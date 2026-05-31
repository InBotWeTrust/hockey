import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Circle,
  CircleDollarSign,
  Lock,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  achievementKeys,
  claimAchievement,
  fetchAchievements,
  type AchievementDto,
} from '../api/achievements.js';
import { fetchWeeklyChallenge } from '../api/weeklyChallenge.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';

type AchievementFilter =
  | 'all'
  | 'claimable'
  | 'daily'
  | 'training'
  | 'duel'
  | 'tournament'
  | 'shop'
  | 'future';
type AchievementPageTab = 'achievements' | 'challenges';

const FILTERS: Array<{ id: AchievementFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'claimable', label: 'Получить' },
  { id: 'daily', label: 'Ежедневная' },
  { id: 'training', label: 'Тренировка' },
  { id: 'duel', label: 'Дуэли' },
  { id: 'tournament', label: 'Турниры' },
  { id: 'shop', label: 'Магазин' },
  { id: 'future', label: 'Будущее' },
];
const ACHIEVEMENT_PAGE_TABS: Array<{ id: AchievementPageTab; label: string }> = [
  { id: 'achievements', label: 'Задания' },
  { id: 'challenges', label: 'Челленджи' },
];

function categoryMatches(achievement: AchievementDto, filter: AchievementFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'claimable') return achievement.isClaimable;
  if (filter === 'future') return achievement.availability === 'future';
  return achievement.category === filter;
}

function achievementCompleted(achievement: AchievementDto): boolean {
  return achievement.status === 'claimed' || achievement.status === 'completed_unclaimed';
}

function countText(completed: number, total: number): string {
  return `${completed}/${total}`;
}

