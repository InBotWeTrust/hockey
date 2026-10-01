import { CircleDollarSign, Star, Ticket, TrendingUp } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
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

type RatingAward = NonNullable<MonthlyRatingCongratulation['awards']>[number];

function placeTitle(award: Pick<RatingAward, 'scope' | 'place'>, seasonKey: string): string {
  const month = seasonLabel(seasonKey);
  const monthPhrase = `за\u00a0${month}`;
  if (award.scope === 'overall') {
    if (award.place === 1) return `Вы стали победителем общего зачёта дуэлей ${monthPhrase}`;
    return `Вы заняли ${award.place}-е место в общем зачёте дуэлей ${monthPhrase}`;
  }
  const format = scopeLabels[award.scope];
  if (award.place === 1) {
    return `Вы победитель зачёта дуэлей ${monthPhrase} в формате «${format}»`;
  }
  return `Вы стали призёром зачёта дуэлей ${monthPhrase} в формате «${format}»`;
}

const scopeLabels = {
  overall: 'Общий зачёт',
  express: 'Экспресс',
  express_plus: 'Микс',
  classic: 'Классика',
} as const;

function seasonLabel(seasonKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(seasonKey);
  if (match === null) return seasonKey;
  const year = match[1];
  const month = Number(match[2]);
  const monthName = MONTH_NAMES[month - 1];
  return year === undefined || monthName === undefined
    ? seasonKey
    : monthName.toLocaleLowerCase('ru-RU');
}

function formatPoints(points: number): string {
  const absolute = Math.abs(points);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const unit = lastTwo >= 11 && lastTwo <= 14
    ? 'очков'
    : last === 1
      ? 'очко'
      : last >= 2 && last <= 4
        ? 'очка'
        : 'очков';
  return `${points.toLocaleString('ru-RU')} ${unit}`;
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
  const startFocusRef = useRef<HTMLDivElement>(null);
  const awards = congratulation.awards?.filter((award) =>
    award.coins + award.stars + award.experience + award.tokens > 0,
  ) ?? [];
  const primaryAward: RatingAward =
    awards.find((award) => award.scope === 'overall') ??
    awards[0] ?? {
      scope: 'overall',
      place: congratulation.place,
      points: congratulation.points ?? 0,
      coins: congratulation.coins,
      stars: congratulation.stars,
      experience: congratulation.experience ?? 0,
      tokens: congratulation.tokens,
    };
  const secondaryAwards = awards.filter((award) => award.scope !== primaryAward.scope);
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
      label: 'Опыт',
      value: congratulation.experience ?? 0,
      tone: 'experience' as const,
      icon: <TrendingUp size={20} strokeWidth={2.55} />,
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
      title={placeTitle(primaryAward, congratulation.season_key)}
      closeBlocked
      initialFocusRef={startFocusRef}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal monthly-rating-reward-modal"
    >
      <div
        ref={startFocusRef}
        data-monthly-rating-modal-start
        tabIndex={-1}
        aria-hidden="true"
      />
      <img
        className="bonus-game-preview-modal__artwork monthly-rating-reward-modal__artwork"
        src="/modes/amateur-duel.webp"
        alt="Два хоккеиста соревнуются в дуэли"
      />
      <div className="monthly-rating-reward-modal__placements" aria-label="Результаты зачётов">
        <p className="monthly-rating-reward-modal__primary-result">
          {primaryAward.place}-е место <span>·</span>{' '}
          {formatPoints(primaryAward.points ?? 0)}
        </p>
      </div>
      <section
        className="regular-podium-modal__rewards"
        aria-labelledby="monthly-rating-rewards-title"
      >
        <h3 id="monthly-rating-rewards-title" className="section-label">
          Награды
        </h3>
        <div className="regular-podium-modal__reward-list">
          {rewards.map((reward) => (
            <RewardValue key={reward.label} {...reward} />
          ))}
        </div>
      </section>
      {secondaryAwards.length > 0 && (
        <section
          className="monthly-rating-reward-modal__other-standings"
          aria-labelledby="monthly-rating-other-standings-title"
        >
          <h3 id="monthly-rating-other-standings-title" className="section-label">
            Другие зачёты
          </h3>
          <div className="monthly-rating-reward-modal__other-standings-list">
            {secondaryAwards.map((award) => (
              <p key={award.scope}>
                <strong>{scopeLabels[award.scope]}:</strong>
                {' '}{award.place}-е место {' · '}
                {formatPoints(award.points ?? 0)}
              </p>
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
          {pending ? 'Сохраняем…' : 'Понятно'}
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
