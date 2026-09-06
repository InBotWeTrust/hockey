import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleDollarSign, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWeeklyChallengeCatalog } from '../api/weeklyChallenge.js';
import {
  claimWeeklyChallengeReward,
  declineWeeklyChallenge,
  joinWeeklyChallenge,
  type WeeklyChallenge,
  type WeeklyChallengeCatalogResponse,
} from '../api/weeklyChallenge.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { triggerHaptic } from '../feedback/haptics.js';

type AchievementPageTab = 'achievements' | 'challenges';
type ChallengeFilter = keyof WeeklyChallengeCatalogResponse;

const ACHIEVEMENT_PAGE_TABS: Array<{ id: AchievementPageTab; label: string }> = [
  { id: 'achievements', label: 'Задания' },
  { id: 'challenges', label: 'Челленджи' },
];

const FILTERS: Array<{ id: ChallengeFilter; label: string }> = [
  { id: 'active', label: 'Действующие' },
  { id: 'future', label: 'Будущие' },
  { id: 'completed', label: 'Пройденные' },
];

const EMPTY_TEXT: Record<ChallengeFilter, string> = {
  active: 'Вы пока не участвуете в действующих челленджах',
  future: 'Будущих челленджей пока нет',
  completed: 'Вы пока не прошли ни одного челленджа',
};

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function dateText(value: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;
}

