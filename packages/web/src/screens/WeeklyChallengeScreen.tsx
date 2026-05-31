import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Star, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  claimWeeklyChallengeReward,
  declineWeeklyChallenge,
  fetchWeeklyChallenge,
  joinWeeklyChallenge,
  type WeeklyChallenge,
} from '../api/weeklyChallenge.js';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function dateText(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(value));
}

function statusText(challenge: WeeklyChallenge): string {
  if (challenge.status === 'not_open') return 'Вход скоро откроется';
  if (challenge.status === 'join_open') return 'Открыт набор участников';
  if (challenge.status === 'running') return 'Челлендж идет';
  return 'Челлендж завершен';
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
}): JSX.Element {
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
  const query = useQuery({ queryKey: ['weekly-challenge'], queryFn: fetchWeeklyChallenge });
  const challenge = query.data?.challenge ?? null;
  const join = useMutation({
    mutationFn: (id: string) => joinWeeklyChallenge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });
  const decline = useMutation({
    mutationFn: (id: string) => declineWeeklyChallenge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });
  const claim = useMutation({
    mutationFn: (id: string) => claimWeeklyChallengeReward(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });

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
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>
            Челлендж недели
          </h1>
        </div>

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
            style={{ borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--blue-accent)' }}>
                {statusText(challenge)}
              </div>
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
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <RewardChip
                label="Монеты"
                value={challenge.reward.coins}
                color="#9A6700"
                icon={<CircleDollarSign size={20} strokeWidth={2.55} />}
              />
              <RewardChip
                label="Звёзды"
                value={challenge.reward.stars}
                color="#B77900"
                icon={<Star size={20} strokeWidth={2.55} fill="currentColor" />}
              />
              <RewardChip
                label="Опыт"
                value={challenge.reward.experience}
                color="#158A86"
                icon={<TrendingUp size={20} strokeWidth={2.55} />}
              />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {challenge.tasks.map((task) => {
                const percent =
                  task.progress === null ? 0 : Math.min(100, Math.round((task.progress / task.target) * 100));
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
                  className="btn btn--ghost"
                  onClick={() => decline.mutate(challenge.id)}
                  disabled={decline.isPending || join.isPending}
                  style={{ padding: '12px 0', fontSize: 13 }}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className="btn btn--cta"
                  onClick={() => join.mutate(challenge.id)}
                  disabled={join.isPending || decline.isPending}
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
                onClick={() => claim.mutate(challenge.id)}
                disabled={claim.isPending}
              >
                Получить награду
              </button>
            )}
            {challenge.participant?.rewardClaimedAt && (
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--muted)' }}>
                Награда получена
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
