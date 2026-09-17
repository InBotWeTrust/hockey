import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '../feedback/haptics.js';
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
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
import { summarizeAchievementProgress } from '../achievements/progressSummary.js';
import {
  AchievementLevelBadge,
  AchievementStageDetails,
} from '../achievements/AchievementStageDetails.js';
import { achievementThumbnailUrl } from '../achievements/artwork.js';
import {
  countClaimableWeeklyChallenges,
  fetchWeeklyChallenge,
  weeklyChallengeKeys,
} from '../api/weeklyChallenge.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { useAuthStore } from '../auth/authStore.js';
import { updateCachedInventoryBalances, updateCachedProfileBalances } from '../app/queryClient.js';

type AchievementFilter =
  | 'all'
  | 'claimable'
  | 'career'
  | 'daily'
  | 'training'
  | 'duel'
  | 'tournament'
  | 'shop'
  | 'future';
type AchievementPageTab = 'achievements' | 'challenges';

const FILTERS: Array<{ id: AchievementFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'claimable', label: 'Забрать' },
  { id: 'career', label: 'Карьера' },
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

function statusText(achievement: AchievementDto): string {
  if (achievement.availability === 'future') return 'Скоро';
  if (achievement.status === 'claimed') return 'Получено';
  return 'Не получено';
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
): Array<{ tone: RewardTone; text: string; value: number }> {
  const prefix = opts.plus === true ? '+' : '';
  return [
    rewards.currency > 0
      ? { tone: 'coin' as const, text: `${prefix}${rewards.currency} монет`, value: rewards.currency }
      : null,
    rewards.stars > 0 ? { tone: 'star' as const, text: `${prefix}${rewards.stars} зв.`, value: rewards.stars } : null,
    rewards.experience > 0
      ? { tone: 'experience' as const, text: `${prefix}${rewards.experience} опыта`, value: rewards.experience }
      : null,
    rewards.tokens > 0
      ? { tone: 'token' as const, text: `${prefix}${rewards.tokens} токенов`, value: rewards.tokens }
      : null,
  ].filter((part): part is { tone: RewardTone; text: string; value: number } => part !== null);
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

function rewardCardIcon(tone: RewardTone): JSX.Element {
  if (tone === 'coin') return <CircleDollarSign size={12} aria-hidden="true" />;
  if (tone === 'star') return <Star size={12} fill="currentColor" aria-hidden="true" />;
  if (tone === 'experience') return <TrendingUp size={12} aria-hidden="true" />;
  return <Ticket size={12} aria-hidden="true" />;
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
    nextLevelOpened: boolean;
  } | null>(null);

  const achievementsQuery = useQuery({
    queryKey: achievementKeys.all,
    queryFn: fetchAchievements,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const weeklyChallengeQuery = useQuery({
    queryKey: weeklyChallengeKeys.current,
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
    countClaimableWeeklyChallenges([
      weeklyChallengeQuery.data?.challenge,
      ...(weeklyChallengeQuery.data?.pendingRewards ?? []),
    ]) > 0;
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
        return [item.id, summarizeAchievementProgress(matching)] as const;
      }),
    );
  }, [achievements, visibleFilters]);
  const selectedFilterCounts = filterCounts.get(filter) ?? {
    completed: 0,
    total: 0,
    levels: { completed: 0, total: 0 },
  };

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
      updateCachedProfileBalances(queryClient, response.balances);
      updateCachedInventoryBalances(queryClient, response.balances);
      setSelected(null);
      setClaimedReward({
        title: response.achievement.title,
        currency: response.rewards.currency,
        stars: response.rewards.stars,
        experience: response.rewards.experience,
        tokens: response.rewards.tokens ?? 0,
        nextLevelOpened: response.stage?.opened != null,
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
        <div className="section-label section-label--page achievement-counts">
          Задания · {selectedFilterCounts.completed}/{selectedFilterCounts.total}, уровни · {selectedFilterCounts.levels.completed}/{selectedFilterCounts.levels.total}
        </div>
        <SegmentedTabs
          items={visibleFilters.map((item) => ({
            ...item,
            attention: item.id === 'claimable' && hasClaimableAchievements,
            ...(item.id === 'claimable' ? { attentionSize: 'small' as const } : {}),
          }))}
          activeTab={filter}
          ariaLabel="Фильтр заданий"
          onChange={setFilter}
          scrollable
        />

        {achievementsQuery.isLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14, padding: '32px 0' }}>Загрузка…</div>
        ) : (
          <div className="achievement-list">
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
            maxHeight: 'calc(100dvh - 20px - var(--app-safe-top) - var(--app-safe-bottom))',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <div className="achievement-details-modal__content">
            <div className="achievement-details-modal__artwork">
              <img
                className="achievement-details-modal__image"
                src={selected.photoUrl}
                alt={selected.title}
              />
              {selected.stage && (
                <AchievementLevelBadge stage={selected.stage} status={selected.status} />
              )}
            </div>
            <p className="achievement-details-modal__description">
              {selected.stage ? selected.description : selected.requirement}
            </p>
          </div>
          {selected.stage && (
            <AchievementStageDetails stage={selected.stage} status={selected.status} />
          )}
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
        <div role="status" aria-live="polite" className="achievement-reward-toast">
          <span className="achievement-reward-toast__status">Награда за достижение начислена</span>
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
          {claimedReward.nextLevelOpened && (
            <span className="achievement-reward-toast__next-level">
              Следующий уровень открыт
            </span>
          )}
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
  const claimable = achievement.status === 'completed_unclaimed';
  const stage = achievement.stage;
  const progressPercent =
    stage && stage.targetValue > 0
      ? Math.min(100, Math.max(0, (stage.progressValue / stage.targetValue) * 100))
      : 0;
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat('ru-RU').format(value).replaceAll('\u00a0', ' ');
  const rewards = rewardPartItems({
    currency: achievement.rewardCurrency,
    stars: achievement.rewardStars,
    experience: achievement.rewardExperience,
    tokens: achievement.rewardTokens ?? 0,
  });

  return (
    <article
      className={`achievement-card achievement-card--list${claimable ? ' achievement-card--claimable' : ''}`}
    >
      <button
        type="button"
        className="achievement-card__open"
        aria-label={`${achievement.title}. Открыть подробности`}
        onClick={onOpen}
      >
        <div className="achievement-card__thumbnail">
          <img
            src={achievementThumbnailUrl(achievement.photoUrl)}
            alt=""
            loading="lazy"
            decoding="async"
          />
          {achievement.status === 'claimed' && (
            <span className="achievement-card__status achievement-card__status--claimed">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </div>

        <div className="achievement-card__body">
          <div className="achievement-card__heading">
            <strong className="achievement-card__title" title={achievement.title}>
              {achievement.title}
            </strong>
            {stage ? (
              <span className="achievement-card__stage">Уровень {stage.current} из {stage.total}</span>
            ) : (
              <span className="achievement-card__status-copy">{statusText(achievement)}</span>
            )}
          </div>

          {rewards.length > 0 && (
            <span
              className="achievement-card__rewards achievement-card__rewards--inline"
              aria-label={`Награда: ${rewardText(achievement)}`}
            >
              {rewards.map((reward) => (
                <span key={reward.tone} style={{ color: rewardColor(reward.tone) }}>
                  {rewardCardIcon(reward.tone)} {reward.value}
                </span>
              ))}
            </span>
          )}

          {!stage && (
            <div className="achievement-card__requirement">{achievement.requirement}</div>
          )}

          {stage && stage.targetValue > 0 && (
            <div
              className="achievement-card__stage-progress"
              role="progressbar"
              aria-label="Прогресс достижения"
              aria-valuemin={0}
              aria-valuenow={stage.progressValue}
              aria-valuemax={stage.targetValue}
            >
              <span className="achievement-card__stage-progress-fill" style={{ width: `${progressPercent}%` }} />
              <strong>{formatNumber(stage.progressValue)} / {formatNumber(stage.targetValue)}</strong>
            </div>
          )}

          {achievement.status === 'claimed' && stage && stage.current >= stage.total && (
            <span className="achievement-card__complete">Все уровни пройдены</span>
          )}
        </div>
      </button>

      {claimable && (
        <button
          type="button"
          className="btn btn--cta achievement-card__claim"
          disabled={claimDisabled}
          onClick={onClaim}
        >
          Забрать награду
        </button>
      )}
    </article>
  );
}
