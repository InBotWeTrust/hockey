import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementDto } from '../api/achievements.js';
import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';
import type { WeeklyChallenge } from '../api/weeklyChallenge.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { SectionsScreen } from './SectionsScreen.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');

interface MockSectionsData {
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
    tokens: number;
    created_at: string;
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

function sectionAchievement(id: string, status: AchievementDto['status']): AchievementDto {
  return {
    id,
    photoUrl: '/achievements/first-goal.webp',
    title: id,
    description: 'Описание',
    requirement: 'Условие',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 0,
    rewardStars: 0,
    rewardExperience: 0,
    status,
    isUnlocked: status !== 'locked',
    isClaimable: status === 'completed_unclaimed',
  };
}

describe('SectionsScreen', () => {
  it('keeps the two quick cards readable on screens up to 360px wide', () => {
    expect(designSystemCss).toMatch(
      /@media \(max-width:\s*360px\)[\s\S]*?\.sections-quick-card\s*\{[^}]*grid-template-columns:\s*46px minmax\(0,\s*1fr\);/s,
    );
    expect(designSystemCss).toMatch(
      /@media \(max-width:\s*360px\)[\s\S]*?\.sections-quick-card__title\s*\{[^}]*font-size:\s*11px;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    useDailyStore.setState({ data: null, loading: false, error: null, inFlight: false });
    useTrainingSessionStore.setState({ data: null, loading: false, error: null, inFlight: false });
  });

  it('shows today after the current daily shot progress', async () => {
    mockSectionsApi({ dailyTotalShots: 50 });
    renderSections();

    expect(await screen.findByText('50/90 бросков сегодня')).toBeInTheDocument();
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
    expect(await screen.findByText('Быстрый доступ')).toBeInTheDocument();
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
    [1, 'Вы победитель зачета дуэлей за август'],
    [2, 'Вы заняли 2-е место в зачете дуэлей за август'],
    [17, 'Вы заняли 17-е место в зачете дуэлей за август'],
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
    expect(screen.queryByText(/зачет[ае] дуэлей за август/)).toBeNull();
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
    expect(screen.queryByRole('dialog', { name: /зачете дуэлей/ })).toBeNull();
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

    expect(await screen.findByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
    void client.refetchQueries({
      queryKey: ['amateur-duel', 'rating', 'congratulations', 'pending'],
      exact: true,
    });
    await waitFor(() => expect(monthlyRequestCount).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
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

    await waitFor(() => expect(screen.queryByText(/зачет[ае] дуэлей за август/)).toBeNull());
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

    await screen.findByText('Быстрый доступ');
    expect(screen.queryByRole('dialog', { name: /зачете дуэлей/ })).toBeNull();
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

    expect(await screen.findByText(/зачет[ае] дуэлей за июнь/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByText(/зачет[ае] дуэлей за июль/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/зачет[ае] дуэлей за июнь/)).toBeNull());
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

    expect(await screen.findByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
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

    expect(await screen.findByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
    const pendingGetsBeforeAcknowledgement = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        String(input).includes('/api/duel/amateur/rating/congratulations/pending'),
      ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось закрыть. Попробуйте ещё раз.',
    );
    expect(screen.getByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
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
    expect(screen.queryByText(/зачет[ае] дуэлей за август/)).toBeNull();
    expect(screen.queryByText('Отложенный челлендж')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(await screen.findByText(/зачет[ае] дуэлей за август/)).toBeInTheDocument();
    expect(screen.queryByText('Отложенный челлендж')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
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

  it('marks the achievements section when an achievement reward is waiting', async () => {
    mockSectionsApi({
      achievements: [
        sectionAchievement('claimed', 'claimed'),
        sectionAchievement('waiting', 'completed_unclaimed'),
        sectionAchievement('locked', 'locked'),
      ],
    });
    renderSections();

    expect(await screen.findByText('2/3 наград')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
  });

  it('keeps the weekly challenge out of the sections list', async () => {
    mockSectionsApi({
      achievementsUnclaimedCount: 0,
      weeklyChallenge: {
        id: 'challenge-1',
        title: 'Неделя снайпера',
        status: 'running',
        canClaimReward: false,
      },
    });
    renderSections();

    expect(await screen.findByRole('button', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });

  it('groups frequent actions before the longer game modes', async () => {
    // Break caught: the shop must not fall below the long list of progression modes on phones.
    mockSectionsApi();
    renderSections();

    const quickAccess = await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(
      within(quickAccess)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Ежедневная игра', 'Тренировка', 'Задания', 'Магазин']);

    const modes = screen.getByRole('region', { name: 'Игровые режимы' });
    expect(
      within(modes)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Любители', 'Профессионалы']);
    within(quickAccess)
      .getAllByRole('button')
      .forEach((button) => expect(button).toHaveClass('section-card-surface'));
    within(modes)
      .getAllByRole('button')
      .forEach((button) => {
        expect(button).toHaveClass('section-card-surface');
        expect(button.querySelector('svg')).toHaveClass('card-chevron');
      });
  });

  it('uses wide daily and shop cards around one compact training and tasks row', async () => {
    // Break caught: all four quick actions used the same half-width card and lost hierarchy.
    mockSectionsApi();
    renderSections();

    const quickAccess = await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(within(quickAccess).getByRole('button', { name: 'Ежедневная игра' })).toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Магазин' })).toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Тренировка' })).not.toHaveClass(
      'sections-quick-card--wide',
    );
    expect(within(quickAccess).getByRole('button', { name: 'Задания' })).not.toHaveClass(
      'sections-quick-card--wide',
    );
    ['Ежедневная игра', 'Магазин'].forEach((name) => {
      expect(
        within(quickAccess).getByRole('button', { name }).querySelector('.card-chevron'),
      ).toBeInTheDocument();
    });
    ['Тренировка', 'Задания'].forEach((name) => {
      expect(
        within(quickAccess).getByRole('button', { name }).querySelector('.card-chevron'),
      ).toBeNull();
    });
  });

  it('starts directly with quick access without a duplicate page label', async () => {
    // Break caught: the redundant page label would waste vertical space above the first action.
    mockSectionsApi();
    renderSections();

    await screen.findByRole('region', { name: 'Быстрый доступ' });
    expect(screen.queryByText('Разделы')).toBeNull();
  });

  it('keeps bonus games and tournaments inside the amateur parent section', async () => {
    mockSectionsApi();
    renderSections();

    const amateur = await screen.findByRole('button', { name: 'Любители' });
    expect(amateur).toHaveTextContent('Дуэли, бонусные игры и турниры');
    expect(amateur).not.toHaveTextContent('Раздел открыт');
    expect(screen.queryByRole('button', { name: 'Бонусные игры' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Турниры' })).toBeNull();
  });

  it('shows the live remaining-goals preview on a full-color Amateur card', async () => {
    mockSectionsApi({
      dailyLifetimeTotalGoals: 42,
      dailyAmateurUnlockGoalsRequired: 750,
      profileCompetitionLevel: 'beginner',
    });
    renderSections();

    const amateur = await screen.findByRole('button', { name: 'Любители' });
    expect(amateur).toHaveTextContent('Осталось 708 шайб до статуса «Любитель»');
    expect(amateur).toHaveClass('section-card-surface--default');
    expect(amateur).not.toHaveClass('section-card-surface--muted');
    expect(within(amateur).getByRole('img', { hidden: true })).not.toHaveStyle({
      filter: 'grayscale(1) saturate(0.12)',
    });
    expect(amateur).not.toHaveTextContent('Дуэли, бонусные игры и турниры');
    expect(amateur).not.toHaveTextContent('Раздел открыт');
  });

  it('keeps a single supporting line on the professional card', async () => {
    mockSectionsApi();
    renderSections();

    const professional = await screen.findByRole('button', { name: 'Профессионалы' });
    expect(within(professional).getByText('Игры самого высокого уровня')).toHaveStyle({
      fontSize: '12px',
      fontWeight: '850',
    });
    expect(professional).not.toHaveTextContent('Раздел в разработке');
  });

  it('opens the amateur section chooser for an unlocked player', async () => {
    mockSectionsApi({ profileCompetitionLevel: 'amateur' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?view=amateur&from=sections');
  });

  it('opens the Amateur preview for a beginner without a locked-info modal', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'beginner' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?view=amateur&from=sections');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the amateur parent for a server-authorized amateur below the daily goal threshold', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'amateur' });
    renderSections();

    fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?view=amateur&from=sections');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([{ profileRequest: 'loading' as const }, { profileRequest: 'error' as const }])(
    'keeps the daily-goal fallback when the profile request is $profileRequest',
    async ({ profileRequest }) => {
      mockSectionsApi({
        dailyLifetimeTotalGoals: 300,
        profileRequest,
      });
      renderSections();

      fireEvent.click(await screen.findByRole('button', { name: 'Любители' }));

      expect(screen.getByTestId('location')).toHaveTextContent('/?view=amateur&from=sections');
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('does not mark tasks for future or running challenges without a claimable reward', async () => {
    mockSectionsApi({
      achievements: [],
      achievementsUnclaimedCount: 0,
      weeklyChallenge: {
        id: 'challenge-1',
        title: 'Неделя снайпера',
        status: 'running',
        canClaimReward: false,
      },
      weeklyPendingRewards: [
        {
          id: 'challenge-future',
          title: 'Следующая неделя',
          status: 'future',
          canClaimReward: false,
        },
      ],
    });
    renderSections();

    expect(await screen.findByText('0/0 наград')).toBeInTheDocument();
    expect(screen.queryByLabelText('Требуется действие')).toBeNull();
  });

  it('marks tasks once when a weekly challenge reward can be claimed', async () => {
    mockSectionsApi({
      achievements: [],
      achievementsUnclaimedCount: 0,
      weeklyChallenge: {
        id: 'challenge-1',
        title: 'Неделя снайпера',
        status: 'finished',
        canClaimReward: true,
      },
      weeklyPendingRewards: [
        { id: 'challenge-1', title: 'Неделя снайпера', status: 'finished', canClaimReward: true },
      ],
    });
    renderSections();

    expect(await screen.findByText('0/0 наград')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
  });

  it('hides weekly challenge attention for beginners while keeping achievement attention', async () => {
    mockSectionsApi({
      profileCompetitionLevel: 'beginner',
      achievements: [],
      achievementsUnclaimedCount: 0,
      weeklyChallenge: {
        id: 'challenge-1',
        title: 'Неделя снайпера',
        status: 'running',
        canClaimReward: false,
      },
      weeklyPendingRewards: [{ id: 'challenge-old', title: 'Прошлая неделя' }],
    });
    renderSections();

    expect(await screen.findByText('0/0 наград')).toBeInTheDocument();
    expect(screen.queryByLabelText('Требуется действие')).toBeNull();
  });
});
