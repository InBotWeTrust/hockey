import { describe, expect, it } from 'vitest';
import { getDuelSettlementPolicy } from '../../src/duel/amateur/lifecycle.js';

describe('duel settlement policy', () => {
  it('preserves normal duel settlement behavior', () => {
    expect(getDuelSettlementPolicy('challenge')).toEqual({
      settleStake: true,
      grantTemplateRewards: true,
      updateRating: true,
      evaluateAchievements: true,
    });
  });

  it('delegates tournament economy and standings while retaining duel achievements', () => {
    expect(getDuelSettlementPolicy('tournament')).toEqual({
      settleStake: false,
      grantTemplateRewards: false,
      updateRating: false,
      evaluateAchievements: true,
    });
  });
});
