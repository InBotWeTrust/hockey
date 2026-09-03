import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import type { BonusGameAccessType, BonusRewardSnapshot } from './types.js';

export interface BalanceSnapshot {
  coins: number;
  stars: number;
  experience: number;
}

export interface FirstClearRewardInput {
  userId: string;
  gameId: string;
  attemptId: string;
  reward: BonusRewardSnapshot;
  now: Date;
}

interface LockedUserRow {
  level: number;
  lifetime_goals_total: number;
  xp: number;
  experience: number;
  coins: number;
}

interface LockedCurrencyAccountRow {
  balance: number;
  reserved_balance: number;
}

interface PurchasableGameRow {
  id: string;
  slug: string;
  status: 'draft' | 'active' | 'archived';
  access_type: BonusGameAccessType;
  unlock_price_stars: number;
  revision: number;
  predecessor_id: string | null;
  predecessor_completed: boolean;
  unlock_id: string | null;
  completion_id: string | null;
  active_attempt_id: string | null;
}

async function lockCurrencyAccount(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<LockedCurrencyAccountRow> {
  await client.query(
    `insert into user_currency_account (user_id, created_at, updated_at)
     values ($1, $2, $2)
     on conflict (user_id) do nothing`,
    [userId, now],
  );
  const { rows } = await client.query<LockedCurrencyAccountRow>(
    `select balance, reserved_balance
       from user_currency_account
      where user_id = $1
      for update`,
    [userId],
  );
  const account = rows[0];
  if (account === undefined) {
    throw new AppError('internal_error', 'currency account not found', 500);
  }
  return account;
}

export async function lockBonusEconomyBalances(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<BalanceSnapshot> {
  const { rows } = await client.query<{ xp: number; experience: number }>(
    `select xp, experience
       from users
      where id = $1
      for update`,
    [userId],
  );
  const user = rows[0];
  if (user === undefined) throw new AppError('not_found', 'user not found', 404);
  const account = await lockCurrencyAccount(client, userId, now);
  return {
    coins: Number(account.balance),
    stars: Number(user.xp),
    experience: Number(user.experience),
  };
}

async function lockUser(client: PoolClient, userId: string, now: Date): Promise<LockedUserRow> {
  const { rows } = await client.query<Omit<LockedUserRow, 'coins'>>(
    `select level, lifetime_goals_total, xp, experience
       from users
      where id = $1
      for update`,
    [userId],
  );
  const user = rows[0];
  if (user === undefined) throw new AppError('not_found', 'user not found', 404);
  const account = await lockCurrencyAccount(client, userId, now);
  return { ...user, coins: Number(account.balance) };
}

async function fetchPurchasableGame(
  client: PoolClient,
  userId: string,
  gameId: string,
): Promise<PurchasableGameRow> {
  const { rows } = await client.query<PurchasableGameRow>(
    `select game.id, game.slug, game.status, game.access_type,
            game.unlock_price_stars, game.revision,
            predecessor.id as predecessor_id,
            (predecessor_completion.id is not null) as predecessor_completed,
            unlock.id as unlock_id,
            completion.id as completion_id,
            active_attempt.id as active_attempt_id
       from bonus_game game
       left join lateral (
         select previous.id
           from bonus_game previous
          where previous.status = 'active'
            and previous.skill_code = game.skill_code
            and previous.sort_order < game.sort_order
          order by previous.sort_order desc, previous.id desc
          limit 1
       ) predecessor on true
       left join user_bonus_game_completion predecessor_completion
         on predecessor_completion.user_id = $1
        and predecessor_completion.bonus_game_id = predecessor.id
       left join user_bonus_game_unlock unlock
         on unlock.user_id = $1 and unlock.bonus_game_id = game.id
       left join user_bonus_game_completion completion
         on completion.user_id = $1 and completion.bonus_game_id = game.id
       left join bonus_game_attempt active_attempt
         on active_attempt.user_id = $1
        and active_attempt.bonus_game_id = game.id
        and active_attempt.status = 'active'
      where game.id = $2
      for update of game`,
    [userId, gameId],
  );
  const game = rows[0];
  if (game === undefined) {
    throw new AppError('bonus_game_inactive', 'bonus game is inactive', 409);
  }
  return game;
}

export async function purchaseBonusGame(
  pool: Pool,
  input: { userId: string; gameId: string; expectedPriceStars: number; now: Date },
): Promise<{ unlocked: true; starBalance: number }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const user = await lockUser(client, input.userId, input.now);
    const settings = await getGameSettings(client);
    const game = await fetchPurchasableGame(client, input.userId, input.gameId);

    if (game.unlock_id !== null) {
      await client.query('commit');
      return { unlocked: true, starBalance: Number(user.xp) };
    }

    const competitionLevel = resolveCompetitionLevel(
      Number(user.level),
      Number(user.lifetime_goals_total),
      settings.amateur.unlockGoalsRequired,
    );
    if (competitionLevel === 'beginner') {
      throw new AppError('bonus_level_locked', 'bonus games require amateur access', 403);
    }
    if (game.status !== 'active') {
      throw new AppError('bonus_game_inactive', 'bonus game is inactive', 409);
    }
    if (game.active_attempt_id !== null || game.completion_id !== null) {
      // `unlocked` means the stale request's access goal is already satisfied.
      // Existing attempts/completions are grandfathered without creating a paid unlock.
      await client.query('commit');
      return { unlocked: true, starBalance: Number(user.xp) };
    }
    if (game.predecessor_id !== null && !game.predecessor_completed) {
      throw new AppError(
        'bonus_previous_game_required',
        'previous bonus game completion required',
        409,
      );
    }
    if (game.access_type === 'free') {
      await client.query('commit');
      return { unlocked: true, starBalance: Number(user.xp) };
    }

    const price = Number(game.unlock_price_stars);
    if (price !== input.expectedPriceStars) {
      throw new AppError('bonus_price_changed', 'bonus game price changed', 409);
    }
    const debited = await client.query<{ xp: number }>(
      `update users
          set xp = xp - $2
        where id = $1 and xp >= $2
        returning xp`,
      [input.userId, price],
    );
    const balance = debited.rows[0];
    if (balance === undefined) {
      throw new AppError('bonus_insufficient_stars', 'not enough stars', 409);
    }

    const event = await client.query<{ id: string }>(
      `insert into bonus_game_economy_event
         (user_id, bonus_game_id, kind,
          coins_delta, stars_delta, experience_delta,
          coins_after, stars_after, experience_after,
          snapshot, created_at)
       values ($1, $2, 'unlock_purchase',
               0, $3, 0,
               $4, $5, $6,
               $7::jsonb, $8)
       returning id`,
      [
        input.userId,
        game.id,
        -price,
        Number(user.coins),
        Number(balance.xp),
        Number(user.experience),
        JSON.stringify({
          priceStars: price,
          gameRevision: Number(game.revision),
          gameSlug: game.slug,
        }),
        input.now,
      ],
    );
    const eventId = event.rows[0]?.id;
    if (eventId === undefined) {
      throw new AppError('internal_error', 'bonus unlock event was not saved', 500);
    }
    await client.query(
      `insert into user_bonus_game_unlock
         (user_id, bonus_game_id, paid_price_stars, economy_event_id, unlocked_at)
       values ($1, $2, $3, $4, $5)`,
      [input.userId, game.id, price, eventId, input.now],
    );

    await client.query('commit');
    return { unlocked: true, starBalance: Number(balance.xp) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readBalanceSnapshot(client: PoolClient, userId: string): Promise<BalanceSnapshot> {
  const { rows } = await client.query<{
    coins: number;
    stars: number;
    experience: number;
  }>(
    `select account.balance::int as coins,
            users.xp::int as stars,
            users.experience::int as experience
       from users
       join user_currency_account account on account.user_id = users.id
      where users.id = $1`,
    [userId],
  );
  const balances = rows[0];
  if (balances === undefined) {
    throw new AppError('internal_error', 'locked bonus balances not found', 500);
  }
  return {
    coins: Number(balances.coins),
    stars: Number(balances.stars),
    experience: Number(balances.experience),
  };
}

export async function grantFirstClearReward(
  client: PoolClient,
  input: FirstClearRewardInput,
): Promise<{ granted: boolean; balances: BalanceSnapshot }> {
  const completion = await client.query<{ id: string }>(
    `insert into user_bonus_game_completion
       (user_id, bonus_game_id, attempt_id, reward_snapshot, completed_at)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (user_id, bonus_game_id) do nothing
     returning id`,
    [input.userId, input.gameId, input.attemptId, JSON.stringify(input.reward), input.now],
  );
  const completionId = completion.rows[0]?.id;
  if (completionId === undefined) {
    return { granted: false, balances: await readBalanceSnapshot(client, input.userId) };
  }

  const existingReward = await client.query<{ id: string }>(
    `select id
       from bonus_game_economy_event
      where user_id = $1
        and bonus_game_id = $2
        and kind = 'first_clear_reward'
      limit 1`,
    [input.userId, input.gameId],
  );
  if (existingReward.rows[0] !== undefined) {
    return { granted: false, balances: await readBalanceSnapshot(client, input.userId) };
  }

  const accountResult = await client.query<LockedCurrencyAccountRow>(
    `update user_currency_account
        set balance = balance + $2,
            updated_at = $3
      where user_id = $1
      returning balance, reserved_balance`,
    [input.userId, input.reward.coins, input.now],
  );
  const account = accountResult.rows[0];
  if (account === undefined) {
    throw new AppError('internal_error', 'currency account not found', 500);
  }

  const userResult = await client.query<{ xp: number; experience: number }>(
    `update users
        set xp = xp + $2,
            experience = experience + $3
      where id = $1
      returning xp, experience`,
    [input.userId, input.reward.stars, input.reward.experience],
  );
  const user = userResult.rows[0];
  if (user === undefined) throw new AppError('not_found', 'user not found', 404);

  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta,
        balance_after, reserved_after, metadata, created_at)
     values ($1, 'bonus_game_reward', $2, 0, $3, $4, $5::jsonb, $6)`,
    [
      input.userId,
      input.reward.coins,
      Number(account.balance),
      Number(account.reserved_balance),
      JSON.stringify({
        bonus_game_id: input.gameId,
        bonus_game_attempt_id: input.attemptId,
        stars: input.reward.stars,
        experience: input.reward.experience,
      }),
      input.now,
    ],
  );
  await client.query(
    `insert into bonus_game_economy_event
       (user_id, bonus_game_id, attempt_id, kind,
        coins_delta, stars_delta, experience_delta,
        coins_after, stars_after, experience_after, snapshot, created_at)
     values ($1, $2, $3, 'first_clear_reward',
             $4, $5, $6,
             $7, $8, $9, $10::jsonb, $11)`,
    [
      input.userId,
      input.gameId,
      input.attemptId,
      input.reward.coins,
      input.reward.stars,
      input.reward.experience,
      Number(account.balance),
      Number(user.xp),
      Number(user.experience),
      JSON.stringify(input.reward),
      input.now,
    ],
  );

  return {
    granted: true,
    balances: {
      coins: Number(account.balance),
      stars: Number(user.xp),
      experience: Number(user.experience),
    },
  };
}
