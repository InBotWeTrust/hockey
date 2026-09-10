import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import {
  parseBonusPeriodRules,
  type BonusGameAttemptRow,
  type BonusGamePeriodLogRow,
  type BonusPeriodClosedReason,
  type BonusPeriodRule,
} from './types.js';

interface PeriodAggregate {
  shotsTaken: number;
  goals: number;
}

async function lockAttempt(client: PoolClient, attemptId: string): Promise<BonusGameAttemptRow> {
  const { rows } = await client.query<BonusGameAttemptRow>(
    'select * from bonus_game_attempt where id = $1 for update',
    [attemptId],
  );
  const attempt = rows[0];
  if (attempt === undefined) {
    throw new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
  }
  return attempt;
}

async function aggregatePeriod(
  client: PoolClient,
  attemptId: string,
  periodNumber: number,
): Promise<PeriodAggregate> {
  const { rows } = await client.query<{ shots_taken: number; goals: number }>(
    `select count(*)::int as shots_taken,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'bonus'
        and bonus_game_attempt_id = $1
        and period_number = $2`,
    [attemptId, periodNumber],
  );
  const aggregate = rows[0]!;
  return {
    shotsTaken: Number(aggregate.shots_taken),
    goals: Number(aggregate.goals),
  };
}

function rulesForAttempt(attempt: BonusGameAttemptRow): BonusPeriodRule[] {
  try {
    return parseBonusPeriodRules(
      attempt.rules_snapshot.periods,
      attempt.rules_snapshot.totalPeriods,
      attempt.rules_snapshot.targetGoals,
    );
  } catch {
    throw new AppError('internal_error', 'invalid bonus attempt rules snapshot', 500);
  }
}

export async function closeBonusPeriod(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
  endedAt: Date,
  closedReason: BonusPeriodClosedReason,
): Promise<BonusGamePeriodLogRow | null> {
  if (attempt.period_started_at === null || attempt.current_period < 1) {
    throw new AppError('internal_error', 'active bonus period has no start timestamp', 500);
  }
  const aggregate = await aggregatePeriod(client, attempt.id, attempt.current_period);
  const durationMs = Math.max(0, endedAt.getTime() - attempt.period_started_at.getTime());
  const { rows } = await client.query<BonusGamePeriodLogRow>(
    `insert into bonus_game_period_log
       (attempt_id, period_number, started_at, ended_at, shots_taken, goals,
        duration_ms, closed_reason, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $4)
     on conflict (attempt_id, period_number) do nothing
     returning *`,
    [
      attempt.id,
      attempt.current_period,
      attempt.period_started_at,
      endedAt,
      aggregate.shotsTaken,
      aggregate.goals,
      durationMs,
      closedReason,
    ],
  );
  return rows[0] ?? null;
}

async function finishPeriod(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
  endedAt: Date,
): Promise<BonusGameAttemptRow> {
  const isFinalPeriod = attempt.current_period >= attempt.rules_snapshot.totalPeriods;
  const { rows } = isFinalPeriod
    ? await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set status = 'failed', state = 'closed', closed_at = $1,
                period_started_at = null, break_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [endedAt, attempt.id],
      )
    : await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set state = 'break_active', break_started_at = $1,
                period_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [endedAt, attempt.id],
      );
  return rows[0]!;
}

export async function reconcileBonusAttempt(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
  now: Date,
): Promise<BonusGameAttemptRow> {
  let current = await lockAttempt(client, attempt.id);
  if (current.status !== 'active' || current.state === 'closed') return current;

  const rules = rulesForAttempt(current);
  if (current.state === 'period_active') {
    if (current.period_started_at === null) {
      throw new AppError('internal_error', 'active bonus period has no start timestamp', 500);
    }
    const periodRule = rules[current.current_period - 1];
    if (periodRule === undefined) {
      throw new AppError('internal_error', 'active bonus period is outside its snapshot', 500);
    }
    const aggregate = await aggregatePeriod(client, current.id, current.current_period);
    if (periodRule.shotsLimit !== null && aggregate.shotsTaken >= periodRule.shotsLimit) {
      await closeBonusPeriod(client, current, now, 'quota');
      current = await finishPeriod(client, current, now);
    } else {
      const periodEnd = new Date(current.period_started_at.getTime() + periodRule.durationMs);
      if (now >= periodEnd) {
        await closeBonusPeriod(client, current, periodEnd, 'timeout');
        current = await finishPeriod(client, current, periodEnd);
      }
    }
  }

  if (
    current.status === 'active' &&
    current.state === 'break_active' &&
    current.break_started_at !== null
  ) {
    const breakEnd = new Date(
      current.break_started_at.getTime() + current.rules_snapshot.breakDurationMs,
    );
    if (now >= breakEnd) {
      const { rows } = await client.query<BonusGameAttemptRow>(
        `update bonus_game_attempt
            set state = 'idle', break_started_at = null, updated_at = $1
          where id = $2
        returning *`,
        [breakEnd, current.id],
      );
      current = rows[0]!;
    }
  }

  return current;
}
