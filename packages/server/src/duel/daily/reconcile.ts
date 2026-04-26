import type { PoolClient } from 'pg';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';

export const PERIOD_DURATION_MS = 20 * 60 * 1000;
export const BREAK_DURATION_MS = 15 * 60 * 1000;
export const SHOTS_PER_PERIOD = 30;
export const TOTAL_PERIODS = 3;

export type DayPoolState = 'idle' | 'period_active' | 'break_active' | 'closed';

export interface DayPoolRow {
  id: string;
  user_id: string;
  day_date: string; // 'YYYY-MM-DD' (parsed by pg DATE type-parser override)
  state: DayPoolState;
  current_period: number;
  period_started_at: Date | null;
  break_started_at: Date | null;
  closed_at: Date | null;
  game_core_version: number;
  daily_seed: string;
  created_at: Date;
}

interface PeriodAggregate {
  shots_taken: number;
  goals: number;
}

async function aggregatePeriodShots(
  client: PoolClient,
  dayPoolId: string,
  periodNumber: number,
): Promise<PeriodAggregate> {
  const { rows } = await client.query<{ shots_taken: string; goals: string }>(
    `select count(*)::int as shots_taken,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'daily'
        and day_pool_id = $1
        and period_number = $2`,
    [dayPoolId, periodNumber],
  );
  const row = rows[0]!;
  return { shots_taken: Number(row.shots_taken), goals: Number(row.goals) };
}

async function insertPeriodLog(
  client: PoolClient,
  pool: DayPoolRow,
  endedAt: Date,
  closedReason: 'quota' | 'timeout' | 'day_end',
): Promise<void> {
  if (pool.period_started_at === null) {
    throw new AppError(
      'internal_error',
      'cannot insert period_log without period_started_at',
      500,
    );
  }
  const agg = await aggregatePeriodShots(client, pool.id, pool.current_period);
  const inserted = await client.query<{ id: string }>(
    `insert into period_log
       (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (day_pool_id, period_number) do nothing
     returning id`,
    [
      pool.id,
      pool.current_period,
      pool.period_started_at,
      endedAt,
      agg.shots_taken,
      agg.goals,
      closedReason,
    ],
  );
  // Only bump lifetime stats when the row was actually inserted (idempotent
  // reconcile may try to close the same period twice).
  if (inserted.rowCount && inserted.rowCount > 0) {
    await client.query(
      `update users
          set lifetime_shots_total = lifetime_shots_total + $1,
              lifetime_goals_total = lifetime_goals_total + $2
        where id = $3`,
      [agg.shots_taken, agg.goals, pool.user_id],
    );
  }
  await appendEvent(client, pool.user_id, 'period_closed', {
    day_pool_id: pool.id,
    period_number: pool.current_period,
    closed_reason: closedReason,
    shots_taken: agg.shots_taken,
    goals: agg.goals,
  });
}

async function fetchUserTimezone(
  client: PoolClient,
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ timezone: string }>(
    'select timezone from users where id = $1',
    [userId],
  );
  if (rows.length === 0) {
    throw new AppError('not_found', 'user not found', 404);
  }
  return rows[0]!.timezone;
}

async function localDate(
  client: PoolClient,
  now: Date,
  tz: string,
): Promise<string> {
  const { rows } = await client.query<{ d: string }>(
    `select to_char(($1::timestamptz at time zone $2)::date, 'YYYY-MM-DD') as d`,
    [now.toISOString(), tz],
  );
  return rows[0]!.d;
}

async function nextDayMidnight(
  client: PoolClient,
  poolDayDate: string,
  tz: string,
): Promise<Date> {
  const { rows } = await client.query<{ midnight: string }>(
    `select (($1::date + interval '1 day')::timestamp at time zone $2) as midnight`,
    [poolDayDate, tz],
  );
  return new Date(rows[0]!.midnight);
}

async function fetchOpenPool(
  client: PoolClient,
  userId: string,
): Promise<DayPoolRow | null> {
  const { rows } = await client.query<DayPoolRow>(
    `select * from day_pool
      where user_id = $1 and state != 'closed'
        for update`,
    [userId],
  );
  return rows[0] ?? null;
}

export interface ReconciledPool {
  pool: DayPoolRow | null;
  timezone: string;
  localToday: string;
}

export async function reconcileDayPool(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<ReconciledPool> {
  const timezone = await fetchUserTimezone(client, userId);
  let pool = await fetchOpenPool(client, userId);
  const today = await localDate(client, now, timezone);

  if (pool === null) {
    return { pool: null, timezone, localToday: today };
  }

  if (pool.day_date !== today) {
    const midnight = await nextDayMidnight(client, pool.day_date, timezone);
    if (pool.state === 'period_active') {
      await insertPeriodLog(client, pool, midnight, 'day_end');
    }
    await client.query(
      `update day_pool set state='closed', closed_at=$1 where id=$2`,
      [midnight, pool.id],
    );
    await appendEvent(client, pool.user_id, 'day_pool_closed', {
      day_pool_id: pool.id,
      reason: 'day_end',
    });
    return { pool: null, timezone, localToday: today };
  }

  if (pool.state === 'period_active' && pool.period_started_at !== null) {
    const periodEnd = new Date(
      pool.period_started_at.getTime() + PERIOD_DURATION_MS,
    );
    if (now >= periodEnd) {
      await insertPeriodLog(client, pool, periodEnd, 'timeout');
      const isFinal = pool.current_period >= TOTAL_PERIODS;
      const sql = isFinal
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
      const { rows } = await client.query<DayPoolRow>(sql, [periodEnd, pool.id]);
      pool = rows[0]!;
      if (isFinal) {
        await appendEvent(client, pool.user_id, 'day_pool_closed', {
          day_pool_id: pool.id,
          reason: 'completed',
        });
        return { pool: null, timezone, localToday: today };
      }
    }
  }

  if (pool.state === 'break_active' && pool.break_started_at !== null) {
    const breakEnd = new Date(
      pool.break_started_at.getTime() + BREAK_DURATION_MS,
    );
    if (now >= breakEnd) {
      const { rows } = await client.query<DayPoolRow>(
        `update day_pool
            set state='idle',
                break_started_at=null
          where id=$1
        returning *`,
        [pool.id],
      );
      pool = rows[0]!;
    }
  }

  if (pool.state === 'idle' && pool.current_period >= TOTAL_PERIODS) {
    const closedAt = now;
    await client.query(
      `update day_pool set state='closed', closed_at=$1 where id=$2`,
      [closedAt, pool.id],
    );
    await appendEvent(client, pool.user_id, 'day_pool_closed', {
      day_pool_id: pool.id,
      reason: 'completed',
    });
    return { pool: null, timezone, localToday: today };
  }

  return { pool, timezone, localToday: today };
}
