import { getGoalie } from './balance/goalies.js';
import { getAdvancedTrainingV2Side, type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique,
  type evaluateAdvancedTrainingV2Shot } from './advancedTrainingV2.js';
import { DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
  resolveMarksmanshipShotContext } from './marksmanship.js';
import { classifyMarksmanshipV6Score } from './marksmanshipV6.js';
import { deriveShotSeed, getSessionPhaseOffsets } from './session.js';
import type { ShotInput } from './shot/types.js';

export interface AdvancedTrainingContinuousContext {
  runSeed: string;
  technique: AdvancedTrainingV2Technique;
  side: AdvancedTrainingV2Side;
  speeds: AdvancedTrainingV2Scenario['speeds'];
  goalieId: string;
}

export interface AdvancedTrainingWindow {
  startMs: number;
  endMs: number;
  targetMs: number;
}

export const ADVANCED_TRAINING_WINDOW_SCAN_STEP_MS = 5;
export const ADVANCED_TRAINING_WINDOW_SCAN_HORIZON_MS = 120_000;

export function getAdvancedTrainingContinuousSeed(technique: AdvancedTrainingV2Technique): string {
  // These two catalog trajectories were verified for both sides of their assigned exercises.
  const scene = technique === 'super_precise' ? 4 : 0;
  return `advanced-training-v2:bank-1:scene-${scene}`;
}

export function evaluateAdvancedTrainingContinuousShot(
  movement: AdvancedTrainingContinuousContext,
  input: ShotInput,
): ReturnType<typeof evaluateAdvancedTrainingV2Shot> {
  const context = resolveMarksmanshipShotContext({
    shotInput: { tapTime: input.tapTime,
      shooterTapTime: input.shooterTapTime ?? input.tapTime, ...movement.speeds },
    goalie: getGoalie(movement.goalieId),
    seed: deriveShotSeed(movement.runSeed, 1, 1),
    shotIndex: 1,
    phaseOffsets: getSessionPhaseOffsets(movement.runSeed),
    earliestTapTime: 0,
    scoring: DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
  });
  const measurements = context.result.type === 'goal' ? context.v6Measurements ?? null : null;
  const actualTechnique = measurements === null ? null
    : classifyMarksmanshipV6Score(measurements).technique;
  const actualSide = measurements === null || actualTechnique === null ? null
    : getAdvancedTrainingV2Side(actualTechnique, measurements);
  return { result: context.result, actualTechnique, actualSide,
    success: actualTechnique === movement.technique && actualSide === movement.side,
    measurements };
}

export function findNextAdvancedTrainingWindow(
  movement: AdvancedTrainingContinuousContext,
  afterMs: number,
): AdvancedTrainingWindow | null {
  if (!Number.isFinite(afterMs) || afterMs < 0) return null;
  const traversalMs = 500 / movement.speeds.shooterFrequency;
  const earliest = Math.ceil(afterMs + 4 * traversalMs);
  const step = ADVANCED_TRAINING_WINDOW_SCAN_STEP_MS;
  const limit = earliest + ADVANCED_TRAINING_WINDOW_SCAN_HORIZON_MS;
  const succeeds = (tapTime: number): boolean => evaluateAdvancedTrainingContinuousShot(
    movement, { tapTime, shooterTapTime: tapTime }).success;
  for (let time = Math.ceil(earliest / step) * step; time <= limit; time += step) {
    if (!succeeds(time)) continue;
    let startMs = time;
    while (startMs > earliest && succeeds(startMs - 1)) startMs -= 1;
    let endMs = time;
    while (endMs < limit && succeeds(endMs + 1)) endMs += 1;
    return { startMs, endMs, targetMs: time };
  }
  return null;
}
