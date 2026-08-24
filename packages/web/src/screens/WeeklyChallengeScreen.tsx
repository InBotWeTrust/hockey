import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Sparkles, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { triggerHaptic } from '../feedback/haptics.js';
import {
  claimWeeklyChallengeReward,
  declineWeeklyChallenge,
  fetchWeeklyChallenge,
  joinWeeklyChallenge,
  type WeeklyChallenge,
} from '../api/weeklyChallenge.js';

type AchievementPageTab = 'achievements' | 'challenges';

const ACHIEVEMENT_PAGE_TABS: Array<{ id: AchievementPageTab; label: string }> = [
  { id: 'achievements', label: 'Задания' },
  { id: 'challenges', label: 'Челленджи' },
];

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
    return { label: 'До открытия входа', target: challenge.joinOpenAt };
  }
  if (challenge.status === 'join_open') {
    return { label: 'До старта', target: challenge.startAt };
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
  if (days > 0) return `${days} д ${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function rewardPartItems(
  reward: WeeklyChallenge['reward'],
  opts: { plus?: boolean } = {},
): Array<{ tone: RewardTone; text: string }> {
  const prefix = opts.plus === true ? '+' : '';
  return [
    reward.coins > 0 ? { tone: 'coin' as const, text: `${prefix}${numberText(reward.coins)}` } : null,
    reward.stars > 0 ? { tone: 'star' as const, text: `${prefix}${numberText(reward.stars)}` } : null,
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        color,
        fontSize: 18,
        fontWeight: 950,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 20px',
        }}
      >
        {icon}
      </span>
      <span>{numberText(value)}</span>
    </span>
  );
}

export function WeeklyChallengeScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claimedReward, setClaimedReward] = useState<{
    title: string;
    reward: WeeklyChallenge['reward'];
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['weekly-challenge'], queryFn: fetchWeeklyChallenge });
  const challenge = query.data?.challenge ?? null;
  const pendingRewards = query.data?.pendingRewards ?? [];
  const timer = challenge ? timerTargetText(challenge) : null;
  const remainingText = timer === null ? null : formatRemaining(Date.parse(timer.target) - nowMs);
  const challengeAttention =
    challenge?.canJoin === true || challenge?.canClaimReward === true || pendingRewards.length > 0;
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
    mutationFn: (challengeToClaim: WeeklyChallenge) =>
      claimWeeklyChallengeReward(challengeToClaim.id),
    onMutate: () => {
      setClaimError(null);
    },
    onSuccess: (_response, challengeToClaim) => {
      triggerHaptic('success');
      setClaimError(null);
      setClaimedReward({ title: challengeToClaim.title, reward: challengeToClaim.reward });
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

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 24px 24px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate('/sections')}
            aria-label="Назад"
            title="Назад"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              minHeight: 40,
              borderRadius: 999,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>Задания</h1>
        </div>

        <SegmentedTabs
          items={ACHIEVEMENT_PAGE_TABS.map((tab) => ({
            ...tab,
            attention: tab.id === 'challenges' ? challengeAttention : false,
          }))}
          activeTab="challenges"
          ariaLabel="Разделы заданий"
          onChange={(tab) => {
            if (tab === 'achievements') navigate('/achievements');
          }}
        />

        {query.isLoading && (
          <div className="glass" style={{ borderRadius: 20, padding: 18 }}>
            Загрузка...
          </div>
        )}

        {!query.isLoading && !challenge && (
          <div className="glass" style={{ borderRadius: 24, padding: 22 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>На этой неделе активного челленджа нет</h1>
            <p style={{ margin: '10px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
              Когда админ откроет новый челлендж, он появится здесь.
            </p>
          </div>
        )}

        {challenge && (
          <div
            className="glass"
            style={{
              borderRadius: 26,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <h1 style={{ margin: '4px 0 0', fontSize: 24, lineHeight: 1.1 }}>
                {challenge.title}
              </h1>
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>
                {dateText(challenge.startAt)} - {dateText(challenge.endAt)} МСК
              </div>
              {challenge.description && (
                <p style={{ margin: '8px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {challenge.description}
                </p>
              )}
              {timer && remainingText && (
                <div
                  style={{
                    marginTop: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontWeight: 900,
                  }}
                >
                  <span style={{ color: 'var(--muted)', fontWeight: 800 }}>{timer.label}:</span>
                  <span>{remainingText}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <RewardChip
                label="Монеты"
                value={challenge.reward.coins}
                color={rewardColor('coin')}
                icon={<CircleDollarSign size={20} strokeWidth={2.55} />}
              />
              <RewardChip
                label="Звёзды"
                value={challenge.reward.stars}
                color={rewardColor('star')}
                icon={<Star size={20} strokeWidth={2.55} fill="currentColor" />}
              />
              <RewardChip
                label="Опыт"
                value={challenge.reward.experience}
                color={rewardColor('experience')}
                icon={<TrendingUp size={20} strokeWidth={2.55} />}
              />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {challenge.tasks.map((task) => {
                const percent =
                  task.progress === null
                    ? 0
                    : Math.min(100, Math.round((task.progress / task.target) * 100));
                return (
                  <div
                    key={task.id}
                    style={{ padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.56)' }}
                  >
                    <div style={{ fontWeight: 900 }}>{task.title}</div>
                    <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 13 }}>
                      {task.progress === null
                        ? `Цель: ${numberText(task.target)}`
                        : `${numberText(task.progress)} / ${numberText(task.target)}`}
                    </div>
                    {task.progress !== null && (
                      <div
                        style={{
                          marginTop: 9,
                          height: 5,
                          borderRadius: 999,
                          background: 'rgba(15,23,42,0.1)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: 'var(--blue-accent)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {challenge.canJoin && (
              <div style={{ display: 'grid', gridTemplateColumns: '0.82fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => decline.mutate(challenge.id)}
                  disabled={decline.isPending || join.isPending}
                  style={{
                    minHeight: 44,
                    padding: '12px 0',
                    fontSize: 13,
                    background: '#dc2626',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.72)',
                    boxShadow: '0 8px 20px rgba(220, 38, 38, 0.22)',
                    opacity: decline.isPending || join.isPending ? 0.68 : 1,
                  }}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => join.mutate(challenge.id)}
                  disabled={join.isPending || decline.isPending}
                  style={{
                    minHeight: 44,
                    padding: '12px 0',
                    fontSize: 13,
                    background: '#16a34a',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.72)',
                    boxShadow: '0 8px 20px rgba(22, 163, 74, 0.22)',
                    opacity: join.isPending || decline.isPending ? 0.68 : 1,
                  }}
                >
                  Участвовать
                </button>
              </div>
            )}
            {!challenge.canJoin && challenge.declinedAt && !challenge.participant && (
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--muted)' }}>
                Участие отклонено
              </div>
            )}
            {challenge.canClaimReward && (
              <button
                type="button"
                className="btn btn--cta"
                onClick={() => claim.mutate(challenge)}
                disabled={claim.isPending}
              >
                Получить награду
              </button>
            )}
            {claimError && (
              <div
                role="alert"
                style={{
                  marginTop: challenge.canClaimReward ? -4 : 0,
                  color: '#dc2626',
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {claimError}
              </div>
            )}
            {challenge.participant?.rewardClaimedAt && (
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--muted)' }}>
                Награда получена
              </div>
            )}
          </div>
        )}

        {pendingRewards.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {pendingRewards.map((rewardChallenge) => (
              <PendingRewardCard
                key={rewardChallenge.id}
                challenge={rewardChallenge}
                onClaim={() => claim.mutate(rewardChallenge)}
                disabled={claim.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {claimedReward && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            left: 18,
            right: 18,
            bottom: 'calc(88px + var(--app-safe-bottom))',
            zIndex: 280,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            className="glass"
            style={{
              width: 'min(100%, 330px)',
              borderRadius: 18,
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: '34px minmax(0, 1fr)',
              gap: 10,
              alignItems: 'center',
              animation: 'reward-pop 2.6s ease both',
            }}
          >
            <Sparkles size={24} color="var(--reward-coin)" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>
                {claimedReward.title}
              </div>
              {rewardPartItems(claimedReward.reward, { plus: true }).length > 0 && (
                <div
                  style={{
                    marginTop: 3,
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {rewardPartItems(claimedReward.reward, { plus: true }).map((part, index) => (
                    <span key={part.tone} style={{ color: rewardColor(part.tone) }}>
                      {index > 0 ? '· ' : ''}
                      {part.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PendingRewardCard({
  challenge,
  onClaim,
  disabled,
}: {
  challenge: WeeklyChallenge;
  onClaim: () => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <div
      className="glass"
      style={{ borderRadius: 22, padding: 16, display: 'grid', gap: 12 }}
      aria-label={`Награда за челлендж ${challenge.title}`}
    >
      <div>
        <div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>Награда ждёт</div>
        <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13, fontWeight: 800 }}>
          {challenge.title}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <RewardChip
          label="Монеты"
          value={challenge.reward.coins}
          color={rewardColor('coin')}
          icon={<CircleDollarSign size={20} strokeWidth={2.55} />}
        />
        <RewardChip
          label="Звёзды"
          value={challenge.reward.stars}
          color={rewardColor('star')}
          icon={<Star size={20} strokeWidth={2.55} fill="currentColor" />}
        />
        <RewardChip
          label="Опыт"
          value={challenge.reward.experience}
          color={rewardColor('experience')}
          icon={<TrendingUp size={20} strokeWidth={2.55} />}
        />
      </div>
      <button
        type="button"
        className="btn btn--cta"
        onClick={onClaim}
        disabled={disabled}
        style={{ minHeight: 44 }}
      >
        Получить награду
      </button>
    </div>
  );
}
