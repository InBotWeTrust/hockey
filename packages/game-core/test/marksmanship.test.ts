import { describe, expect, it } from 'vitest';
import { resolvePerspectiveCourtShot } from '../src/court/perspective.js';
import type { GoalieConfig } from '../src/goalie/types.js';
import {
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  classifyMarksmanshipGeometry,
  classifyMarksmanshipSeries,
  classifyMarksmanshipShot,
  isStrictCounterDirection,
  parseMarksmanshipScoringRules,
  scoreMarksmanshipBreakdown,
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

function findNearbyOpportunityInput(resultType: 'save' | 'miss'): ShotInput {
  for (let tapTime = 0; tapTime <= 20_000; tapTime += 10) {
    const candidate: ShotInput = {
      tapTime,
      shooterTapTime: tapTime,
      puckSpeedPerMs: 1.25,
      shooterFrequency: 0.75,
      goalieFrequency: 0.6,
      goalFrequency: 0.5,
    };
    const result = resolvePerspectiveCourtShot(
      candidate,
      movingGoalie,
      'marksmanship-fixture',
      1,
      STICK_NEUTRAL,
      offsets,
    );
    if (result.type !== resultType) continue;
    for (let deltaMs = -250; deltaMs <= 250; deltaMs += 10) {
      if (tapTime + deltaMs < 0) continue;
      const nearby = resolvePerspectiveCourtShot(
        {
          ...candidate,
          tapTime: tapTime + deltaMs,
          shooterTapTime: tapTime + deltaMs,
        },
        movingGoalie,
        'marksmanship-fixture',
        1,
        STICK_NEUTRAL,
        offsets,
      );
      if (nearby.type === 'goal') return candidate;
    }
  }
  throw new Error(`No nearby ${resultType} fixture found`);
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

  it('normalizes the legacy scoring snapshot without adding V2 bonuses', () => {
    const legacy = {
      scanStepMs: 10,
      counterDirectionBonus: 15,
      counterDirectionGoalDistance: 24,
      brackets: DEFAULT_MARKSMANSHIP_SCORING_RULES.brackets,
    };

    expect(parseMarksmanshipScoringRules(legacy)).toMatchObject({
      counterDirectionBonus: 15,
      closeGoalieBonus: 0,
      behindGoalieBonus: 0,
      boardNarrowBonus: 0,
      doubleMultiplier: 1,
      tripleMultiplier: 1,
    });
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

describe('classifyMarksmanshipGeometry', () => {
  it('keeps board proximity as a tag without making the shot difficult by itself', () => {
    expect(
      classifyMarksmanshipGeometry({
        puckX: 58,
        shooterX: 58,
        shooterDirection: -1,
        goalieCenterX: 300,
        goalieHalfWidth: 24,
        goalieDirection: 1,
        goalXMin: 35,
        goalXMax: 125,
      }),
    ).toEqual({
      boardSide: true,
      closeToGoalie: false,
      counterDirection: false,
      behindGoalie: false,
    });
  });

  it('combines a close counter-direction shot behind a moving goalkeeper', () => {
    expect(
      classifyMarksmanshipGeometry({
        puckX: 255,
        shooterX: 255,
        shooterDirection: 1,
        goalieCenterX: 285,
        goalieHalfWidth: 20,
        goalieDirection: 1,
        goalXMin: 245,
        goalXMax: 327,
      }),
    ).toEqual({
      boardSide: false,
      closeToGoalie: true,
      counterDirection: true,
      behindGoalie: true,
    });
  });

  it('does not call the matching side behind the goalkeeper', () => {
    expect(
      classifyMarksmanshipGeometry({
        puckX: 310,
        shooterX: 310,
        shooterDirection: -1,
        goalieCenterX: 285,
        goalieHalfWidth: 20,
        goalieDirection: 1,
        goalXMin: 245,
        goalXMax: 327,
      }).behindGoalie,
    ).toBe(false);
  });
});

describe('classifyMarksmanshipSeries', () => {
  it('marks two goals less than a second apart in the same pass as a double', () => {
    expect(
      classifyMarksmanshipSeries({
        tapTime: 600,
        shooterTapTime: 600,
        shooterFrequency: 0.75,
        shooterPhaseOffset: 0,
        previousGoals: [{ tapTime: 150, shooterTapTime: 150 }],
      }),
    ).toMatchObject({ type: 'double', index: 2, multiplier: 1.7 });
  });

  it('does not mark an out-of-order goal timestamp as a double', () => {
    expect(
      classifyMarksmanshipSeries({
        tapTime: 100,
        shooterTapTime: 600,
        shooterFrequency: 0.75,
        shooterPhaseOffset: 0,
        previousGoals: [{ tapTime: 150, shooterTapTime: 150 }],
      }),
    ).toMatchObject({ type: 'single', index: 1, multiplier: 1 });
  });

  it('does not mark an out-of-order goal timestamp as a triple', () => {
    expect(
      classifyMarksmanshipSeries({
        tapTime: 100,
        shooterTapTime: 600,
        shooterFrequency: 0.75,
        shooterPhaseOffset: 0,
        previousGoals: [
          { tapTime: 150, shooterTapTime: 150 },
          { tapTime: 350, shooterTapTime: 350 },
        ],
      }),
    ).toMatchObject({ type: 'single', index: 1, multiplier: 1 });
  });

  it('uses the configured counter-direction goal distance', () => {
    expect(
      classifyMarksmanshipGeometry({
        puckX: 255,
        shooterX: 255,
        shooterDirection: 1,
        goalieCenterX: 390,
        goalieHalfWidth: 20,
        goalieDirection: 1,
        goalXMin: 245,
        goalXMax: 327,
        maxGoalDistance: 70,
      }).counterDirection,
    ).toBe(true);
  });

  it('marks the third goal in one uninterrupted pass as a triple', () => {
    expect(
      classifyMarksmanshipSeries({
        tapTime: 600,
        shooterTapTime: 600,
        shooterFrequency: 0.75,
        shooterPhaseOffset: 0,
        previousGoals: [
          { tapTime: 100, shooterTapTime: 100 },
          { tapTime: 350, shooterTapTime: 350 },
        ],
      }),
    ).toMatchObject({ type: 'triple', index: 3, multiplier: 1.8 });
  });

  it('starts a new single after the shooter reverses at the board', () => {
    expect(
      classifyMarksmanshipSeries({
        tapTime: 800,
        shooterTapTime: 800,
        shooterFrequency: 0.75,
        shooterPhaseOffset: 0,
        previousGoals: [
          { tapTime: 350, shooterTapTime: 350 },
          { tapTime: 600, shooterTapTime: 600 },
        ],
      }),
    ).toMatchObject({ type: 'single', index: 1, multiplier: 1 });
  });
});

describe('scoreMarksmanshipBreakdown', () => {
  it('combines the base, series multiplier and overlapping situation bonuses', () => {
    expect(
      scoreMarksmanshipBreakdown({
        basePoints: 100,
        windowDurationMs: 80,
        geometry: {
          boardSide: true,
          closeToGoalie: true,
          counterDirection: true,
          behindGoalie: true,
        },
        series: { type: 'double', index: 2, multiplier: 1.7, passId: 0 },
        scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES,
      }),
    ).toEqual({
      basePoints: 100,
      multipliedBasePoints: 170,
      situationBonus: 75,
      seriesBonus: 70,
      awardedPoints: 245,
    });
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
      basePoints: 0,
      awardedPoints: 0,
      difficultyCode: null,
    });
  });

  it.each(['save', 'miss'] as const)(
    'classifies a nearby %s as human error while keeping zero points',
    (resultType) => {
      const shot = findNearbyOpportunityInput(resultType);
      const classification = classify(shot);

      expect(classification).toMatchObject({
        result: { type: resultType },
        opportunity: 'human_error',
        awardedPoints: 0,
      });
      expect(classification.timingErrorMs).not.toBeNull();
    },
  );

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
      situationBonus: 15,
      awardedPoints: 115,
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
      situationBonus: 65,
      awardedPoints: 220,
      difficultyCode: 'very_narrow',
    });
  });
});
