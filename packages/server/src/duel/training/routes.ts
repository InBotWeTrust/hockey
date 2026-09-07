import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getGoalie,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  type DailyPeriodSpeedPreset,
} from '@hockey/game-core';
import {
  evaluatePendingDailyPeriodClosedAchievements,
  evaluateTrainingClosedAchievements,
} from '../../achievements/engine.js';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';
import { deriveShotSeed, deriveTrainingSeed } from '../seed.js';
import { reconcileDayPool, type DayPoolRow } from '../daily/reconcile.js';
import { scheduleDailyCompletionSideEffect } from '../daily/completionSideEffects.js';
import {
  getConfiguredDailyPeriodSpeedPreset,
  getGameSettings,
  type GameSettings,
} from '../gameSettings.js';
import {
  assertGameplayActionAllowed,
  assertTournamentGameplayAllowed,
  getTournamentGameplayLockState,
  lockUserGameplay,
  type GameplayLockState,
} from '../gameplayLocks.js';

const startBodySchema = z.object({
  period_number: z.number().int().min(1).max(3),
});

const shotBodySchema = z.object({
  shot_index: z.number().int().min(1),
  input: z.object({
    tapTime: z.number(),
    shooterTapTime: z.number().optional(),
    puckSpeedPerMs: z.number().min(0.2).max(5).optional(),
    shooterFrequency: z.number().min(0.1).max(3).optional(),
    goalieFrequency: z.number().min(0.1).max(3).optional(),
    goalFrequency: z.number().min(0.1).max(3).optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const TAP_TIME_FUTURE_TOLERANCE_MS = 2500;
const TAP_TIME_STALE_TOLERANCE_MS = 12_000;
const TAP_TIME_PAUSE_ALLOWANCE_PER_SHOT_MS = 2_000;

interface TrainingSessionRow {
  id: string;
  user_id: string;
  day_date: string;
  selected_period: number;
  state: 'active' | 'closed';
  game_core_version: number;
  training_seed: string;
  shots_limit: number;
  started_at: Date;
  closed_at: Date | null;
}

interface TrainingStateResponse {
  state: 'idle' | 'active' | 'closed';
  selected_period: number | null;
  shots_taken: number;
  goals: number;
  shots_limit: number;
  day_date: string;
  next_day_starts_at: string;
  training_seed: string | null;
  started_at: string | null;
  server_now: string;
  goalie_id: string;
  period_speed_presets: DailyPeriodSpeedPreset[];
  tournament_day_locked: boolean;
  tournament_day_starts_at: string | null;
}

interface TrainingShotSubmitResponse {
  server_result: 'goal' | 'save' | 'miss';
  state: TrainingStateResponse;
}

interface TrainingHistorySession {
  day_date: string;
  selected_period: number;
  shots_limit: number;
  total_shots: number;
  total_goals: number;
  completed: boolean;
}

interface TrainingHistorySummary {
  played_trainings: number;
  completed_trainings: number;
  total_shots: number;
  total_goals: number;
}

function isDailyGameStartedAndIncomplete(pool: DayPoolRow | null, totalPeriods: number): boolean {
  if (pool === null || pool.state === 'closed') return false;
  if (pool.state === 'period_active' || pool.state === 'break_active') return true;
  return pool.state === 'idle' && pool.current_period > 0 && pool.current_period < totalPeriods;
}

async function withTransaction<T>(
  app: { pg: { connect: () => Promise<PoolClient> } },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchUserTimezone(client: PoolClient, userId: string): Promise<string> {
  const { rows } = await client.query<{ timezone: string }>(
    'select timezone from users where id = $1',
    [userId],
  );
  return rows[0]?.timezone ?? 'UTC';
}

async function fetchLocalToday(client: PoolClient, timezone: string, now: Date): Promise<string> {
  const { rows } = await client.query<{ local_today: string }>(
    `select to_char($1::timestamptz at time zone $2, 'YYYY-MM-DD') as local_today`,
    [now.toISOString(), timezone],
  );
  return rows[0]!.local_today;
}

async function nextDayStartsAt(
  client: PoolClient,
  localToday: string,
  timezone: string,
): Promise<string> {
  const { rows } = await client.query<{ ts: string }>(
    `select (($1::date + interval '1 day')::timestamp at time zone $2)::text as ts`,
    [localToday, timezone],
  );
  return new Date(rows[0]!.ts).toISOString();
}

async function aggregateTraining(
  client: PoolClient,
  trainingSessionId: string,
): Promise<{ shots: number; goals: number }> {
  const { rows } = await client.query<{ shots: string; goals: string }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'training' and training_session_id = $1`,
    [trainingSessionId],
  );
  return {
    shots: Number(rows[0]!.shots),
    goals: Number(rows[0]!.goals),
  };
}

async function fetchTodayTrainingSession(
  client: PoolClient,
  userId: string,
  localToday: string,
): Promise<TrainingSessionRow | null> {
  const { rows } = await client.query<TrainingSessionRow>(
    `select id, user_id, day_date::text as day_date, selected_period, state,
            game_core_version, training_seed, shots_limit, started_at, closed_at
       from training_session
      where user_id = $1 and day_date = $2::date
      for update`,
    [userId, localToday],
  );
  return rows[0] ?? null;
}

async function reconcileTrainingSession(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<{ session: TrainingSessionRow | null; localToday: string; timezone: string }> {
  const timezone = await fetchUserTimezone(client, userId);
  const localToday = await fetchLocalToday(client, timezone, now);
  await client.query(
    `update training_session
        set state = 'closed', closed_at = coalesce(closed_at, $3)
      where user_id = $1 and day_date <> $2::date and state = 'active'`,
    [userId, localToday, now],
  );
  const session = await fetchTodayTrainingSession(client, userId, localToday);
  return { session, localToday, timezone };
}

async function buildTrainingState(
  client: PoolClient,
  userId: string,
  session: TrainingSessionRow | null,
  localToday: string,
  timezone: string,
  settings: GameSettings,
  now: Date,
  knownTournamentLock?: GameplayLockState,
): Promise<TrainingStateResponse> {
  const nextDay = await nextDayStartsAt(client, localToday, timezone);
  const tournamentLock =
    knownTournamentLock ?? (await getTournamentGameplayLockState(client, userId, now));
  const tournamentDayLocked =
    tournamentLock.blocked &&
    (tournamentLock.reason === 'scheduled_tournament' ||
      tournamentLock.reason === 'active_classic');
  if (session === null) {
    return {
      state: 'idle',
      selected_period: null,
      shots_taken: 0,
      goals: 0,
      shots_limit: settings.training.shotsLimit,
      day_date: localToday,
      next_day_starts_at: nextDay,
      training_seed: null,
      started_at: null,
      server_now: now.toISOString(),
      goalie_id: settings.training.goalieId,
      period_speed_presets: settings.daily.periodSpeedPresets,
      tournament_day_locked: tournamentDayLocked,
      tournament_day_starts_at: tournamentLock.tournamentStartsAt?.toISOString() ?? null,
    };
  }

  const stats = await aggregateTraining(client, session.id);
  return {
    state: session.state,
    selected_period: session.selected_period,
    shots_taken: stats.shots,
    goals: stats.goals,
    shots_limit: session.shots_limit,
    day_date: session.day_date,
    next_day_starts_at: nextDay,
    training_seed: session.training_seed,
    started_at: session.started_at.toISOString(),
    server_now: now.toISOString(),
    goalie_id: settings.training.goalieId,
    period_speed_presets: settings.daily.periodSpeedPresets,
    tournament_day_locked: tournamentDayLocked,
    tournament_day_starts_at: tournamentLock.tournamentStartsAt?.toISOString() ?? null,
  };
}

async function fetchTrainingHistory(
  client: PoolClient,
  userId: string,
  limit: number,
  offset: number,
): Promise<{
  sessions: TrainingHistorySession[];
  hasMore: boolean;
  nextOffset: number | null;
  summary: TrainingHistorySummary;
}> {
  const { rows } = await client.query<{
    day_date: string;
    selected_period: number;
    shots_limit: number;
    total_shots: number;
    total_goals: number;
  }>(
    `select to_char(ts.day_date, 'YYYY-MM-DD') as day_date,
            ts.selected_period,
            ts.shots_limit,
            count(ss.id)::int as total_shots,
            count(ss.id) filter (where ss.server_result = 'goal')::int as total_goals
       from training_session ts
       left join shot_session ss
         on ss.training_session_id = ts.id
        and ss.user_id = ts.user_id
        and ss.mode = 'training'
      where ts.user_id = $1
      group by ts.id
      order by ts.day_date desc, ts.started_at desc
      limit $2 offset $3`,
    [userId, limit + 1, offset],
  );
  const sessions = rows.slice(0, limit).map((row) => ({
    day_date: row.day_date,
    selected_period: Number(row.selected_period),
    shots_limit: Number(row.shots_limit),
    total_shots: Number(row.total_shots),
    total_goals: Number(row.total_goals),
    completed: Number(row.total_shots) >= Number(row.shots_limit),
  }));
  const { rows: summaryRows } = await client.query<TrainingHistorySummary>(
    `with session_totals as (
       select ts.id,
              ts.shots_limit,
              count(ss.id)::int as total_shots,
              count(ss.id) filter (where ss.server_result = 'goal')::int as total_goals
         from training_session ts
         left join shot_session ss
           on ss.training_session_id = ts.id
          and ss.user_id = ts.user_id
          and ss.mode = 'training'
        where ts.user_id = $1
        group by ts.id
     )
     select count(*) filter (where total_shots > 0)::int as played_trainings,
            count(*) filter (where total_shots >= shots_limit)::int as completed_trainings,
            coalesce(sum(total_shots), 0)::int as total_shots,
            coalesce(sum(total_goals), 0)::int as total_goals
       from session_totals`,
    [userId],
  );
  const summary = summaryRows[0] ?? {
    played_trainings: 0,
    completed_trainings: 0,
    total_shots: 0,
    total_goals: 0,
  };
  const hasMore = rows.length > limit;
  return {
    sessions,
    hasMore,
    nextOffset: hasMore ? offset + sessions.length : null,
    summary: {
      played_trainings: Number(summary.played_trainings),
      completed_trainings: Number(summary.completed_trainings),
      total_shots: Number(summary.total_shots),
      total_goals: Number(summary.total_goals),
    },
  };
}

function assertTrainingTapTimeFresh(
  session: TrainingSessionRow,
  previousShots: number,
  tapTime: number,
  now: Date,
): void {
  if (!Number.isFinite(tapTime) || tapTime < 0) {
    throw new AppError('bad_request', 'invalid training shot tapTime', 400);
  }

  const elapsedMs = Math.max(0, now.getTime() - session.started_at.getTime());
  const futureLimit = elapsedMs + TAP_TIME_FUTURE_TOLERANCE_MS;
  const staleLimit = Math.max(
    0,
    elapsedMs - TAP_TIME_STALE_TOLERANCE_MS - previousShots * TAP_TIME_PAUSE_ALLOWANCE_PER_SHOT_MS,
  );

  if (tapTime > futureLimit || tapTime < staleLimit) {
    throw new AppError('conflict', 'training shot tapTime is stale', 409);
  }
}

async function assertTrainingAvailableDuringDaily(
  client: PoolClient,
  userId: string,
  now: Date,
  settings: GameSettings,
): Promise<void> {
  const { pool } = await reconcileDayPool(client, userId, now, settings.daily);
  if (isDailyGameStartedAndIncomplete(pool, settings.daily.totalPeriods)) {
    throw new AppError('conflict', 'training is locked while the daily game is in progress', 409);
  }
}

export const trainingRoutes: FastifyPluginAsync<{ trainingSeedSecret: string }> = async (
  app,
  opts,
) => {
  const schedulePendingAchievementRecovery = (userId: string): void => {
    scheduleDailyCompletionSideEffect(
      () => evaluatePendingDailyPeriodClosedAchievements(app.pg, userId),
      (error) => {
        app.log.warn({ err: error, userId }, 'failed to recover pending daily period achievements');
      },
    );
  };

  app.get('/duel/training/state', { preHandler: [app.authenticate] }, async (req) =>
    withTransaction(app, async (client): Promise<TrainingStateResponse> => {
      const now = new Date();
      const settings = await getGameSettings(client);
      const { session, localToday, timezone } = await reconcileTrainingSession(
        client,
        req.user.id,
        now,
      );
      return buildTrainingState(client, req.user.id, session, localToday, timezone, settings, now);
    }),
  );

  app.get('/duel/training/history', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError('bad_request', 'invalid training history query', 400);
    return withTransaction(app, async (client) => {
      const now = new Date();
      await reconcileTrainingSession(client, req.user.id, now);
      return fetchTrainingHistory(client, req.user.id, parsed.data.limit, parsed.data.offset);
    });
  });

  app.post('/duel/training/start', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = startBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid training start payload', 400);
    }
    const { period_number: selectedPeriod } = parsed.data;

    const state = await withTransaction(app, async (client): Promise<TrainingStateResponse> => {
      await lockUserGameplay(client, req.user.id);
      const now = new Date();
      const settings = await getGameSettings(client);
      await assertGameplayActionAllowed(client, {
        userId: req.user.id,
        action: 'start_training',
        now,
      });
      await assertTrainingAvailableDuringDaily(client, req.user.id, now, settings);
      const tournamentLock = await getTournamentGameplayLockState(client, req.user.id, now);
      const { session, localToday, timezone } = await reconcileTrainingSession(
        client,
        req.user.id,
        now,
      );
      if (session !== null) {
        if (session.state === 'active' && session.selected_period !== selectedPeriod) {
          const { rows } = await client.query<TrainingSessionRow>(
            `update training_session
                set selected_period = $1
              where id = $2
              returning id, user_id, day_date::text as day_date, selected_period, state,
                        game_core_version, training_seed, shots_limit, started_at, closed_at`,
            [selectedPeriod, session.id],
          );
          return buildTrainingState(
            client,
            req.user.id,
            rows[0]!,
            localToday,
            timezone,
            settings,
            now,
            tournamentLock,
          );
        }
        return buildTrainingState(
          client,
          req.user.id,
          session,
          localToday,
          timezone,
          settings,
          now,
          tournamentLock,
        );
      }

      const trainingSeed = deriveTrainingSeed(
        req.user.id,
        localToday,
        selectedPeriod,
        opts.trainingSeedSecret,
      );
      const { rows } = await client.query<TrainingSessionRow>(
        `insert into training_session
             (user_id, day_date, selected_period, state, game_core_version,
              training_seed, shots_limit, started_at)
           values ($1, $2::date, $3, 'active', $4, $5, $6, $7)
           on conflict (user_id, day_date) do update
             set selected_period = case
                   when training_session.state = 'active' then excluded.selected_period
                   else training_session.selected_period
                 end
           returning id, user_id, day_date::text as day_date, selected_period, state,
                     game_core_version, training_seed, shots_limit, started_at, closed_at`,
        [
          req.user.id,
          localToday,
          selectedPeriod,
          GAME_CORE_VERSION,
          trainingSeed,
          settings.training.shotsLimit,
          now,
        ],
      );
      const created = rows[0]!;
      await appendEvent(client, req.user.id, 'training_session_created', {
        training_session_id: created.id,
        day_date: localToday,
        selected_period: selectedPeriod,
      });
      return buildTrainingState(
        client,
        req.user.id,
        created,
        localToday,
        timezone,
        settings,
        now,
        tournamentLock,
      );
    });
    schedulePendingAchievementRecovery(req.user.id);
    return state;
  });

  app.post('/duel/training/shot', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = shotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid training shot payload', 400);
    }
    const body = parsed.data;

    const response = await withTransaction(
      app,
      async (client): Promise<TrainingShotSubmitResponse> => {
        await lockUserGameplay(client, req.user.id);
        const now = new Date();
        const settings = await getGameSettings(client);
        await assertTournamentGameplayAllowed(client, req.user.id, now);
        await assertTrainingAvailableDuringDaily(client, req.user.id, now, settings);
        const tournamentLock = await getTournamentGameplayLockState(client, req.user.id, now);
        const { session, localToday, timezone } = await reconcileTrainingSession(
          client,
          req.user.id,
          now,
        );
        if (session === null) {
          throw new AppError('conflict', 'no active training session', 409);
        }
        if (session.state !== 'active') {
          throw new AppError('conflict', 'training session is closed', 409);
        }

        const stats = await aggregateTraining(client, session.id);
        if (stats.shots >= session.shots_limit) {
          throw new AppError('conflict', 'training shot quota exhausted', 409);
        }
        const expectedShotIndex = stats.shots + 1;
        if (body.shot_index !== expectedShotIndex) {
          throw new AppError(
            'conflict',
            `shot_index mismatch: expected ${expectedShotIndex}, got ${body.shot_index}`,
            409,
          );
        }
        assertTrainingTapTimeFresh(session, stats.shots, body.input.tapTime, now);

        const shotSeed = deriveShotSeed(
          session.training_seed,
          session.selected_period,
          body.shot_index,
        );
        const periodSpeeds = getConfiguredDailyPeriodSpeedPreset(
          settings.daily.periodSpeedPresets,
          session.selected_period,
        );
        const shotInput = {
          tapTime: body.input.tapTime,
          ...(body.input.shooterTapTime !== undefined
            ? { shooterTapTime: body.input.shooterTapTime }
            : {}),
          puckSpeedPerMs: periodSpeeds.puckSpeedPerMs,
          shooterFrequency: periodSpeeds.shooterFrequency,
          goalieFrequency: periodSpeeds.goalieFrequency,
          goalFrequency: periodSpeeds.goalFrequency,
        };
        const result = resolvePerspectiveCourtShot(
          shotInput,
          getGoalie(settings.training.goalieId),
          shotSeed,
          body.shot_index,
          STICK_NEUTRAL,
          getSessionPhaseOffsets(session.training_seed),
        );
        const serverResult: 'goal' | 'save' | 'miss' = result.type;

        await client.query(
          `insert into shot_session
           (user_id, mode, training_session_id, period_number, shot_index, seed,
            input_payload, server_result, game_core_version)
         values ($1, 'training', $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            session.id,
            session.selected_period,
            body.shot_index,
            shotSeed,
            JSON.stringify(shotInput),
            serverResult,
            session.game_core_version,
          ],
        );

        if (body.claimed_result !== serverResult) {
          await appendEvent(client, req.user.id, 'shot_mismatch', {
            mode: 'training',
            training_session_id: session.id,
            period_number: session.selected_period,
            shot_index: body.shot_index,
            claimed_result: body.claimed_result,
            server_result: serverResult,
          });
        }

        if (expectedShotIndex >= session.shots_limit) {
          await client.query(
            `update training_session
              set state = 'closed', closed_at = $1
            where id = $2`,
            [now, session.id],
          );
          await appendEvent(client, req.user.id, 'training_session_closed', {
            training_session_id: session.id,
            closed_reason: 'quota',
          });
          await evaluateTrainingClosedAchievements(client, {
            userId: req.user.id,
            trainingSessionId: session.id,
            dayDate: session.day_date,
            shotsLimit: session.shots_limit,
            dailyTotalPeriods: settings.daily.totalPeriods,
            dailyShotsPerPeriod: settings.daily.shotsPerPeriod,
          });
        }

        const nextSession = await fetchTodayTrainingSession(client, req.user.id, localToday);
        const state = await buildTrainingState(
          client,
          req.user.id,
          nextSession,
          localToday,
          timezone,
          settings,
          now,
          tournamentLock,
        );
        return { server_result: serverResult, state };
      },
    );
    schedulePendingAchievementRecovery(req.user.id);
    return response;
  });
};
