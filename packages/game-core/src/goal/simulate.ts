import type { GoalieConfig } from '../goalie/types.js';
import type { GoalState } from './types.js';
import { GOAL, RINK } from '../rink.js';

// Отрицательный MARGIN позволяет воротам уезжать за номинальные борта
// RINK — sprite-площадка шире RINK на ~21 ед. с каждой стороны.
// maxSafeOffset = min(150-(-50), 390-240-(-50)) = 200.
const MARGIN = -50;

/**
 * Deterministic triangular-wave board-to-board slide for the goal frame.
 * Static when `cfg.goalAmplitude` or `cfg.goalFrequency` is 0.
 * Time is absolute ms since session start — same contract as `simulateGoalie`.
 */
export function simulateGoal(cfg: GoalieConfig, t: number, phaseOffsetMs = 0): GoalState {
  if (cfg.goalAmplitude <= 0 || cfg.goalFrequency <= 0) {
    return { offsetX: 0 };
  }
  const maxOffset = Math.max(0, Math.min(cfg.goalAmplitude, maxSafeOffset()));
  const period = 1000 / cfg.goalFrequency;
  const et = t + phaseOffsetMs;
  const phase = (((et % period) + period) % period) / period; // 0..1
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; // -1..1..-1
  return { offsetX: maxOffset * tri };
}

function maxSafeOffset(): number {
  const leftRoom = GOAL.x - MARGIN;
  const rightRoom = RINK.width - (GOAL.x + GOAL.width) - MARGIN;
  return Math.max(0, Math.min(leftRoom, rightRoom));
}