function timerTargetText(challenge: WeeklyChallenge): { label: string; target: string } | null {
  if (challenge.status === 'not_open') {
    return { label: 'Вход откроется через', target: challenge.joinOpenAt };
  }
  if (challenge.status === 'join_open') {
    return { label: 'Старт через', target: challenge.startAt };
  }
  if (challenge.status === 'running') {
    return { label: 'До окончания', target: challenge.endAt };
  }
  return null;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function rewardPartItems(
  reward: WeeklyChallenge['reward'],
  opts: { plus?: boolean } = {},
): Array<{ tone: RewardTone; text: string }> {
  const prefix = opts.plus === true ? '+' : '';
  return [
    reward.coins > 0
      ? { tone: 'coin' as const, text: `${prefix}${numberText(reward.coins)}` }
      : null,
    reward.stars > 0
      ? { tone: 'star' as const, text: `${prefix}${numberText(reward.stars)}` }
      : null,
    reward.experience > 0
      ? { tone: 'experience' as const, text: `${prefix}${numberText(reward.experience)}` }
      : null,
  ].filter((part): part is { tone: RewardTone; text: string } => part !== null);
}

function RewardChip({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
}): JSX.Element | null {
  if (value <= 0) return null;
  return (
    <span
      aria-label={`${label}: ${value}`}
      title={`${label}: ${numberText(value)}`}
      className="weekly-challenge-card__reward"
      style={{ color }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{numberText(value)}</span>
    </span>
  );
}

function firstVisibleFilter(catalog: WeeklyChallengeCatalogResponse): ChallengeFilter {
  if (catalog.active.length > 0) return 'active';
  if (catalog.future.length > 0) return 'future';
  if (catalog.completed.length > 0) return 'completed';
  return 'active';
}

export function WeeklyChallengeScreen({
  profileContext = false,
}: {
  profileContext?: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const backRoute = profileContext ? '/profile' : '/sections';
  const achievementsRoute = profileContext ? '/profile/achievements' : '/achievements';
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [filter, setFilter] = useState<ChallengeFilter>('active');
  const [filterInitialized, setFilterInitialized] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{
    title: string;
    reward: WeeklyChallenge['reward'];
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['weekly-challenge', 'catalog'],
    queryFn: fetchWeeklyChallengeCatalog,
  });
  const catalog = query.data ?? { future: [], active: [], completed: [] };
  const visibleChallenges = catalog[filter];
  const selectedFilter = FILTERS.find((item) => item.id === filter) ?? FILTERS[0]!;
  const challengeAttention = [...catalog.future, ...catalog.active, ...catalog.completed].some(
    (challenge) => challenge.canJoin || challenge.canClaimReward,
  );

  const join = useMutation({
    mutationFn: (id: string) => joinWeeklyChallenge(id),
    onSuccess: () => {
      triggerHaptic('success');
      return queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] });
    },
    onError: () => triggerHaptic('error'),
  });
  const decline = useMutation({
    mutationFn: (id: string) => declineWeeklyChallenge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });
  const claim = useMutation({
    mutationFn: (challenge: WeeklyChallenge) => claimWeeklyChallengeReward(challenge.id),
    onMutate: () => setClaimError(null),
    onSuccess: (_response, challenge) => {
      triggerHaptic('success');
      setClaimError(null);
      setClaimedReward({ title: challenge.title, reward: challenge.reward });
      window.setTimeout(() => setClaimedReward(null), 2800);
      void queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] });
    },
    onError: (error) => {
      triggerHaptic('error');
      setClaimError(error instanceof Error ? error.message : 'Не удалось получить награду');
    },
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (query.data === undefined || filterInitialized) return;
    setFilter(firstVisibleFilter(query.data));
    setFilterInitialized(true);
  }, [filterInitialized, query.data]);

  return (
    <main className="screen weekly-challenge-screen">
      <section className="weekly-challenge-screen__content">
        <div className="weekly-challenge-screen__header">
          <button
            type="button"
            className="icon-btn weekly-challenge-screen__back"
            onClick={() => navigate(backRoute)}
            aria-label="Назад"
            title="Назад"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="screen-title-on-arena weekly-challenge-screen__title">Задания</h1>
        </div>

        <SegmentedTabs
          items={ACHIEVEMENT_PAGE_TABS.map((tab) => ({
            ...tab,
            attention: tab.id === 'challenges' ? challengeAttention : false,
          }))}
          activeTab="challenges"
          ariaLabel="Разделы заданий"
          onChange={(tab) => {
            if (tab === 'achievements') navigate(achievementsRoute);
          }}
        />

        <div
          className="segmented-tabs weekly-challenge-filters"
          role="tablist"
          aria-label="Фильтры челленджей"
        >
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`segmented-tabs__item weekly-challenge-filter${filter === item.id ? ' segmented-tabs__item--active' : ''}`}
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <h2 className="section-label weekly-challenge-section-title">
          {selectedFilter.label} ({visibleChallenges.length})
        </h2>

        {query.isLoading && <p className="weekly-challenge-empty">Загружаем челленджи…</p>}
        {!query.isLoading && visibleChallenges.length === 0 && (
          <p className="weekly-challenge-empty">{EMPTY_TEXT[filter]}</p>
        )}
        {!query.isLoading && visibleChallenges.length > 0 && (
          <div className="weekly-challenge-list">
            {visibleChallenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                nowMs={nowMs}
                joinPending={join.isPending}
                declinePending={decline.isPending}
                claimPending={claim.isPending}
                claimError={claimError}
                onJoin={() => join.mutate(challenge.id)}
                onDecline={() => decline.mutate(challenge.id)}
                onClaim={() => claim.mutate(challenge)}
              />
            ))}
          </div>
        )}
      </section>

      {claimedReward && <RewardToast title={claimedReward.title} reward={claimedReward.reward} />}
    </main>
  );
}

