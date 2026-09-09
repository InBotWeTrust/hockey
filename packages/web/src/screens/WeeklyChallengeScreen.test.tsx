import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate });
  });

  function challenge(overrides: Partial<WeeklyChallenge> = {}): WeeklyChallenge {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Неделя снайпера',
      description: 'Забрасывай шайбы.',
      status: 'running',
      joinOpenAt: '2026-06-01T09:00:00.000Z',
      startAt: '2026-06-02T09:00:00.000Z',
      endAt: '2026-06-09T09:00:00.000Z',
      joinEnabled: true,
      reward: { coins: 100, stars: 50, experience: 50 },
      participant: { joinedAt: '2026-06-01T10:00:00.000Z', rewardClaimedAt: null },
      declinedAt: null,
      tasks: [
        {
          id: 'task-1',
          type: 'goals_scored',
          title: '500 шайб',
          target: 500,
          progress: 240,
          completed: false,
        },
      ],
      canJoin: false,
      canClaimReward: false,
      allTasksCompleted: false,
      serverNow: '2026-06-03T10:00:00.000Z',
      ...overrides,
    };
  }

  it('shows a plain readable empty state without another glass container', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [],
      completed: [],
    });

    renderScreen();

    const empty = await screen.findByText('Вы пока не участвуете в действующих челленджах');
    expect(empty.closest('.glass')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Действующие (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Челленджи', selected: true })).toBeInTheDocument();
  });

  it('filters future, active and completed personal challenges with counts', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [
        challenge({
          id: '22222222-2222-2222-2222-222222222222',
          title: 'Следующая неделя',
          status: 'not_open',
          participant: null,
          tasks: [{ ...challenge().tasks[0]!, progress: null, completed: null }],
        }),
      ],
      active: [challenge()],
      completed: [
        challenge({
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Пройденная неделя',
          status: 'finished',
          allTasksCompleted: true,
          tasks: [{ ...challenge().tasks[0]!, progress: 500, completed: true }],
        }),
      ],
    });

    renderScreen();

    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
    const filters = screen.getByRole('tablist', { name: 'Фильтры челленджей' });
    expect(filters).toHaveClass(
      'segmented-tabs',
      'weekly-challenge-filters',
    );
    expect(within(filters).queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Действующие (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Следующая неделя')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Будущие' }));
    expect(screen.getByText('Следующая неделя')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Будущие (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Пройденные' }));
    expect(screen.getByText('Пройденная неделя')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Пройденные (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Действующие' })).toBeInTheDocument();
  });

  it('uses the first non-empty group when there is no active challenge', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [
        challenge({
          title: 'Скоро начнётся',
          status: 'join_open',
          participant: null,
          canJoin: true,
          tasks: [{ ...challenge().tasks[0]!, progress: null, completed: null }],
        }),
      ],
      active: [],
      completed: [],
    });

    renderScreen();

    expect(await screen.findByText('Скоро начнётся')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Будущие', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Будущие (1)' })).toBeInTheDocument();
  });

  it('does not mark challenges as actionable after the player declined', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [
        challenge({
          participant: null,
          canJoin: true,
          declinedAt: '2026-06-01T10:00:00.000Z',
          tasks: [{ ...challenge().tasks[0]!, progress: null, completed: null }],
        }),
      ],
      completed: [],
    });

    renderScreen();

    await screen.findByText('Неделя снайпера');
    expect(screen.queryByLabelText('Требуется действие')).not.toBeInTheDocument();
  });

  it('renders tasks as compact rows instead of nested cards', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [
        challenge({
          tasks: [
            challenge().tasks[0]!,
            {
              id: 'task-2',
              type: 'duels_played',
              title: 'Сыграть дуэль',
              target: 1,
              progress: 1,
              completed: true,
            },
          ],
        }),
      ],
      completed: [],
    });

    renderScreen();

    const list = await screen.findByRole('list', { name: 'Задачи челленджа Неделя снайпера' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('240 / 500')).toBeInTheDocument();
    expect(within(list).getByText('1 / 1')).toBeInTheDocument();
    expect(list.querySelector('.weekly-challenge-task__check')).toBeInTheDocument();
  });

  it('lets the player join a future challenge and claim a completed one', async () => {
    const future = challenge({
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Будущий челлендж',
      status: 'join_open',
      participant: null,
      canJoin: true,
      tasks: [{ ...challenge().tasks[0]!, progress: null, completed: null }],
    });
    const completed = challenge({
      id: '33333333-3333-3333-3333-333333333333',
      title: 'Готовая награда',
      status: 'finished',
      allTasksCompleted: true,
      canClaimReward: true,
      tasks: [{ ...challenge().tasks[0]!, progress: 500, completed: true }],
    });
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [future],
      active: [],
      completed: [completed],
    });
    vi.mocked(api.joinWeeklyChallenge).mockResolvedValue({ challenge: null, pendingRewards: [] });
    vi.mocked(api.claimWeeklyChallengeReward).mockResolvedValue({
      challenge: null,
      pendingRewards: [],
    });

    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Участвовать' }));
    await waitFor(() => expect(api.joinWeeklyChallenge).toHaveBeenCalledWith(future.id));
    fireEvent.click(screen.getByRole('tab', { name: 'Пройденные' }));
    fireEvent.click(screen.getByRole('button', { name: 'Получить награду' }));
    await waitFor(() => expect(api.claimWeeklyChallengeReward).toHaveBeenCalledWith(completed.id));
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
  });
});
