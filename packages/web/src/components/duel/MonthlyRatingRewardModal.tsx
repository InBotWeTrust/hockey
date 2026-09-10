import { CircleDollarSign, Star, Ticket } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MonthlyRatingCongratulation } from '../../api/amateurDuel.js';
import { rewardColor, type RewardTone } from '../../app/rewardColors.js';
import { AccessibleModal } from '../AccessibleModal.js';

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

function placeTitle(place: number): string {
  if (place === 1) return 'Вы выиграли рейтинг дуэлей!';
  return `Вы заняли ${place}-е место в рейтинге дуэлей!`;
}

function seasonLabel(seasonKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
  if (match === null) return seasonKey;
  const year = match[1];
  const month = Number(match[2]);
  const monthName = MONTH_NAMES[month - 1];
  return year === undefined || monthName === undefined ? seasonKey : `${monthName} ${year}`;
}

export function MonthlyRatingRewardModal({
  congratulation,
  pending,
  error,
  onConfirm,
}: {
  congratulation: MonthlyRatingCongratulation;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}): JSX.Element {
  const rewards = [
    {
      label: 'Монеты',
      value: congratulation.coins,
      tone: 'coin' as const,
      icon: <CircleDollarSign size={20} strokeWidth={2.55} />,
    },
    {
      label: 'Звёзды',
      value: congratulation.stars,
      tone: 'star' as const,
      icon: <Star size={20} strokeWidth={2.55} fill="currentColor" />,
    },
    {
      label: 'Токены',
      value: congratulation.tokens,
      tone: 'token' as const,
      icon: <Ticket size={20} strokeWidth={2.55} />,
    },
  ].filter((reward) => reward.value > 0);

  return (
    <AccessibleModal
      title={placeTitle(congratulation.place)}
      copy={seasonLabel(congratulation.season_key)}
      closeBlocked
      cardClassName="duel-result-card regular-podium-modal"
    >
      <section
        className="regular-podium-modal__rewards"
        aria-labelledby="monthly-rating-rewards-title"
      >
        <h3 id="monthly-rating-rewards-title" className="section-label">
          Награды
        </h3>
        <div className="regular-podium-modal__reward-list">
          {rewards.map((reward) => (
            <RewardValue key={reward.tone} {...reward} />
          ))}
        </div>
      </section>
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
