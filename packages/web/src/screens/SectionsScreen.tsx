import { ClassicSections } from '../components/ClassicSections.js';
import { SectionsView } from '../components/SectionsView.js';
import { CityMap } from '../components/CityMap.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check } from 'lucide-react';
import { achievementKeys, fetchAchievements } from '../api/achievements.js';
import { apiFetch } from '../api/apiFetch.js';
import {
  acknowledgeWeeklyChallengeFailure,
  countClaimableWeeklyChallenges,
  fetchPendingWeeklyChallengeFailure,
  fetchWeeklyChallenge,
  weeklyChallengeKeys,
  type WeeklyChallengeFailureResponse,
} from '../api/weeklyChallenge.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import type { ProfileData } from './profileTypes.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { acknowledgeRegularSeasonPodiumCongratulation } from '../api/tournament.js';
import { RegularSeasonPodiumModal } from '../tournament/RegularSeasonPodiumModal.js';
import {
  acknowledgeMonthlyRatingCongratulation,
  fetchPendingMonthlyRatingCongratulations,
  type PendingMonthlyRatingCongratulationsResponse,
} from '../api/amateurDuel.js';
import { MonthlyRatingRewardModal } from '../components/duel/MonthlyRatingRewardModal.js';
import { summarizeAchievementProgress } from '../achievements/progressSummary.js';
import { fetchBonusGames } from '../api/bonusGames.js';
import { preloadInitialTrainingHubArtwork } from '../components/InitialTrainingCourse.js';
import { useAuthStore } from '../auth/authStore.js';

const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 300;
const MONTHLY_RATING_CONGRATULATIONS_KEY = [
  'amateur-duel',
  'rating',
  'congratulations',
  'pending',
] as const;
const BONUS_PROGRESS_STORAGE_PREFIX = 'hockey.bonusGamesProgress.v1:';

type StoredBonusProgress = { completed: number; total: number };

