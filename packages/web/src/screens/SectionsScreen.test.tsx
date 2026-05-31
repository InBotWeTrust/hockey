import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { SectionsScreen } from './SectionsScreen.js';

interface MockSectionsData {
  achievementsUnclaimedCount?: number;
  weeklyChallenge?: Record<string, unknown> | null;
  weeklyPendingRewards?: Array<Record<string, unknown>>;
}

function renderSections(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sections']}>
        <SectionsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockSectionsApi({
  achievementsUnclaimedCount = 1,
  weeklyChallenge = null,
  weeklyPendingRewards = [],
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
            lifetime_total_goals: 300,
            amateur_unlock_goals_required: 300,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
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

  it('keeps the weekly challenge out of the sections list', async () => {
    mockSectionsApi({
      achievementsUnclaimedCount: 0,
      weeklyChallenge: { id: 'challenge-1', title: 'Неделя снайпера', canJoin: true },
    });
    renderSections();

    expect(await screen.findByRole('button', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Челлендж недели' })).toBeNull();
  });
});
