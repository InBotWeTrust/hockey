export type RewardTone = 'coin' | 'star' | 'experience';

export const REWARD_COLORS: Record<RewardTone, string> = {
  coin: 'var(--reward-coin)',
  star: 'var(--reward-star)',
  experience: 'var(--reward-experience)',
};

export function rewardColor(tone: RewardTone): string {
  return REWARD_COLORS[tone];
}