function readStoredBonusProgress(userId: string | undefined): StoredBonusProgress | null {
  if (userId === undefined) return null;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${BONUS_PROGRESS_STORAGE_PREFIX}${userId}`) ?? 'null',
    ) as Partial<StoredBonusProgress> | null;
    return parsed !== null && Number.isInteger(parsed.completed) && Number.isInteger(parsed.total)
      ? { completed: parsed.completed!, total: parsed.total! }
      : null;
  } catch {
    return null;
  }
}

function storeBonusProgress(userId: string | undefined, progress: StoredBonusProgress): void {
  if (userId === undefined) return;
  try {
    window.localStorage.setItem(
      `${BONUS_PROGRESS_STORAGE_PREFIX}${userId}`,
      JSON.stringify(progress),
    );
  } catch {
    // Cached progress is optional; live catalog data remains authoritative.
  }
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

export function SectionsScreen(): JSX.Element {
  const navigate = useNavigate();
  const cityPreview =
    import.meta.env.DEV && new URLSearchParams(useLocation().search).get('city') === '1';
  const queryClient = useQueryClient();
  const dailyData = useDailyStore((s) => s.data);
  const refreshDaily = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const refreshTraining = useTrainingSessionStore((s) => s.refresh);
  const [podiumAckError, setPodiumAckError] = useState<string | null>(null);
  const [monthlyRatingAckError, setMonthlyRatingAckError] = useState<string | null>(null);
  const [failureAckError, setFailureAckError] = useState<string | null>(null);
  const userId = useAuthStore((state) => state.user?.id);
  const [storedBonusProgress] = useState(() => readStoredBonusProgress(userId));
  const weeklyChallenge = useQuery({
    queryKey: weeklyChallengeKeys.current,
    queryFn: fetchWeeklyChallenge,
  });
  const achievementsQuery = useQuery({
    queryKey: achievementKeys.all,
    queryFn: fetchAchievements,
  });
  const bonusGamesQuery = useQuery({
    queryKey: ['bonus-games'],
    queryFn: fetchBonusGames,
  });
  useEffect(() => {
    if (bonusGamesQuery.data === undefined) return;
    storeBonusProgress(userId, {
      completed: bonusGamesQuery.data.games.filter((game) => game.is_completed).length,
      total: bonusGamesQuery.data.games.length,
    });
  }, [bonusGamesQuery.data, userId]);
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile', 'sections'],
    queryFn: () => apiFetch<ProfileData>('/me?includeTournamentCongratulations=true'),
  });
  const failureQuery = useQuery({
    queryKey: ['weekly-challenge', 'failure', 'pending'],
    queryFn: fetchPendingWeeklyChallengeFailure,
  });
  const monthlyRatingQuery = useQuery({
    queryKey: MONTHLY_RATING_CONGRATULATIONS_KEY,
    queryFn: ({ signal }) => fetchPendingMonthlyRatingCongratulations({ signal }),
  });

  const pendingCongratulations = profileQuery.data?.pendingTournamentCongratulations ?? [];
  const bonusGamesMeta = bonusGamesQuery.data
    ? `Пройдено: ${bonusGamesQuery.data.games.filter((game) => game.is_completed).length}/${bonusGamesQuery.data.games.length}`
    : storedBonusProgress
      ? `Пройдено: ${storedBonusProgress.completed}/${storedBonusProgress.total}`
      : bonusGamesQuery.isError
        ? 'Прогресс недоступен'
        : 'Пройдено: —/—';
  const profileQueueReady = profileQuery.isSuccess;
  const activeCongratulation = profileQueueReady ? (pendingCongratulations[0] ?? null) : null;
  const pendingMonthlyRatingCongratulations = (monthlyRatingQuery.data?.congratulations ?? [])
    .filter((congratulation) =>
      [
        congratulation.coins,
        congratulation.stars,
        congratulation.experience ?? 0,
        congratulation.tokens,
      ].some((value) => value > 0),
    )
    .sort((left, right) =>
      left.season_key === right.season_key
        ? left.id.localeCompare(right.id)
        : left.season_key.localeCompare(right.season_key),
    );
  const monthlyRatingQueueReady =
    profileQueueReady && activeCongratulation === null && monthlyRatingQuery.isSuccess;
  const activeMonthlyRatingCongratulation = monthlyRatingQueueReady
    ? (pendingMonthlyRatingCongratulations[0] ?? null)
    : null;
  const rewardQueueError = profileQuery.isError
    ? { onRetry: () => void profileQuery.refetch() }
    : profileQueueReady && activeCongratulation === null && monthlyRatingQuery.isError
      ? { onRetry: () => void monthlyRatingQuery.refetch() }
      : null;
  const acknowledgePodium = useMutation({
    mutationFn: acknowledgeRegularSeasonPodiumCongratulation,
    onMutate: () => setPodiumAckError(null),
    onSuccess: (_response, congratulationId) => {
      setPodiumAckError(null);
      queryClient.setQueryData<ProfileData>(['profile', 'sections'], (current) =>
        current === undefined
          ? current
          : {
              ...current,
              pendingTournamentCongratulations:
                current.pendingTournamentCongratulations?.filter(
                  (item) => item.id !== congratulationId,
                ) ?? [],
            },
      );
    },
    onError: () => setPodiumAckError('Не удалось закрыть. Попробуйте ещё раз.'),
  });
  const acknowledgeFailure = useMutation({
    mutationFn: acknowledgeWeeklyChallengeFailure,
    onMutate: () => setFailureAckError(null),
    onSuccess: (response) => {
      setFailureAckError(null);
      queryClient.setQueryData<WeeklyChallengeFailureResponse>(
        ['weekly-challenge', 'failure', 'pending'],
        response,
      );
    },
    onError: () => setFailureAckError('Не удалось закрыть. Попробуйте ещё раз.'),
  });
  const acknowledgeMonthlyRating = useMutation({
    mutationFn: acknowledgeMonthlyRatingCongratulation,
    onMutate: async () => {
      setMonthlyRatingAckError(null);
      await queryClient.cancelQueries({
        queryKey: MONTHLY_RATING_CONGRATULATIONS_KEY,
        exact: true,
      });
    },
    onSuccess: (_response, congratulationId) => {
      setMonthlyRatingAckError(null);
      queryClient.setQueryData<PendingMonthlyRatingCongratulationsResponse>(
        MONTHLY_RATING_CONGRATULATIONS_KEY,
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                congratulations: current.congratulations.filter(
                  (congratulation) => congratulation.id !== congratulationId,
                ),
              },
      );
      void queryClient.invalidateQueries({
        queryKey: MONTHLY_RATING_CONGRATULATIONS_KEY,
        exact: true,
      });
    },
    onError: () => setMonthlyRatingAckError('Не удалось закрыть. Попробуйте ещё раз.'),
  });

  useEffect(() => {
    preloadInitialTrainingHubArtwork();
  }, []);

  useEffect(() => {
    if (dailyData === null) void refreshDaily();
    if (trainingData === null) void refreshTraining();
  }, [dailyData, refreshDaily, refreshTraining, trainingData]);

  const amateurUnlockGoalsRequired = Math.max(
    0,
    dailyData?.amateur_unlock_goals_required ?? DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED,
  );
  const amateurGoals = Math.min(amateurUnlockGoalsRequired, dailyData?.lifetime_total_goals ?? 0);
  const amateurGoalsRemaining = Math.max(0, amateurUnlockGoalsRequired - amateurGoals);
  const isAmateurUnlocked =
    profileQuery.data?.competitionLevel === 'amateur' ||
    profileQuery.data?.competitionLevel === 'professional' ||
    (dailyData?.lifetime_total_goals ?? 0) >= amateurUnlockGoalsRequired;
  const trainingMeta = trainingData
    ? `${trainingData.shots_taken}/${trainingData.shots_limit} бросков`
    : 'Загрузка тренировки…';
  const dailyShotsLimit = (dailyData?.shots_per_period ?? 30) * (dailyData?.total_periods ?? 3);
  const achievements = achievementsQuery.data?.achievements ?? [];
  const achievementsCompletedCount = achievements.filter(
    (achievement) =>
      achievement.status === 'claimed' || achievement.status === 'completed_unclaimed',
  ).length;
  const activeAchievements = achievements.filter(
    (achievement) => achievement.availability === 'active',
  );
  const achievementProgress = summarizeAchievementProgress(activeAchievements);
  const achievementsUnclaimedCount = achievementsQuery.data?.unclaimedCount ?? 0;
  const weeklyChallengesAvailable =
    profileQuery.data?.competitionLevel === 'amateur' ||
    profileQuery.data?.competitionLevel === 'professional';
  const weeklyChallengeActionCount = weeklyChallengesAvailable
    ? countClaimableWeeklyChallenges([
        weeklyChallenge.data?.challenge,
        ...(weeklyChallenge.data?.pendingRewards ?? []),
      ])
    : 0;
  const sectionTasksActionCount = achievementsUnclaimedCount + weeklyChallengeActionCount;
  const achievementsMeta = [
    `Награды: ${numberText(achievementsCompletedCount)}/${numberText(achievements.length)}`,
    `Уровни: ${numberText(achievementProgress.levels.completed)}/${numberText(achievementProgress.levels.total)}`,
  ] as const;

  return (
    <main
      className="screen city-map-screen"
      style={{
        padding: 'calc(18px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
      }}
    >
      <SectionsView
        initialMap={cityPreview}
        map={
          <CityMap
            amateur={isAmateurUnlocked}
            dailyMeta={`${numberText(dailyData?.daily_total_shots ?? 0)}/${numberText(dailyShotsLimit)}`}
            trainingMeta={trainingMeta}
            tasksMeta={achievementsMeta.join(' · ')}
            bonusMeta={bonusGamesMeta}
            attention={sectionTasksActionCount > 0}
          />
        }
        cards={
          <ClassicSections
            dailyMeta={`${numberText(dailyData?.daily_total_shots ?? 0)}/${numberText(dailyShotsLimit)}`}
            trainingMeta={trainingMeta}
            achievementsMeta={achievementsMeta}
            sectionTasksActionCount={sectionTasksActionCount}
            bonusGamesMeta={bonusGamesMeta}
            isAmateurUnlocked={isAmateurUnlocked}
            amateurGoalsRemaining={amateurGoalsRemaining}
            navigate={navigate}
          />
        }
      />

      {activeCongratulation !== null && (
        <RegularSeasonPodiumModal
          congratulation={activeCongratulation}
          pending={acknowledgePodium.isPending}
          error={podiumAckError}
          onConfirm={() => acknowledgePodium.mutate(activeCongratulation.id)}
        />
      )}
      {activeCongratulation === null && activeMonthlyRatingCongratulation !== null && (
        <MonthlyRatingRewardModal
          congratulation={activeMonthlyRatingCongratulation}
          pending={acknowledgeMonthlyRating.isPending}
          error={monthlyRatingAckError}
          onConfirm={() => acknowledgeMonthlyRating.mutate(activeMonthlyRatingCongratulation.id)}
        />
      )}
      {activeCongratulation === null &&
        monthlyRatingQueueReady &&
        activeMonthlyRatingCongratulation === null &&
        failureQuery.data?.challenge != null && (
          <AccessibleModal
            title="Челлендж не пройден"
            copy={failureQuery.data.challenge.title}
            closeBlocked
            cardClassName="weekly-challenge-failure-modal"
          >
            <div className="weekly-challenge-failure-modal__tasks">
              {failureQuery.data.challenge.tasks.map((task) => (
                <div
                  className={`weekly-challenge-failure-modal__task${task.completed ? ' weekly-challenge-failure-modal__task--completed' : ''}`}
                  key={task.id}
                >
                  <span className="weekly-challenge-failure-modal__status" aria-hidden="true">
                    {task.completed && <Check size={15} strokeWidth={3} />}
                  </span>
                  <span>{task.title}</span>
                  <strong>
                    {(task.progress ?? 0).toLocaleString('ru-RU')} /{' '}
                    {task.target.toLocaleString('ru-RU')}
                  </strong>
                </div>
              ))}
            </div>
            {failureAckError !== null && (
              <p className="modal-error" role="alert">
                {failureAckError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-primary btn btn--cta"
                disabled={acknowledgeFailure.isPending}
                onClick={() => acknowledgeFailure.mutate(failureQuery.data!.challenge!.id)}
              >
                {acknowledgeFailure.isPending ? 'Закрываем…' : 'Понятно'}
              </button>
            </div>
          </AccessibleModal>
        )}
      {rewardQueueError !== null && (
        <section className="duel-state-card duel-state-card--error" role="alert">
          <p>Не удалось загрузить награды.</p>
          <button type="button" className="btn btn--cta" onClick={rewardQueueError.onRetry}>
            Повторить загрузку наград
          </button>
        </section>
      )}
    </main>
  );
}
