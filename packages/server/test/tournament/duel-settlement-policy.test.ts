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

  it('delegates tournament economy and standings to the fixture domain', () => {
    expect(getDuelSettlementPolicy('tournament')).toEqual({
      settleStake: false,
      grantTemplateRewards: false,
      updateRating: false,
      evaluateAchievements: false,
    });
  });
});
