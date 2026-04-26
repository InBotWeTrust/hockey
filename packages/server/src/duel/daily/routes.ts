import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
} from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';
import { deriveDailySeed, deriveShotSeed } from '../seed.js';
import {
  BREAK_DURATION_MS,
  PERIOD_DURATION_MS,
  SHOTS_PER_PERIOD,
  TOTAL_PERIODS,
  reconcileDayPool,
  type DayPoolRow,
} from './reconcile.js';

const DAILY_GOALIE_ID = 'rookie';

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

interface PeriodLogEntry {
  period_number: number;
  shots_taken: number;
  goals: number;
  closed_reason: 'quota' | 'timeout' | 'day_end';
  ended_at: string;
}

interface DailyStateResponse {
  state: 'idle' | 'period_active' | 'break_active' | 'closed';
  current_period: number;
  current_period_shots: number;
  current_period_goals: number;
  daily_total_shots: number;
  daily_total_goals: number;
  lifetime_total_shots: number;
  lifetime_total_goals: number;
  period_ends_at: string | null;
  break_ends_at: string | null;
  day_date: string | null;
  next_day_starts_at: string;
  daily_seed: string | null;
  goalie_id: string;
  shots_per_period: number;
  total_periods: number;
  recent_periods: PeriodLogEntry[];
}

async function fetchUserTimezone(
  client: PoolClient,
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ timezone: string }>(
    'select timezone from users where id = $1',
    [userId],
  );
  return rows[0]?.timezone ?? 'UTC';
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

async function fetchRecentPeriods(
  client: PoolClient,
  dayPoolId: string,
): Promise<PeriodLogEntry[]> {
  const { rows } = await client.query<{
    period_number: number;
    shots_taken: number;
    goals: number;
    closed_reason: 'quota' | 'timeout' | 'day_end';
    ended_at: Date;
  }>(
    `select period_number, shots_taken, goals, closed_reason, ended_at
       from period_log
      where day_pool_id = $1
      order by period_number asc`,
    [dayPoolId],
  );
  return rows.map((r) => ({
    period_number: r.period_number,
    shots_taken: r.shots_taken,
    goals: r.goals,
    closed_reason: r.closed_reason,
    ended_at: r.ended_at.toISOString(),
  }));
}

async function fetchLifetime(
  client: PoolClient,
  userId: string,
): Promise<{ shots: number; goals: number }> {
  const { rows } = await client.query<{ shots: number; goals: number }>(
    `select lifetime_shots_total as shots, lifetime_goals_total as goals
       from users where id = $1`,
    [userId],
  );
  if (rows.length === 0) return { shots: 0, goals: 0 };
  return { shots: Number(rows[0]!.shots), goals: Number(rows[0]!.goals) };
}

interface ShotSubmitResponse {
  server_result: 'goal' | 'save' | 'miss';
  state: DailyStateResponse;
}

