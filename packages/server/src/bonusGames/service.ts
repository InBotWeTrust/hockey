import { randomUUID } from 'node:crypto';
import { GAME_CORE_VERSION } from '@hockey/game-core';
import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { deriveBonusAttemptSeed } from '../duel/seed.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import { closeBonusPeriod, reconcileBonusAttempt } from './reconcile.js';
import {
  parseBonusPeriodRules,
  type BonusArenaSnapshot,
  type BonusGameAccessType,
  type BonusGameAttemptDTO,
  type BonusGameAttemptRow,
  type BonusGameStatus,
  type BonusPeriodRule,
} from './types.js';

interface LockedUserRow {
  level: number;
  lifetime_goals_total: number;
}

export const BONUS_GAME_CATALOG_LOCK_CLASS_ID = 0x42474d45;
export const BONUS_GAME_CATALOG_LOCK_OBJECT_ID = 1;

/**
 * Catalog readers take the shared side of this transaction-scoped protocol.
 * Every admin transaction that mutates bonus-game activation/order must take
 * `lockBonusGameCatalogForMutation` before reading or writing the catalog.
 */
export async function lockBonusGameCatalogForRead(client: PoolClient): Promise<void> {
  await client.query('select pg_advisory_xact_lock_shared($1::int, $2::int)', [
    BONUS_GAME_CATALOG_LOCK_CLASS_ID,
    BONUS_GAME_CATALOG_LOCK_OBJECT_ID,
  ]);
}

export async function lockBonusGameCatalogForMutation(client: PoolClient): Promise<void> {
  await client.query('select pg_advisory_xact_lock($1::int, $2::int)', [
    BONUS_GAME_CATALOG_LOCK_CLASS_ID,
    BONUS_GAME_CATALOG_LOCK_OBJECT_ID,
  ]);
}

interface StartableGameRow {
  id: string;
  slug: string;
  title: string;
  status: BonusGameStatus;
  access_type: BonusGameAccessType;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  period_rules: unknown;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  arena_theme_id: string;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  revision: number;
  arena_slug: string;
  arena_title: string;
  arena_artwork_url: string;
  arena_thumbnail_url: string;
  predecessor_id: string | null;
  predecessor_completed: boolean;
  unlock_id: string | null;
  completion_id: string | null;
}

const EXPECTED_START_ERROR_CODES_AFTER_RECONCILE = new Set([
  'bonus_level_locked',
  'bonus_previous_game_required',
  'bonus_purchase_required',
  'bonus_game_inactive',
]);

