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
function rewardRulesSchema(limit: number) {
  const amount = z.number().int().min(0).max(limit);
  const reward = z.object({ coins: amount, stars: amount, tokens: amount });
  return z.object({
    equalExperienceTolerancePercent: z.number().int().min(0).max(100),
    strongerWin: reward,
    equalWin: reward,
    weakerWin: reward,
    draw: reward,
    loss: reward,
  });
}

/** New configuration and immutable snapshot writes use the account storage cap. */
export const duelRewardRulesSchema = rewardRulesSchema(REWARD_AMOUNT_LIMIT);
/** Historical reads retain the formerly supported exact safe-integer range. */
export const storedDuelRewardRulesSchema = rewardRulesSchema(Number.MAX_SAFE_INTEGER);

export function duelRewardStorageCompatible(input: {
  rewardRules: DuelRewardRules;
  winCurrencyReward: number;
  drawCurrencyReward: number;
  winStarReward: number;
  stakeAmount: number;
  entryFeeAmount: number;
}): boolean {
  if (!duelRewardRulesSchema.safeParse(input.rewardRules).success) return false;
  if (
    ![
      input.winCurrencyReward,
      input.drawCurrencyReward,
      input.winStarReward,
      input.stakeAmount,
      input.entryFeeAmount,
    ].every((amount) => Number.isInteger(amount) && amount >= 0 && amount <= REWARD_AMOUNT_LIMIT)
  )
    return false;
  if (
    input.stakeAmount * 2 > REWARD_AMOUNT_LIMIT ||
    input.stakeAmount + input.entryFeeAmount > REWARD_AMOUNT_LIMIT
  )
    return false;
  return (['strongerWin', 'equalWin', 'weakerWin', 'draw', 'loss'] as const).every((category) => {
    const win = category.endsWith('Win');
    const reward = input.rewardRules[category];
    const coins =
      reward.coins +
      (win
        ? input.winCurrencyReward + input.stakeAmount * 2
        : category === 'draw'
          ? input.drawCurrencyReward + input.stakeAmount
          : 0);
    return (
      coins <= REWARD_AMOUNT_LIMIT &&
      reward.stars + (win ? input.winStarReward : 0) <= REWARD_AMOUNT_LIMIT
    );
  });
}

export const DEFAULT_DUEL_REWARD_RULES: DuelRewardRules = {
  equalExperienceTolerancePercent: 10,
  strongerWin: { coins: 0, stars: 0, tokens: 0 },
  equalWin: { coins: 0, stars: 0, tokens: 0 },
  weakerWin: { coins: 0, stars: 0, tokens: 0 },
  draw: { coins: 0, stars: 0, tokens: 0 },
  loss: { coins: 0, stars: 0, tokens: 0 },
};

export function parseDuelRewardRules(value: unknown): DuelRewardRules {
  return storedDuelRewardRulesSchema.parse(value);
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
