import type { AchievementDto } from '../api/achievements.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';
import type { WeeklyChallenge } from '../api/weeklyChallenge.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { SectionsScreen } from './SectionsScreen.js';
import { useAuthStore } from '../auth/authStore.js';


interface MockSectionsData {
  bonusGamesCompleted?: boolean[];
  achievements?: AchievementDto[];
  achievementsUnclaimedCount?: number;
  weeklyChallenge?: Record<string, unknown> | null;
  weeklyPendingRewards?: Array<Record<string, unknown>>;
  dailyLifetimeTotalGoals?: number;
  dailyAmateurUnlockGoalsRequired?: number;
  dailyTotalShots?: number;
  profileCompetitionLevel?: 'beginner' | 'amateur' | 'professional';
  profileRequest?: 'error' | 'loading';
  profileResponse?: Promise<Response>;
  monthlyRequest?: 'error' | 'errorAfterAcknowledgement';
  monthlyResponse?: Promise<Response>;
  pendingTournamentCongratulations?: RegularSeasonPodiumCongratulation[];
  acknowledgementRequest?: 'error';
  monthlyAcknowledgementRequest?: 'error';
  pendingMonthlyRatingCongratulations?: Array<{
    id: string;
    season_key: string;
    place: number;
    matches_played: number;
    eligible_count: number;
    rewarded_count: number;
    coins: number;
    stars: number;
    experience?: number;
    tokens: number;
    points?: number;
    created_at: string;
    awards?: Array<{
      scope: 'overall' | 'express' | 'express_plus' | 'classic';
      place: number;
      points?: number;
      coins: number;
      stars: number;
      experience: number;
      tokens: number;
    }>;
  }>;
  pendingChallengeFailure?: WeeklyChallenge | null;
}