async function aggregateCurrentPeriod(
  client: PoolClient,
  dayPoolId: string,
  periodNumber: number,
): Promise<{ shots: number; goals: number }> {
  const { rows } = await client.query<{ shots: string; goals: string }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'daily' and day_pool_id = $1 and period_number = $2`,
    [dayPoolId, periodNumber],
  );
  return {
    shots: Number(rows[0]!.shots),
    goals: Number(rows[0]!.goals),
  };
}

async function aggregateDailyTotals(
  client: PoolClient,
  dayPoolId: string,
): Promise<{ shots: number; goals: number }> {
  const { rows } = await client.query<{ shots: string; goals: string }>(
    `select coalesce(sum(shots_taken), 0)::int as shots,
            coalesce(sum(goals), 0)::int as goals
       from period_log
      where day_pool_id = $1`,
    [dayPoolId],
  );
  return {
    shots: Number(rows[0]!.shots),
    goals: Number(rows[0]!.goals),
  };
}

async function buildState(
  client: PoolClient,
  pool: DayPoolRow | null,
  localToday: string,
  userId: string,
): Promise<DailyStateResponse> {
  const timezone = await fetchUserTimezone(client, userId);
  const nextDay = await nextDayStartsAt(client, localToday, timezone);

  if (pool === null) {
    const lifetime = await fetchLifetime(client, userId);
    return {
      state: 'idle',
      current_period: 0,
      current_period_shots: 0,
      current_period_goals: 0,
      daily_total_shots: 0,
      daily_total_goals: 0,
      lifetime_total_shots: lifetime.shots,
      lifetime_total_goals: lifetime.goals,
      period_ends_at: null,
      break_ends_at: null,
      day_date: localToday,
      next_day_starts_at: nextDay,
      daily_seed: null,
      goalie_id: DAILY_GOALIE_ID,
      shots_per_period: SHOTS_PER_PERIOD,
      total_periods: TOTAL_PERIODS,
      recent_periods: [],
    };
  }

  const archived = await aggregateDailyTotals(client, pool.id);
  let currentShots = 0;
  let currentGoals = 0;
  if (pool.state === 'period_active') {
    const cur = await aggregateCurrentPeriod(client, pool.id, pool.current_period);
    currentShots = cur.shots;
    currentGoals = cur.goals;
  }
  // lifetime_*_total in users only includes closed periods. Add the still-open
  // period's shots so the response stays in sync with what the player sees.
  const lifetimeStored = await fetchLifetime(client, userId);
  const recentPeriods = await fetchRecentPeriods(client, pool.id);

  const periodEndsAt =
    pool.state === 'period_active' && pool.period_started_at !== null
      ? new Date(pool.period_started_at.getTime() + PERIOD_DURATION_MS).toISOString()
      : null;
  const breakEndsAt =
    pool.state === 'break_active' && pool.break_started_at !== null
      ? new Date(pool.break_started_at.getTime() + BREAK_DURATION_MS).toISOString()
      : null;

  return {
    state: pool.state,
    current_period: pool.current_period,
    current_period_shots: currentShots,
    current_period_goals: currentGoals,
    daily_total_shots: archived.shots + currentShots,
    daily_total_goals: archived.goals + currentGoals,
    lifetime_total_shots: lifetimeStored.shots + currentShots,
    lifetime_total_goals: lifetimeStored.goals + currentGoals,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    day_date: pool.day_date,
    next_day_starts_at: nextDay,
    daily_seed: pool.daily_seed,
    goalie_id: DAILY_GOALIE_ID,
    shots_per_period: SHOTS_PER_PERIOD,
    total_periods: TOTAL_PERIODS,
    recent_periods: recentPeriods,
  };
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

export const dailyRoutes: FastifyPluginAsync<{ dailySeedSecret: string }> = async (
  app,
  opts,
) => {
  app.get('/duel/daily/state', { preHandler: [app.authenticate] }, async (req) => {
    return withTransaction(app, async (client) => {
      const { pool, localToday } = await reconcileDayPool(
        client,
        req.user.id,
        new Date(),
      );
      return buildState(client, pool, localToday, req.user.id);
    });
  });

  app.post(
    '/duel/daily/period/start',
    { preHandler: [app.authenticate] },
    async (req) => {
      return withTransaction(app, async (client) => {
        const now = new Date();
        const { pool, timezone, localToday } = await reconcileDayPool(
          client,
          req.user.id,
          now,
        );

        if (pool !== null) {
          if (pool.state !== 'idle') {
            throw new AppError(
              'conflict',
              `cannot start period in state '${pool.state}'`,
              409,
            );
          }
          if (pool.current_period >= TOTAL_PERIODS) {
            throw new AppError(
              'conflict',
              'all periods completed for this day',
              409,
            );
          }
          const { rows } = await client.query<DayPoolRow>(
            `update day_pool
                set state='period_active',
                    current_period = current_period + 1,
                    period_started_at = $1,
                    break_started_at = null
              where id = $2
            returning *`,
            [now, pool.id],
          );
          return buildState(client, rows[0]!, localToday, req.user.id);
        }

        // Lazy create new day_pool — first period of the day.
        const dailySeed = deriveDailySeed(
          req.user.id,
          localToday,
          opts.dailySeedSecret,
        );
        const { rows } = await client.query<DayPoolRow>(
          `insert into day_pool
             (user_id, day_date, state, current_period,
              period_started_at, game_core_version, daily_seed)
           values ($1, $2, 'period_active', 1, $3, $4, $5)
        returning *`,
          [req.user.id, localToday, now, GAME_CORE_VERSION, dailySeed],
        );
        await appendEvent(client, req.user.id, 'day_pool_created', {
          day_pool_id: rows[0]!.id,
          day_date: localToday,
          timezone,
          game_core_version: GAME_CORE_VERSION,
        });
        return buildState(client, rows[0]!, localToday, req.user.id);
      });
    },
  );

  app.post(
    '/duel/daily/shot',
    { preHandler: [app.authenticate] },
    async (req) => {
      const parsed = shotBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('bad_request', 'invalid shot payload', 400);
      }
      const body = parsed.data;

      return withTransaction(app, async (client): Promise<ShotSubmitResponse> => {
        const now = new Date();
        const { pool, localToday } = await reconcileDayPool(
          client,
          req.user.id,
          now,
        );
        if (pool === null) {
          throw new AppError('conflict', 'no active day_pool', 409);
        }
        if (pool.state !== 'period_active') {
          throw new AppError(
            'conflict',
            `cannot submit shot in state '${pool.state}'`,
            409,
          );
        }

        const cur = await aggregateCurrentPeriod(client, pool.id, pool.current_period);
        const expectedShotIndex = cur.shots + 1;
        if (body.shot_index !== expectedShotIndex) {
          throw new AppError(
            'conflict',
            `shot_index mismatch: expected ${expectedShotIndex}, got ${body.shot_index}`,
            409,
          );
        }
        if (cur.shots >= SHOTS_PER_PERIOD) {
          throw new AppError('conflict', 'shot quota for this period exhausted', 409);
        }

        const shotSeed = deriveShotSeed(
          pool.daily_seed,
          pool.current_period,
          body.shot_index,
        );
        const goalieCfg = getGoalie(DAILY_GOALIE_ID);
        const phaseOffsets = getSessionPhaseOffsets(pool.daily_seed);
        const shotInput = {
          tapTime: body.input.tapTime,
          ...(body.input.shooterTapTime !== undefined
            ? { shooterTapTime: body.input.shooterTapTime }
            : {}),
          ...(body.input.puckSpeedPerMs !== undefined
            ? { puckSpeedPerMs: body.input.puckSpeedPerMs }
            : {}),
          ...(body.input.shooterFrequency !== undefined
            ? { shooterFrequency: body.input.shooterFrequency }
            : {}),
          ...(body.input.goalieFrequency !== undefined
            ? { goalieFrequency: body.input.goalieFrequency }
            : {}),
          ...(body.input.goalFrequency !== undefined
            ? { goalFrequency: body.input.goalFrequency }
            : {}),
        };
        const result = resolveShot(
          shotInput,
          goalieCfg,
          shotSeed,
          body.shot_index,
          STICK_NEUTRAL,
          phaseOffsets,
        );
        const serverResult: 'goal' | 'save' | 'miss' = result.type;

        await client.query(
          `insert into shot_session
             (user_id, mode, day_pool_id, period_number, shot_index, seed,
              input_payload, server_result, game_core_version)
           values ($1, 'daily', $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            pool.id,
            pool.current_period,
            body.shot_index,
            shotSeed,
            JSON.stringify(body.input),
            serverResult,
            pool.game_core_version,
          ],
        );

        if (body.claimed_result !== serverResult) {
          await appendEvent(client, req.user.id, 'shot_mismatch', {
            day_pool_id: pool.id,
            period_number: pool.current_period,
            shot_index: body.shot_index,
            claimed: body.claimed_result,
            server: serverResult,
          });
        }

        // Quota reached — close period, enter break.
        let currentPool: DayPoolRow = pool;
        if (body.shot_index === SHOTS_PER_PERIOD) {
          const periodEndedAt = now;
          const goals = cur.goals + (serverResult === 'goal' ? 1 : 0);
          await client.query(
            `insert into period_log
               (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
             values ($1, $2, $3, $4, $5, $6, 'quota')`,
            [
              pool.id,
              pool.current_period,
              pool.period_started_at,
              periodEndedAt,
              SHOTS_PER_PERIOD,
              goals,
            ],
          );
          await client.query(
            `update users
                set lifetime_shots_total = lifetime_shots_total + $1,
                    lifetime_goals_total = lifetime_goals_total + $2
              where id = $3`,
            [SHOTS_PER_PERIOD, goals, req.user.id],
          );
          await appendEvent(client, req.user.id, 'period_closed', {
            day_pool_id: pool.id,
            period_number: pool.current_period,
            closed_reason: 'quota',
            shots_taken: SHOTS_PER_PERIOD,
            goals,
          });
          // After the LAST period — close the day directly. Otherwise enter
          // the regular break.
          const isFinalPeriod = pool.current_period >= TOTAL_PERIODS;
          const updateSql = isFinalPeriod
            ? `update day_pool
                  set state='closed',
                      closed_at=$1,
                      period_started_at=null
                where id=$2
              returning *`
            : `update day_pool
                  set state='break_active',
                      break_started_at=$1,
                      period_started_at=null
                where id=$2
              returning *`;
          const { rows } = await client.query<DayPoolRow>(updateSql, [periodEndedAt, pool.id]);
          currentPool = rows[0]!;
          if (isFinalPeriod) {
            await appendEvent(client, req.user.id, 'day_pool_closed', {
              day_pool_id: pool.id,
              reason: 'completed',
            });
          }
        }

        const state = await buildState(client, currentPool, localToday, req.user.id);
        return { server_result: serverResult, state };
      });
    },
  );
};
