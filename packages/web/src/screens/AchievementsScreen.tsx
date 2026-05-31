import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Lock, Sparkles, Star, TrendingUp } from 'lucide-react';
import {
  achievementKeys,
  claimAchievement,
  fetchAchievements,
  type AchievementDto,
} from '../api/achievements.js';

type AchievementFilter = 'all' | 'daily' | 'training' | 'duel' | 'tournament' | 'shop' | 'future';

const FILTERS: Array<{ id: AchievementFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'daily', label: 'Ежедневная' },
  { id: 'training', label: 'Тренировка' },
  { id: 'duel', label: 'Дуэли' },
  { id: 'tournament', label: 'Турниры' },
  { id: 'shop', label: 'Магазин' },
  { id: 'future', label: 'Будущее' },
];

function categoryMatches(achievement: AchievementDto, filter: AchievementFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'future') return achievement.availability === 'future';
  return achievement.category === filter;
}

function statusText(achievement: AchievementDto): string {
  if (achievement.availability === 'future') return 'Скоро';
  if (achievement.status === 'claimed') return 'Получено';
  if (achievement.status === 'completed_unclaimed') return 'Забрать';
  return 'Закрыто';
}

function rewardText(achievement: AchievementDto): string {
  return [
    achievement.rewardCurrency > 0 ? `${achievement.rewardCurrency} монет` : null,
    achievement.rewardStars > 0 ? `${achievement.rewardStars} зв.` : null,
    achievement.rewardExperience > 0 ? `${achievement.rewardExperience} опыта` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function AchievementsScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [selected, setSelected] = useState<AchievementDto | null>(null);
  const [claimedReward, setClaimedReward] = useState<{
    title: string;
    currency: number;
    stars: number;
    experience: number;
  } | null>(null);

  const achievementsQuery = useQuery({
    queryKey: achievementKeys.all,
    queryFn: fetchAchievements,
  });
  const achievements = achievementsQuery.data?.achievements ?? [];
  const filtered = useMemo(
    () => achievements.filter((achievement) => categoryMatches(achievement, filter)),
    [achievements, filter],
  );

  const claimMutation = useMutation({
    mutationFn: (achievementId: string) => claimAchievement(achievementId),
    onSuccess: (response) => {
      queryClient.setQueryData(achievementKeys.all, {
        achievements: achievements.map((achievement) =>
          achievement.id === response.achievement.id ? response.achievement : achievement,
        ),
        unclaimedCount: response.unclaimedCount,
      });
      void queryClient.invalidateQueries({ queryKey: ['achievements'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSelected(null);
      setClaimedReward({
        title: response.achievement.title,
        currency: response.rewards.currency,
        stars: response.rewards.stars,
        experience: response.rewards.experience,
      });
      window.setTimeout(() => setClaimedReward(null), 1800);
    },
  });

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(18px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div className="section-label section-label--page">Задания</div>
        <div
          role="tablist"
          aria-label="Фильтр заданий"
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 2,
            overscrollBehaviorX: 'contain',
          }}
        >
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={filter === item.id ? 'pill pill--dark' : 'pill'}
              style={{
                flex: '0 0 auto',
                border: 0,
                minHeight: 34,
                padding: '0 14px',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {achievementsQuery.isLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14, padding: '32px 0' }}>Загрузка…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
              paddingBottom: 80,
            }}
          >
            {filtered.map((achievement) => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                onOpen={() => setSelected(achievement)}
              />
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelected(null)}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2 className="modal-title">{selected.title}</h2>
            <p className="modal-copy">{selected.requirement}</p>
            <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
              {selected.description}
            </div>
            {rewardText(selected) && (
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <RewardChip icon={<CircleDollarSign size={13} />} value={selected.rewardCurrency} />
                <RewardChip
                  icon={<Star size={13} fill="currentColor" />}
                  value={selected.rewardStars}
                />
                <RewardChip icon={<TrendingUp size={13} />} value={selected.rewardExperience} />
              </div>
            )}
            <div className="modal-actions">
              {selected.isClaimable ? (
                <button
                  type="button"
                  className="modal-primary btn btn--cta"
                  disabled={claimMutation.isPending}
                  onClick={() => claimMutation.mutate(selected.id)}
                >
                  Забрать
                </button>
              ) : (
                <button
                  type="button"
                  className="modal-primary btn btn--cta"
                  onClick={() => setSelected(null)}
                >
                  Закрыть
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
              animation: 'reward-pop 1.6s ease both',
            }}
          >
            <Sparkles size={24} color="#0f766e" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>
                {claimedReward.title}
              </div>
              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>
                +{claimedReward.currency} монет · +{claimedReward.stars} зв. · +
                {claimedReward.experience} опыта
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function RewardChip({ icon, value }: { icon: JSX.Element; value: number }): JSX.Element | null {
  if (value <= 0) return null;
  return (
    <span
      className="pill"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 9px',
        fontSize: 11,
        fontWeight: 900,
      }}
    >
      {icon}
      {value}
    </span>
  );
}

function AchievementCard({
  achievement,
  onOpen,
}: {
  achievement: AchievementDto;
  onOpen: () => void;
}): JSX.Element {
  const muted = achievement.status === 'locked' || achievement.availability === 'future';
  const claimable = achievement.status === 'completed_unclaimed';
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        minHeight: 218,
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 8,
        overflow: 'hidden',
        padding: 0,
        background: claimable ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
        color: 'var(--ink)',
        textAlign: 'left',
        boxShadow: claimable
          ? '0 10px 26px rgba(15, 118, 110, 0.16)'
          : '0 8px 20px rgba(15,23,42,0.08)',
        position: 'relative',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'rgba(15,23,42,0.08)' }}>
        <img
          src={achievement.photoUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: muted ? 'grayscale(1) saturate(0.1)' : 'none',
            opacity: muted ? 0.6 : 1,
          }}
        />
      </div>
      <div style={{ padding: '10px 10px 12px', display: 'grid', gap: 7 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            className={claimable || achievement.status === 'claimed' ? 'pill pill--dark' : 'pill'}
            style={{ padding: '4px 8px', fontSize: 10, fontWeight: 900 }}
          >
            {statusText(achievement)}
          </span>
          {muted && <Lock size={14} color="rgba(71,85,105,0.72)" />}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.15,
            minHeight: 30,
            overflowWrap: 'anywhere',
          }}
        >
          {achievement.title}
        </div>
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.25,
            color: 'var(--muted)',
            fontWeight: 700,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {achievement.requirement}
        </div>
      </div>
    </button>
  );
}
