import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/weeklyChallenge.js';
import type { WeeklyChallenge } from '../api/weeklyChallenge.js';
import { WeeklyChallengeScreen } from './WeeklyChallengeScreen.js';

vi.mock('../api/weeklyChallenge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchWeeklyChallengeCatalog: vi.fn(),
  claimWeeklyChallengeReward: vi.fn(),
}));

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

  afterEach(() => {
    vi.useRealTimers();
  });

  function challenge(overrides: Partial<WeeklyChallenge> = {}): WeeklyChallenge {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Неделя снайпера',
      description: 'Забрасывай шайбы.',
      status: 'running',
      startAt: '2026-06-02T09:00:00.000Z',
      endAt: '2026-06-09T09:00:00.000Z',
      reward: { coins: 100, stars: 50, experience: 50, tokens: 5 },
      rewardClaimedAt: null,
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
      hasProgress: true,
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
          status: 'future',
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
    expect(filters).toHaveClass('segmented-tabs', 'weekly-challenge-filters');
    expect(within(filters).queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Действующие (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Участвовать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отказаться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument();
    expect(screen.queryByText('Следующая неделя')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Будущие' }));
    expect(screen.getByText('Следующая неделя')).toBeInTheDocument();
    expect(screen.getByText(/Старт через/)).toBeInTheDocument();
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
          status: 'future',
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

  it('does not mark a running challenge without a reward as actionable', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [
        challenge({
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

  it('renders a token reward chip only when its value is positive', async () => {
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [
        challenge({ reward: { coins: 0, stars: 0, experience: 0, tokens: 7 } }),
        challenge({
          id: '22222222-2222-2222-2222-222222222222',
          title: 'Без токенов',
          reward: { coins: 0, stars: 0, experience: 0, tokens: 0 },
        }),
      ],
      completed: [],
    });

    renderScreen();

    expect(await screen.findByLabelText('Токены: 7')).toBeInTheDocument();
    expect(screen.queryByLabelText('Токены: 0')).not.toBeInTheDocument();
  });

  it('lets the player claim a completed reward without participation actions', async () => {
    const completed = challenge({
      id: '33333333-3333-3333-3333-333333333333',
      title: 'Готовая награда',
      status: 'finished',
      allTasksCompleted: true,
      canClaimReward: true,
      tasks: [{ ...challenge().tasks[0]!, progress: 500, completed: true }],
    });
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [],
      completed: [completed],
    });
    vi.mocked(api.claimWeeklyChallengeReward).mockResolvedValue({
      challenge: null,
      pendingRewards: [],
    });

    renderScreen();

    await screen.findByText('Готовая награда');
    expect(screen.getByLabelText('Требуется действие')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Участвовать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отказаться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Получить награду' }));
    await waitFor(() => expect(api.claimWeeklyChallengeReward).toHaveBeenCalledWith(completed.id));
    expect(vibrate).toHaveBeenCalledWith([10, 35, 15]);
  });

  it('shows positive token rewards in the claim toast', async () => {
    const completed = challenge({
      id: '44444444-4444-4444-4444-444444444444',
      title: 'Токены за неделю',
      status: 'finished',
      allTasksCompleted: true,
      canClaimReward: true,
      reward: { coins: 0, stars: 0, experience: 0, tokens: 7 },
      tasks: [{ ...challenge().tasks[0]!, progress: 500, completed: true }],
    });
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [],
      completed: [completed],
    });
    vi.mocked(api.claimWeeklyChallengeReward).mockResolvedValue({
      challenge: null,
      pendingRewards: [],
    });

    renderScreen();

    await screen.findByText('Токены за неделю');
    fireEvent.click(screen.getByRole('button', { name: 'Получить награду' }));
    expect(await screen.findByText('+7')).toBeInTheDocument();
  });

  it('refreshes the open future catalog into the active week at Monday midnight Moscow', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const future = challenge({
      status: 'future',
      startAt: '2026-09-13T21:00:00Z',
      endAt: '2026-09-20T09:00:00Z',
      serverNow: '2026-09-13T20:59:50Z',
    });
    vi.mocked(api.fetchWeeklyChallengeCatalog)
      .mockResolvedValueOnce({ future: [future], active: [], completed: [] })
      .mockResolvedValue({
        future: [],
        active: [{ ...future, status: 'running', serverNow: '2026-09-13T21:00:20Z' }],
        completed: [],
      });
    renderScreen();
    await screen.findByText('Скоро');
    expect(screen.getByRole('tab', { name: 'Будущие', selected: true })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByText('Идёт сейчас')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Действующие (1)' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Участвовать|Отказаться/ }),
    ).not.toBeInTheDocument();
  });

  it('refreshes the open active catalog into completed history at Sunday noon Moscow', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const active = challenge({
      startAt: '2026-09-06T21:00:00Z',
      endAt: '2026-09-13T09:00:00Z',
      serverNow: '2026-09-13T08:59:50Z',
      allTasksCompleted: true,
      canClaimReward: true,
    });
    vi.mocked(api.fetchWeeklyChallengeCatalog)
      .mockResolvedValueOnce({ future: [], active: [active], completed: [] })
      .mockResolvedValue({
        future: [],
        active: [],
        completed: [{ ...active, status: 'finished', serverNow: '2026-09-13T09:00:20Z' }],
      });
    renderScreen();
    await screen.findByText('Идёт сейчас');
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByText('Пройден')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Пройденные (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить награду' })).toBeInTheDocument();
  });

  it.each(['focus', 'pageshow', 'visibilitychange'])(
    'refreshes catalog on return to the app (%s)',
    async (event) => {
      vi.mocked(api.fetchWeeklyChallengeCatalog)
        .mockResolvedValueOnce({ future: [], active: [], completed: [] })
        .mockResolvedValue({
          future: [],
          active: [challenge({ title: 'Обновлённая неделя' })],
          completed: [],
        });
      renderScreen();
      await screen.findByText('Вы пока не участвуете в действующих челленджах');
      fireEvent(event === 'visibilitychange' ? document : window, new Event(event));
      expect(await screen.findByText('Обновлённая неделя')).toBeInTheDocument();
    },
  );

  it('counts down from server time even when the device clock is years ahead', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockResolvedValue({
      future: [],
      active: [challenge({ endAt: '2026-09-13T09:00:00Z', serverNow: '2026-09-13T08:50:00Z' })],
      completed: [],
    });
    renderScreen();
    expect(await screen.findByText('До окончания · 10 мин')).toBeInTheDocument();
    vi.mocked(api.fetchWeeklyChallengeCatalog).mockImplementation(() => new Promise(() => {}));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText('До окончания · 9 мин')).toBeInTheDocument();
  });
});
