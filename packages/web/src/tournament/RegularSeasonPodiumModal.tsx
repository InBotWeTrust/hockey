import { CircleDollarSign, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { AccessibleModal } from '../components/AccessibleModal.js';

const PLACE_CONTENT = {
  1: {
    title: 'Вы выиграли регулярный чемпионат!',
    artwork: '/tournament-results/regular-season-first.webp',
    artworkAlt: 'Победитель регулярного чемпионата с золотым кубком',
  },
  2: {
    title: 'Вы заняли 2-е место в регулярном чемпионате!',
    artwork: '/tournament-results/regular-season-second.webp',
    artworkAlt: 'Серебряный призёр регулярного чемпионата с кубком',
  },
  3: {
    title: 'Вы заняли 3-е место в регулярном чемпионате!',
    artwork: '/tournament-results/regular-season-third.webp',
    artworkAlt: 'Бронзовый призёр регулярного чемпионата с кубком',
  },
} as const;

export function RegularSeasonPodiumModal({
  congratulation,
  pending,
  error,
  onConfirm,
}: {
  congratulation: RegularSeasonPodiumCongratulation;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}): JSX.Element {
  const content = PLACE_CONTENT[congratulation.place];
  const rewards = [
    {
      label: 'Монеты',
      value: congratulation.reward.coins,
      tone: 'coin' as const,
      icon: <CircleDollarSign size={20} strokeWidth={2.55} />,
    },
    {
      label: 'Звёзды',
      value: congratulation.reward.stars,
      tone: 'star' as const,
      icon: <Star size={20} strokeWidth={2.55} fill="currentColor" />,
    },
    {
      label: 'Опыт',
      value: congratulation.reward.experience,
      tone: 'experience' as const,
      icon: <TrendingUp size={20} strokeWidth={2.55} />,
    },
  ].filter((reward) => reward.value > 0);
  return (
    <AccessibleModal
      title={content.title}
      copy={congratulation.tournamentTitle}
      closeBlocked
      cardClassName="duel-result-card regular-podium-modal"
    >
      <img
        className="tournament-duel-result__artwork"
        src={content.artwork}
        alt={content.artworkAlt}
      />
      {rewards.length > 0 && (
        <section className="regular-podium-modal__rewards" aria-labelledby="podium-rewards-title">
          <h3 id="podium-rewards-title" className="section-label">
            Награды
          </h3>
          <div className="regular-podium-modal__reward-list">
            {rewards.map((reward) => (
              <RewardValue key={reward.tone} {...reward} />
            ))}
          </div>
        </section>
      )}
      {error !== null && (
        <p className="regular-podium-modal__error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Закрываем…' : 'Закрыть'}
        </button>
      </div>
    </AccessibleModal>
  );
}

function RewardValue({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: RewardTone;
  icon: ReactNode;
}): JSX.Element {
  return (
    <span
      className="regular-podium-modal__reward"
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value.toLocaleString('ru-RU')}`}
      style={{ color: rewardColor(tone) }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{value.toLocaleString('ru-RU')}</span>
    </span>
  );
}