function isExpectedStartErrorAfterReconcile(error: unknown): error is AppError {
  return error instanceof AppError && EXPECTED_START_ERROR_CODES_AFTER_RECONCILE.has(error.code);
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toBonusAttemptDto(attempt: BonusGameAttemptRow): BonusGameAttemptDTO {
  return {
    id: attempt.id,
    gameId: attempt.bonus_game_id,
    status: attempt.status,
    state: attempt.state,
    currentPeriod: Number(attempt.current_period),
    periodStartedAt: toIso(attempt.period_started_at),
    breakStartedAt: toIso(attempt.break_started_at),
    closedAt: toIso(attempt.closed_at),
    shotsTaken: Number(attempt.shots_taken),
    goals: Number(attempt.goals),
    attemptSeed: attempt.attempt_seed,
    gameCoreVersion: Number(attempt.game_core_version),
    rules: attempt.rules_snapshot,
    reward: attempt.reward_snapshot,
  };
}

async function lockUser(client: PoolClient, userId: string): Promise<LockedUserRow> {
  const { rows } = await client.query<LockedUserRow>(
    `select level, lifetime_goals_total
       from users
      where id = $1
      for update`,
    [userId],
  );
  const user = rows[0];
  if (user === undefined) throw new AppError('not_found', 'user not found', 404);
  return user;
}

async function fetchActiveAttempt(
  client: PoolClient,
  userId: string,
): Promise<BonusGameAttemptRow | null> {
  const { rows } = await client.query<BonusGameAttemptRow>(
    `select * from bonus_game_attempt
      where user_id = $1 and status = 'active'
      for update`,
    [userId],
  );
  return rows[0] ?? null;
}

async function fetchOwnedAttempt(
  client: PoolClient,
  userId: string,
  attemptId: string,
): Promise<BonusGameAttemptRow> {
  const { rows } = await client.query<BonusGameAttemptRow>(
    `select * from bonus_game_attempt
      where id = $1 and user_id = $2
      for update`,
    [attemptId, userId],
  );
  const attempt = rows[0];
  if (attempt === undefined) {
    throw new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
  }
  return attempt;
}

async function fetchStartableGame(
  client: PoolClient,
  userId: string,
  gameId: string,
): Promise<StartableGameRow> {
  const { rows } = await client.query<StartableGameRow>(
    `select game.id, game.slug, game.title, game.status, game.access_type,
            game.target_goals, game.total_periods, game.break_duration_ms,
            game.period_rules, game.reward_coins, game.reward_stars,
            game.reward_experience, game.arena_theme_id,
            game.goalkeeper_ready_url, game.goalkeeper_save_url, game.revision,
            arena.slug as arena_slug, arena.title as arena_title,
            arena.artwork_url as arena_artwork_url,
            arena.thumbnail_url as arena_thumbnail_url,
            predecessor.id as predecessor_id,
            (predecessor_completion.id is not null) as predecessor_completed,
            unlock.id as unlock_id, completion.id as completion_id
       from bonus_game game
       join arena_theme arena on arena.id = game.arena_theme_id
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
      where game.id = $2
      for share of game, arena`,
    [userId, gameId],
  );
  const game = rows[0];
  if (game === undefined || game.status !== 'active') {
    throw new AppError('bonus_game_inactive', 'bonus game is inactive', 409);
  }
  return game;
}

function parseGameRules(game: StartableGameRow): BonusPeriodRule[] {
  try {
    return parseBonusPeriodRules(game.period_rules, game.total_periods, game.target_goals);
  } catch {
    throw new AppError('internal_error', 'active bonus game has invalid rules', 500);
  }
}

async function begin(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function rollbackAndRelease(client: PoolClient): Promise<void> {
  await client.query('rollback').catch(() => undefined);
  client.release();
}

export async function startOrResumeBonusAttempt(
  pool: Pool,
  input: { userId: string; gameId: string; now: Date; seedSecret: string },
): Promise<{ attempt: BonusGameAttemptDTO; created: boolean }> {
  const client = await begin(pool);
  let deferredError: AppError | null = null;
  let terminalReconcilePerformed = false;
  try {
    const user = await lockUser(client, input.userId);
    const active = await fetchActiveAttempt(client, input.userId);
    if (active !== null) {
      const reconciled = await reconcileBonusAttempt(client, active, input.now);
      terminalReconcilePerformed = reconciled.status !== 'active';
      if (reconciled.status === 'active') {
        if (reconciled.bonus_game_id === input.gameId) {
          await client.query('commit');
          return { attempt: toBonusAttemptDto(reconciled), created: false };
        }
        deferredError = new AppError(
          'bonus_attempt_already_active',
          `active bonus attempt: ${reconciled.id}`,
          409,
        );
      }
    }

    if (deferredError === null) {
      await lockBonusGameCatalogForRead(client);
      const [settings, game] = await Promise.all([
        getGameSettings(client),
        fetchStartableGame(client, input.userId, input.gameId),
      ]);
      const competitionLevel = resolveCompetitionLevel(
        Number(user.level),
        Number(user.lifetime_goals_total),
        settings.amateur.unlockGoalsRequired,
      );
      if (competitionLevel === 'beginner') {
        throw new AppError('bonus_level_locked', 'bonus games require amateur access', 403);
      }
      if (game.predecessor_id !== null && !game.predecessor_completed) {
        throw new AppError(
          'bonus_previous_game_required',
          'previous bonus game completion required',
          409,
        );
      }
      if (
        game.access_type === 'paid' &&
        game.unlock_id === null &&
        game.completion_id === null
      ) {
        throw new AppError('bonus_purchase_required', 'bonus game purchase required', 409);
      }

      const periods = parseGameRules(game);
      const arena: BonusArenaSnapshot = {
        id: game.arena_theme_id,
        slug: game.arena_slug,
        title: game.arena_title,
        artworkUrl: game.arena_artwork_url,
        thumbnailUrl: game.arena_thumbnail_url,
      };
      const rulesSnapshot = {
        gameId: game.id,
        slug: game.slug,
        title: game.title,
        revision: Number(game.revision),
        targetGoals: Number(game.target_goals),
        totalPeriods: Number(game.total_periods),
        breakDurationMs: Number(game.break_duration_ms),
        periods,
        goalkeeperReadyUrl: game.goalkeeper_ready_url,
        goalkeeperSaveUrl: game.goalkeeper_save_url,
        arena,
      };
      const rewardSnapshot = {
        coins: Number(game.reward_coins),
        stars: Number(game.reward_stars),
        experience: Number(game.reward_experience),
      };
      const attemptId = randomUUID();
      const attemptSeed = deriveBonusAttemptSeed(
        attemptId,
        input.userId,
        game.id,
        input.seedSecret,
      );
      const { rows } = await client.query<BonusGameAttemptRow>(
        `insert into bonus_game_attempt
           (id, user_id, bonus_game_id, status, state, current_period,
            shots_taken, goals, attempt_seed, game_core_version,
            definition_revision, rules_snapshot, reward_snapshot,
            arena_theme_id_snapshot, arena_snapshot, goalkeeper_ready_url,
            goalkeeper_save_url, created_at, updated_at)
         values ($1, $2, $3, 'active', 'idle', 0,
                 0, 0, $4, $5,
                 $6, $7::jsonb, $8::jsonb,
                 $9, $10::jsonb, $11, $12, $13, $13)
         returning *`,
        [
          attemptId,
          input.userId,
          game.id,
          attemptSeed,
          GAME_CORE_VERSION,
          game.revision,
          JSON.stringify(rulesSnapshot),
          JSON.stringify(rewardSnapshot),
          game.arena_theme_id,
          JSON.stringify(arena),
          game.goalkeeper_ready_url,
          game.goalkeeper_save_url,
          input.now,
        ],
      );
      await client.query('commit');
      return { attempt: toBonusAttemptDto(rows[0]!), created: true };
    }

    await client.query('commit');
  } catch (error) {
    if (terminalReconcilePerformed && isExpectedStartErrorAfterReconcile(error)) {
      await client.query('commit');
      deferredError = error;
    } else {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
  throw deferredError!;
}

export async function startBonusPeriod(
  pool: Pool,
  input: { userId: string; attemptId: string; now: Date },
): Promise<BonusGameAttemptDTO> {
  const client = await begin(pool);
  let deferredError: AppError | null = null;
  let result: BonusGameAttemptDTO | null = null;
  try {
    await lockUser(client, input.userId);
    const owned = await fetchOwnedAttempt(client, input.userId, input.attemptId);
    const attempt = await reconcileBonusAttempt(client, owned, input.now);
    if (attempt.status !== 'active') {
      deferredError = new AppError(
        'bonus_attempt_not_active',
        'bonus attempt is not active',
        409,
      );
    } else if (
      attempt.state !== 'idle' ||
      attempt.current_period >= attempt.rules_snapshot.totalPeriods
    ) {
      deferredError = new AppError('bonus_period_not_ready', 'bonus period is not ready', 409);
    } else {
      const { rows } = await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set state = 'period_active', current_period = current_period + 1,
                period_started_at = $1, break_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [input.now, attempt.id],
      );
      result = toBonusAttemptDto(rows[0]!);
    }
    await client.query('commit');
  } catch (error) {
    await rollbackAndRelease(client);
    throw error;
  }
  client.release();
  if (deferredError !== null) throw deferredError;
  return result!;
}

export async function abandonBonusAttempt(
  pool: Pool,
  input: { userId: string; attemptId: string; now: Date },
): Promise<BonusGameAttemptDTO> {
  const client = await begin(pool);
  let deferredError: AppError | null = null;
  let result: BonusGameAttemptDTO | null = null;
  try {
    await lockUser(client, input.userId);
    const owned = await fetchOwnedAttempt(client, input.userId, input.attemptId);
    const attempt = await reconcileBonusAttempt(client, owned, input.now);
    if (attempt.status !== 'active') {
      deferredError = new AppError(
        'bonus_attempt_not_active',
        'bonus attempt is not active',
        409,
      );
    } else {
      if (attempt.state === 'period_active') {
        await closeBonusPeriod(client, attempt, input.now, 'attempt_abandoned');
      }
      const { rows } = await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set status = 'abandoned', state = 'closed', closed_at = $1,
                period_started_at = null, break_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [input.now, attempt.id],
      );
      result = toBonusAttemptDto(rows[0]!);
    }
    await client.query('commit');
  } catch (error) {
    await rollbackAndRelease(client);
    throw error;
  }
  client.release();
  if (deferredError !== null) throw deferredError;
  return result!;
}
