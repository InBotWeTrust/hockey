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
export type DuelRewardCategory = Exclude<keyof DuelRewardRules, 'equalExperienceTolerancePercent'>;

// PostgreSQL integer accounts and ledger amounts share this limit. Exposed in
// the admin API so the editor cannot drift from server validation.
export const REWARD_AMOUNT_LIMIT = 2_147_483_647;
const safeNonNegativeInteger = z.number().int().min(0).max(REWARD_AMOUNT_LIMIT);

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
  return rules[selectDuelRewardCategory(rules, outcome, winnerExperience, opponentExperience)];
}

export function selectDuelRewardCategory(
  rules: DuelRewardRules,
  outcome: DuelRewardOutcome,
  winnerExperience: number,
  opponentExperience: number,
): DuelRewardCategory {
  if (outcome === 'draw' || outcome === 'loss') return outcome;

  const opponent = classifyExperienceOpponent(
    winnerExperience,
    opponentExperience,
    rules.equalExperienceTolerancePercent,
  );
  if (opponent === 'stronger') return 'strongerWin';
  if (opponent === 'weaker') return 'weakerWin';
  return 'equalWin';
}
