import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  DEFAULT_MARKSMANSHIP_V5_SCORING_RULES,
  classifyMarksmanshipShot,
  type GoalieConfig,
} from '@hockey/game-core';
import { toMarksmanshipScoreDetails } from '../../src/bonusGames/marksmanshipScoreDetails.js';
import * as bonusService from '../../src/bonusGames/service.js';

const goalie: GoalieConfig = {
  id: 'test', name: 'Test', pattern: 'linear', hp: 0,
  baseReward: 0, firstClearBonus: 0, speed: 0, amplitude: 1,
  frequency: 0.6, goalAmplitude: 220, goalFrequency: 0.5,
};

function classify(scoring: typeof DEFAULT_MARKSMANSHIP_SCORING_RULES |
  typeof DEFAULT_MARKSMANSHIP_V3_SCORING_RULES | typeof DEFAULT_MARKSMANSHIP_V4_SCORING_RULES |
  typeof DEFAULT_MARKSMANSHIP_V5_SCORING_RULES) {
  return classifyMarksmanshipShot({
    shotInput: {
      tapTime: 11_060, shooterTapTime: 11_060, puckSpeedPerMs: 1.25,
      shooterFrequency: 0.75, goalieFrequency: 0.6, goalFrequency: 0.5,
    },
    goalie, seed: 'marksmanship-fixture', shotIndex: 1,
    phaseOffsets: { goalie: 0, goal: 0, shooter: 0 },
    earliestTapTime: 0, scoring,
  });
}

describe('marksmanship score details', () => {
  it('accepts the previous core version for saved bonus attempts only', () => {
    expect(typeof bonusService.supportsBonusGameCoreVersion).toBe('function');
    expect(bonusService.supportsBonusGameCoreVersion(64)).toBe(true);
    expect(bonusService.supportsBonusGameCoreVersion(61)).toBe(false);
    expect(bonusService.supportsBonusGameCoreVersion(66)).toBe(false);
  });

  it('stores the selected V5 technique and tenths for a confirmed goal', () => {
    const classification = classify(DEFAULT_MARKSMANSHIP_V5_SCORING_RULES);
    expect(classification.result.type).toBe('goal');
    const details = toMarksmanshipScoreDetails(classification, DEFAULT_MARKSMANSHIP_V5_SCORING_RULES);
    expect(details).toMatchObject({
      version: 5,
      technique: classification.v5Score?.technique,
      availableTechniques: classification.v5Score?.availableTechniques,
      pointsTenths: classification.awardedPoints,
      result: 'goal',
    });
    expect(details).not.toHaveProperty('seriesBonus');
  });

  it('stores zero V5 points without a claimed technique for a closed miss', () => {
    const goal = classify(DEFAULT_MARKSMANSHIP_V5_SCORING_RULES);
    const details = toMarksmanshipScoreDetails({
      ...goal, result: { type: 'miss', reason: 'wide' }, opportunity: 'closed',
      timingErrorMs: null, windowDurationMs: null,
      v5Score: null, v5Measurements: null, awardedPoints: 0,
    }, DEFAULT_MARKSMANSHIP_V5_SCORING_RULES);
    expect(details).toMatchObject({
      version: 5, result: 'miss', opportunity: 'closed',
      technique: null, availableTechniques: [], pointsTenths: 0,
    });
  });

  it('stores authoritative V4 technique and tenths without legacy bonuses', () => {
    const classification = classify(DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    const details = toMarksmanshipScoreDetails(classification, DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    expect(details).toMatchObject({
      version: 4,
      technique: classification.v4Score?.technique,
      pointsTenths: classification.awardedPoints,
      result: classification.result.type,
      availableTechniques: classification.v4Score?.availableTechniques,
    });
    expect(details).not.toHaveProperty('seriesBonus');
    expect(details).not.toHaveProperty('category');
  });

  it('stores no claimed technique or points when V4 situation is closed', () => {
    const goal = classify(DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    const details = toMarksmanshipScoreDetails({
      ...goal, result: { type: 'miss', reason: 'wide' }, opportunity: 'closed',
      timingErrorMs: null, windowDurationMs: null,
      v4Score: null, v4Measurements: null, awardedPoints: 0,
    }, DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    expect(details).toMatchObject({
      version: 4, result: 'miss', opportunity: 'closed',
      technique: null, availableTechniques: [], pointsTenths: 0,
    });
  });

  it('keeps a V4 sub-25 ms chance distinct from an ordinary human error', () => {
    const goal = classify(DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    const details = toMarksmanshipScoreDetails({
      ...goal, result: { type: 'save', goalieContact: { x: 286, y: 240 } },
      opportunity: 'too_short', timingErrorMs: 12, windowDurationMs: 18,
      awardedPoints: 0,
    }, DEFAULT_MARKSMANSHIP_V4_SCORING_RULES);
    expect(details).toMatchObject({
      version: 4, result: 'save', opportunity: 'too_short',
      windowDurationMs: 18, pointsTenths: 0,
    });
  });
  it('stores one V3 reason without series or situation bonuses', () => {
    const details = toMarksmanshipScoreDetails(
      classify(DEFAULT_MARKSMANSHIP_V3_SCORING_RULES), DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
    );
    expect(details).toMatchObject({ version: 3, category: expect.any(Number), reason: expect.any(String) });
    expect(details).not.toHaveProperty('seriesBonus');
    expect(details).not.toHaveProperty('situationBonus');
  });

  it('preserves the V2 detail shape for an old attempt', () => {
    const details = toMarksmanshipScoreDetails(
      classify(DEFAULT_MARKSMANSHIP_SCORING_RULES), DEFAULT_MARKSMANSHIP_SCORING_RULES,
    );
    expect(details).toMatchObject({ version: 2, seriesBonus: 0, situationBonus: 0 });
    expect(details).not.toHaveProperty('category');
  });
});
