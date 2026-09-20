import { GOAL_OPENING, PUCK_START } from '@hockey/game-core';
import type { BonusGameAttempt } from '../api/bonusGames.js';
import { SHOT_RESULT_PAUSE_MS } from './shotTiming.js';

export interface BonusGameClockBasis {
  sceneElapsedMs: number;
  shooterElapsedMs: number;
}

export interface EnduranceClock {
  totalRemainingMs: number;
  goalRemainingMs: number;
  goalWindowPending: boolean;
}

function remainingFromDeadline(deadline: string | null, authoritativeNowMs: number): number {
  if (deadline === null) return 0;
  const deadlineMs = Date.parse(deadline);
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, deadlineMs - authoritativeNowMs);
}

export function deriveEnduranceClock(
  attempt: BonusGameAttempt,
  receivedAtPerformanceMs: number,
  currentPerformanceMs: number,
): EnduranceClock {
  const serverNowMs = Date.parse(attempt.server_now);
  if (!Number.isFinite(serverNowMs)) {
    return { totalRemainingMs: 0, goalRemainingMs: 0, goalWindowPending: false };
  }

  const authoritativeNowMs =
    serverNowMs + Math.max(0, currentPerformanceMs - receivedAtPerformanceMs);
  const goalWindowStartedAtMs =
    attempt.goal_window_started_at === null
      ? Number.NaN
      : Date.parse(attempt.goal_window_started_at);
  const goalWindowEndsAtMs =
    attempt.goal_window_ends_at === null ? Number.NaN : Date.parse(attempt.goal_window_ends_at);
  const goalWindowPending =
    Number.isFinite(goalWindowStartedAtMs) &&
    Number.isFinite(goalWindowEndsAtMs) &&
    authoritativeNowMs < goalWindowStartedAtMs;

  return {
    totalRemainingMs: remainingFromDeadline(attempt.period_ends_at, authoritativeNowMs),
    goalRemainingMs: goalWindowPending
      ? Math.max(0, goalWindowEndsAtMs - goalWindowStartedAtMs)
      : remainingFromDeadline(attempt.goal_window_ends_at, authoritativeNowMs),
    goalWindowPending,
  };
}

export function deriveBonusGameClockBasis(attempt: BonusGameAttempt): BonusGameClockBasis {
  if (attempt.state !== 'period_active' || attempt.period_started_at === null) {
    return { sceneElapsedMs: 0, shooterElapsedMs: 0 };
  }
  const rule = attempt.rules.periods.find(
    (candidate) => candidate.period_number === attempt.current_period,
  );
  const startedAt = Date.parse(attempt.period_started_at);
  const serverNow = Date.parse(attempt.server_now);
  if (
    rule === undefined ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(serverNow) ||
    !Number.isFinite(rule.puck_speed_per_ms) ||
    rule.puck_speed_per_ms <= 0
  ) {
    return { sceneElapsedMs: 0, shooterElapsedMs: 0 };
  }

  const wallElapsedMs = Math.max(0, serverNow - startedAt);
  const acceptedShots = Math.max(0, attempt.current_period_shots_taken);
  const sceneElapsedMs = Math.max(0, wallElapsedMs - acceptedShots * SHOT_RESULT_PAUSE_MS);
  const flightMs = (PUCK_START.y - GOAL_OPENING.y) / rule.puck_speed_per_ms;
  return {
    sceneElapsedMs,
    shooterElapsedMs: Math.max(0, sceneElapsedMs - acceptedShots * flightMs),
  };
}

export function deriveBonusGameClockEpoch(attempt: BonusGameAttempt): string {
  if (attempt.state === 'period_active') {
    return `period:${attempt.id}:${attempt.current_period}:${attempt.period_started_at ?? ''}`;
  }
  if (attempt.state === 'closed') {
    return `closed:${attempt.id}:${attempt.closed_at ?? attempt.status}`;
  }
  return `${attempt.state}:${attempt.id}:${attempt.current_period}`;
}

export function futureBonusPeriodDurationMs(attempt: BonusGameAttempt): number {
  if (attempt.rules.skill_code !== 'speed') return 0;
  return attempt.rules.periods
    .filter((period) => period.period_number > attempt.current_period)
    .reduce((total, period) => total + period.duration_ms, 0);
}
