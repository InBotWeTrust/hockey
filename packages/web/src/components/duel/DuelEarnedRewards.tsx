import { Star, TrendingUp } from 'lucide-react';
import { rewardColor } from '../../app/rewardColors.js';

export interface DuelEarnedReward {
  stars: number;
  experience: number;
}

export function DuelEarnedRewards({ reward }: { reward: DuelEarnedReward | null }): JSX.Element | null {
  if (reward === null || (reward.stars <= 0 && reward.experience <= 0)) return null;
  return (
    <span className="duel-earned-rewards">
      {reward.stars > 0 && (
        <span className="duel-earned-rewards__item" aria-label={`Звёзды: ${reward.stars}`} style={{ color: rewardColor('star') }}>
          <Star size={15} strokeWidth={2.45} fill="currentColor" aria-hidden="true" />
          <span>{reward.stars}</span>
        </span>
      )}
      {reward.experience > 0 && (
        <span className="duel-earned-rewards__item" aria-label={`Опыт: ${reward.experience}`} style={{ color: rewardColor('experience') }}>
          <TrendingUp size={15} strokeWidth={2.35} aria-hidden="true" />
          <span>{reward.experience}</span>
        </span>
      )}
    </span>
  );
}
