import { randomUUID } from 'node:crypto';
import {
  GAME_CORE_VERSION,
  GOAL_OPENING,
  PUCK_START,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  STICK_NEUTRAL,
  type ShotInput,
} from '@hockey/game-core';
import type { Pool, PoolClient } from 'pg';
import { appendEvent } from '../duel/eventLog.js';
import { getGameSettings } from '../duel/gameSettings.js';
import { deriveBonusAttemptSeed, deriveShotSeed } from '../duel/seed.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import {
  consumePeriodLoadout,
  hasPeriodLoadoutSelection,
  type PeriodLoadoutSelection,
  type PeriodLoadoutSnapshot,
} from '../inventory/periodLoadout.js';
import {
  grantFirstClearReward,
  lockBonusEconomyBalances,
  type BalanceSnapshot,
} from './economy.js';
import { closeBonusPeriod, reconcileBonusAttempt } from './reconcile.js';
import {
  advanceGoalStreak,
  evaluateBonusQualification,
  normalizeBonusQualificationRules,
  type BonusQualificationRules,
} from './qualification.js';
import {
  buildBonusGoalieConfig,
  parseBonusPeriodRules,
  type BonusArenaSnapshot,
  type BonusGameAccessType,
  type BonusGameAttemptDTO,
  type BonusGameAttemptRow,
  type BonusRewardSnapshot,
  type BonusGameStatus,
  type BonusSkillCode,
  type BonusPeriodRule,
} from './types.js';

interface LockedUserRow {
  level: number;
  lifetime_goals_total: number;
}

type BonusShotResult = 'goal' | 'save' | 'miss';

export interface SubmitBonusShotInput {
  userId: string;
  attemptId: string;
  claimedShotIndex: number;
  input: ShotInput & { shooterTapTime: number };
  claimedResult: BonusShotResult;
  now: Date;
}

export interface SubmitBonusShotResult {
  serverResult: BonusShotResult;
  attempt: BonusGameAttemptDTO;
  rewardGranted: BonusRewardSnapshot | null;
  balances: BalanceSnapshot;
}

interface BonusShotRow {
  period_number: number;
  shot_index: number;
  server_result: BonusShotResult;
}

interface BonusAttemptVersionRow {
  game_core_version: number;
}

/** Stable service conflict code for the Task 7 HTTP/client error mapping. */
export const BONUS_GAME_CORE_VERSION_MISMATCH_CODE = 'bonus_game_core_version_mismatch';
export const BONUS_SHOT_TIME_INVALID_CODE = 'bonus_shot_time_invalid';
export const BONUS_SHOT_TIME_STALE_CODE = 'bonus_shot_time_stale';

export class BonusAttemptAlreadyActiveError extends AppError {
  constructor(public readonly activeAttempt: { id: string; gameId: string }) {
    super('bonus_attempt_already_active', 'another bonus attempt is already active', 409);
  }
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
  skill_code: BonusSkillCode;
  status: BonusGameStatus;
  access_type: BonusGameAccessType;
  target_goals: number;
  qualification_rules: unknown | null;
  total_periods: number;
  break_duration_ms: number;
  use_inventory: boolean;
  preview_title: string;
  preview_story: string;
  preview_artwork_url: string;
  preview_revision: number;
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
  preview_dismissed_revision: number | null;
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

interface BonusAttemptDerivedState {
  currentPeriodShotsTaken: number;
  rewardGranted: boolean;
  currentLoadout: PeriodLoadoutSnapshot | null;
}

export function toBonusAttemptDto(
  attempt: BonusGameAttemptRow,
  derived: BonusAttemptDerivedState,
): BonusGameAttemptDTO {
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
    currentPeriodShotsTaken: derived.currentPeriodShotsTaken,
    goals: Number(attempt.goals),
    currentGoalStreak: Number(attempt.current_goal_streak),
    bestGoalStreak: Number(attempt.best_goal_streak),
    previewRequired: attempt.preview_acknowledged_at === null,
    currentLoadout: derived.currentLoadout,
    rewardGranted: derived.rewardGranted,
    attemptSeed: attempt.attempt_seed,
    gameCoreVersion: Number(attempt.game_core_version),
    rules: attempt.rules_snapshot,
    reward: attempt.reward_snapshot,
  };
}

