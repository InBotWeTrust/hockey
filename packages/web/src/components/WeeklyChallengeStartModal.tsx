import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleDollarSign, Flag, Star, Ticket, TrendingUp, X } from 'lucide-react';
import {
  acknowledgeWeeklyChallengeStart,
  fetchPendingWeeklyChallengeStart,
  weeklyChallengeKeys,
  type WeeklyChallenge,
  type WeeklyChallengeTask,
} from '../api/weeklyChallenge.js';
import { AccessibleModal } from './AccessibleModal.js';

const MONTH_LABELS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
] as const;

function challengeDate(value: string): { weekday: string; dateTime: string } {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    timeZone: 'Europe/Moscow',
  }).format(date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Europe/Moscow',
    })
      .formatToParts(date)
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  const monthIndex = Number(parts.month) - 1;
  return {
    weekday: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`,
    dateTime: `${Number(parts.day)} ${MONTH_LABELS[monthIndex]} · ${parts.hour}:${parts.minute}`,
  };
}

const START_TASK_TITLES: Record<WeeklyChallengeTask['type'], string> = {
  goals_scored: 'Забросить шайбы',
  duels_played: 'Сыграть дуэли',
  duels_won: 'Победить в дуэлях',
  duel_invites_sent: 'Пригласить соперников',
  trainings_completed: 'Завершить тренировки',
  channel_posts_commented: 'Прокомментировать посты канала',
};

function taskTitleWithoutTarget(task: WeeklyChallengeTask): string {
  if (task.title.match(new RegExp(`(^|\\s)${task.target}(?=\\s|$)`)) !== null) {
    return START_TASK_TITLES[task.type];
  }
  return task.title.trim();
}

function rewardItems(reward: WeeklyChallenge['reward']) {
  return [
    { label: 'Монеты', value: reward.coins, icon: CircleDollarSign, tone: 'coin' },
    { label: 'Звёзды', value: reward.stars, icon: Star, tone: 'star' },
    { label: 'Опыт', value: reward.experience, icon: TrendingUp, tone: 'experience' },
    { label: 'Токены', value: reward.tokens, icon: Ticket, tone: 'token' },
  ].filter((item) => item.value > 0);
}

export function WeeklyChallengeStartModal({ enabled }: { enabled: boolean }): JSX.Element | null {
  const queryClient = useQueryClient();
  const [hiddenChallengeId, setHiddenChallengeId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['weekly-challenge', 'start', 'pending'],
    queryFn: fetchPendingWeeklyChallengeStart,
    enabled,
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: acknowledgeWeeklyChallengeStart,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: weeklyChallengeKeys.current });
      await queryClient.invalidateQueries({ queryKey: ['weekly-challenge', 'start'] });
    },
  });
  const challenge = query.data?.challenge ?? null;
  if (challenge === null || hiddenChallengeId === challenge.id) return null;
  const startDate = challengeDate(challenge.startAt);
  const endDate = challengeDate(challenge.endAt);

  const acknowledge = async (): Promise<void> => {
    try {
      await mutation.mutateAsync(challenge.id);
      setHiddenChallengeId(challenge.id);
    } catch {
      // Keep the modal visible so the start is not marked as seen only locally.
    }
  };

  return (
    <AccessibleModal
      title={
        <span className="weekly-challenge-start-modal__title">
          <Flag size={20} aria-hidden="true" />
          <span>Недельный челлендж стартовал!</span>
        </span>
      }
      ariaLabel="Новый недельный челлендж"
      onRequestClose={() => void acknowledge()}
      closeBlocked={mutation.isPending}
      cardClassName="weekly-challenge-start-modal"
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={mutation.isPending}
          onClick={() => void acknowledge()}
        >
          <X size={16} />
        </button>
      }
    >
      <div className="weekly-challenge-start-modal__content">
        {(challenge.title || challenge.description) && (
          <div className="weekly-challenge-start-modal__hero">
            {challenge.title && (
              <h3 className="weekly-challenge-card__title">{challenge.title}</h3>
            )}
            {challenge.description && (
              <p className="weekly-challenge-card__description">{challenge.description}</p>
            )}
          </div>
        )}
        <div className="weekly-challenge-start-modal__dates" aria-label="Период челленджа">
          <div>
            <span>Старт</span>
            <strong>
              <span>{startDate.weekday}</span>
              <span>{startDate.dateTime}</span>
            </strong>
          </div>
          <ArrowRight className="weekly-challenge-start-modal__date-arrow" size={20} aria-hidden="true" />
          <div>
            <span>Финиш</span>
            <strong>
              <span>{endDate.weekday}</span>
              <span>{endDate.dateTime}</span>
            </strong>
          </div>
        </div>
        <div className="weekly-challenge-start-modal__rewards" aria-label="Награда">
          {rewardItems(challenge.reward).map(({ label, value, icon: Icon, tone }) => (
            <span
              key={label}
              aria-label={`${label}: ${value}`}
              title={`${label}: ${value}`}
              className={`weekly-challenge-card__reward reward--${tone}`}
            >
              <span aria-hidden="true">
                <Icon size={17} fill={tone === 'star' ? 'currentColor' : 'none'} />
              </span>
              <strong>{value}</strong>
            </span>
          ))}
        </div>
        <ul className="weekly-challenge-task-list" aria-label="Задания челленджа">
          {challenge.tasks.map((task) => (
            <li className="weekly-challenge-task" key={task.id}>
              <div className="weekly-challenge-task__line">
                <span className="weekly-challenge-task__title">
                  {taskTitleWithoutTarget(task)}
                </span>
                <strong className="weekly-challenge-task__value">{task.target}</strong>
              </div>
            </li>
          ))}
        </ul>
        {mutation.isError && (
          <div role="alert" className="weekly-challenge-start-modal__error">
            Не удалось сохранить. Проверьте соединение и попробуйте ещё раз.
          </div>
        )}
        <button
          type="button"
          className="btn btn--cta"
          disabled={mutation.isPending}
          onClick={() => void acknowledge()}
        >
          {mutation.isPending ? 'Сохраняем…' : 'Понятно'}
        </button>
      </div>
    </AccessibleModal>
  );
}
