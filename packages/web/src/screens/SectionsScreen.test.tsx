import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { SectionsScreen } from './SectionsScreen.js';

interface MockSectionsData {
  achievementsUnclaimedCount?: number;
  weeklyChallenge?: Record<string, unknown> | null;
  weeklyPendingRewards?: Array<Record<string, unknown>>;
  dailyLifetimeTotalGoals?: number;
  profileCompetitionLevel?: 'beginner' | 'amateur' | 'professional';
  profileRequest?: 'error' | 'loading';
}

function renderSections(): void {
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
}

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function mockSectionsApi({
  achievementsUnclaimedCount = 1,
  weeklyChallenge = null,
  weeklyPendingRewards = [],
  dailyLifetimeTotalGoals = 300,
  profileCompetitionLevel,
  profileRequest,
}: MockSectionsData = {}): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/achievements')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ achievements: [], unclaimedCount: achievementsUnclaimedCount }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
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
    if (url.endsWith('/api/duel/daily/state')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            state: 'idle',
            shots_per_period: 30,
            total_periods: 3,
            daily_total_shots: 0,
            lifetime_total_goals: dailyLifetimeTotalGoals,
            amateur_unlock_goals_required: 300,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.endsWith('/api/me')) {
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
        new Response(JSON.stringify({ competitionLevel: profileCompetitionLevel }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
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

describe('SectionsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDailyStore.setState({ data: null, loading: false, error: null, inFlight: false });
    useTrainingSessionStore.setState({ data: null, loading: false, error: null, inFlight: false });
  });

  it('marks the achievements section when an achievement reward is waiting', async () => {
    mockSectionsApi();
    renderSections();

    expect(await screen.findByText('1 награда ждёт')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
  });

  it.each([
    { count: 1, text: '1 награда ждёт' },
    { count: 2, text: '2 награды ждут' },
    { count: 5, text: '5 наград ждут' },
  ])('uses Russian plural forms for $count achievement rewards', async ({ count, text }) => {
    mockSectionsApi({ achievementsUnclaimedCount: count });
    renderSections();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('keeps the weekly challenge out of the sections list', async () => {
    mockSectionsApi({
      achievementsUnclaimedCount: 0,
      weeklyChallenge: { id: 'challenge-1', title: 'Неделя снайпера', canJoin: true },
    });
    renderSections();

    expect(await screen.findByRole('button', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });

  it('places bonus games immediately between amateur and professional sections', async () => {
    mockSectionsApi();
    renderSections();

    await screen.findByRole('button', { name: 'Бонусные игры' });
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    const amateurIndex = labels.findIndex((label) => label.includes('Любители'));
    const bonusIndex = labels.findIndex((label) => label.includes('Бонусные игры'));
    const proIndex = labels.findIndex((label) => label.includes('Профессионалы'));

    expect(bonusIndex).toBe(amateurIndex + 1);
    expect(proIndex).toBe(bonusIndex + 1);
  });

  it('opens bonus games for a server-authorized amateur below the daily goal threshold', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'amateur' });
    renderSections();

    expect(await screen.findByText('Игры и награды за первое прохождение')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Бонусные игры' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/bonus-games');
    expect(screen.queryByRole('dialog', { name: 'Нужен любительский уровень' })).toBeNull();
  });

  it('keeps bonus games locked for a beginner below the daily goal threshold', async () => {
    mockSectionsApi({ dailyLifetimeTotalGoals: 0, profileCompetitionLevel: 'beginner' });
    renderSections();

    await waitFor(() => {
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).endsWith('/api/me')),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Бонусные игры' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/sections');
    expect(screen.getByRole('dialog', { name: 'Нужен любительский уровень' })).toBeInTheDocument();
  });

  it.each([{ profileRequest: 'loading' as const }, { profileRequest: 'error' as const }])(
    'keeps the daily-goal fallback when the profile request is $profileRequest',
    async ({ profileRequest }) => {
      mockSectionsApi({
        dailyLifetimeTotalGoals: 300,
        profileRequest,
      });
      renderSections();

      fireEvent.click(await screen.findByRole('button', { name: 'Бонусные игры' }));

      expect(screen.getByTestId('location')).toHaveTextContent('/bonus-games');
      expect(screen.queryByRole('dialog', { name: 'Нужен любительский уровень' })).toBeNull();
    },
  );

  it('summarizes achievement rewards and weekly challenge actions on the achievements card', async () => {
    mockSectionsApi({
      achievementsUnclaimedCount: 2,
      weeklyChallenge: { id: 'challenge-1', title: 'Неделя снайпера', canJoin: true },
      weeklyPendingRewards: [{ id: 'challenge-old', title: 'Прошлая неделя' }],
    });
    renderSections();

    expect(await screen.findByText('4 действия ждут')).toBeInTheDocument();
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });
});
