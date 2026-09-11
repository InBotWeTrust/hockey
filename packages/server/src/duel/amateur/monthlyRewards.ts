import type { Pool, PoolClient } from 'pg';
import { evaluateMonthlyRatingSettledAchievements } from '../../achievements/engine.js';
import { AppError } from '../../plugins/errors.js';
import { lockRatingLifecycle } from './ratingLock.js';
import { reconcileRatingSeasonMatches } from './routes.js';

interface RatingRow {
  user_id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  matches_played: number;
  active_duration_seconds: number;
}

interface Reward {
  coins: number;
  stars: number;
  tokens: number;
}

export interface MonthlyRatingCongratulations extends Reward {
  id: string;
  season_key: string;
  place: number;
  matches_played: number;
  eligible_count: number;
  rewarded_count: number;
  created_at: Date;
}

function rewardForPlace(place: number, rewardedCount: number): Reward {
  if (place > rewardedCount) return { coins: 0, stars: 0, tokens: 0 };
  if (place === 1) return { coins: 15_000, stars: 300, tokens: 10 };
  if (place === 2) return { coins: 10_000, stars: 200, tokens: 7 };
  if (place === 3) return { coins: 7_500, stars: 150, tokens: 5 };
  if (place <= 10) return { coins: 0, stars: 50, tokens: 3 };
  return { coins: 0, stars: 15, tokens: 1 };
}