export async function loadBonusAttemptDto(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
): Promise<BonusGameAttemptDTO> {
  const { rows } = await client.query<{
    current_period_shots_taken: number;
    reward_granted: boolean;
    current_loadout: PeriodLoadoutSnapshot | null;
  }>(
    `select
       (select count(*)::int
          from shot_session
         where mode = 'bonus'
           and bonus_game_attempt_id = $1
           and period_number = $2) as current_period_shots_taken,
       exists(
         select 1
           from user_bonus_game_completion
          where attempt_id = $1
       ) as reward_granted,
       (select loadout.snapshot
          from bonus_game_period_loadout loadout
         where loadout.attempt_id = $1 and loadout.period_number = $2) as current_loadout`,
    [attempt.id, attempt.current_period],
  );
  const derived = rows[0]!;
  return toBonusAttemptDto(attempt, {
    currentPeriodShotsTaken: Number(derived.current_period_shots_taken),
    rewardGranted: derived.reward_granted,
    currentLoadout: derived.current_loadout,
  });
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

async function fetchOwnedAttemptVersion(
  client: PoolClient,
  userId: string,
  attemptId: string,
): Promise<number> {
  const { rows } = await client.query<BonusAttemptVersionRow>(
    `select game_core_version
       from bonus_game_attempt
      where id = $1 and user_id = $2`,
    [attemptId, userId],
  );
  const attempt = rows[0];
  if (attempt === undefined) {
    throw new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
  }
  return Number(attempt.game_core_version);
}

function unsupportedBonusGameCoreVersion(): AppError {
  // There is no historical bonus resolver: never validate an old snapshot with current rules.
  return new AppError(
    BONUS_GAME_CORE_VERSION_MISMATCH_CODE,
    'bonus game version is no longer supported',
    409,
  );
}

async function fetchStartableGame(
  client: PoolClient,
  userId: string,
  gameId: string,
): Promise<StartableGameRow> {
  const { rows } = await client.query<StartableGameRow>(
    `select game.id, game.slug, game.title, game.status, game.access_type,
            game.skill_code, game.target_goals, game.qualification_rules, game.total_periods,
            game.break_duration_ms, game.use_inventory, game.preview_title,
            game.preview_story, game.preview_artwork_url, game.preview_revision,
            game.period_rules, game.reward_coins, game.reward_stars,
            game.reward_experience, game.arena_theme_id,
            game.goalkeeper_ready_url, game.goalkeeper_save_url, game.revision,
            arena.slug as arena_slug, arena.title as arena_title,
            arena.artwork_url as arena_artwork_url,
            arena.thumbnail_url as arena_thumbnail_url,
            predecessor.id as predecessor_id,
            (predecessor_completion.id is not null) as predecessor_completed,
            unlock.id as unlock_id, completion.id as completion_id,
            preview_preference.dismissed_revision as preview_dismissed_revision
       from bonus_game game
       join arena_theme arena on arena.id = game.arena_theme_id
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
       left join user_bonus_game_preview_preference preview_preference
         on preview_preference.user_id = $1 and preview_preference.bonus_game_id = game.id
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
          const attempt = await loadBonusAttemptDto(client, reconciled);
          await client.query('commit');
          return { attempt, created: false };
        }
        deferredError = new BonusAttemptAlreadyActiveError({
          id: reconciled.id,
          gameId: reconciled.bonus_game_id,
        });
      }
    }

    if (deferredError === null) {
      await lockBonusGameCatalogForRead(client);
      const settings = await getGameSettings(client);
      const game = await fetchStartableGame(client, input.userId, input.gameId);
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
      if (game.access_type === 'paid' && game.unlock_id === null && game.completion_id === null) {
        throw new AppError('bonus_purchase_required', 'bonus game purchase required', 409);
      }

      const periods = parseGameRules(game);
      const qualificationRules = normalizeBonusQualificationRules(game.qualification_rules, {
        targetGoals: Number(game.target_goals),
        shotsLimit: periods.reduce((sum, period) => sum + (period.shotsLimit ?? 0), 0),
      });
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
        skillCode: game.skill_code,
        revision: Number(game.revision),
        targetGoals: Number(game.target_goals),
        qualificationRules,
        totalPeriods: Number(game.total_periods),
        breakDurationMs: Number(game.break_duration_ms),
        useInventory: game.use_inventory,
        previewTitle: game.preview_title,
        previewStory: game.preview_story,
        previewArtworkUrl: game.preview_artwork_url,
        previewRevision: Number(game.preview_revision),
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
            goalkeeper_save_url, preview_acknowledged_at, created_at, updated_at)
         values ($1, $2, $3, 'active', 'idle', 0,
                 0, 0, $4, $5,
                 $6, $7::jsonb, $8::jsonb,
                 $9, $10::jsonb, $11, $12, $13, $14, $14)
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
          game.preview_dismissed_revision !== null &&
          Number(game.preview_dismissed_revision) >= Number(game.preview_revision)
            ? input.now
            : null,
          input.now,
        ],
      );
      const attempt = await loadBonusAttemptDto(client, rows[0]!);
      await client.query('commit');
      return { attempt, created: true };
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
  input: {
    userId: string;
    attemptId: string;
    now: Date;
    loadout?: PeriodLoadoutSelection;
  },
): Promise<BonusGameAttemptDTO> {
  const client = await begin(pool);
  let deferredError: AppError | null = null;
  let result: BonusGameAttemptDTO | null = null;
  try {
    await lockUser(client, input.userId);
    const owned = await fetchOwnedAttempt(client, input.userId, input.attemptId);
    const attempt = await reconcileBonusAttempt(client, owned, input.now);
    if (attempt.status !== 'active') {
      deferredError = new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
    } else if (attempt.preview_acknowledged_at === null) {
      deferredError = new AppError(
        'bonus_preview_required',
        'bonus game preview must be acknowledged',
        409,
      );
    } else if (!attempt.rules_snapshot.useInventory && hasPeriodLoadoutSelection(input.loadout)) {
      deferredError = new AppError(
        'bonus_inventory_disabled',
        'inventory is disabled for this bonus game',
        409,
      );
    } else if (
      attempt.state !== 'idle' ||
      attempt.current_period >= attempt.rules_snapshot.totalPeriods
    ) {
      deferredError = new AppError('bonus_period_not_ready', 'bonus period is not ready', 409);
    } else {
      const nextPeriod = Number(attempt.current_period) + 1;
      if (attempt.rules_snapshot.useInventory) {
        await consumePeriodLoadout(client, {
          userId: input.userId,
          attemptId: attempt.id,
          periodNumber: nextPeriod,
          selection: input.loadout ?? {},
          now: input.now,
        });
      }
      const { rows } = await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set state = 'period_active', current_period = current_period + 1,
                period_started_at = $1, break_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [input.now, attempt.id],
      );
      result = await loadBonusAttemptDto(client, rows[0]!);
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

export async function acknowledgeBonusPreview(
  pool: Pool,
  input: { userId: string; attemptId: string; dismissFuture: boolean; now: Date },
): Promise<BonusGameAttemptDTO> {
  const client = await begin(pool);
  try {
    await lockUser(client, input.userId);
    const attempt = await fetchOwnedAttempt(client, input.userId, input.attemptId);
    if (attempt.status !== 'active') {
      throw new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
    }
    if (input.dismissFuture) {
      await client.query(
        `insert into user_bonus_game_preview_preference
           (user_id, bonus_game_id, dismissed_revision, updated_at)
         values ($1, $2, $3, $4)
         on conflict (user_id, bonus_game_id) do update
           set dismissed_revision = greatest(
                 user_bonus_game_preview_preference.dismissed_revision,
                 excluded.dismissed_revision
               ),
               updated_at = excluded.updated_at`,
        [input.userId, attempt.bonus_game_id, attempt.rules_snapshot.previewRevision, input.now],
      );
    }
    const { rows } = await client.query<BonusGameAttemptRow>(
      `update bonus_game_attempt
          set preview_acknowledged_at = coalesce(preview_acknowledged_at, $1),
              updated_at = $1
        where id = $2
      returning *`,
      [input.now, attempt.id],
    );
    const result = await loadBonusAttemptDto(client, rows[0]!);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
      deferredError = new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
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
      result = await loadBonusAttemptDto(client, rows[0]!);
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

async function fetchAcceptedBonusShot(
  client: PoolClient,
  attemptId: string,
  periodNumber: number,
  shotIndex: number,
): Promise<BonusShotRow | null> {
  const { rows } = await client.query<BonusShotRow>(
    `select period_number, shot_index, server_result
       from shot_session
      where mode = 'bonus'
        and bonus_game_attempt_id = $1
        and period_number = $2
        and shot_index = $3
      order by id
      limit 1`,
    [attemptId, periodNumber, shotIndex],
  );
  return rows[0] ?? null;
}

async function countBonusPeriodShots(
  client: PoolClient,
  attemptId: string,
  periodNumber: number,
): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    `select count(*)::int as count
       from shot_session
      where mode = 'bonus'
        and bonus_game_attempt_id = $1
        and period_number = $2`,
    [attemptId, periodNumber],
  );
  return Number(rows[0]!.count);
}

function periodRuleForAttempt(attempt: BonusGameAttemptRow): BonusPeriodRule {
  let periods: BonusPeriodRule[];
  try {
    periods = parseBonusPeriodRules(
      attempt.rules_snapshot.periods,
      attempt.rules_snapshot.totalPeriods,
      attempt.rules_snapshot.targetGoals,
    );
  } catch {
    throw new AppError('internal_error', 'invalid bonus attempt rules snapshot', 500);
  }
  const period = periods[attempt.current_period - 1];
  if (period === undefined) {
    throw new AppError('internal_error', 'active bonus period is outside its snapshot', 500);
  }
  return period;
}

function qualificationForAttempt(attempt: BonusGameAttemptRow): BonusQualificationRules {
  return normalizeBonusQualificationRules(attempt.rules_snapshot.qualificationRules, {
    targetGoals: attempt.rules_snapshot.targetGoals,
    shotsLimit: attempt.rules_snapshot.periods.reduce(
      (sum, period) => sum + (period.shotsLimit ?? 0),
      0,
    ),
  });
}

async function activeElapsedMs(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
  now: Date,
): Promise<number> {
  const { rows } = await client.query<{ elapsed_ms: number }>(
    `select coalesce(sum(duration_ms), 0)::int as elapsed_ms
       from bonus_game_period_log
      where attempt_id = $1`,
    [attempt.id],
  );
  const archivedMs = Number(rows[0]?.elapsed_ms ?? 0);
  const currentMs =
    attempt.state === 'period_active' && attempt.period_started_at !== null
      ? Math.max(0, now.getTime() - attempt.period_started_at.getTime())
      : 0;
  return archivedMs + currentMs;
}

function authoritativeShotInput(
  input: SubmitBonusShotInput['input'],
  rule: BonusPeriodRule,
): ShotInput {
  return {
    tapTime: input.tapTime,
    shooterTapTime: input.shooterTapTime,
    puckSpeedPerMs: rule.puckSpeedPerMs,
    shooterFrequency: rule.shooterFrequency,
    goalieFrequency: rule.goalieFrequency,
    goalFrequency: rule.goalFrequency,
  };
}

const BONUS_SHOT_NETWORK_LAG_TOLERANCE_MS = 2_500;
const BONUS_SHOT_FUTURE_TOLERANCE_MS = 250;
const BONUS_SHOT_CLOCK_RELATION_TOLERANCE_MS = 100;

function invalidBonusShotTime(): AppError {
  return new AppError(BONUS_SHOT_TIME_INVALID_CODE, 'bonus shot timing is invalid', 400);
}

function assertBonusShotInputClockBase(
  input: unknown,
): asserts input is SubmitBonusShotInput['input'] {
  if (typeof input !== 'object' || input === null) {
    throw invalidBonusShotTime();
  }
  const clocks = input as { tapTime?: unknown; shooterTapTime?: unknown };
  if (
    typeof clocks.tapTime !== 'number' ||
    !Number.isFinite(clocks.tapTime) ||
    clocks.tapTime < 0 ||
    typeof clocks.shooterTapTime !== 'number' ||
    !Number.isFinite(clocks.shooterTapTime) ||
    clocks.shooterTapTime < 0
  ) {
    throw invalidBonusShotTime();
  }
}

function assertBonusShotTimeFresh(
  attempt: BonusGameAttemptRow,
  previousShots: number,
  input: SubmitBonusShotInput['input'],
  rule: BonusPeriodRule,
  now: Date,
): void {
  if (attempt.period_started_at === null) {
    throw new AppError('bonus_period_not_ready', 'active bonus period has no start time', 409);
  }

  const elapsedMs = Math.max(0, now.getTime() - attempt.period_started_at.getTime());
  const flightMs = (PUCK_START.y - GOAL_OPENING.y) / rule.puckSpeedPerMs;
  // The period clock is continuous. A successful shot response updates score
  // only and must never move the scene clock backwards.
  const expectedSceneTime = elapsedMs;
  const expectedShooterTime = expectedSceneTime - previousShots * flightMs;
  const isNearAuthoritativeClock = (actual: number, expected: number): boolean =>
    actual >= expected - BONUS_SHOT_NETWORK_LAG_TOLERANCE_MS &&
    actual <= expected + BONUS_SHOT_FUTURE_TOLERANCE_MS;

  if (
    !isNearAuthoritativeClock(input.tapTime, expectedSceneTime) ||
    !isNearAuthoritativeClock(input.shooterTapTime, expectedShooterTime)
  ) {
    throw new AppError(BONUS_SHOT_TIME_STALE_CODE, 'bonus shot timing is stale', 409);
  }

  const shooterLag = input.tapTime - input.shooterTapTime;
  const expectedShooterLag = previousShots * flightMs;
  if (Math.abs(shooterLag - expectedShooterLag) > BONUS_SHOT_CLOCK_RELATION_TOLERANCE_MS) {
    throw invalidBonusShotTime();
  }
}

export async function submitBonusShot(
  pool: Pool,
  input: SubmitBonusShotInput,
): Promise<SubmitBonusShotResult> {
  assertBonusShotInputClockBase(input.input);
  const client = await begin(pool);
  let deferredError: AppError | null = null;
  let response: SubmitBonusShotResult | null = null;
  try {
    // Read-only preflight keeps unsupported attempts free of account, shot, reward, and audit writes.
    if (
      (await fetchOwnedAttemptVersion(client, input.userId, input.attemptId)) !== GAME_CORE_VERSION
    ) {
      throw unsupportedBonusGameCoreVersion();
    }

    // Keep the global economy lock order stable: users, currency account, attempt.
    let balances = await lockBonusEconomyBalances(client, input.userId, input.now);
    const owned = await fetchOwnedAttempt(client, input.userId, input.attemptId);
    if (Number(owned.game_core_version) !== GAME_CORE_VERSION) {
      throw unsupportedBonusGameCoreVersion();
    }
    let attempt = await reconcileBonusAttempt(client, owned, input.now);

    if (attempt.status !== 'active' || attempt.state !== 'period_active') {
      const accepted = await fetchAcceptedBonusShot(
        client,
        attempt.id,
        attempt.current_period,
        input.claimedShotIndex,
      );
      if (accepted !== null) {
        response = {
          serverResult: accepted.server_result,
          attempt: await loadBonusAttemptDto(client, attempt),
          rewardGranted: null,
          balances,
        };
      } else if (attempt.status !== 'active') {
        deferredError = new AppError(
          'bonus_attempt_not_active',
          'bonus attempt is not active',
          409,
        );
      } else {
        deferredError = new AppError('bonus_period_not_ready', 'bonus period is not active', 409);
      }
    } else {
      const rule = periodRuleForAttempt(attempt);
      const acceptedShotCount = await countBonusPeriodShots(
        client,
        attempt.id,
        attempt.current_period,
      );
      const expectedShotIndex = acceptedShotCount + 1;
      if (input.claimedShotIndex !== expectedShotIndex) {
        deferredError = new AppError(
          'bonus_shot_index_mismatch',
          `bonus shot index mismatch: expected ${expectedShotIndex}`,
          409,
        );
      } else if (rule.shotsLimit !== null && acceptedShotCount >= rule.shotsLimit) {
        deferredError = new AppError(
          'bonus_period_not_ready',
          'bonus period shot quota is exhausted',
          409,
        );
      } else {
        assertBonusShotTimeFresh(attempt, acceptedShotCount, input.input, rule, input.now);
        const shotSeed = deriveShotSeed(
          attempt.attempt_seed,
          attempt.current_period,
          expectedShotIndex,
        );
        const shotInput = authoritativeShotInput(input.input, rule);
        const goalie = buildBonusGoalieConfig(
          attempt.rules_snapshot.slug,
          attempt.rules_snapshot.title,
          rule,
        );
        const serverResult = resolvePerspectiveCourtShot(
          shotInput,
          goalie,
          shotSeed,
          expectedShotIndex,
          STICK_NEUTRAL,
          getSessionPhaseOffsets(attempt.attempt_seed),
        ).type;

        if (input.claimedResult !== serverResult) {
          await appendEvent(
            client,
            input.userId,
            'shot_mismatch',
            {
              mode: 'bonus',
              bonus_game_attempt_id: attempt.id,
              period_number: attempt.current_period,
              shot_index: expectedShotIndex,
              claimed_result: input.claimedResult,
              server_result: serverResult,
            },
            input.now,
          );
          deferredError = new AppError(
            'bonus_shot_result_mismatch',
            'bonus shot result mismatch',
            409,
          );
        } else {
          await client.query(
            `insert into shot_session
               (user_id, mode, bonus_game_attempt_id, period_number, shot_index,
                seed, input_payload, server_result, game_core_version, created_at)
             values ($1, 'bonus', $2, $3, $4,
                     $5, $6::jsonb, $7, $8, $9)`,
            [
              input.userId,
              attempt.id,
              attempt.current_period,
              expectedShotIndex,
              shotSeed,
              JSON.stringify(shotInput),
              serverResult,
              attempt.game_core_version,
              input.now,
            ],
          );
          const nextStreak = advanceGoalStreak(
            {
              current: Number(attempt.current_goal_streak),
              best: Number(attempt.best_goal_streak),
            },
            serverResult,
          );
          const updated = await client.query<BonusGameAttemptRow>(
            `update bonus_game_attempt
                set shots_taken = shots_taken + 1,
                    goals = goals + $2,
                    current_goal_streak = $3,
                    best_goal_streak = $4,
                    updated_at = $5
              where id = $1
              returning *`,
            [
              attempt.id,
              serverResult === 'goal' ? 1 : 0,
              nextStreak.current,
              nextStreak.best,
              input.now,
            ],
          );
          attempt = updated.rows[0]!;

          let rewardGranted: BonusRewardSnapshot | null = null;
          const qualification = evaluateBonusQualification(qualificationForAttempt(attempt), {
            goals: Number(attempt.goals),
            shotsTaken: Number(attempt.shots_taken),
            bestGoalStreak: Number(attempt.best_goal_streak),
            activeElapsedMs: await activeElapsedMs(client, attempt, input.now),
          });
          if (qualification.passed) {
            await closeBonusPeriod(client, attempt, input.now, 'target_reached');
            const reward = await grantFirstClearReward(client, {
              userId: input.userId,
              gameId: attempt.bonus_game_id,
              attemptId: attempt.id,
              reward: attempt.reward_snapshot,
              now: input.now,
            });
            balances = reward.balances;
            rewardGranted = reward.granted ? attempt.reward_snapshot : null;
            const completed = await client.query<BonusGameAttemptRow>(
              `update bonus_game_attempt
                  set status = 'completed', state = 'closed', closed_at = $1,
                      period_started_at = null, break_started_at = null, updated_at = $1
                where id = $2
                returning *`,
              [input.now, attempt.id],
            );
            attempt = completed.rows[0]!;
          } else if (rule.shotsLimit !== null && expectedShotIndex >= rule.shotsLimit) {
            attempt = await reconcileBonusAttempt(client, attempt, input.now);
          }

          response = {
            serverResult,
            attempt: await loadBonusAttemptDto(client, attempt),
            rewardGranted,
            balances,
          };
        }
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (deferredError !== null) throw deferredError;
  return response!;
}