function renderSections(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sections']}>
        <SectionsScreen />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function mockSectionsApi({
  bonusGamesCompleted = [true, true, ...Array<boolean>(25).fill(false)],
  achievements = [],
  achievementsUnclaimedCount = 1,
  weeklyChallenge = null,
  weeklyPendingRewards = [],
  dailyLifetimeTotalGoals = 300,
  dailyAmateurUnlockGoalsRequired = 300,
  dailyTotalShots = 0,
  profileCompetitionLevel = 'amateur',
  profileRequest,
  profileResponse,
  pendingTournamentCongratulations = [],
  acknowledgementRequest,
  monthlyRequest,
  monthlyResponse,
  monthlyAcknowledgementRequest,
  pendingMonthlyRatingCongratulations = [],
  pendingChallengeFailure = null,
}: MockSectionsData = {}): void {
  const acknowledgedMonthlyRatingCongratulations = new Set<string>();
  let monthlyAcknowledgementAttempted = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/bonus-games')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            games: bonusGamesCompleted.map((isCompleted, index) => ({
              id: `bonus-${index}`,
              title: `Бонусная игра ${index + 1}`,
              target_goals: 1,
              period_rules: [],
              arena: { artwork_url: '/bonus-games/arenas/test.webp' },
              active_attempt: null,
              is_completed: isCompleted,
            })),
            active_attempt: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.endsWith('/api/achievements')) {
      return Promise.resolve(
        new Response(JSON.stringify({ achievements, unclaimedCount: achievementsUnclaimedCount }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/api/weekly-challenge/current')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ challenge: weeklyChallenge, pendingRewards: weeklyPendingRewards }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.endsWith('/api/weekly-challenge/failures/pending')) {
      return Promise.resolve(
        new Response(JSON.stringify({ challenge: pendingChallengeFailure }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/api/duel/amateur/rating/congratulations/pending')) {
      if (monthlyResponse !== undefined) return monthlyResponse;
      if (
        monthlyRequest === 'error' ||
        (monthlyRequest === 'errorAfterAcknowledgement' && monthlyAcknowledgementAttempted)
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'monthly rewards unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            congratulations: pendingMonthlyRatingCongratulations.filter(
              (congratulation) => !acknowledgedMonthlyRatingCongratulations.has(congratulation.id),
            ),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.includes('/api/duel/amateur/rating/congratulations/') && url.endsWith('/read')) {
      monthlyAcknowledgementAttempted = true;
      const congratulationId = url.split('/').at(-2);
      if (monthlyAcknowledgementRequest !== 'error' && congratulationId !== undefined) {
        acknowledgedMonthlyRatingCongratulations.add(congratulationId);
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(
            monthlyAcknowledgementRequest === 'error'
              ? { error: { code: 'internal', message: 'failed' } }
              : { ok: true },
          ),
          {
            status: monthlyAcknowledgementRequest === 'error' ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.includes('/api/weekly-challenge/failures/') && url.endsWith('/acknowledge')) {
      return Promise.resolve(
        new Response(JSON.stringify({ challenge: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/api/duel/daily/state')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            state: 'idle',
            shots_per_period: 30,
            total_periods: 3,
            daily_total_shots: dailyTotalShots,
            lifetime_total_goals: dailyLifetimeTotalGoals,
            amateur_unlock_goals_required: dailyAmateurUnlockGoalsRequired,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/api/me')) {
      if (profileResponse !== undefined) return profileResponse;
      if (profileRequest === 'loading') return new Promise<Response>(() => undefined);
      if (profileRequest === 'error') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'profile unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            competitionLevel: profileCompetitionLevel,
            pendingTournamentCongratulations,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.includes('/api/tournaments/congratulations/') && url.endsWith('/read')) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            acknowledgementRequest === 'error'
              ? { error: { code: 'internal', message: 'failed' } }
              : { acknowledged: true },
          ),
          {
            status: acknowledgementRequest === 'error' ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    if (url.endsWith('/api/duel/training/state')) {
      return Promise.resolve(
        new Response(JSON.stringify({ state: 'idle', shots_limit: 500, shots_taken: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SectionsScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', displayName: 'Игрок' },
    });
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    useDailyStore.setState({ data: null, loading: false, error: null, inFlight: false });
    useTrainingSessionStore.setState({ data: null, loading: false, error: null, inFlight: false });
  });

  it('shows an unfinished challenge result once and acknowledges it', async () => {
    mockSectionsApi({
      pendingChallengeFailure: {
        id: '00000000-0000-4000-8000-000000000811',
        title: 'Снайпер недели',
        description: 'Описание',
        status: 'finished',
        startAt: '2026-09-02T00:00:00.000Z',
        endAt: '2026-09-09T00:00:00.000Z',
        reward: { coins: 0, stars: 0, experience: 0, tokens: 0 },
        rewardClaimedAt: null,
        tasks: [
          {
            id: 'task-1',
            type: 'goals_scored',
            title: 'Забросить шайбы',
            target: 100,
            progress: 72,
            completed: false,
          },
          {
            id: 'task-2',
            type: 'trainings_completed',
            title: 'Пройти тренировки',
            target: 2,
            progress: 2,
            completed: true,
          },
        ],
        hasProgress: true,
        canClaimReward: false,
        allTasksCompleted: false,
        serverNow: '2026-09-09T01:00:00.000Z',
      },
    });
    renderSections();

    expect(await screen.findByRole('dialog', { name: 'Челлендж не пройден' })).toBeInTheDocument();
    expect(screen.getByText('Снайпер недели')).toBeInTheDocument();
    expect(screen.getByText('72 / 100')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(await screen.findByLabelText('Карта района')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Челлендж не пройден' })).not.toBeInTheDocument();
  });

  it('shows pending podium congratulations oldest first and advances after acknowledgement', async () => {
    mockSectionsApi({
      pendingTournamentCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000951',
          tournamentId: '00000000-0000-4000-8000-000000000961',
          tournamentTitle: 'Первый турнир',
          place: 1,
          reward: { coins: 5000, stars: 25, experience: 1500 },
          createdAt: '2026-09-02T21:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000952',
          tournamentId: '00000000-0000-4000-8000-000000000962',
          tournamentTitle: 'Второй турнир',
          place: 2,
          reward: { coins: 3000, stars: 15, experience: 900 },
          createdAt: '2026-09-03T21:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText('Первый турнир')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/me?includeTournamentCongratulations=true',
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByText('Второй турнир')).toBeInTheDocument();
    expect(screen.queryByText('Первый турнир')).toBeNull();
  });

  it.each([
    [1, 'Вы стали победителем общего зачёта дуэлей за\u00a0август'],
    [2, 'Вы заняли 2-е место в общем зачёте дуэлей за\u00a0август'],
    [17, 'Вы заняли 17-е место в общем зачёте дуэлей за\u00a0август'],
  ])(
    'fetches and shows the approved monthly title for place %i only from the sections queue',
    async (place, title) => {
      mockSectionsApi({
        pendingMonthlyRatingCongratulations: [
          {
            id: '00000000-0000-4000-8000-000000000971',
            season_key: '2026-08',
            place,
            matches_played: 42,
            eligible_count: 50,
            rewarded_count: 10,
            coins: 10000,
            stars: 200,
            tokens: 7,
            created_at: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
      renderSections();

      expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        '/api/duel/amateur/rating/congratulations/pending',
        expect.anything(),
      );
    },
  );

  it('shows two scope awards in one monthly dialog with one duel illustration', async () => {
    mockSectionsApi({
      pendingMonthlyRatingCongratulations: [{
        id: '00000000-0000-4000-8000-000000000972',
        season_key: '2026-08', place: 1, matches_played: 30,
        eligible_count: 2, rewarded_count: 2,
        coins: 15000, stars: 330, experience: 30, tokens: 10, points: 999,
        awards: [
          { scope: 'overall', place: 1, points: 999, coins: 15000, stars: 300, experience: 0, tokens: 10 },
          { scope: 'classic', place: 1, points: 42, coins: 0, stars: 30, experience: 30, tokens: 0 },
        ],
        created_at: '2026-09-01T00:00:00.000Z',
      }],
    });
    renderSections();
    const dialog = await screen.findByRole('dialog', {
      name: 'Вы стали победителем общего зачёта дуэлей за\u00a0август',
    });
    expect(dialog).toHaveTextContent('1-е место · 999 очков');
    expect(dialog).toHaveTextContent('Классика: 1-е место · 42 очка');
    expect(dialog).toHaveTextContent('330');
    expect(within(dialog).getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
    expect(dialog.querySelector('.lucide-trending-up')).not.toBeNull();
    expect(dialog.querySelector('.lucide-trophy')).toBeNull();
    expect(dialog.querySelectorAll('img[src="/modes/amateur-duel.webp"]')).toHaveLength(1);
  });

  it('shows a format winner title and points when only the Classic award is present', async () => {
    mockSectionsApi({
      pendingMonthlyRatingCongratulations: [{
        id: '00000000-0000-4000-8000-000000000973',
        season_key: '2026-09', place: 1, matches_played: 12,
        eligible_count: 12, rewarded_count: 3,
        coins: 0, stars: 30, experience: 30, tokens: 0, points: 87,
        awards: [
          { scope: 'classic', place: 1, points: 87, coins: 0, stars: 30, experience: 30, tokens: 0 },
        ],
        created_at: '2026-10-01T00:00:00.000Z',
      }],
    });
    renderSections();

    const dialog = await screen.findByRole('dialog', {
      name: 'Вы победитель зачёта дуэлей за\u00a0сентябрь в формате «Классика»',
    });
    expect(dialog).toHaveTextContent('1-е место · 87 очков');
  });

  it('does not show monthly rewards before the higher-priority tournament queue is known', async () => {
    const profile = deferredResponse();
    const monthly = deferredResponse();
    mockSectionsApi({
      profileResponse: profile.promise,
      monthlyResponse: monthly.promise,
    });
    renderSections();

    await act(async () => {
      monthly.resolve(
        jsonResponse({
          congratulations: [
            {
              id: '00000000-0000-4000-8000-000000000979',
              season_key: '2026-08',
              place: 1,
              matches_played: 50,
              eligible_count: 50,
              rewarded_count: 10,
              coins: 15000,
              stars: 300,
              tokens: 10,
              created_at: '2026-09-01T00:00:00.000Z',
            },
          ],
        }),
      );
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      profile.resolve(
        jsonResponse({
          competitionLevel: 'amateur',
          pendingTournamentCongratulations: [
            {
              id: '00000000-0000-4000-8000-000000000980',
              tournamentId: '00000000-0000-4000-8000-000000000990',
              tournamentTitle: 'Приоритетный турнир',
              place: 1,
              reward: { coins: 5000, stars: 25, experience: 1500 },
              createdAt: '2026-09-02T21:00:00.000Z',
            },
          ],
        }),
      );
    });

    expect(await screen.findByText('Приоритетный турнир')).toBeInTheDocument();
    expect(screen.queryByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeNull();
  });

  it('blocks monthly and weekly rewards behind a retryable tournament-queue error', async () => {
    mockSectionsApi({
      profileRequest: 'error',
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000981',
          season_key: '2026-08',
          place: 1,
          matches_played: 50,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 15000,
          stars: 300,
          tokens: 10,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить награды.');
    expect(screen.queryByRole('dialog', { name: /зач[её]те дуэлей/ })).toBeNull();
    const profileCallsBeforeRetry = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes('/api/me?includeTournamentCongratulations=true'),
      ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку наград' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([input]) =>
            String(input).includes('/api/me?includeTournamentCongratulations=true'),
          ).length,
      ).toBe(profileCallsBeforeRetry + 1),
    );
  });

  it('blocks weekly failure behind a retryable monthly-rating queue error', async () => {
    mockSectionsApi({
      monthlyRequest: 'error',
      pendingChallengeFailure: {
        id: '00000000-0000-4000-8000-000000000982',
        title: 'Не должен открыться',
        description: 'Описание',
        status: 'finished',
        startAt: '2026-09-02T00:00:00.000Z',
        endAt: '2026-09-09T00:00:00.000Z',
        reward: { coins: 0, stars: 0, experience: 0, tokens: 0 },
        rewardClaimedAt: null,
        tasks: [],
        hasProgress: true,
        canClaimReward: false,
        allTasksCompleted: false,
        serverNow: '2026-09-09T01:00:00.000Z',
      },
    });
    renderSections();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить награды.');
    expect(screen.queryByText('Не должен открыться')).toBeNull();
    const monthlyCallsBeforeRetry = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes('/api/duel/amateur/rating/congratulations/pending'),
      ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку наград' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([input]) =>
            String(input).includes('/api/duel/amateur/rating/congratulations/pending'),
          ).length,
      ).toBe(monthlyCallsBeforeRetry + 1),
    );
  });

  it('does not resurrect an acknowledged monthly reward from a stale in-flight query', async () => {
    const staleMonthly = deferredResponse();
    let monthlyRequestCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/duel/amateur/rating/congratulations/pending')) {
        monthlyRequestCount += 1;
        if (monthlyRequestCount === 2) return staleMonthly.promise;
        return Promise.resolve(
          jsonResponse({
            congratulations:
              monthlyRequestCount === 1
                ? [
                    {
                      id: '00000000-0000-4000-8000-000000000983',
                      season_key: '2026-08',
                      place: 1,
                      matches_played: 50,
                      eligible_count: 50,
                      rewarded_count: 10,
                      coins: 15000,
                      stars: 300,
                      tokens: 10,
                      created_at: '2026-09-01T00:00:00.000Z',
                    },
                  ]
                : [],
          }),
        );
      }
      if (url.includes('/api/duel/amateur/rating/congratulations/') && url.endsWith('/read')) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url.includes('/api/me')) {
        return Promise.resolve(
          jsonResponse({ competitionLevel: 'amateur', pendingTournamentCongratulations: [] }),
        );
      }
      return Promise.resolve(jsonResponse({ challenge: null }));
    });
    const client = renderSections();

    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
    void client.refetchQueries({
      queryKey: ['amateur-duel', 'rating', 'congratulations', 'pending'],
      exact: true,
    });
    await waitFor(() => expect(monthlyRequestCount).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    await waitFor(() => expect(monthlyRequestCount).toBe(3));
    staleMonthly.resolve(
      jsonResponse({
        congratulations: [
          {
            id: '00000000-0000-4000-8000-000000000983',
            season_key: '2026-08',
            place: 1,
            matches_played: 50,
            eligible_count: 50,
            rewarded_count: 10,
            coins: 15000,
            stars: 300,
            tokens: 10,
            created_at: '2026-09-01T00:00:00.000Z',
          },
        ],
      }),
    );

    await waitFor(() => expect(screen.queryByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeNull());
  });

  it('does not show a monthly rating modal when a pending placement has no reward', async () => {
    mockSectionsApi({
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000978',
          season_key: '2026-08',
          place: 17,
          matches_played: 31,
          eligible_count: 72,
          rewarded_count: 14,
          coins: 0,
          stars: 0,
          tokens: 0,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    renderSections();

    await screen.findByLabelText('Карта района');
    expect(screen.queryByRole('dialog', { name: /зач[её]те дуэлей/ })).toBeNull();
  });

  it('acknowledges monthly rating congratulations oldest first and advances the queue', async () => {
    mockSectionsApi({
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000972',
          season_key: '2026-06',
          place: 1,
          matches_played: 50,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 15000,
          stars: 300,
          tokens: 10,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000973',
          season_key: '2026-07',
          place: 2,
          matches_played: 42,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 10000,
          stars: 200,
          tokens: 7,
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+июнь/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+июль/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/зач[её]т[ае] дуэлей за\s+июнь/)).toBeNull());
  });

  it('keeps the monthly rating modal open after acknowledgement fails', async () => {
    mockSectionsApi({
      monthlyAcknowledgementRequest: 'error',
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000974',
          season_key: '2026-08',
          place: 1,
          matches_played: 50,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 15000,
          stars: 300,
          tokens: 10,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
  });

  it('does not refetch or replace the monthly modal after acknowledgement fails', async () => {
    mockSectionsApi({
      monthlyAcknowledgementRequest: 'error',
      monthlyRequest: 'errorAfterAcknowledgement',
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000984',
          season_key: '2026-08',
          place: 1,
          matches_played: 50,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 15000,
          stars: 300,
          tokens: 10,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
    const pendingGetsBeforeAcknowledgement = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes('/api/duel/amateur/rating/congratulations/pending'),
      ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).includes('/api/duel/amateur/rating/congratulations/pending'),
        ).length,
    ).toBe(pendingGetsBeforeAcknowledgement);
  });

  it('keeps tournament podium ahead of monthly rating and weekly failure in the modal queue', async () => {
    mockSectionsApi({
      pendingTournamentCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000975',
          tournamentId: '00000000-0000-4000-8000-000000000985',
          tournamentTitle: 'Кубок впереди очереди',
          place: 1,
          reward: { coins: 5000, stars: 25, experience: 1500 },
          createdAt: '2026-09-02T21:00:00.000Z',
        },
      ],
      pendingMonthlyRatingCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000976',
          season_key: '2026-08',
          place: 1,
          matches_played: 50,
          eligible_count: 50,
          rewarded_count: 10,
          coins: 15000,
          stars: 300,
          tokens: 10,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      pendingChallengeFailure: {
        id: '00000000-0000-4000-8000-000000000977',
        title: 'Отложенный челлендж',
        description: 'Описание',
        status: 'finished',
        startAt: '2026-09-02T00:00:00.000Z',
        endAt: '2026-09-09T00:00:00.000Z',
        reward: { coins: 0, stars: 0, experience: 0, tokens: 0 },
        rewardClaimedAt: null,
        tasks: [],
        hasProgress: true,
        canClaimReward: false,
        allTasksCompleted: false,
        serverNow: '2026-09-09T01:00:00.000Z',
      },
    });
    renderSections();

    expect(await screen.findByText('Кубок впереди очереди')).toBeInTheDocument();
    expect(screen.queryByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeNull();
    expect(screen.queryByText('Отложенный челлендж')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(await screen.findByText(/зач[её]т[ае] дуэлей за\s+август/)).toBeInTheDocument();
    expect(screen.queryByText('Отложенный челлендж')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(await screen.findByText('Отложенный челлендж')).toBeInTheDocument();
  });

  it('keeps the same congratulation open when acknowledgement fails', async () => {
    mockSectionsApi({
      acknowledgementRequest: 'error',
      pendingTournamentCongratulations: [
        {
          id: '00000000-0000-4000-8000-000000000953',
          tournamentId: '00000000-0000-4000-8000-000000000963',
          tournamentTitle: 'Турнир с ошибкой сети',
          place: 3,
          reward: { coins: 0, stars: 0, experience: 0 },
          createdAt: '2026-09-03T21:00:00.000Z',
        },
      ],
    });
    renderSections();

    expect(await screen.findByText('Турнир с ошибкой сети')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText('Турнир с ошибкой сети')).toBeInTheDocument();
  });

  it.each([{ profileRequest: 'loading' as const }, { profileRequest: 'error' as const }])(
    'keeps the daily-goal fallback when the profile request is $profileRequest',
    async ({ profileRequest }) => {
      mockSectionsApi({
        dailyLifetimeTotalGoals: 300,
        profileRequest,
      });
      renderSections();

      fireEvent.click(await screen.findByRole('button', { name: 'Выбрать Стадион «Центральный»' }));
      fireEvent.click(screen.getByRole('button', { name: 'Дуэли и турниры' }));

      expect(screen.getByTestId('location')).toHaveTextContent('/?view=amateur&from=sections');
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});
