import { z } from 'zod';

export type OrdinaryRewardCategory = 'stronger' | 'equal' | 'weaker' | 'draw' | 'loss' | 'noShow';
export type OrdinaryRewardAmount = { stars: number; experience: number };

export interface OrdinaryRewardSettings {
  equalExperienceTolerancePercent: number;
  equalExperienceMinimumGap: number;
  stronger: OrdinaryRewardAmount;
  equal: OrdinaryRewardAmount;
  weaker: OrdinaryRewardAmount;
  draw: OrdinaryRewardAmount;
  loss: OrdinaryRewardAmount;
}

const amountSchema = z.object({
  stars: z.number().int().min(0).max(2_147_483_647),
  experience: z.number().int().min(0).max(2_147_483_647),
});

export const ordinaryRewardSettingsSchema: z.ZodType<OrdinaryRewardSettings> = z.object({
  equalExperienceTolerancePercent: z.number().int().min(0).max(100),
  equalExperienceMinimumGap: z.number().int().min(0).max(2_147_483_647),
  stronger: amountSchema,
  equal: amountSchema,
  weaker: amountSchema,
  draw: amountSchema,
  loss: amountSchema,
});

export const DEFAULT_ORDINARY_REWARD_SETTINGS: OrdinaryRewardSettings = {
  equalExperienceTolerancePercent: 10,
  equalExperienceMinimumGap: 20,
  stronger: { stars: 5, experience: 5 },
  equal: { stars: 3, experience: 3 },
  weaker: { stars: 2, experience: 2 },
  draw: { stars: 0, experience: 2 },
  loss: { stars: 0, experience: 1 },
};

export function ordinaryDuelReward(
  settings: OrdinaryRewardSettings,
  outcome: 'win' | 'draw' | 'loss',
  myExperience: number,
  opponentExperience: number,
  completed: boolean,
): OrdinaryRewardAmount & { category: OrdinaryRewardCategory } {
  if (!completed) return { category: 'noShow', stars: 0, experience: 0 };
  if (outcome === 'draw' || outcome === 'loss') return { category: outcome, ...settings[outcome] };
  const lessExperienced = Math.min(myExperience, opponentExperience);
  const significantGap = Math.max(
    settings.equalExperienceMinimumGap,
    lessExperienced * settings.equalExperienceTolerancePercent / 100,
  );
  const gap = opponentExperience - myExperience;
  const category = gap > significantGap ? 'stronger' : gap < -significantGap ? 'weaker' : 'equal';
  return { category, ...settings[category] };
}