function ChallengeCard({
  challenge,
  nowMs,
  joinPending,
  declinePending,
  claimPending,
  claimError,
  onJoin,
  onDecline,
  onClaim,
}: {
  challenge: WeeklyChallenge;
  nowMs: number;
  joinPending: boolean;
  declinePending: boolean;
  claimPending: boolean;
  claimError: string | null;
  onJoin: () => void;
  onDecline: () => void;
  onClaim: () => void;
}): JSX.Element {
  const timer = timerTargetText(challenge);
  const remaining = timer === null ? null : formatRemaining(Date.parse(timer.target) - nowMs);
  const statusText =
    challenge.status === 'finished'
      ? 'Пройден'
      : challenge.status === 'running'
        ? 'Идёт сейчас'
        : 'Скоро';

  return (
    <article className="glass weekly-challenge-card">
      <div className="weekly-challenge-card__topline">
        <span className="weekly-challenge-card__status">{statusText}</span>
        {timer !== null && remaining !== null && (
          <span className="weekly-challenge-card__timer">
            {timer.label} · {remaining}
          </span>
        )}
      </div>
      <div>
        <h2 className="weekly-challenge-card__title">{challenge.title}</h2>
        <div className="weekly-challenge-card__dates">
          {dateText(challenge.startAt)} — {dateText(challenge.endAt)} МСК
        </div>
        {challenge.description && (
          <p className="weekly-challenge-card__description">{challenge.description}</p>
        )}
      </div>

      <div className="weekly-challenge-card__rewards" aria-label="Награда">
        <RewardChip
          label="Монеты"
          value={challenge.reward.coins}
          color={rewardColor('coin')}
          icon={<CircleDollarSign size={16} strokeWidth={2.55} />}
        />
        <RewardChip
          label="Звёзды"
          value={challenge.reward.stars}
          color={rewardColor('star')}
          icon={<Star size={16} strokeWidth={2.55} fill="currentColor" />}
        />
        <RewardChip
          label="Опыт"
          value={challenge.reward.experience}
          color={rewardColor('experience')}
          icon={<TrendingUp size={16} strokeWidth={2.55} />}
        />
      </div>

      <ul className="weekly-challenge-task-list" aria-label={`Задачи челленджа ${challenge.title}`}>
        {challenge.tasks.map((task) => {
          const percent =
            task.progress === null
              ? 0
              : Math.min(100, Math.round((task.progress / task.target) * 100));
          return (
            <li className="weekly-challenge-task" key={task.id}>
              <div className="weekly-challenge-task__line">
                <span className="weekly-challenge-task__title">
                  {task.completed === true && (
                    <Check
                      className="weekly-challenge-task__check"
                      size={14}
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  )}
                  {task.title}
                </span>
                <span className="weekly-challenge-task__value">
                  {task.progress === null
                    ? `Цель ${numberText(task.target)}`
                    : `${numberText(task.progress)} / ${numberText(task.target)}`}
                </span>
              </div>
              {task.progress !== null && (
                <div className="weekly-challenge-task__track" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {challenge.canJoin && (
        <div className="weekly-challenge-card__actions">
          <button
            type="button"
            className="btn weekly-challenge-card__decline"
            onClick={onDecline}
            disabled={declinePending || joinPending}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn btn--cta"
            onClick={onJoin}
            disabled={joinPending || declinePending}
          >
            Участвовать
          </button>
        </div>
      )}
      {challenge.canClaimReward && (
        <button type="button" className="btn btn--cta" onClick={onClaim} disabled={claimPending}>
          Получить награду
        </button>
      )}
      {challenge.participant?.rewardClaimedAt && (
        <div className="weekly-challenge-card__claimed">Награда получена</div>
      )}
      {claimError && challenge.canClaimReward && (
        <div role="alert" className="weekly-challenge-card__error">
          {claimError}
        </div>
      )}
    </article>
  );
}

function RewardToast({
  title,
  reward,
}: {
  title: string;
  reward: WeeklyChallenge['reward'];
}): JSX.Element {
  return (
    <div className="weekly-challenge-reward-toast" aria-live="polite">
      <div className="glass weekly-challenge-reward-toast__card">
        <Sparkles size={24} color="var(--reward-coin)" />
        <div>
          <div className="weekly-challenge-reward-toast__title">{title}</div>
          <div className="weekly-challenge-reward-toast__values">
            {rewardPartItems(reward, { plus: true }).map((part, index) => (
              <span key={part.tone} style={{ color: rewardColor(part.tone) }}>
                {index > 0 ? '· ' : ''}
                {part.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
