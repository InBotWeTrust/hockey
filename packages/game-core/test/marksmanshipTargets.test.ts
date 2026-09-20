import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  classifyMarksmanshipShot,
  resolveMarksmanshipShotContext,
  scoreMarksmanshipWindow,
} from '../src/marksmanship.js';
import type { GoalieConfig } from '../src/goalie/types.js';
import { deriveShotSeed, getSessionPhaseOffsets } from '../src/session.js';

const DURATIONS_MS = [30_000, 60_000, 90_000, 120_000, 150_000, 180_000, 210_000];
const TARGETS = [1_100, 2_450, 4_000, 5_750, 7_750, 9_950, 12_450];
const SEARCH_STEP_MS = 10;
const FLIGHT_MS = 416;
const RESULT_PAUSE_MS = 1_000;
const MOTION_REPEAT_MS = 20_000;
const MAX_DURATION_MS = DURATIONS_MS[DURATIONS_MS.length - 1]!;
const PHASE_SEEDS = Array.from(
  { length: 30 },
  (_, index) => `marksmanship-target-phase-${String(index + 1).padStart(2, '0')}`,
);

const goalie: GoalieConfig = {
  id: 'marksmanship-target-sweep',
  name: 'Target sweep',
  pattern: 'linear',
  hp: 0,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: 1,
  frequency: 0.6,
  goalAmplitude: 220,
  goalFrequency: 0.5,
};

interface TargetStats {
  minimum: number;
  median: number;
  maximum: number;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function optimumByDuration(seed: string): number[] {
  const offsets = getSessionPhaseOffsets(seed);
  const bestAtWallTime = new Int32Array(MAX_DURATION_MS + 1);
  let current = new Int32Array(Math.floor(MAX_DURATION_MS / SEARCH_STEP_MS) + 1);
  current.fill(-1);
  current[0] = 0;

  for (let completedShots = 0; ; completedShots += 1) {
    const sceneBaseMs = completedShots * FLIGHT_MS;
    const maximumSceneMs = MAX_DURATION_MS - completedShots * RESULT_PAUSE_MS;
    if (sceneBaseMs > maximumSceneMs) break;
    const stateCount = Math.floor((maximumSceneMs - sceneBaseMs) / SEARCH_STEP_MS) + 1;
    const nextMaximumSceneMs = MAX_DURATION_MS - (completedShots + 1) * RESULT_PAUSE_MS;
    const nextStateCount =
      sceneBaseMs + FLIGHT_MS > nextMaximumSceneMs
        ? 0
        : Math.floor((nextMaximumSceneMs - (sceneBaseMs + FLIGHT_MS)) / SEARCH_STEP_MS) + 1;
    const next = new Int32Array(nextStateCount);
    next.fill(-1);
    const phaseSampleCount = MOTION_REPEAT_MS / SEARCH_STEP_MS;
    const goalSamples = new Uint8Array(phaseSampleCount);
    const counterSamples = new Uint8Array(phaseSampleCount);
    const shotIndex = completedShots + 1;
    const shotSeed = deriveShotSeed(seed, 1, shotIndex);
    for (let cacheIndex = 0; cacheIndex < phaseSampleCount; cacheIndex += 1) {
      const normalizedSceneTime = positiveModulo(
        sceneBaseMs + cacheIndex * SEARCH_STEP_MS,
        MOTION_REPEAT_MS,
      );
      const normalizedShooterTime = cacheIndex * SEARCH_STEP_MS;
      const context = resolveMarksmanshipShotContext({
        shotInput: {
          tapTime: normalizedSceneTime,
          shooterTapTime: normalizedShooterTime,
          puckSpeedPerMs: 1.25,
          shooterFrequency: 0.75,
          goalieFrequency: 0.6,
          goalFrequency: 0.5,
        },
        goalie,
        seed: shotSeed,
        shotIndex,
        phaseOffsets: offsets,
        earliestTapTime: normalizedSceneTime,
        scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES,
      });
      goalSamples[cacheIndex] = context.result.type === 'goal' ? 1 : 0;
      counterSamples[cacheIndex] = context.counterDirection ? 1 : 0;
    }

    const leftGoalSamples = new Uint16Array(phaseSampleCount);
    const rightGoalSamples = new Uint16Array(phaseSampleCount);
    let goalRunSamples = 0;
    for (let index = 0; index < phaseSampleCount * 2; index += 1) {
      const cacheIndex = index % phaseSampleCount;
      goalRunSamples = goalSamples[cacheIndex] === 1 ? goalRunSamples + 1 : 0;
      if (index >= phaseSampleCount) {
        leftGoalSamples[cacheIndex] = Math.min(goalRunSamples, phaseSampleCount);
      }
    }
    goalRunSamples = 0;
    for (let index = phaseSampleCount * 2 - 1; index >= 0; index -= 1) {
      const cacheIndex = index % phaseSampleCount;
      goalRunSamples = goalSamples[cacheIndex] === 1 ? goalRunSamples + 1 : 0;
      if (index < phaseSampleCount) {
        rightGoalSamples[cacheIndex] = Math.min(goalRunSamples, phaseSampleCount);
      }
    }

    if (completedShots === 0) {
      const sampleIndex = goalSamples.findIndex((value) => value === 1);
      const sampleTime = sampleIndex * SEARCH_STEP_MS;
      const canonical = classifyMarksmanshipShot({
        shotInput: {
          tapTime: sampleTime,
          shooterTapTime: sampleTime,
          puckSpeedPerMs: 1.25,
          shooterFrequency: 0.75,
          goalieFrequency: 0.6,
          goalFrequency: 0.5,
        },
        goalie,
        seed: shotSeed,
        shotIndex,
        phaseOffsets: offsets,
        earliestTapTime: sampleTime,
        scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES,
      });
      const optimizedScore =
        scoreMarksmanshipWindow(
          rightGoalSamples[sampleIndex]! * SEARCH_STEP_MS,
          DEFAULT_MARKSMANSHIP_SCORING_RULES,
        ) +
        (counterSamples[sampleIndex] === 1
          ? DEFAULT_MARKSMANSHIP_SCORING_RULES.counterDirectionBonus
          : 0);
      if (canonical.awardedPoints !== optimizedScore) {
        throw new Error('optimized target sweep diverged from the canonical classifier');
      }
    }

    const prefixBest = new Int32Array(stateCount);
    let runningStateBest = -1;
    for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
      runningStateBest = Math.max(runningStateBest, current[stateIndex] ?? -1);
      prefixBest[stateIndex] = runningStateBest;
    }

    for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
      const sceneTime = sceneBaseMs + stateIndex * SEARCH_STEP_MS;
      const wallTapTime = sceneTime + completedShots * RESULT_PAUSE_MS;
      const cacheIndex = stateIndex % phaseSampleCount;
      let nextScore = prefixBest[stateIndex] ?? -1;
      if (goalSamples[cacheIndex] === 1) {
        const leftIndex = Math.max(0, stateIndex - leftGoalSamples[cacheIndex]! + 1);
        const rightIndex = stateIndex + rightGoalSamples[cacheIndex]! - 1;
        const counterBonus =
          counterSamples[cacheIndex] === 1
            ? DEFAULT_MARKSMANSHIP_SCORING_RULES.counterDirectionBonus
            : 0;
        const plateauEnd = Math.min(stateIndex, leftIndex);
        if (prefixBest[plateauEnd]! >= 0) {
          nextScore = Math.max(
            nextScore,
            prefixBest[plateauEnd]! +
              scoreMarksmanshipWindow(
                (rightIndex - leftIndex + 1) * SEARCH_STEP_MS,
                DEFAULT_MARKSMANSHIP_SCORING_RULES,
              ) +
              counterBonus,
          );
        }
        for (let readyIndex = leftIndex + 1; readyIndex <= stateIndex; readyIndex += 1) {
          if (current[readyIndex]! < 0) continue;
          nextScore = Math.max(
            nextScore,
            current[readyIndex]! +
              scoreMarksmanshipWindow(
                (rightIndex - readyIndex + 1) * SEARCH_STEP_MS,
                DEFAULT_MARKSMANSHIP_SCORING_RULES,
              ) +
              counterBonus,
          );
        }
      }

      if (nextScore < 0) continue;
      if (stateIndex < next.length && nextScore > next[stateIndex]!) {
        next[stateIndex] = nextScore;
      }
      if (nextScore > bestAtWallTime[wallTapTime]!) {
        bestAtWallTime[wallTapTime] = nextScore;
      }
    }

