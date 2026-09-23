import type { Pool, PoolClient } from 'pg';
import { evaluateMonthlyRatingSettledAchievements } from '../../achievements/engine.js';
import { AppError } from '../../plugins/errors.js';
import { lockRatingLifecycle } from './ratingLock.js';
import { reconcileRatingSeasonMatches } from './routes.js';
import { getGameSettings } from '../gameSettings.js';
import { hasMonthlyReward, monthlyRewardForPlace, type MonthlyRatingReward, type RatingScope } from './monthlyRatingSettings.js';

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

type Reward = MonthlyRatingReward;

export interface MonthlyRatingCongratulations extends Reward {
  id: string;
  season_key: string;
  place: number;
  matches_played: number;
  eligible_count: number;
  rewarded_count: number;
  created_at: Date;
  awards: Array<Reward & { scope: RatingScope; place: number }>;
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
          const readyToClose = await reconcileRatingSeasonMatches(client, seasonKey, now);
          if (!readyToClose) {
            await client.query('commit');
            return;
          }
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
  const settings = (await getGameSettings(client)).amateur.monthlyRating;
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
  const rewardedCount = Math.min(eligibleCount, 50, Math.max(3, Math.floor(eligibleCount * 0.2)));

  const formatRows = new Map<RatingScope, RatingRow[]>();
  for (const scope of ['express', 'express_plus', 'classic'] as const) {
    const result = await client.query<RatingRow>(
      `with live as (
         select e.user_id, sum(e.points)::int as points, sum(e.wins)::int as wins,
                sum(e.draws)::int as draws, sum(e.losses)::int as losses,
                sum(e.goals_for)::int as goals_for, sum(e.goals_against)::int as goals_against,
                count(*)::int as matches_played,
                sum(e.active_duration_seconds)::int as active_duration_seconds
           from amateur_duel_rating_match e
           join amateur_duel_match m on m.id = e.match_id
          where e.season_key = $1 and m.duel_kind = $2 and m.status = 'settled'
            and m.ranked and m.source <> 'tournament'
          group by e.user_id
       ), ranked as (
         select live.*, coalesce(sum(case when opponent.points = live.points then entry.points else 0 end), 0)::int as head_to_head_points
           from live
           left join amateur_duel_rating_match entry on entry.season_key = $1 and entry.user_id = live.user_id
           left join amateur_duel_match match on match.id = entry.match_id and match.duel_kind = $2
           left join amateur_duel_rating_match opponent_entry on opponent_entry.match_id = match.id and opponent_entry.user_id <> live.user_id
           left join live opponent on opponent.user_id = opponent_entry.user_id
          group by live.user_id, live.points, live.wins, live.draws, live.losses,
                   live.goals_for, live.goals_against, live.matches_played, live.active_duration_seconds
       )
       select ranked.user_id, ranked.points, ranked.wins, ranked.draws, ranked.losses,
              ranked.goals_for, ranked.goals_against, ranked.matches_played, ranked.active_duration_seconds
         from ranked join users u on u.id = ranked.user_id
        order by ranked.points desc, ranked.head_to_head_points desc,
                 ranked.matches_played desc, ranked.wins desc, u.display_name asc, ranked.user_id asc`,
      [seasonKey, scope],
    );
    formatRows.set(scope, result.rows);
  }

  // Global economy order: lock all users by UUID before any currency/token account
  // or achievement write, matching other transactions that mutate multiple players.
  await client.query('select id from users where id = any($1::uuid[]) order by id for update', [
    [...new Set([...rows, ...[...formatRows.values()].flat()].map((row) => row.user_id))],
  ]);
  await client.query(
    `insert into monthly_duel_rating_season
       (season_key, eligible_count, rewarded_count, closed_at, settings_snapshot) values ($1, $2, $3, $4, $5)`,
    [seasonKey, eligibleCount, rewardedCount, now, JSON.stringify(settings)],
  );
  for (const [index, row] of rows.entries()) {
    const place = index + 1;
    const reward = monthlyRewardForPlace(settings, 'overall', place, rewardedCount);
    await client.query(
      `insert into monthly_duel_rating_placement
         (season_key, user_id, place, points, wins, matches_played, active_duration_seconds,
          draws, losses, goals_for, goals_against, coins, stars, experience, tokens, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
        reward.experience,
        reward.tokens,
        now,
      ],
    );
    if (hasMonthlyReward(reward)) await payReward(client, seasonKey, 'overall', row.user_id, reward, now);
    await evaluateMonthlyRatingSettledAchievements(client, {
      type: 'monthly_duel_rating_settled',
      seasonKey,
      userId: row.user_id,
      place,
    });
  }
  for (const [scope, ranked] of formatRows) {
    for (const [index, row] of ranked.entries()) {
      const place = index + 1;
      const reward = monthlyRewardForPlace(settings, scope, place, 1);
      await client.query(
        `insert into monthly_duel_format_placement
           (season_key, scope, user_id, place, points, wins, draws, losses, goals_for, goals_against,
            matches_played, active_duration_seconds, coins, stars, experience, tokens, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [seasonKey, scope, row.user_id, place, row.points, row.wins, row.draws, row.losses,
          row.goals_for, row.goals_against, row.matches_played, row.active_duration_seconds,
          reward.coins, reward.stars, reward.experience, reward.tokens, now],
      );
      if (hasMonthlyReward(reward)) await payReward(client, seasonKey, scope, row.user_id, reward, now);
    }
  }
}

