export type RatingScope = 'overall' | 'express' | 'express_plus' | 'classic';
export type MonthlyRatingReward = { coins: number; stars: number; experience: number; tokens: number };

export interface RatingScopeSettings {
  enabled: boolean;
  first: MonthlyRatingReward;
}

export interface OverallRatingSettings extends RatingScopeSettings {
  second: MonthlyRatingReward;
  third: MonthlyRatingReward;
  fourToTen: MonthlyRatingReward;
  elevenToFifty: MonthlyRatingReward;
}

export interface MonthlyRatingSettings {
  overall: OverallRatingSettings;
  express: RatingScopeSettings;
  express_plus: RatingScopeSettings;
  classic: RatingScopeSettings;
}

const zero: MonthlyRatingReward = { coins: 0, stars: 0, experience: 0, tokens: 0 };
const format = (): RatingScopeSettings => ({
  enabled: true,
  first: { coins: 0, stars: 30, experience: 30, tokens: 0 },
});

export const DEFAULT_MONTHLY_RATING_SETTINGS: MonthlyRatingSettings = {
  overall: {
    enabled: true,
    first: { coins: 15_000, stars: 300, experience: 0, tokens: 10 },
    second: { coins: 10_000, stars: 200, experience: 0, tokens: 7 },
    third: { coins: 7_500, stars: 150, experience: 0, tokens: 5 },
    fourToTen: { coins: 0, stars: 50, experience: 0, tokens: 3 },
    elevenToFifty: { coins: 0, stars: 15, experience: 0, tokens: 1 },
  },
  express: format(),
  express_plus: format(),
  classic: format(),
};

export function monthlyRewardForPlace(
  settings: MonthlyRatingSettings,
  scope: RatingScope,
  place: number,
  rewardedCount: number,
): MonthlyRatingReward {
  const config = settings[scope];
  if (!config.enabled || place < 1 || place > rewardedCount) return { ...zero };
  if (place === 1) return { ...config.first };
  if (scope !== 'overall') return { ...zero };
  const overall = settings.overall;
  if (place === 2) return { ...overall.second };
  if (place === 3) return { ...overall.third };
  if (place <= 10) return { ...overall.fourToTen };
  if (place <= 50) return { ...overall.elevenToFifty };
  return { ...zero };
}

export function hasMonthlyReward(reward: MonthlyRatingReward): boolean {
  return reward.coins > 0 || reward.stars > 0 || reward.experience > 0 || reward.tokens > 0;
}