    current = next;
  }

  let runningBest = 0;
  let durationIndex = 0;
  const bestByDuration: number[] = [];
  for (let wallTime = 0; wallTime <= MAX_DURATION_MS; wallTime += 1) {
    runningBest = Math.max(runningBest, bestAtWallTime[wallTime]!);
    if (wallTime === DURATIONS_MS[durationIndex]) {
      bestByDuration.push(runningBest);
      durationIndex += 1;
    }
  }
  return bestByDuration;
}

function summarize(values: number[][]): TargetStats[] {
  return DURATIONS_MS.map((_duration, durationIndex) => {
    const sorted = values.map((row) => row[durationIndex]!).sort((a, b) => a - b);
    return {
      minimum: sorted[0]!,
      median: sorted[Math.floor(sorted.length / 2)]!,
      maximum: sorted[sorted.length - 1]!,
    };
  });
}

describe('marksmanship published targets', () => {
  it('stay below the conservative optimum across thirty deterministic phases', () => {
    const stats = summarize(PHASE_SEEDS.map(optimumByDuration));
    const conservativeMax = stats.map((entry) => entry.minimum);

    expect(TARGETS).toEqual([1_100, 2_450, 4_000, 5_750, 7_750, 9_950, 12_450]);
    expect(TARGETS.every((target, index) => target <= conservativeMax[index]!)).toBe(true);
    expect(stats).toMatchInlineSnapshot(`
      [
        {
          "maximum": 2605,
          "median": 2355,
          "minimum": 2210,
        },
        {
          "maximum": 4940,
          "median": 4630,
          "minimum": 4475,
        },
        {
          "maximum": 7225,
          "median": 6920,
          "minimum": 6740,
        },
        {
          "maximum": 9430,
          "median": 9190,
          "minimum": 9005,
        },
        {
          "maximum": 11740,
          "median": 11475,
          "minimum": 11300,
        },
        {
          "maximum": 14000,
          "median": 13775,
          "minimum": 13605,
        },
        {
          "maximum": 16300,
          "median": 16035,
          "minimum": 15890,
        },
      ]
    `);
  }, 120_000);
});