async function payReward(
  client: PoolClient,
  seasonKey: string,
  scope: RatingScope,
  userId: string,
  reward: Reward,
  now: Date,
): Promise<void> {
  const { rows: stars } = await client.query<{ xp: number; experience: number }>(
    'update users set xp = xp + $2, experience = experience + $3 where id = $1 returning xp, experience',
    [userId, reward.stars, reward.experience],
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
  if (scope === 'overall') {
    await client.query(
      `insert into monthly_duel_rating_economy_event
         (season_key, user_id, coins, stars, experience, tokens, coin_balance_after, star_balance_after,
          experience_balance_after, token_balance_after, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [seasonKey, userId, reward.coins, reward.stars, reward.experience, reward.tokens,
        coinAccount.balance, starAccount.xp, starAccount.experience, tokenAccount.balance, now],
    );
  } else {
    await client.query(
      `insert into monthly_duel_format_economy_event
         (season_key, scope, user_id, coins, stars, experience, tokens, coin_balance_after,
          star_balance_after, experience_balance_after, token_balance_after, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [seasonKey, scope, userId, reward.coins, reward.stars, reward.experience, reward.tokens,
        coinAccount.balance, starAccount.xp, starAccount.experience, tokenAccount.balance, now],
    );
  }
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata, created_at)
     values ($1, 'monthly_duel_rating_reward', $2, 0, $3, $4, $5, $6)`,
    [
      userId,
      reward.coins,
      coinAccount.balance,
      coinAccount.reserved_balance,
      JSON.stringify({ season_key: seasonKey, scope, ...reward }),
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
    `with pending as (
       select p.id, p.season_key, 'overall'::text as scope, p.place, p.matches_played,
              p.coins, p.stars, p.experience, p.tokens, p.created_at
         from monthly_duel_rating_placement p
        where p.user_id = $1 and p.viewed_at is null
          and (p.coins > 0 or p.stars > 0 or p.experience > 0 or p.tokens > 0)
       union all
       select p.id, p.season_key, p.scope, p.place, p.matches_played,
              p.coins, p.stars, p.experience, p.tokens, p.created_at
         from monthly_duel_format_placement p
        where p.user_id = $1 and p.viewed_at is null
          and (p.coins > 0 or p.stars > 0 or p.experience > 0 or p.tokens > 0)
     )
     select (array_agg(p.id order by case when p.scope = 'overall' then 0 else 1 end, p.scope))[1] as id,
            p.season_key,
            (array_agg(p.place order by case when p.scope = 'overall' then 0 else 1 end, p.scope))[1] as place,
            (array_agg(p.matches_played order by case when p.scope = 'overall' then 0 else 1 end, p.scope))[1] as matches_played,
            s.eligible_count, s.rewarded_count,
            sum(p.coins)::int as coins, sum(p.stars)::int as stars,
            sum(p.experience)::int as experience, sum(p.tokens)::int as tokens,
            min(p.created_at) as created_at,
            jsonb_agg(jsonb_build_object('scope', p.scope, 'place', p.place,
              'coins', p.coins, 'stars', p.stars, 'experience', p.experience,
              'tokens', p.tokens) order by case when p.scope = 'overall' then 0 else 1 end, p.scope) as awards
       from pending p join monthly_duel_rating_season s using (season_key)
      group by p.season_key, s.eligible_count, s.rewarded_count
      order by p.season_key asc`,
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
  const client = await pool.connect();
  try {
    await client.query('begin');
    const found = await client.query<{ season_key: string }>(
      `select season_key from monthly_duel_rating_placement where id = $1 and user_id = $2
          and (coins > 0 or stars > 0 or experience > 0 or tokens > 0)
       union all
       select season_key from monthly_duel_format_placement where id = $1 and user_id = $2
          and (coins > 0 or stars > 0 or experience > 0 or tokens > 0)
       limit 1`,
      [id, userId],
    );
    const seasonKey = found.rows[0]?.season_key;
    if (!seasonKey) throw new AppError('not_found', 'congratulation not found', 404);
    await client.query(
      `update monthly_duel_rating_placement set viewed_at = coalesce(viewed_at, $3)
        where season_key = $1 and user_id = $2 and viewed_at is null`,
      [seasonKey, userId, now],
    );
    await client.query(
      `update monthly_duel_format_placement set viewed_at = coalesce(viewed_at, $3)
        where season_key = $1 and user_id = $2 and viewed_at is null`,
      [seasonKey, userId, now],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
