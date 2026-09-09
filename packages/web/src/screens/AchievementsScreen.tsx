import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '../feedback/haptics.js';
import {
  ArrowLeft,
  Check,
  Circle,
  CircleDollarSign,
  Lock,
  Star,
  Ticket,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  achievementKeys,
  claimAchievement,
  fetchAchievements,
  type AchievementDto,
} from '../api/achievements.js';
import { fetchWeeklyChallenge, weeklyChallengeNeedsAction } from '../api/weeklyChallenge.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { useAuthStore } from '../auth/authStore.js';

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
  rewards: { currency: number; stars: number; experience: number; tokens: number },
  opts: { plus?: boolean } = {},
): string[] {
  return rewardPartItems(rewards, opts).map((part) => part.text);
}

function rewardPartItems(
  rewards: { currency: number; stars: number; experience: number; tokens: number },
  opts: { plus?: boolean } = {},
): Array<{ tone: RewardTone; text: string }> {
  const prefix = opts.plus === true ? '+' : '';
  return [
    rewards.currency > 0
      ? { tone: 'coin' as const, text: `${prefix}${rewards.currency} монет` }
      : null,
    rewards.stars > 0 ? { tone: 'star' as const, text: `${prefix}${rewards.stars} зв.` } : null,
    rewards.experience > 0
      ? { tone: 'experience' as const, text: `${prefix}${rewards.experience} опыта` }
      : null,
    rewards.tokens > 0
      ? { tone: 'token' as const, text: `${prefix}${rewards.tokens} токенов` }
      : null,
  ].filter((part): part is { tone: RewardTone; text: string } => part !== null);
}

function rewardText(achievement: AchievementDto): string {
  return rewardParts({
    currency: achievement.rewardCurrency,
    stars: achievement.rewardStars,
    experience: achievement.rewardExperience,
    tokens: achievement.rewardTokens ?? 0,
  }).join(' · ');
}

function rewardToastIcon(tone: RewardTone): JSX.Element {
  if (tone === 'coin') {
    return (
      <CircleDollarSign
        size={15}
        strokeWidth={2.55}
        data-testid="achievement-reward-icon-coins"
        aria-hidden="true"
      />
    );
  }
  if (tone === 'star') {
    return (
      <Star
        size={15}
        strokeWidth={2.55}
        fill="currentColor"
        data-testid="achievement-reward-icon-stars"
        aria-hidden="true"
      />
    );
  }
  if (tone === 'experience') {
    return (
      <TrendingUp
        size={15}
        strokeWidth={2.55}
        data-testid="achievement-reward-icon-experience"
        aria-hidden="true"
      />
    );
  }
  return <Ticket size={15} strokeWidth={2.55} aria-hidden="true" />;
}

export function AchievementsScreen({
  profileContext = false,
}: {
  profileContext?: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const competitionLevel = useAuthStore((state) => state.user?.competitionLevel ?? null);
  const backRoute = profileContext ? '/profile' : '/sections';
  const weeklyChallengeRoute = profileContext
    ? '/profile/achievements/weekly-challenge'
    : '/achievements/weekly-challenge';
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [selected, setSelected] = useState<AchievementDto | null>(null);
  const [claimedReward, setClaimedReward] = useState<{
    title: string;
    currency: number;
    stars: number;
    experience: number;
    tokens: number;
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
    () => FILTERS.filter((item) => item.id !== 'claimable' || hasClaimableAchievements),
    [hasClaimableAchievements],
  );
  const challengeAttention =
    competitionLevel !== 'beginner' &&
    (weeklyChallengeNeedsAction(weeklyChallengeQuery.data?.challenge) ||
      (weeklyChallengeQuery.data?.pendingRewards?.length ?? 0) > 0);
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
      triggerHaptic('success');
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
        tokens: response.rewards.tokens ?? 0,
      });
      window.setTimeout(() => setClaimedReward(null), 5000);
    },
    onError: () => triggerHaptic('error'),
  });

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 14px 24px',
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
            onClick={() => navigate(backRoute)}
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
          <h1
            className="screen-title-on-arena"
            style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}
          >
            Задания
          </h1>
        </div>
        <SegmentedTabs
          items={ACHIEVEMENT_PAGE_TABS.map((tab) => ({
            ...tab,
            attention: tab.id === 'achievements' ? achievementsAttention : challengeAttention,
          }))}
          activeTab="achievements"
          ariaLabel="Разделы заданий"
          onChange={(tab) => {
            if (tab === 'challenges') navigate(weeklyChallengeRoute);
          }}
        />
        <div className="section-label section-label--page">
          Задания · {countText(selectedFilterCounts.completed, selectedFilterCounts.total)}
        </div>
        <SegmentedTabs
          items={visibleFilters}
          activeTab={filter}
          ariaLabel="Фильтр заданий"
          onChange={setFilter}
          scrollable
        />

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
        <AccessibleModal
          title={selected.title}
          copy={selected.requirement}
          onRequestClose={() => setSelected(null)}
          closeBlocked={claimMutation.isPending}
          cardClassName="achievement-details-modal achievement-details-modal--crisp"
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть окно"
              disabled={claimMutation.isPending}
              onClick={() => setSelected(null)}
            >
              <X size={15} />
            </button>
          }
          cardStyle={{
            width: 'min(320px, calc(100vw - 40px))',
            maxHeight: 'calc(100dvh - 40px - var(--app-safe-top) - var(--app-safe-bottom))',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <div className="achievement-details-modal__content">
            <img
              className="achievement-details-modal__image"
              src={selected.photoUrl}
              alt={selected.title}
            />
            <p>{selected.description}</p>
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
              <RewardChip
                icon={<Ticket size={13} />}
                value={selected.rewardTokens ?? 0}
                tone="token"
              />
            </div>
          )}
          {selected.isClaimable && (
            <div className="modal-actions">
              <button
                type="button"
                className="modal-primary btn--cta"
                disabled={claimMutation.isPending}
                onClick={() => claimMutation.mutate(selected.id)}
              >
                Забрать
              </button>
            </div>
          )}
        </AccessibleModal>
      )}

      {claimedReward && (
        <div
          role="status"
          aria-live="polite"
          className="achievement-reward-toast"
        >
          <span className="achievement-reward-toast__status">
            Награда за достижение начислена
          </span>
          <strong className="achievement-reward-toast__title">{claimedReward.title}</strong>
          <div className="achievement-reward-toast__values">
            {rewardPartItems(claimedReward, { plus: true }).map((part) => (
              <span
                className="achievement-reward-toast__value"
                key={part.tone}
                style={{ color: rewardColor(part.tone) }}
              >
                <span className="achievement-reward-toast__icon">
                  {rewardToastIcon(part.tone)}
                  <span>{part.text}</span>
                </span>
              </span>
            ))}
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
      className={`achievement-card${claimable ? ' achievement-card--claimable' : ''}`}
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
        className="achievement-card__body"
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
          className="achievement-card__requirement"
          style={{
            fontSize: 11,
            lineHeight: '14px',
            maxHeight: 42,
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
