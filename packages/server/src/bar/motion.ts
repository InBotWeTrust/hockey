import {
  createGoalieSimulator,
  getGoalie,
  getSessionPhaseOffsets,
  simulateGoal,
  simulateShooter,
} from '@hockey/game-core';
import type { BarMotion } from './types.js';
export interface MotionSource {
  userId: string;
  period: number;
  state: string;
  elapsedMs: number;
  shooterElapsedMs?: number;
  seed: string;
  shotIndex: number;
  shooterFrequency?: number;
  goalieFrequency?: number;
  goalFrequency?: number;
}
/** Two seconds of coordinates, computed once per observed match; no simulation secrets in the DTO. */
export function sampleBarMotion(
  source: MotionSource,
  goalieId: string,
  sampledAt: Date,
): BarMotion {
  const base = getGoalie(goalieId);
  const cfg = {
    ...base,
    frequency: source.goalieFrequency ?? base.frequency,
    goalFrequency: source.goalFrequency ?? base.goalFrequency,
  };
  const phase = getSessionPhaseOffsets(source.seed);
  const goalie = createGoalieSimulator(cfg, source.seed, source.shotIndex);
  return {
    userId: source.userId,
    period: source.period,
    sampledAt: sampledAt.toISOString(),
    frames: Array.from({ length: 21 }, (_, index) => {
      const offsetMs = index * 100;
      const elapsed = source.state === 'period_active' ? offsetMs : 0;
      const t = Math.max(0, source.elapsedMs + elapsed);
      const position = goalie(t, phase.goalie).position;
      return {
        offsetMs,
        shooterX: simulateShooter(
          Math.max(0, (source.shooterElapsedMs ?? source.elapsedMs) + elapsed) + phase.shooter,
          source.shooterFrequency,
        ).x,
        goalOffsetX: simulateGoal(cfg, t, phase.goal).offsetX,
        goalieX: position.x,
        goalieY: position.y,
      };
    }),
  };
}
