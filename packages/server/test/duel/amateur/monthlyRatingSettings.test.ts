import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MONTHLY_RATING_SETTINGS,
  monthlyRewardForPlace,
} from '../../../src/duel/amateur/monthlyRatingSettings.js';

describe('monthly rating settings', () => {
  it('defaults to the approved general bands and one prize per format', () => {
    const settings = DEFAULT_MONTHLY_RATING_SETTINGS;
    expect(settings.overall.minimumMatches).toBe(30);
    expect(settings.express.minimumMatches).toBe(10);
    expect(settings.express_plus.minimumMatches).toBe(10);
    expect(settings.classic.minimumMatches).toBe(10);
    expect(monthlyRewardForPlace(settings, 'overall', 1, 1)).toEqual({
      coins: 15000, stars: 300, experience: 0, tokens: 10,
    });
    expect(monthlyRewardForPlace(settings, 'overall', 2, 3).stars).toBe(200);
    expect(monthlyRewardForPlace(settings, 'overall', 11, 11).stars).toBe(15);
    expect(monthlyRewardForPlace(settings, 'express', 1, 1)).toEqual({
      coins: 0, stars: 30, experience: 30, tokens: 0,
    });
    expect(monthlyRewardForPlace(settings, 'express', 2, 2).stars).toBe(0);
  });

  it('suppresses payouts for disabled and entirely zero award bands', () => {
    const settings = structuredClone(DEFAULT_MONTHLY_RATING_SETTINGS);
    settings.express.enabled = false;
    settings.classic.first = { coins: 0, stars: 0, experience: 0, tokens: 0 };
    expect(monthlyRewardForPlace(settings, 'express', 1, 1).stars).toBe(0);
    expect(monthlyRewardForPlace(settings, 'classic', 1, 1).stars).toBe(0);
  });
});