function FitOneLineTitle({ text }: { text: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const title = textRef.current;
    if (!container || !title) return;

    let frame = 0;
    const fitTitle = (): void => {
      title.style.fontSize = '13px';
      const availableWidth = Math.max(0, container.clientWidth - 4);
      const titleWidth = title.scrollWidth;
      const nextFontSize =
        availableWidth > 0 && titleWidth > availableWidth
          ? Math.max(7.5, Math.floor(((13 * availableWidth) / titleWidth) * 10) / 10)
          : 13;
      title.style.fontSize = `${nextFontSize}px`;
    };

    const scheduleFit = (): void => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitTitle);
    };

    scheduleFit();
    const timeoutId = window.setTimeout(scheduleFit, 120);
    void document.fonts?.ready.then(scheduleFit).catch(() => undefined);
    window.addEventListener('resize', scheduleFit);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFit);
    resizeObserver?.observe(container);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', scheduleFit);
      resizeObserver?.disconnect();
    };
  }, [text]);

  return (
    <div ref={containerRef} style={{ minWidth: 0, overflow: 'hidden', marginTop: 1 }}>
      <span
        ref={textRef}
        style={{
          display: 'block',
          whiteSpace: 'nowrap',
          overflow: 'visible',
          fontSize: 13,
          fontWeight: 950,
          lineHeight: 1.15,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function statusText(achievement: AchievementDto): string {
  if (achievement.availability === 'future') return 'Скоро';
  if (achievement.status === 'claimed') return 'Получено';
  return 'Не получено';
}

function statusIcon(achievement: AchievementDto): JSX.Element {
  if (achievement.availability === 'future') return <Lock size={12} />;
  if (achievement.status === 'claimed') return <Check size={12} strokeWidth={3} />;
  return <Circle size={11} strokeWidth={2.7} />;
}

function rewardParts(
  rewards: { currency: number; stars: number; experience: number },
  opts: { plus?: boolean } = {},
): string[] {
  return rewardPartItems(rewards, opts).map((part) => part.text);
}

function rewardPartItems(
  rewards: { currency: number; stars: number; experience: number },
  opts: { plus?: boolean } = {},
): Array<{ tone: RewardTone; text: string }> {
  const prefix = opts.plus === true ? '+' : '';
  return [
    rewards.currency > 0 ? { tone: 'coin' as const, text: `${prefix}${rewards.currency} монет` } : null,
    rewards.stars > 0 ? { tone: 'star' as const, text: `${prefix}${rewards.stars} зв.` } : null,
    rewards.experience > 0
      ? { tone: 'experience' as const, text: `${prefix}${rewards.experience} опыта` }
      : null,
  ].filter((part): part is { tone: RewardTone; text: string } => part !== null);
}

function rewardText(achievement: AchievementDto): string {
  return rewardParts({
    currency: achievement.rewardCurrency,
    stars: achievement.rewardStars,
    experience: achievement.rewardExperience,
  }).join(' · ');
}

export function AchievementsScreen(): JSX.Element {
  const navigate = useNavigate();
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
  const weeklyChallengeQuery = useQuery({
    queryKey: ['weekly-challenge', 'achievements'],
    queryFn: fetchWeeklyChallenge,
  });
  const achievements = achievementsQuery.data?.achievements ?? [];
  const achievementsAttention = (achievementsQuery.data?.unclaimedCount ?? 0) > 0;
  const hasClaimableAchievements = achievements.some((achievement) => achievement.isClaimable);
  const visibleFilters = useMemo(
    () =>
      FILTERS.filter((item) => item.id !== 'claimable' || hasClaimableAchievements),
    [hasClaimableAchievements],
  );
  const challengeAttention =
    weeklyChallengeQuery.data?.challenge?.canJoin === true ||
    weeklyChallengeQuery.data?.challenge?.canClaimReward === true ||
    (weeklyChallengeQuery.data?.pendingRewards?.length ?? 0) > 0;
  const filtered = useMemo(
    () => achievements.filter((achievement) => categoryMatches(achievement, filter)),
    [achievements, filter],
  );
  const filterCounts = useMemo(() => {
    return new Map(
      visibleFilters.map((item) => {
        const matching = achievements.filter((achievement) =>
          categoryMatches(achievement, item.id),
        );
        const completed = matching.filter(achievementCompleted).length;
        return [item.id, { completed, total: matching.length }] as const;
      }),
    );
  }, [achievements, visibleFilters]);
  const selectedFilterCounts = filterCounts.get(filter) ?? { completed: 0, total: 0 };

  useEffect(() => {
    if (filter === 'claimable' && !hasClaimableAchievements) setFilter('all');
  }, [filter, hasClaimableAchievements]);

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
      window.setTimeout(() => setClaimedReward(null), 2800);
    },
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
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
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
            attention: tab.id === 'achievements' ? achievementsAttention : challengeAttention,
          }))}
          activeTab="achievements"
          ariaLabel="Разделы заданий"
          onChange={(tab) => {
            if (tab === 'challenges') navigate('/achievements/weekly-challenge');
          }}
        />
        <div className="section-label section-label--page">
          Задания ({countText(selectedFilterCounts.completed, selectedFilterCounts.total)})
        </div>
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
          {visibleFilters.map((item) => (
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
                onClaim={() => claimMutation.mutate(achievement.id)}
                claimDisabled={claimMutation.isPending}
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
                <RewardChip
                  icon={<CircleDollarSign size={13} />}
                  value={selected.rewardCurrency}
                  tone="coin"
                />
                <RewardChip
                  icon={<Star size={13} fill="currentColor" />}
                  value={selected.rewardStars}
                  tone="star"
                />
                <RewardChip
                  icon={<TrendingUp size={13} />}
                  value={selected.rewardExperience}
                  tone="experience"
                />
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
              animation: 'reward-pop 2.6s ease both',
            }}
          >
            <Sparkles size={24} color="#0f766e" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>
                {claimedReward.title}
              </div>
              {rewardPartItems(claimedReward, { plus: true }).length > 0 && (
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
                  {rewardPartItems(claimedReward, { plus: true }).map((part, index) => (
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

function RewardChip({
  icon,
  value,
  tone,
}: {
  icon: JSX.Element;
  value: number;
  tone: RewardTone;
}): JSX.Element | null {
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
        color: rewardColor(tone),
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
  onClaim,
  claimDisabled,
}: {
  achievement: AchievementDto;
  onOpen: () => void;
  onClaim: () => void;
  claimDisabled: boolean;
}): JSX.Element {
  const muted = achievement.status !== 'claimed' || achievement.availability === 'future';
  const claimable = achievement.status === 'completed_unclaimed';
  return (
    <button
      type="button"
      disabled={claimable && claimDisabled}
      onClick={() => {
        if (claimable) {
          onClaim();
          return;
        }
        onOpen();
      }}
      style={{
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 8,
        overflow: 'hidden',
        padding: 0,
        display: 'grid',
        gridTemplateRows: 'auto 88px',
        alignSelf: 'stretch',
        background: claimable ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
        color: 'var(--ink)',
        textAlign: 'left',
        boxShadow: claimable
          ? '0 10px 26px rgba(15, 118, 110, 0.16)'
          : '0 8px 20px rgba(15,23,42,0.08)',
        position: 'relative',
        cursor: claimable && claimDisabled ? 'wait' : 'pointer',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          background: 'rgba(15,23,42,0.08)',
          position: 'relative',
        }}
      >
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
        <span
          className={achievement.status === 'claimed' ? 'pill pill--dark' : 'pill'}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            minHeight: 25,
            padding: '0 8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            fontWeight: 950,
            boxShadow: '0 6px 18px rgba(15,23,42,0.12)',
          }}
        >
          {statusIcon(achievement)}
          {statusText(achievement)}
        </span>
        {claimable && (
          <span
            aria-label="Требуется действие"
            className="attention-dot-pulse"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 9,
              height: 9,
              borderRadius: 999,
              background: 'rgba(220, 38, 38, 0.96)',
              boxShadow: '0 0 0 4px rgba(220, 38, 38, 0.18)',
            }}
          />
        )}
      </div>
      <div
        style={{
          minHeight: 0,
          padding: '8px 10px 9px',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 5,
        }}
      >
        <FitOneLineTitle text={achievement.title} />
        <div
          data-achievement-requirement
          style={{
            fontSize: 11,
            lineHeight: '14px',
            maxHeight: 42,
            color: 'var(--muted)',
            fontWeight: 700,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'break-word',
          }}
        >
          {achievement.requirement}
        </div>
      </div>
    </button>
  );
}
