import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
  classifyMarksmanshipShot,
  type GoalieConfig,
} from '@hockey/game-core';
import { toMarksmanshipScoreDetails } from '../../src/bonusGames/marksmanshipScoreDetails.js';

const goalie: GoalieConfig = {
  id: 'test', name: 'Test', pattern: 'linear', hp: 0,
  baseReward: 0, firstClearBonus: 0, speed: 0, amplitude: 1,
  frequency: 0.6, goalAmplitude: 220, goalFrequency: 0.5,
};

function classify(scoring: typeof DEFAULT_MARKSMANSHIP_SCORING_RULES | typeof DEFAULT_MARKSMANSHIP_V3_SCORING_RULES) {
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
