import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import type { BonusGameAccessType } from './types.js';

interface LockedUserRow {
  level: number;
  lifetime_goals_total: number;
  xp: number;
  experience: number;
  coins: number;
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

async function lockUser(client: PoolClient, userId: string): Promise<LockedUserRow> {
  const { rows } = await client.query<LockedUserRow>(
    `select u.level, u.lifetime_goals_total, u.xp, u.experience,
            coalesce(account.balance, 0)::int as coins
       from users u
       left join user_currency_account account on account.user_id = u.id
      where u.id = $1
      for update of u`,
    [userId],
  );
  const user = rows[0];
  if (user === undefined) throw new AppError('not_found', 'user not found', 404);
  return user;
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
      where game.id = $2`,
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
  input: { userId: string; gameId: string; now: Date },
): Promise<{ unlocked: true; starBalance: number }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const user = await lockUser(client, input.userId);
    const [settings, game] = await Promise.all([
      getGameSettings(client),
      fetchPurchasableGame(client, input.userId, input.gameId),
    ]);

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
