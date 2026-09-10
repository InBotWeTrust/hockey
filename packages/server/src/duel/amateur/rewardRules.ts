import { z } from 'zod';

export type DuelRewardAmount = { coins: number; stars: number; tokens: number };

export type DuelRewardRules = {
  equalExperienceTolerancePercent: number;
  strongerWin: DuelRewardAmount;
  equalWin: DuelRewardAmount;
  weakerWin: DuelRewardAmount;
  draw: DuelRewardAmount;
  loss: DuelRewardAmount;
};

export type DuelExperienceOpponent = 'stronger' | 'equal' | 'weaker';
export type DuelRewardOutcome = 'win' | 'draw' | 'loss';

const safeNonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const duelRewardAmountSchema = z.object({
  coins: safeNonNegativeInteger,
  stars: safeNonNegativeInteger,
  tokens: safeNonNegativeInteger,
});

export const duelRewardRulesSchema = z.object({
  equalExperienceTolerancePercent: z.number().int().min(0).max(100),
  strongerWin: duelRewardAmountSchema,
  equalWin: duelRewardAmountSchema,
  weakerWin: duelRewardAmountSchema,
  draw: duelRewardAmountSchema,
  loss: duelRewardAmountSchema,
});

export const DEFAULT_DUEL_REWARD_RULES: DuelRewardRules = {
  equalExperienceTolerancePercent: 10,
  strongerWin: { coins: 0, stars: 0, tokens: 0 },
  equalWin: { coins: 0, stars: 0, tokens: 0 },
  weakerWin: { coins: 0, stars: 0, tokens: 0 },
  draw: { coins: 0, stars: 0, tokens: 0 },
  loss: { coins: 0, stars: 0, tokens: 0 },
};

export function parseDuelRewardRules(value: unknown): DuelRewardRules {
  return duelRewardRulesSchema.parse(value);
}

export function classifyExperienceOpponent(
  winnerExperience: number,
  opponentExperience: number,
  equalExperienceTolerancePercent: number,
): DuelExperienceOpponent {
  if (winnerExperience === 0) return opponentExperience === 0 ? 'equal' : 'stronger';

  const winner = BigInt(winnerExperience);
  const opponent = BigInt(opponentExperience);
  const tolerance = BigInt(equalExperienceTolerancePercent);

  if (opponent * 100n > winner * (100n + tolerance)) return 'stronger';
  if (opponent * 100n < winner * (100n - tolerance)) return 'weaker';
  return 'equal';
}

export function selectDuelReward(
  rules: DuelRewardRules,
  outcome: DuelRewardOutcome,
  winnerExperience: number,
  opponentExperience: number,
): DuelRewardAmount {
  if (outcome === 'draw') return rules.draw;
  if (outcome === 'loss') return rules.loss;

  const opponent = classifyExperienceOpponent(
    winnerExperience,
    opponentExperience,
    rules.equalExperienceTolerancePercent,
  );
  if (opponent === 'stronger') return rules.strongerWin;
  if (opponent === 'weaker') return rules.weakerWin;
  return rules.equalWin;
}
