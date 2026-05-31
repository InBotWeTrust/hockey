import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/weeklyChallenge.js';
import type { WeeklyChallenge } from '../api/weeklyChallenge.js';
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

  function challenge(overrides: Partial<WeeklyChallenge> = {}): WeeklyChallenge {
    return {
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
      declinedAt: null,
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
      ...overrides,
    };
  }

  it('renders empty state when no active challenge exists', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({ challenge: null, pendingRewards: [] });

    renderScreen();

    expect(await screen.findByRole('heading', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Задания' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Челленджи', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('На этой неделе активного челленджа нет')).toBeInTheDocument();
  });

  it('renders tasks and lets the user join', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({
      challenge: challenge(),
      pendingRewards: [],
    });
    vi.mocked(api.joinWeeklyChallenge).mockResolvedValue({ challenge: null, pendingRewards: [] });
    vi.mocked(api.declineWeeklyChallenge).mockResolvedValue({
      challenge: null,
      pendingRewards: [],
    });

    renderScreen();

    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Участвовать' }));
    await waitFor(() =>
      expect(api.joinWeeklyChallenge).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111'),
    );
  });

  it('renders an unclaimed reward from a previous challenge below the current challenge', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({
      challenge: challenge({ id: '22222222-2222-2222-2222-222222222222' }),
      pendingRewards: [
        challenge({
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Прошлая неделя',
          status: 'finished',
          canJoin: false,
          canClaimReward: true,
          allTasksCompleted: true,
          participant: { joinedAt: '2026-05-20T09:00:00.000Z', rewardClaimedAt: null },
          tasks: [
            {
              id: 'task-previous',
              type: 'goals_scored',
              title: '1 шайба',
              target: 1,
              progress: 1,
              completed: true,
            },
          ],
        }),
      ],
    });
    vi.mocked(api.claimWeeklyChallengeReward).mockResolvedValue({
      challenge: challenge({ id: '22222222-2222-2222-2222-222222222222' }),
      pendingRewards: [],
    });

    renderScreen();

    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
    expect(screen.getByText('Награда ждёт')).toBeInTheDocument();
    expect(screen.getByText('Прошлая неделя')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Получить награду' }));
    await waitFor(() =>
      expect(api.claimWeeklyChallengeReward).toHaveBeenCalledWith(
        '33333333-3333-3333-3333-333333333333',
      ),
    );
    expect(await screen.findByText('+100')).toBeInTheDocument();
    expect(await screen.findByText('· +5')).toBeInTheDocument();
    expect(await screen.findByText('· +50')).toBeInTheDocument();
  });
});
