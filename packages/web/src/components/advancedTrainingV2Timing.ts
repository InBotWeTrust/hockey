import type { AdvancedTrainingV2Scenario } from '@hockey/game-core';

export interface AdvancedTrainingV2Cue {
  traversal: 4 | 3 | 2 | 1 | null;
  shootNow: boolean;
  expired: boolean;
}

export function getAdvancedTrainingV2Cue(scenario: AdvancedTrainingV2Scenario,
  sceneMs: number, stage: 'practice' | 'assessment'): AdvancedTrainingV2Cue {
  const traversalMs = 500 / scenario.speeds.shooterFrequency;
  const elapsed = sceneMs - scenario.sceneStartMs;
  const traversalIndex = Math.floor(elapsed / traversalMs);
  const traversal = stage === 'practice' && traversalIndex >= 0 && traversalIndex < 4
    ? (4 - traversalIndex) as 4 | 3 | 2 | 1 : null;
  return {
    traversal,
    shootNow: stage === 'practice' && Math.abs(sceneMs - scenario.targetTapTimeMs) <= 80,
    expired: sceneMs > scenario.targetTapTimeMs + traversalMs,
  };
}
