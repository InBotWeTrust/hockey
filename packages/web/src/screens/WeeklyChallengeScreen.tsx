import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Sparkles, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  claimWeeklyChallengeReward,
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

export function WeeklyChallengeScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['weekly-challenge'], queryFn: fetchWeeklyChallenge });
  const challenge = query.data?.challenge ?? null;
  const join = useMutation({
    mutationFn: (id: string) => joinWeeklyChallenge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });
  const claim = useMutation({
    mutationFn: (id: string) => claimWeeklyChallengeReward(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });

  return (
    <main
      className="screen"
      style={{ padding: 'calc(16px + var(--app-safe-top)) 14px 24px', overflowY: 'auto' }}
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
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => navigate('/sections')}
          style={{ alignSelf: 'flex-start', padding: '10px 16px', fontSize: 13 }}
        >
          Назад
        </button>
        <div className="section-label section-label--page">Еженедельный челлендж</div>

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
            style={{ borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
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

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, fontWeight: 900 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Coins size={14} /> {numberText(challenge.reward.coins)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Star size={14} /> {numberText(challenge.reward.stars)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Sparkles size={14} /> {numberText(challenge.reward.experience)}
              </span>
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
              <button
                type="button"
                className="btn btn--cta"
                onClick={() => join.mutate(challenge.id)}
                disabled={join.isPending}
              >
                Участвовать
              </button>
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
