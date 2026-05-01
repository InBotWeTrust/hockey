import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
} from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';
import { deriveShotSeed, deriveTrainingSeed } from '../seed.js';

const TRAINING_GOALIE_ID = 'rookie';
const TRAINING_SHOTS_LIMIT = 50;

const startBodySchema = z.object({
  period_number: z.number().int().min(1).max(3),
});

const shotBodySchema = z.object({
  shot_index: z.number().int().min(1),
  input: z.object({
    tapTime: z.number(),
    shooterTapTime: z.number().optional(),
    puckSpeedPerMs: z.number().optional(),
    shooterFrequency: z.number().optional(),
    goalieFrequency: z.number().optional(),
    goalFrequency: z.number().optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

interface TrainingSessionRow {
  id: string;
  user_id: string;
  day_date: string;
  selected_period: number;
  state: 'active' | 'closed';
  game_core_version: number;
  training_seed: string;
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
  goalie_id: string;
}

interface TrainingShotSubmitResponse {
  server_result: 'goal' | 'save' | 'miss';
  state: TrainingStateResponse;
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
            game_core_version, training_seed, started_at, closed_at
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
  session: TrainingSessionRow | null,
  localToday: string,
  timezone: string,
): Promise<TrainingStateResponse> {
  const nextDay = await nextDayStartsAt(client, localToday, timezone);
  if (session === null) {
    return {
      state: 'idle',
      selected_period: null,
      shots_taken: 0,
      goals: 0,
      shots_limit: TRAINING_SHOTS_LIMIT,
      day_date: localToday,
      next_day_starts_at: nextDay,
      training_seed: null,
      goalie_id: TRAINING_GOALIE_ID,
    };
  }

  const stats = await aggregateTraining(client, session.id);
  return {
    state: session.state,
    selected_period: session.selected_period,
    shots_taken: stats.shots,
    goals: stats.goals,
    shots_limit: TRAINING_SHOTS_LIMIT,
    day_date: session.day_date,
    next_day_starts_at: nextDay,
    training_seed: session.training_seed,
    goalie_id: TRAINING_GOALIE_ID,
  };
}

export const trainingRoutes: FastifyPluginAsync<{ trainingSeedSecret: string }> = async (
  app,
  opts,
) => {
  app.get('/duel/training/state', { preHandler: [app.authenticate] }, async (req) =>
    withTransaction(app, async (client): Promise<TrainingStateResponse> => {
      const { session, localToday, timezone } = await reconcileTrainingSession(
        client,
        req.user.id,
        new Date(),
      );
      return buildTrainingState(client, session, localToday, timezone);
    }),
  );

  app.post('/duel/training/start', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = startBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid training start payload', 400);
    }
    const { period_number: selectedPeriod } = parsed.data;

    return withTransaction(app, async (client): Promise<TrainingStateResponse> => {
      const now = new Date();
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
                          game_core_version, training_seed, started_at, closed_at`,
            [selectedPeriod, session.id],
          );
          return buildTrainingState(client, rows[0]!, localToday, timezone);
        }
        return buildTrainingState(client, session, localToday, timezone);
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
              training_seed, started_at)
           values ($1, $2::date, $3, 'active', $4, $5, $6)
           returning id, user_id, day_date::text as day_date, selected_period, state,
                     game_core_version, training_seed, started_at, closed_at`,
        [req.user.id, localToday, selectedPeriod, GAME_CORE_VERSION, trainingSeed, now],
      );
      const created = rows[0]!;
      await appendEvent(client, req.user.id, 'training_session_created', {
        training_session_id: created.id,
        day_date: localToday,
        selected_period: selectedPeriod,
      });
      return buildTrainingState(client, created, localToday, timezone);
    });
  });

  app.post('/duel/training/shot', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = shotBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid training shot payload', 400);
    }
    const body = parsed.data;

    return withTransaction(app, async (client): Promise<TrainingShotSubmitResponse> => {
      const now = new Date();
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
      if (stats.shots >= TRAINING_SHOTS_LIMIT) {
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

      const shotSeed = deriveShotSeed(
        session.training_seed,
        session.selected_period,
        body.shot_index,
      );
      const periodSpeeds = getDailyPeriodSpeedPreset(session.selected_period);
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
      const result = resolveShot(
        shotInput,
        getGoalie(TRAINING_GOALIE_ID),
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
          shot_index: body.shot_index,
          claimed_result: body.claimed_result,
          server_result: serverResult,
        });
      }

      if (expectedShotIndex >= TRAINING_SHOTS_LIMIT) {
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
      }

      const nextSession = await fetchTodayTrainingSession(client, req.user.id, localToday);
      const state = await buildTrainingState(client, nextSession, localToday, timezone);
      return { server_result: serverResult, state };
    });
  });
};
