import { describe, expect, it } from 'vitest';
import { resolvePerspectiveCourtShot } from '../src/court/perspective.js';
import type { GoalieConfig } from '../src/goalie/types.js';
import {
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  classifyMarksmanshipShot,
  isStrictCounterDirection,
  parseMarksmanshipScoringRules,
  scoreMarksmanshipWindow,
} from '../src/marksmanship.js';
import { STICK_NEUTRAL, type ShotInput } from '../src/shot/types.js';

const movingGoalie: GoalieConfig = {
  id: 'marksmanship-test',
  name: 'Test',
  pattern: 'linear',
  hp: 1,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: 1,
  frequency: 0.6,
  goalAmplitude: 220,
  goalFrequency: 0.5,
};

const offsets = { goalie: 0, goal: 0, shooter: 0 } as const;

function findShotInput(resultType: 'goal' | 'save' | 'miss'): ShotInput {
  for (let tapTime = 0; tapTime <= 20_000; tapTime += 10) {
    const input: ShotInput = {
      tapTime,
      shooterTapTime: tapTime,
      puckSpeedPerMs: 1.25,
      shooterFrequency: 0.75,
      goalieFrequency: 0.6,
      goalFrequency: 0.5,
    };
    const result = resolvePerspectiveCourtShot(
      input,
      movingGoalie,
      'marksmanship-fixture',
      1,
      STICK_NEUTRAL,
      offsets,
    );
    if (result.type === resultType) return input;
  }
  throw new Error(`No ${resultType} fixture found`);
}

function classify(shotInput: ShotInput, earliestTapTime = 0) {
  return classifyMarksmanshipShot({
    shotInput,
    goalie: movingGoalie,
    seed: 'marksmanship-fixture',
    shotIndex: 1,
    phaseOffsets: offsets,
    earliestTapTime,
    scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES,
  });
}

describe('scoreMarksmanshipWindow', () => {
  it.each([
    [49, 170],
    [50, 155],
    [69, 155],
    [70, 140],
    [99, 140],
    [100, 130],
    [159, 130],
    [160, 115],
    [249, 115],
    [250, 100],
  ])('scores a %d ms goal window as %d', (windowDurationMs, expected) => {
    expect(scoreMarksmanshipWindow(windowDurationMs, DEFAULT_MARKSMANSHIP_SCORING_RULES)).toBe(
      expected,
    );
  });
});

describe('parseMarksmanshipScoringRules', () => {
  it('accepts the complete scoring snapshot', () => {
    expect(parseMarksmanshipScoringRules(DEFAULT_MARKSMANSHIP_SCORING_RULES)).toEqual(
      DEFAULT_MARKSMANSHIP_SCORING_RULES,
    );
  });

  it('rejects unknown difficulty codes', () => {
    expect(() =>
      parseMarksmanshipScoringRules({
        ...DEFAULT_MARKSMANSHIP_SCORING_RULES,
        brackets: [
          ...DEFAULT_MARKSMANSHIP_SCORING_RULES.brackets.slice(0, -1),
          { minWindowMs: 0, points: 170, code: 'unknown' },
        ],
      }),
    ).toThrow('invalid marksmanship scoring rules');
  });

  it('rejects incomplete scoring snapshots', () => {
    expect(() =>
      parseMarksmanshipScoringRules({
        ...DEFAULT_MARKSMANSHIP_SCORING_RULES,
        brackets: [DEFAULT_MARKSMANSHIP_SCORING_RULES.brackets[5]],
      }),
    ).toThrow('invalid marksmanship scoring rules');
  });
});

describe('isStrictCounterDirection', () => {
  it('accepts the puck on the side opposite a nearby goalkeeper movement', () => {
    expect(
      isStrictCounterDirection({
        puckX: 250,
        goalieCenterX: 280,
        goalieHalfWidth: 20,
        goalieDirection: 1,
        goalXMin: 245,
        goalXMax: 327,
        maxGoalDistance: 24,
      }),
    ).toBe(true);
  });

  it('rejects matching direction, a distant goalkeeper, and a stationary goalkeeper', () => {
    const base = {
      puckX: 250,
      goalieCenterX: 280,
      goalieHalfWidth: 20,
      goalieDirection: 1,
      goalXMin: 245,
      goalXMax: 327,
      maxGoalDistance: 24,
    };
    expect(isStrictCounterDirection({ ...base, puckX: 310 })).toBe(false);
    expect(isStrictCounterDirection({ ...base, goalieCenterX: 400 })).toBe(false);
    expect(isStrictCounterDirection({ ...base, goalieDirection: 0 })).toBe(false);
  });
});

describe('classifyMarksmanshipShot', () => {
  it('is deterministic and does not mutate the shot input', () => {
    const shotInput = findShotInput('goal');
    const original = { ...shotInput };

    expect(classify(shotInput)).toEqual(classify(shotInput));
    expect(shotInput).toEqual(original);
  });

  it.each(['save', 'miss'] as const)('awards zero for a %s', (resultType) => {
    expect(classify(findShotInput(resultType))).toMatchObject({
      result: { type: resultType },
      windowDurationMs: null,
      basePoints: 0,
      counterDirection: false,
      awardedPoints: 0,
      difficultyCode: null,
    });
  });

  it('clamps the left side of the goal window to the first available tap time', () => {
    const shotInput = findShotInput('goal');
    const full = classify(shotInput, 0);
    const clamped = classify(shotInput, shotInput.tapTime);

    expect(full.windowDurationMs).not.toBeNull();
    expect(clamped.windowDurationMs).not.toBeNull();
    expect(clamped.windowDurationMs!).toBeLessThanOrEqual(full.windowDurationMs!);
  });

  it('scores a broad board-side opportunity in the lowest bracket', () => {
    expect(
      classify({
        tapTime: 8_770,
        shooterTapTime: 8_770,
        puckSpeedPerMs: 1.25,
        shooterFrequency: 0.75,
        goalieFrequency: 0.6,
        goalFrequency: 0.5,
      }),
    ).toMatchObject({
      result: { type: 'goal' },
      windowDurationMs: 270,
      basePoints: 100,
      counterDirection: false,
      awardedPoints: 100,
      difficultyCode: 'open',
    });
  });

  it('adds the strict counter-direction bonus to the classified goal', () => {
    expect(
      classify({
        tapTime: 590,
        shooterTapTime: 590,
        puckSpeedPerMs: 1.25,
        shooterFrequency: 0.75,
        goalieFrequency: 0.6,
        goalFrequency: 0.5,
      }),
    ).toMatchObject({
      result: { type: 'goal' },
      windowDurationMs: 60,
      basePoints: 155,
      counterDirection: true,
      awardedPoints: 170,
      difficultyCode: 'very_narrow',
    });
  });
});
