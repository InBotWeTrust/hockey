import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
  classifyMarksmanshipShot,
  classifyMarksmanshipV3Score,
  resolveMarksmanshipShotContext,
} from '../src/marksmanship.js';
import type { GoalieConfig } from '../src/goalie/types.js';
import { deriveShotSeed, getSessionPhaseOffsets } from '../src/session.js';

const DURATIONS_MS = [
  30_000, 50_000, 70_000, 90_000, 110_000, 130_000, 150_000, 170_000, 190_000, 210_000,
];
const RATIOS = [0.5, 0.53, 0.57, 0.6, 0.63, 0.67, 0.7, 0.73, 0.77, 0.8];
const TARGETS = [25, 43, 65, 88, 113, 142, 170, 201, 237, 272];
const SEEDS = Array.from({ length: 30 }, (_, index) =>
  `marksmanship-target-phase-${String(index + 1).padStart(2, '0')}`);
const STEP_MS = 10;
const FLIGHT_MS = 416;
const PAUSE_MS = 1_000;
const LOOKAHEAD_MS = 2_000;
const WINDOW_CAP_SAMPLES = 16;

const goalie: GoalieConfig = {
  id: 'marksmanship-target-sweep', name: 'Target sweep', pattern: 'linear', hp: 0,
  baseReward: 0, firstClearBonus: 0, speed: 0, amplitude: 1,
  frequency: 0.6, goalAmplitude: 220, goalFrequency: 0.5,
};

type Policy = 'earliest' | 'highest' | 'rate';

function trajectory(seed: string, policy: Policy): number[] {
  const offsets = getSessionPhaseOffsets(seed);
  const pointsByDuration = DURATIONS_MS.map(() => 0);
  let score = 0;
  let readySceneTime = 0;
  let completedShots = 0;
  const maxWallTime = DURATIONS_MS[DURATIONS_MS.length - 1]!;

  while (readySceneTime + completedShots * PAUSE_MS < maxWallTime) {
    const shotIndex = completedShots + 1;
    const shotSeed = deriveShotSeed(seed, 1, shotIndex);
    const firstSceneTime = Math.ceil(readySceneTime / STEP_MS) * STEP_MS;
    const lastSceneTime = Math.min(
      firstSceneTime + LOOKAHEAD_MS,
      maxWallTime - completedShots * PAUSE_MS - STEP_MS,
    );
    const sampleCount = Math.floor((lastSceneTime - firstSceneTime) / STEP_MS) + 1;
    if (sampleCount <= 0) break;
    const contexts = Array.from({ length: sampleCount + WINDOW_CAP_SAMPLES }, (_, index) => {
      const tapTime = firstSceneTime + index * STEP_MS;
      return resolveMarksmanshipShotContext({
        shotInput: {
          tapTime, shooterTapTime: tapTime - completedShots * FLIGHT_MS,
          puckSpeedPerMs: 1.25, shooterFrequency: 0.75,
          goalieFrequency: 0.6, goalFrequency: 0.5,
        },
        goalie, seed: shotSeed, shotIndex, phaseOffsets: offsets,
        earliestTapTime: readySceneTime,
        scoring: DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
      });
    });

    let choice: { index: number; points: number; priority: number } | null = null;
    for (let index = 0; index < sampleCount; index += 1) {
      const context = contexts[index]!;
      if (context.result.type !== 'goal') continue;
      let left = index;
      let right = index;
      while (left > 0 && index - left < WINDOW_CAP_SAMPLES &&
        contexts[left - 1]!.result.type === 'goal') left -= 1;
      while (right < contexts.length - 1 && right - index < WINDOW_CAP_SAMPLES &&
        contexts[right + 1]!.result.type === 'goal') right += 1;
      const windowDurationMs = Math.min(160, (right - left + 1) * STEP_MS);
      const points = classifyMarksmanshipV3Score(windowDurationMs, context.geometry).points;
      const waitMs = index * STEP_MS + FLIGHT_MS + PAUSE_MS;
      const priority = policy === 'earliest' ? -index
        : policy === 'highest' ? points * 1_000_000 - index
          : points / waitMs;
      if (choice === null || priority > choice.priority) choice = { index, points, priority };
      if (policy === 'earliest') break;
    }

    if (choice === null) {
      readySceneTime = firstSceneTime + sampleCount * STEP_MS;
      continue;
    }
    const tapTime = firstSceneTime + choice.index * STEP_MS;
    const canonical = classifyMarksmanshipShot({
      shotInput: {
        tapTime, shooterTapTime: tapTime - completedShots * FLIGHT_MS,
        puckSpeedPerMs: 1.25, shooterFrequency: 0.75,
        goalieFrequency: 0.6, goalFrequency: 0.5,
      },
      goalie, seed: shotSeed, shotIndex, phaseOffsets: offsets,
      earliestTapTime: readySceneTime,
      scoring: DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
    });
    if (canonical.result.type !== 'goal' || canonical.awardedPoints !== choice.points) {
      throw new Error('calibration diverged from canonical V3 classifier');
    }
    const wallTapTime = tapTime + completedShots * PAUSE_MS;
    score += canonical.awardedPoints;
    for (let index = 0; index < DURATIONS_MS.length; index += 1) {
      if (wallTapTime < DURATIONS_MS[index]!) pointsByDuration[index] = score;
    }
    readySceneTime = tapTime + FLIGHT_MS;
    completedShots += 1;
  }
  for (let index = 1; index < pointsByDuration.length; index += 1) {
    pointsByDuration[index] = Math.max(pointsByDuration[index]!, pointsByDuration[index - 1]!);
  }
  return pointsByDuration;
}

describe('V3 marksmanship target calibration', () => {
  it('derives ten increasing targets from thirty seeded trajectories', () => {
    const controls = SEEDS.map((seed) => {
      const runs = (['earliest', 'highest', 'rate'] as const).map((policy) => trajectory(seed, policy));
      return DURATIONS_MS.map((_, index) => Math.max(...runs.map((run) => run[index]!)));
    });
    const medians = DURATIONS_MS.map((_, index) => {
      const sorted = controls.map((run) => run[index]!).sort((a, b) => a - b);
      return (sorted[14]! + sorted[15]!) / 2;
    });
    const targets = medians.map((median, index) =>
      Math.max(1, Math.floor(median * RATIOS[index]!)));
    expect(targets).toEqual(TARGETS);
    expect(targets.every((target, index) => index === 0 || target > targets[index - 1]!)).toBe(true);
    expect(targets.every((target, index) =>
      controls.filter((run) => run[index]! >= target).length >= 15)).toBe(true);
  }, 240_000);
});
