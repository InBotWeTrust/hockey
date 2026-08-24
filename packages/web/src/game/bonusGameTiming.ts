import { GOAL_OPENING, PUCK_START } from '@hockey/game-core';
import type { BonusGameAttempt } from '../api/bonusGames.js';

export interface BonusGameClockBasis {
  sceneElapsedMs: number;
  shooterElapsedMs: number;
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
  const sceneElapsedMs = Math.max(0, wallElapsedMs - acceptedShots * 1_000);
  const flightMs = (PUCK_START.y - GOAL_OPENING.y) / rule.puck_speed_per_ms;
  return {
    sceneElapsedMs,
    shooterElapsedMs: Math.max(0, sceneElapsedMs - acceptedShots * flightMs),
  };
}
