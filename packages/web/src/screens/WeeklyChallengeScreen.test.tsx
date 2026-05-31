import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/weeklyChallenge.js';
import { WeeklyChallengeScreen } from './WeeklyChallengeScreen.js';

vi.mock('../api/weeklyChallenge.js');

function renderScreen(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WeeklyChallengeScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WeeklyChallengeScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders empty state when no active challenge exists', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({ challenge: null });

    renderScreen();

    expect(await screen.findByText('На этой неделе активного челленджа нет')).toBeInTheDocument();
  });

  it('renders tasks and lets the user join', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({
      challenge: {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Неделя снайпера',
        description: 'Забрасывай шайбы.',
        status: 'join_open',
        joinOpenAt: '2026-06-01T09:00:00.000Z',
        startAt: '2026-06-02T09:00:00.000Z',
        endAt: '2026-06-09T09:00:00.000Z',
        joinEnabled: true,
        reward: { coins: 100, stars: 5, experience: 50 },
        participant: null,
        tasks: [
          {
            id: 'task-1',
            type: 'goals_scored',
            title: '500 шайб',
            target: 500,
            progress: null,
            completed: null,
          },
        ],
        canJoin: true,
        canClaimReward: false,
        allTasksCompleted: false,
        serverNow: '2026-06-01T10:00:00.000Z',
      },
    });
    vi.mocked(api.joinWeeklyChallenge).mockResolvedValue({ challenge: null });

    renderScreen();

    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Участвовать' }));
    await waitFor(() =>
      expect(api.joinWeeklyChallenge).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
      ),
    );
  });
});
