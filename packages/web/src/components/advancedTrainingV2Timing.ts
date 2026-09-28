import type { AdvancedTrainingEpisodeProfile, AdvancedTrainingV2Scenario,
  AdvancedTrainingWindow } from '@hockey/game-core';

export function getAdvancedTrainingEpisodeCue(episode: AdvancedTrainingEpisodeProfile,
  sceneMs: number, stage: 'practice' | 'assessment'): AdvancedTrainingContinuousCue {
  const remainingMs = episode.intervalStartMs - sceneMs;
  const secondsRemaining = remainingMs > 0 && remainingMs <= 4000
    ? Math.ceil(remainingMs / 1000) as 4 | 3 | 2 | 1 : null;
  return { secondsRemaining,
    shootNow: stage === 'practice' && sceneMs >= episode.intervalStartMs &&
      sceneMs <= episode.intervalEndMs,
    expired: sceneMs > episode.episodeEndMs };
}

export const PRACTICE_SHOT_ARM_LEAD_MS = 240;
export const PRACTICE_SHOT_SLOW_LEAD_MS = 650;
export const PRACTICE_SHOT_SLOW_SCALE = 0.35;

export interface AdvancedTrainingV2Cue {
  traversal: 4 | 3 | 2 | 1 | null;
  shootNow: boolean;
  expired: boolean;
}

export interface AdvancedTrainingContinuousCue {
  secondsRemaining: 4 | 3 | 2 | 1 | null;
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

export function getAdvancedTrainingContinuousCue(window: AdvancedTrainingWindow,
  sceneMs: number, shooterFrequency: number,
  stage: 'practice' | 'assessment'): AdvancedTrainingContinuousCue {
  void shooterFrequency;
  const cueStartMs = stage === 'practice'
    ? window.startMs - PRACTICE_SHOT_ARM_LEAD_MS : window.startMs;
  const slowStartMs = window.startMs - PRACTICE_SHOT_SLOW_LEAD_MS;
  const remainingMs = stage === 'practice' && sceneMs < slowStartMs
    ? slowStartMs - sceneMs + (cueStartMs - slowStartMs) / PRACTICE_SHOT_SLOW_SCALE
    : stage === 'practice' ? (cueStartMs - sceneMs) / PRACTICE_SHOT_SLOW_SCALE
      : cueStartMs - sceneMs;
  const secondsRemaining = remainingMs > 0 && remainingMs <= 4_000
    ? Math.ceil(remainingMs / 1_000) as 4 | 3 | 2 | 1 : null;
  return { secondsRemaining,
    shootNow: stage === 'practice' &&
      sceneMs >= window.startMs - PRACTICE_SHOT_ARM_LEAD_MS && sceneMs <= window.endMs,
    expired: sceneMs > window.endMs };
}