/** Each completed month is a single atomic, immutable payout for every eligible player. */
export async function reconcileCompletedMonthlyRating(pool: Pool, now: Date): Promise<void> {
  for (;;) {
    const { rows: seasons } = await pool.query<{ season_key: string }>(
      `select distinct m.season_key
       from amateur_duel_match m
      where m.season_key < to_char($1::timestamptz at time zone 'Europe/Moscow', 'YYYY-MM')
        and m.ranked and m.source <> 'tournament'
        and not exists (
          select 1 from monthly_duel_rating_season s where s.season_key = m.season_key
        )
      order by m.season_key limit 1`,
      [now],
    );
    if (seasons.length === 0) return;
    for (const { season_key: seasonKey } of seasons) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await lockRatingLifecycle(client);
        // Recheck after acquiring the season lock: another request may have just paid it.
        const closed = await client.query(
          'select 1 from monthly_duel_rating_season where season_key = $1',
          [seasonKey],
        );
        if (closed.rowCount === 0) {
          // Lock the complete set once, including due-match recipients who may only
          // become eligible during reconciliation, before any user/account write.
          await client.query(
            `select id from users where id in (
          select user_id from amateur_duel_rating_match where season_key=$1
          union select challenger_user_id from amateur_duel_match where season_key=$1 and ranked and source<>'tournament'
          union select opponent_user_id from amateur_duel_match where season_key=$1 and ranked and source<>'tournament'
        ) order by id for update`,
            [seasonKey],
          );
          await reconcileRatingSeasonMatches(client, seasonKey);
          await settleSeason(client, seasonKey, now);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  }
}

async function settleSeason(client: PoolClient, seasonKey: string, now: Date): Promise<void> {
  const { rows } = await client.query<RatingRow>(
    `with live as (
       select r.season_key, r.user_id, r.points, r.wins, r.draws, r.losses,
              r.goals_for, r.goals_against, r.matches_played, r.active_duration_seconds
         from amateur_duel_rating_live r
        where r.season_key = $1
     ), ranked as (
       select live.user_id, live.points, live.wins, live.draws, live.losses,
              live.goals_for, live.goals_against, live.matches_played,
              live.active_duration_seconds,
              coalesce(sum(
                case when opponent_live.points = live.points then own_entry.points else 0 end
              ), 0)::int as head_to_head_points
         from live
         left join amateur_duel_rating_match own_entry
           on own_entry.season_key = live.season_key and own_entry.user_id = live.user_id
         left join amateur_duel_rating_match opponent_entry
           on opponent_entry.match_id = own_entry.match_id and opponent_entry.user_id <> live.user_id
         left join live opponent_live
           on opponent_live.user_id = opponent_entry.user_id
        group by live.user_id, live.points, live.wins, live.draws, live.losses,
                 live.goals_for, live.goals_against, live.matches_played,
                 live.active_duration_seconds
     )
     select ranked.user_id, ranked.points, ranked.wins, ranked.draws, ranked.losses,
            ranked.goals_for, ranked.goals_against, ranked.matches_played,
            ranked.active_duration_seconds
       from ranked
       join users u on u.id = ranked.user_id
      order by ranked.points desc, ranked.head_to_head_points desc,
               ranked.matches_played desc, ranked.wins desc, u.display_name asc, ranked.user_id asc`,
      [seasonKey],
  );
  const eligibleCount = rows.length;
  const rewardedCount =
    eligibleCount < 10 ? 0 : Math.min(50, Math.max(3, Math.floor(eligibleCount * 0.2)));

  // Global economy order: lock all users by UUID before any currency/token account
  // or achievement write, matching other transactions that mutate multiple players.
  await client.query('select id from users where id = any($1::uuid[]) order by id for update', [
    rows.map((row) => row.user_id),
  ]);
  await client.query(
    `insert into monthly_duel_rating_season
       (season_key, eligible_count, rewarded_count, closed_at) values ($1, $2, $3, $4)`,
    [seasonKey, eligibleCount, rewardedCount, now],
  );
  for (const [index, row] of rows.entries()) {
    const place = index + 1;
    const reward = rewardForPlace(place, rewardedCount);
    await client.query(
      `insert into monthly_duel_rating_placement
         (season_key, user_id, place, points, wins, matches_played, active_duration_seconds,
          draws, losses, goals_for, goals_against, coins, stars, tokens, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        seasonKey,
        row.user_id,
        place,
        row.points,
        row.wins,
        row.matches_played,
        row.active_duration_seconds,
        row.draws,
        row.losses,
        row.goals_for,
        row.goals_against,
        reward.coins,
        reward.stars,
        reward.tokens,
        now,
      ],
    );
    if (place <= rewardedCount) await payReward(client, seasonKey, row.user_id, reward, now);
    await evaluateMonthlyRatingSettledAchievements(client, {
      type: 'monthly_duel_rating_settled',
      seasonKey,
      userId: row.user_id,
      place,
    });
  }
}

async function payReward(
  client: PoolClient,
  seasonKey: string,
  userId: string,
  reward: Reward,
  now: Date,
): Promise<void> {
  const { rows: stars } = await client.query<{ xp: number }>(
    'update users set xp = xp + $2 where id = $1 returning xp',
    [userId, reward.stars],
  );
  await client.query(
    'insert into user_currency_account (user_id) values ($1) on conflict do nothing',
    [userId],
  );
  const { rows: coins } = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance + $2, updated_at = $3
      where user_id = $1 returning balance, reserved_balance`,
    [userId, reward.coins, now],
  );
  const { rows: tokens } = await client.query<{ balance: number }>(
    `insert into user_reward_token_account (user_id, balance, updated_at) values ($1, $2, $3)
     on conflict (user_id) do update
       set balance = user_reward_token_account.balance + excluded.balance, updated_at = excluded.updated_at
     returning balance`,
    [userId, reward.tokens, now],
  );
  const starAccount = stars[0];
  const coinAccount = coins[0];
  const tokenAccount = tokens[0];
  if (!starAccount || !coinAccount || !tokenAccount) {
    throw new AppError('server_error', 'monthly rating reward account missing', 500);
  }
  await client.query(
    `insert into monthly_duel_rating_economy_event
       (season_key, user_id, coins, stars, tokens, coin_balance_after, star_balance_after,
        token_balance_after, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      seasonKey,
      userId,
      reward.coins,
      reward.stars,
      reward.tokens,
      coinAccount.balance,
      starAccount.xp,
      tokenAccount.balance,
      now,
    ],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata, created_at)
     values ($1, 'monthly_duel_rating_reward', $2, 0, $3, $4, $5, $6)`,
    [
      userId,
      reward.coins,
      coinAccount.balance,
      coinAccount.reserved_balance,
      JSON.stringify({ season_key: seasonKey, ...reward }),
      now,
    ],
  );
}

export async function getPendingMonthlyRatingCongratulations(
  pool: Pool,
  userId: string,
  now: Date = new Date(),
): Promise<MonthlyRatingCongratulations[]> {
  await reconcileCompletedMonthlyRating(pool, now);
  const { rows } = await pool.query<MonthlyRatingCongratulations>(
    `select p.id, p.season_key, p.place, p.matches_played, s.eligible_count, s.rewarded_count,
            p.coins, p.stars, p.tokens, p.created_at
       from monthly_duel_rating_placement p
       join monthly_duel_rating_season s using (season_key)
      where p.user_id = $1 and p.viewed_at is null
        and (p.coins > 0 or p.stars > 0 or p.tokens > 0)
      order by p.season_key asc, p.id asc`,
    [userId],
  );
  return rows;
}

export async function acknowledgeMonthlyRatingCongratulations(
  pool: Pool,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const result = await pool.query(
    `update monthly_duel_rating_placement set viewed_at = coalesce(viewed_at, $3)
      where id = $1 and user_id = $2 and (coins > 0 or stars > 0 or tokens > 0)`,
    [id, userId, now],
  );
  if (result.rowCount === 0) throw new AppError('not_found', 'congratulation not found', 404);
}
