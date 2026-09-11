import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmateurAccessToastStore } from '../amateur/amateurAccessStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { ApiError } from '../api/apiFetch.js';
import type { DailyStateResponse } from '../api/duel.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { BonusGamesScreen } from './BonusGamesScreen.js';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function card(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-8000-000000000601',
    slug: 'beach',
    title: 'Пляж',
    skill_code: 'speed',
    description: 'Солнечная арена у моря',
    sort_order: 1,
    access_type: 'free',
    unlock_price_stars: 0,
    target_goals: 18,
    qualification_rules: { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
    total_periods: 1,
    break_duration_ms: 30000,
    use_inventory: false,
    preview_title: 'Первая квалификация',
    preview_story: 'История',
    preview_artwork_url: '/bonus-games/previews/beach.webp',
    preview_revision: 1,
    period_rules: [
      {
        period_number: 1,
        duration_ms: 240000,
        shots_limit: 30,
        goal_frequency: 0.45,
        goalie_frequency: 0.5,
        shooter_frequency: 0.6,
        puck_speed_per_ms: 1.2,
        goalie_pattern: 'linear',
        goalie_amplitude: 1,
        goal_amplitude: 220,
      },
    ],
    reward: { coins: 100, stars: 1, experience: 50 },
    goalkeeper_ready_url: '/bonus-games/goalkeepers/beach-ready.webp',
    goalkeeper_save_url: '/bonus-games/goalkeepers/beach-save.webp',
    arena: {
      id: '00000000-0000-4000-8000-000000000591',
      slug: 'beach',
      title: 'Пляж',
      artwork_url: '/bonus-games/arenas/beach.webp',
      thumbnail_url: '/bonus-games/arenas/beach.webp',
    },
    is_unlocked: true,
    is_completed: false,
    state: 'available',
    active_attempt: null,
    prerequisite: null,
    ...overrides,
  };
}

function mockCatalog(
  games: unknown[],
  options: {
    catalogFailure?: unknown;
    startFailure?: unknown;
    abandonFailure?: unknown;
    unlockFailure?: unknown;
    unlockStarBalance?: number;
    speedRemaining?: number;
    accuracyRemaining?: number;
    resetsAt?: string;
    dailyAccess?: { qualifyingGoals: number; unlockGoalsRequired: number };
  } = {},
): void {
  const {
    catalogFailure,
    startFailure,
    abandonFailure,
    unlockFailure,
    unlockStarBalance = 6,
    speedRemaining = 2,
    accuracyRemaining = 2,
    resetsAt = '2026-08-25T00:00:00.000Z',
    dailyAccess,
  } = options;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/bonus-games')) {
        if (catalogFailure !== undefined) return Promise.reject(catalogFailure);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              games,
              active_attempt:
                games
                  .map((game) => (game as { active_attempt?: unknown }).active_attempt)
                  .find((attempt) => attempt != null) ?? null,
              attempt_allowances: {
                speed: {
                  skill_code: 'speed',
                  daily_limit: 2,
                  used: 2 - speedRemaining,
                  remaining: speedRemaining,
                  resets_at: resetsAt,
                },
                accuracy: {
                  skill_code: 'accuracy',
                  daily_limit: 2,
                  used: 2 - accuracyRemaining,
                  remaining: accuracyRemaining,
                  resets_at: resetsAt,
                },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }
      if (url.endsWith('/api/duel/daily/state') && dailyAccess !== undefined) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              lifetime_total_goals: dailyAccess.qualifyingGoals,
              amateur_unlock_goals_required: dailyAccess.unlockGoalsRequired,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.match(/\/api\/bonus-games\/[^/]+\/unlock$/) && init?.method === 'POST') {
        if (unlockFailure !== undefined) return Promise.reject(unlockFailure);
        const gameId = url.match(/\/api\/bonus-games\/([^/]+)\/unlock$/)?.[1];
        const unlocked = games.find((game) => (game as { id?: unknown }).id === gameId) as
          | { state?: unknown; is_unlocked?: unknown }
          | undefined;
        if (unlocked !== undefined) {
          unlocked.state = 'available';
          unlocked.is_unlocked = true;
        }
        return Promise.resolve(
          new Response(JSON.stringify({ unlocked: true, star_balance: unlockStarBalance }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (
        url.includes('/api/bonus-games/attempts/') &&
        url.endsWith('/abandon') &&
        init?.method === 'POST'
      ) {
        if (abandonFailure !== undefined) return Promise.reject(abandonFailure);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attempt: {
                id: 'attempt-speed',
                game_id: 'speed-beach',
                game_title: 'Скоростной пляж',
                status: 'abandoned',
                rules: {
                  target_goals: 18,
                  periods: [],
                  skill_code: 'speed',
                  qualification_rules: {
                    type: 'goals_in_time',
                    targetGoals: 18,
                  },
                },
                arena: {
                  artwork_url: '/bonus-games/arenas/beach.webp',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (
        url.includes('/api/bonus-games/') &&
        url.endsWith('/attempts') &&
        init?.method === 'POST'
      ) {
        if (startFailure !== undefined) return Promise.reject(startFailure);
        const gameId = url.match(/\/api\/bonus-games\/([^/]+)\/attempts$/)?.[1] ?? 'unknown';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attempt: {
                id: 'attempt-new',
                game_id: gameId,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    },
  );
}

function renderCatalog(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bonus-games']}>
        <LocationProbe />
        <BonusGamesScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe('BonusGamesScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
    });
    useDailyStore.setState({ data: null });
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
  });

  it('shows a readable attempt allowance and counts down to its reset', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-24T23:59:55.000Z'));
    mockCatalog([card({ state: 'available', is_unlocked: true })], {
      speedRemaining: 1,
      resetsAt: '2026-08-25T00:00:00.000Z',
    });
    renderCatalog();

    expect(await screen.findByText('1 из 2 попыток')).toBeInTheDocument();
    expect(screen.getByText('До обновления 00:00:05')).toBeInTheDocument();
  });

  it('keeps the first two beginner games on their normal paths and explains third games without a request', async () => {
    useAuthStore.setState({
      user: {
        id: 'beginner-1',
        displayName: 'Новичок',
        competitionLevel: 'beginner',
      },
    });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 116,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
    });
    mockCatalog([
      card({ id: 'speed-1', title: 'Скорость 1', skill_code: 'speed', sort_order: 10 }),
      card({
        id: 'speed-2',
        title: 'Скорость 2',
        skill_code: 'speed',
        sort_order: 20,
        state: 'sequence_locked',
        is_unlocked: false,
        prerequisite: { game_id: 'speed-1', title: 'Скорость 1' },
      }),
      card({
        id: 'speed-3',
        title: 'Скорость 3',
        skill_code: 'speed',
        sort_order: 30,
        state: 'level_locked',
        is_unlocked: false,
      }),
      card({
        id: 'accuracy-1',
        title: 'Точность 1',
        skill_code: 'accuracy',
        sort_order: 10,
        state: 'completed',
        is_completed: true,
      }),
      card({
        id: 'accuracy-2',
        title: 'Точность 2',
        skill_code: 'accuracy',
        sort_order: 20,
        access_type: 'paid',
        unlock_price_stars: 4,
        state: 'purchase_required',
        is_unlocked: false,
        prerequisite: { game_id: 'accuracy-1', title: 'Точность 1' },
      }),
      card({
        id: 'accuracy-3',
        title: 'Точность 3',
        skill_code: 'accuracy',
        sort_order: 30,
        state: 'level_locked',
        is_unlocked: false,
      }),
    ]);
    renderCatalog();

    expect(await screen.findByRole('button', { name: 'Играть' })).toBeEnabled();
    expect(
      within(screen.getByRole('heading', { name: 'Скорость 2' }).closest('article')!).queryByRole(
        'button',
      ),
    ).toBeNull();
    const speedThird = screen.getByRole('heading', { name: 'Скорость 3' }).closest('article')!;
    fireEvent.click(within(speedThird).getByRole('button', { name: 'Закрыта' }));
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 1,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Точность' }));
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled();
    expect(
      within(screen.getByRole('heading', { name: 'Точность 2' }).closest('article')!).getByRole(
        'button',
        { name: 'Открыть за 4 звезды' },
      ),
    ).toBeEnabled();
    const accuracyThird = screen.getByRole('heading', { name: 'Точность 3' }).closest('article')!;
    fireEvent.click(within(accuracyThird).getByRole('button', { name: 'Закрыта' }));
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 2,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });

    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('does not promote a completed game when the remaining beginner games are level locked', async () => {
    mockCatalog([
      card({ id: 'speed-1', title: 'Скорость 1', state: 'completed', is_completed: true }),
      card({
        id: 'speed-2',
        title: 'Скорость 2',
        sort_order: 20,
        state: 'completed',
        is_completed: true,
      }),
      card({
        id: 'speed-3',
        title: 'Скорость 3',
        sort_order: 30,
        state: 'level_locked',
        is_unlocked: false,
      }),
    ]);

    renderCatalog();

    expect(await screen.findByRole('heading', { name: 'Пройденные · 2' })).toBeInTheDocument();
    expect(screen.queryByText('Текущая игра')).not.toBeInTheDocument();
    const lockedCard = screen.getByRole('heading', { name: 'Скорость 3' }).closest('article')!;
    expect(lockedCard.querySelector('img')).toHaveClass('bonus-game-card__artwork--locked');
  });

  it('shows the paid second-game price in a standard confirmation modal and cancels safely', async () => {
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    mockCatalog([
      card({
        id: 'accuracy-1',
        title: 'Точность 1',
        skill_code: 'accuracy',
        state: 'completed',
        is_completed: true,
      }),
      card({
        id: 'accuracy-2',
        title: 'Точность 2',
        skill_code: 'accuracy',
        sort_order: 2,
        access_type: 'paid',
        unlock_price_stars: 4,
        state: 'purchase_required',
        is_unlocked: false,
      }),
    ]);
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 4 звезды' }));

    const dialog = screen.getByRole('dialog', { name: 'Открыть бонусную игру?' });
    expect(dialog).toHaveClass('modal-card');
    expect(dialog.closest('.modal-backdrop')).not.toBeNull();
    expect(dialog.querySelector('.modal-header .modal-title')).toHaveTextContent(
      'Открыть бонусную игру?',
    );
    expect(dialog.querySelector('.modal-copy')).toHaveTextContent(
      'Открыть «Точность 2» за 4 звезды?',
    );
    expect(dialog.querySelector('.modal-actions')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Открыть за 4 звезды' })).toHaveClass(
      'modal-primary',
      'btn--cta',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog', { name: 'Открыть бонусную игру?' })).toBeNull();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('purchases with the confirmed price, refreshes state and then starts through the normal flow', async () => {
    useAuthStore.setState({
      user: {
        id: 'beginner-purchase',
        displayName: 'Новичок',
        competitionLevel: 'beginner',
      },
    });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 116,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
    });
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    const games = [
      card({
        id: 'accuracy-1',
        title: 'Точность 1',
        skill_code: 'accuracy',
        state: 'completed',
        is_completed: true,
      }),
      card({
        id: 'accuracy-2',
        title: 'Точность 2',
        skill_code: 'accuracy',
        sort_order: 2,
        access_type: 'paid',
        unlock_price_stars: 4,
        state: 'purchase_required',
        is_unlocked: false,
      }),
    ];
    mockCatalog(games, {
      unlockStarBalance: 6,
      dailyAccess: { qualifyingGoals: 117, unlockGoalsRequired: 300 },
    });
    const client = renderCatalog();
    client.setQueryData(['profile'], { starBalance: 10 });

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 4 звезды' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Открыть бонусную игру?' })).getByRole('button', {
        name: 'Открыть за 4 звезды',
      }),
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Играть' })).toBeEnabled());
    expect(client.getQueryState(['profile'])?.isInvalidated).toBe(true);
    await waitFor(() => expect(useDailyStore.getState().data?.lifetime_total_goals).toBe(117));

    const unlockCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([input]) => String(input) === '/api/bonus-games/accuracy-2/unlock');
    expect(unlockCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ expected_price_stars: 4 }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    await waitFor(() =>
      expect(screen.getByLabelText('location')).toHaveTextContent(
        '/bonus-games/accuracy-2/play?attempt=attempt-new',
      ),
    );
  });

  it('keeps the purchase modal open with a localized insufficient-stars error', async () => {
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    mockCatalog(
      [
        card({
          id: 'accuracy-2',
          title: 'Точность 2',
          skill_code: 'accuracy',
          sort_order: 2,
          access_type: 'paid',
          unlock_price_stars: 4,
          state: 'purchase_required',
          is_unlocked: false,
        }),
      ],
      {
        unlockFailure: new ApiError(
          409,
          'bonus_insufficient_stars',
          'Недостаточно звёзд для открытия бонус-игры.',
        ),
      },
    );
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 4 звезды' }));
    const dialog = screen.getByRole('dialog', { name: 'Открыть бонусную игру?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть за 4 звезды' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Недостаточно звёзд для открытия бонус-игры.',
    );
    expect(dialog).not.toHaveTextContent('bonus_insufficient_stars');
  });

  it('shows one shared toast for a stale purchase rejection without exposing server codes', async () => {
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    mockCatalog(
      [
        card({
          id: 'accuracy-2',
          title: 'Точность 2',
          skill_code: 'accuracy',
          sort_order: 2,
          access_type: 'paid',
          unlock_price_stars: 4,
          state: 'purchase_required',
          is_unlocked: false,
        }),
      ],
      {
        unlockFailure: new ApiError(403, 'amateur_level_required', 'internal policy', {
          goalsRemaining: 184,
          unlockGoalsRequired: 300,
        }),
      },
    );
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 4 звезды' }));
    const dialog = screen.getByRole('dialog', { name: 'Открыть бонусную игру?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Открыть за 4 звезды' }));

    await waitFor(() =>
      expect(useAmateurAccessToastStore.getState()).toMatchObject({
        sequence: 1,
        toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
      }),
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(dialog).not.toHaveTextContent('amateur_level_required');
    expect(dialog).not.toHaveTextContent('internal policy');
  });

  it('loads missing beginner progress before explaining a level-locked game', async () => {
    useAuthStore.setState({
      user: {
        id: 'beginner-direct',
        displayName: 'Новичок',
        competitionLevel: 'beginner',
      },
    });
    mockCatalog(
      [
        card({ id: 'speed-1', title: 'Скорость 1' }),
        card({
          id: 'speed-3',
          title: 'Скорость 3',
          sort_order: 30,
          state: 'level_locked',
          is_unlocked: false,
        }),
      ],
      { dailyAccess: { qualifyingGoals: 116, unlockGoalsRequired: 300 } },
    );
    renderCatalog();

    const lockedCard = (await screen.findByRole('heading', { name: 'Скорость 3' })).closest(
      'article',
    )!;
    await waitFor(() => expect(useDailyStore.getState().data).not.toBeNull());
    fireEvent.click(within(lockedCard).getByRole('button', { name: 'Закрыта' }));

    expect(useAmateurAccessToastStore.getState().toast).toMatchObject({
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });
  });

  it('switches independent skill tabs and remembers the last selected skill', async () => {
    mockCatalog([
      card({ id: 'speed-beach', title: 'Скоростной пляж' }),
      card({ id: 'accuracy-beach', title: 'Точный пляж', skill_code: 'accuracy' }),
    ]);
    renderCatalog();

    expect(await screen.findByRole('tab', { name: 'Скорость' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tablist', { name: 'Навык' })).toHaveClass('segmented-tabs');
    expect(screen.getByRole('tab', { name: 'Скорость' })).toHaveClass(
      'segmented-tabs__item--active',
    );
    expect(await screen.findByText('Скоростной пляж')).toBeInTheDocument();
    expect(screen.queryByText('Точный пляж')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Точность' }));
    expect(screen.getByText('Точный пляж')).toBeInTheDocument();
    expect(screen.queryByText('Скоростной пляж')).not.toBeInTheDocument();
    expect(localStorage.getItem('bonus-games:last-skill')).toBe('accuracy');
  });

  it('offers to continue the active attempt when starting a game in another skill', async () => {
    mockCatalog([
      card({
        id: 'speed-beach',
        title: 'Скоростной пляж',
        state: 'in_progress',
        active_attempt: {
          id: 'attempt-speed',
          game_id: 'speed-beach',
          state: 'period_active',
          current_period: 1,
          period_started_at: '2026-08-26T12:00:00.000Z',
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
      card({ id: 'accuracy-beach', title: 'Точный пляж', skill_code: 'accuracy' }),
    ]);
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    renderCatalog();

    const play = await screen.findByRole('button', { name: 'Играть' });
    expect(play).toBeEnabled();
    fireEvent.click(play);

    const dialog = screen.getByRole('dialog', { name: 'Уже идёт другая игра' });
    expect(dialog).toHaveTextContent('Скорость · Скоростной пляж');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Продолжить текущую' }));

    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/bonus-games/speed-beach/play?attempt=attempt-speed',
    );
  });

  it('explains a level-locked game without offering to abandon an active attempt', async () => {
    useAuthStore.setState({
      user: {
        id: 'beginner-active',
        displayName: 'Новичок',
        competitionLevel: 'beginner',
      },
    });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 116,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
    });
    mockCatalog([
      card({
        id: 'speed-beach',
        title: 'Скоростной пляж',
        state: 'in_progress',
        active_attempt: {
          id: 'attempt-speed',
          game_id: 'speed-beach',
          state: 'period_active',
          current_period: 1,
          period_started_at: '2026-08-26T12:00:00.000Z',
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
      card({
        id: 'accuracy-locked',
        title: 'Закрытая точность',
        skill_code: 'accuracy',
        state: 'level_locked',
        is_unlocked: false,
      }),
    ]);
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Закрыта' }));

    expect(screen.queryByRole('dialog', { name: 'Уже идёт другая игра' })).toBeNull();
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 1,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('abandons the active attempt before starting the selected game', async () => {
    mockCatalog([
      card({
        id: 'speed-beach',
        title: 'Скоростной пляж',
        state: 'in_progress',
        active_attempt: {
          id: 'attempt-speed',
          game_id: 'speed-beach',
          state: 'period_active',
          current_period: 1,
          period_started_at: '2026-08-26T12:00:00.000Z',
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
      card({ id: 'accuracy-beach', title: 'Точный пляж', skill_code: 'accuracy' }),
    ]);
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Играть' }));
    const switchButton = within(
      screen.getByRole('dialog', { name: 'Уже идёт другая игра' }),
    ).getByRole('button', { name: 'Завершить и начать эту' });
    fireEvent.click(switchButton);
    fireEvent.click(switchButton);

    await waitFor(() =>
      expect(screen.getByLabelText('location')).toHaveTextContent(
        '/bonus-games/accuracy-beach/play?attempt=attempt-new',
      ),
    );
    const postUrls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([input]) => String(input));
    expect(postUrls).toEqual([
      '/api/bonus-games/attempts/attempt-speed/abandon',
      '/api/bonus-games/accuracy-beach/attempts',
    ]);
  });

  it('shows the subsection title without repeating the parent sections label', async () => {
    mockCatalog([]);
    renderCatalog();

    expect(await screen.findByRole('heading', { name: 'Бонусные игры' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Разделы любителей' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.queryByText('Разделы')).not.toBeInTheDocument();
  });

  it('returns a legacy bonus catalog route to the amateur Sections stack', async () => {
    mockCatalog([]);
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Назад' }));

    expect(screen.getByLabelText('location')).toHaveTextContent('/?view=amateur&from=sections');
  });

  it('explains the bonus game rules in an accessible modal', async () => {
    mockCatalog([card({})]);
    renderCatalog();

    const infoButton = await screen.findByRole('button', { name: 'Правила бонусных игр' });
    infoButton.focus();
    fireEvent.click(infoButton);

    const dialog = screen.getByRole('dialog', { name: 'Правила бонусных игр' });
    expect(dialog).toHaveTextContent('Игры открываются последовательно');
    expect(dialog).toHaveTextContent('начисляются только за первое прохождение');
    expect(dialog).not.toHaveTextContent('площадка открывается для домашних матчей');

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('dialog', { name: 'Правила бонусных игр' })).not.toBeInTheDocument();
    expect(infoButton).toHaveFocus();
  });

  it('marks a failed catalog request as a high-contrast arena notice', async () => {
    mockCatalog([], { catalogFailure: new TypeError('Network unavailable') });
    renderCatalog();

    expect(await screen.findByRole('alert')).toHaveClass(
      'bonus-games-catalog__notice',
      'bonus-games-catalog__notice--error',
    );
  });

  it('uses card-wide controls for actionable games and a lock marker for closed games', async () => {
    mockCatalog([
      card({ id: 'beach', title: 'Пляж', state: 'completed', is_completed: true }),
      card({
        id: 'ski-resort',
        slug: 'ski-resort',
        title: 'Горнолыжный курорт',
        state: 'sequence_locked',
        is_unlocked: false,
        prerequisite: { game_id: 'beach', title: 'Пляж' },
      }),
      card({
        id: 'pirate-bay',
        slug: 'pirate-bay',
        title: 'Пиратская бухта',
        state: 'available',
      }),
    ]);
    renderCatalog();

    const playControl = await screen.findByRole('button', { name: 'Играть' });
    const repeatControl = screen.getByRole('button', { name: 'Повторить' });
    expect(playControl).toHaveClass('bonus-game-card__hit-area');
    expect(repeatControl).toHaveClass('bonus-game-card__hit-area');
    expect(screen.queryByRole('button', { name: 'Закрыта' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Дальше' })).toHaveClass(
      'section-label',
      'sections-group__title',
    );
    expect(screen.getByLabelText('Игра пройдена')).toBeInTheDocument();
    expect(screen.getByLabelText('Игра закрыта')).toBeInTheDocument();
    expect(screen.queryByText('Нужно пройти: Пляж')).not.toBeInTheDocument();
    expect(screen.queryByText('Готова к игре')).not.toBeInTheDocument();
  });

  it('renders completed games as compact cards with a completion marker', async () => {
    mockCatalog([
      card({
        id: 'beach',
        title: 'Пляж',
        state: 'completed',
        is_completed: true,
      }),
      card({ id: 'resort', title: 'Курорт', sort_order: 2, state: 'available' }),
    ]);
    renderCatalog();

    const completedCard = (await screen.findByRole('heading', { name: 'Пляж' })).closest('article');
    expect(screen.getByRole('heading', { name: 'Пройденные · 1' })).toBeInTheDocument();
    expect(document.querySelector('details.bonus-games-group')).toBeNull();
    expect(completedCard).not.toBeNull();
    expect(completedCard).toHaveClass('bonus-game-card--compact', 'bonus-game-card--completed');
    const completionMarker = within(completedCard!).getByLabelText('Игра пройдена');
    expect(completionMarker).toHaveClass('bonus-game-card__completed-pill');
    expect(completionMarker.parentElement).toBe(completedCard);
    expect(completionMarker).not.toHaveTextContent('Пройдено');
    expect(completedCard!.querySelector('.bonus-game-card__completion')).toBeNull();
    expect(within(completedCard!).getByRole('button', { name: 'Повторить' })).toHaveClass(
      'bonus-game-card__hit-area',
    );
    expect(completedCard!.querySelector('.bonus-game-card__action')).toBeNull();
    expect(within(completedCard!).getByLabelText('Монеты: 100')).toBeInTheDocument();
    expect(completedCard!.querySelector('.bonus-game-card__reward')).toHaveClass(
      'bonus-game-card__reward--muted',
    );
  });

  it('shows every completed game in the compact list when the skill has no current game', async () => {
    mockCatalog(
      Array.from({ length: 10 }, (_, index) =>
        card({
          id: `completed-${index + 1}`,
          slug: `completed-${index + 1}`,
          title: index === 9 ? 'Космос' : `Игра ${index + 1}`,
          sort_order: index + 1,
          state: 'completed',
          is_completed: true,
        }),
      ),
    );
    renderCatalog();

    expect(await screen.findByRole('heading', { name: 'Пройденные · 10' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Текущая игра' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Повторить' })).toHaveLength(10);
    expect(screen.getByRole('heading', { name: 'Космос' }).closest('article')).toHaveClass(
      'bonus-game-card--compact',
      'bonus-game-card--completed',
    );
  });

  it('keeps a reserved chevron slot and splits compact game rules into two lines', async () => {
    mockCatalog([
      card({ id: 'beach', title: 'Пляж', state: 'completed', is_completed: true }),
      card({
        id: 'resort',
        title: 'Курорт',
        sort_order: 2,
        state: 'available',
      }),
      card({
        id: 'locked-resort',
        title: 'Закрытый курорт',
        sort_order: 3,
        state: 'sequence_locked',
        is_unlocked: false,
      }),
    ]);
    renderCatalog();

    const compactCard = (await screen.findByRole('heading', { name: 'Пляж' })).closest('article');
    const availableCard = screen.getByRole('heading', { name: 'Курорт' }).closest('article');
    const lockedCard = screen.getByRole('heading', { name: 'Закрытый курорт' }).closest('article');
    expect(compactCard).not.toBeNull();
    expect(compactCard).toHaveClass('bonus-game-card--compact');
    expect(within(compactCard!).getByText('18 голов из 30 бросков')).toHaveClass(
      'bonus-game-card__details-primary',
    );
    expect(within(compactCard!).getByText('1 период · 30 бросков')).toHaveClass(
      'bonus-game-card__details-secondary',
    );
    expect(availableCard!.querySelector('.bonus-game-card__chevron')).toHaveClass('card-chevron');
    expect(availableCard!.querySelector('.bonus-game-card__chevron')).not.toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
    expect(lockedCard!.querySelector('.bonus-game-card__chevron')).toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
    expect(lockedCard!.querySelector('.bonus-game-card__chevron')).toBeInTheDocument();
    expect(within(lockedCard!).getByLabelText('Игра закрыта')).toBeInTheDocument();
  });

  it('shows a chevron only for an available game or an unfinished attempt', async () => {
    mockCatalog([
      card({ id: 'available-game', title: 'Доступная игра', state: 'available' }),
      card({
        id: 'level-locked-game',
        title: 'Любительская игра',
        sort_order: 2,
        state: 'level_locked',
        is_unlocked: false,
      }),
      card({
        id: 'purchase-required-game',
        title: 'Платная игра',
        sort_order: 3,
        state: 'purchase_required',
        is_unlocked: false,
      }),
    ]);
    renderCatalog();

    const availableCard = (await screen.findByRole('heading', { name: 'Доступная игра' })).closest(
      'article',
    );
    const levelLockedCard = screen.getByRole('heading', { name: 'Любительская игра' }).closest('article');
    const purchaseRequiredCard = screen
      .getByRole('heading', { name: 'Платная игра' })
      .closest('article');
    expect(availableCard).not.toBeNull();
    expect(levelLockedCard).not.toBeNull();
    expect(purchaseRequiredCard).not.toBeNull();
    expect(availableCard!.querySelector('.bonus-game-card__chevron')).not.toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
    expect(levelLockedCard!.querySelector('.bonus-game-card__chevron')).toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
    expect(purchaseRequiredCard!.querySelector('.bonus-game-card__chevron')).toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
  });

  it('keeps a chevron on an unfinished featured game after new attempts run out', async () => {
    mockCatalog(
      [
        card({
          id: 'active-game',
          title: 'Незавершённая игра',
          state: 'in_progress',
          active_attempt: {
            id: 'attempt-active',
            game_id: 'active-game',
            state: 'period_active',
            current_period: 1,
            period_started_at: '2026-08-26T12:00:00.000Z',
            break_started_at: null,
            shots_taken: 4,
            goals: 2,
          },
        }),
      ],
      { speedRemaining: 0 },
    );
    renderCatalog();

    const activeCard = (await screen.findByRole('heading', { name: 'Незавершённая игра' })).closest(
      'article',
    );
    expect(activeCard).not.toBeNull();
    expect(activeCard).toHaveClass('bonus-game-card--featured');
    expect(activeCard!.querySelector('.bonus-game-card__chevron')).not.toHaveClass(
      'bonus-game-card__chevron--hidden',
    );
  });

  it('keeps a conflicting repeat card actionable through the card-wide control', async () => {
    mockCatalog([
      card({ id: 'speed-beach', state: 'completed', is_completed: true }),
      card({
        id: 'accuracy-beach',
        skill_code: 'accuracy',
        state: 'in_progress',
        active_attempt: {
          id: 'attempt-accuracy',
          game_id: 'accuracy-beach',
          state: 'period_active',
          current_period: 1,
          period_started_at: '2026-08-26T12:00:00.000Z',
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
    ]);
    renderCatalog();

    const repeatButton = await screen.findByRole('button', { name: 'Повторить' });
    expect(repeatButton).toBeEnabled();
    expect(repeatButton).toHaveClass('bonus-game-card__hit-area');
    fireEvent.click(repeatButton);
    expect(screen.getByRole('dialog', { name: 'Уже идёт другая игра' })).toBeInTheDocument();
  });

  it('keeps the featured card artwork wide and focused on the upper location', async () => {
    mockCatalog([card({ id: 'north-pole', slug: 'north-pole', title: 'Северный полюс' })]);
    renderCatalog();

    const artwork = await screen.findByAltText('Площадка «Пляж»');
    expect(artwork).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp?v=20260829-world-tour-user-pngs-v10',
    );
    expect(artwork).toHaveStyle({ objectPosition: 'center top' });
    expect(artwork.parentElement).toHaveClass('bonus-game-card__artwork-frame');
  });

  it('gives the featured World Tour card a landmark-forward crop', async () => {
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    mockCatalog([
      card({
        id: 'accuracy-moscow',
        slug: 'accuracy-moscow',
        title: 'Москва',
        skill_code: 'accuracy',
        arena: {
          id: 'arena-moscow',
          slug: 'accuracy-world-tour-moscow',
          title: 'Москва',
          artwork_url: '/bonus-games/world-tour/arenas/moscow.webp',
          thumbnail_url: '/bonus-games/world-tour/previews/moscow.webp',
        },
      }),
    ]);
    renderCatalog();

    const artwork = await screen.findByAltText('Площадка «Москва»');
    expect(artwork.closest('article')).toHaveClass('bonus-game-card--world-tour');
    expect(artwork).toHaveStyle({ objectPosition: 'center 50%' });
  });

  it('opens the server-reported active attempt when continuing a game', async () => {
    mockCatalog([
      card({
        id: 'beach',
        state: 'in_progress',
        active_attempt: {
          id: 'attempt-1',
          game_id: 'beach',
          state: 'idle',
          current_period: 1,
          period_started_at: null,
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
    ]);
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Продолжить' }));

    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/bonus-games/beach/play?attempt=attempt-1',
    );
  });

  it('continues a snapshotted active attempt after its game is archived', async () => {
    mockCatalog([
      card({
        id: 'beach',
        state: 'archived',
        active_attempt: {
          id: 'attempt-archived',
          game_id: 'beach',
          state: 'idle',
          current_period: 1,
          period_started_at: null,
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
    ]);
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Продолжить' }));

    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/bonus-games/beach/play?attempt=attempt-archived',
    );
  });

  it('keeps an active snapshotted attempt as the focus after switching to its skill', async () => {
    mockCatalog([
      card({
        id: 'archived-beach',
        title: 'Архивный пляж',
        skill_code: 'accuracy',
        state: 'archived',
        active_attempt: {
          id: 'attempt-archived',
          game_id: 'archived-beach',
          state: 'period_active',
          current_period: 1,
          period_started_at: '2026-08-26T12:00:00.000Z',
          break_started_at: null,
          shots_taken: 4,
          goals: 2,
        },
      }),
      card({
        id: 'available-resort',
        title: 'Доступный курорт',
        skill_code: 'accuracy',
        sort_order: 2,
        state: 'available',
      }),
    ]);
    localStorage.setItem('bonus-games:last-skill', 'accuracy');
    renderCatalog();

    const focus = await screen.findByRole('region', { name: 'Текущая игра' });
    expect(within(focus).getByRole('heading', { name: 'Архивный пляж' })).toBeInTheDocument();
    expect(within(focus).getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('uses the authoritative arena thumbnail for the featured card', async () => {
    mockCatalog([
      card({
        preview_artwork_url: 'https://media.example.test/beach-preview.webp?generation=9',
        arena: {
          id: 'arena-beach',
          slug: 'beach',
          title: 'Пляж',
          artwork_url: 'https://media.example.test/beach.webp?generation=7',
          thumbnail_url: 'https://media.example.test/beach-thumb.webp?generation=8',
        },
      }),
    ]);
    renderCatalog();

    expect(await screen.findByAltText('Площадка «Пляж»')).toHaveAttribute(
      'src',
      'https://media.example.test/beach-thumb.webp?generation=8',
    );
  });

  it('cache-busts bundled arena artwork so newly deployed ice textures are visible', async () => {
    mockCatalog([card({})]);
    renderCatalog();

    expect(await screen.findByAltText('Площадка «Пляж»')).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp?v=20260829-world-tour-user-pngs-v10',
    );
  });

  it('uses square goalie-free arena artwork for compact future cards', async () => {
    mockCatalog([
      card({ id: 'beach', title: 'Пляж' }),
      card({
        id: 'resort',
        title: 'Курорт',
        sort_order: 2,
        state: 'sequence_locked',
        preview_artwork_url: 'https://media.example.test/resort-preview.webp',
        arena: {
          id: 'arena-resort',
          slug: 'resort',
          title: 'Курорт',
          artwork_url: 'https://media.example.test/resort.webp',
          thumbnail_url: 'https://media.example.test/resort-thumb.webp',
        },
      }),
    ]);
    renderCatalog();

    const artwork = await screen.findByAltText('Площадка «Курорт»');
    expect(artwork).toHaveAttribute('src', 'https://media.example.test/resort-thumb.webp');
    expect(artwork).toHaveStyle({ objectPosition: 'center top' });
    expect(artwork).toHaveClass('bonus-game-card__artwork--locked');
  });

  it('renders purchase-required game artwork in black and white', async () => {
    mockCatalog([
      card({ id: 'beach', title: 'Пляж' }),
      card({
        id: 'paid-game',
        title: 'Платная игра',
        sort_order: 2,
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 5,
      }),
    ]);
    renderCatalog();

    const paidCard = (await screen.findByRole('heading', { name: 'Платная игра' })).closest('article');
    expect(paidCard).not.toBeNull();
    expect(within(paidCard!).getByRole('img')).toHaveClass('bonus-game-card__artwork--locked');
  });

  it('labels the featured qualification as the current game', async () => {
    mockCatalog([card({})]);
    renderCatalog();

    expect(await screen.findByRole('heading', { name: 'Текущая игра' })).toHaveClass(
      'section-label',
      'sections-group__title',
    );
  });

  it('shows only non-zero first-clear rewards in compact future cards', async () => {
    mockCatalog([
      card({ id: 'beach', title: 'Пляж', reward: { coins: 0, stars: 0, experience: 0 } }),
      card({
        id: 'resort',
        title: 'Курорт',
        sort_order: 2,
        state: 'sequence_locked',
        reward: { coins: 21, stars: 0, experience: 25 },
      }),
    ]);
    renderCatalog();

    const compactCard = (await screen.findByRole('heading', { name: 'Курорт' })).closest('article');
    expect(compactCard).not.toBeNull();
    expect(within(compactCard!).getByLabelText('Монеты: 21')).toHaveTextContent('21');
    expect(within(compactCard!).getByLabelText('Опыт: 25')).toHaveTextContent('25');
    expect(within(compactCard!).queryByLabelText('Звёзды: 0')).not.toBeInTheDocument();
    expect(within(compactCard!).queryByText('За первое прохождение')).not.toBeInTheDocument();
  });

  it('renders first-clear rewards as accessible resource icons', async () => {
    mockCatalog([
      card({
        state: 'available',
        target_goals: 21,
        qualification_rules: { type: 'goals_from_shots', targetGoals: 21, shotsLimit: 21 },
        total_periods: 2,
        period_rules: [
          { ...card({}).period_rules[0], shots_limit: 5 },
          { ...card({}).period_rules[0], period_number: 2, shots_limit: 16 },
        ],
        reward: { coins: 21, stars: 22, experience: 25 },
      }),
    ]);
    renderCatalog();

    expect(await screen.findByText('21 голов из 21 бросков')).toHaveClass(
      'bonus-game-card__details-primary',
    );
    expect(screen.getByText('2 периода · 21 бросок')).toHaveClass(
      'bonus-game-card__details-secondary',
    );
    expect(screen.getByText('За первое прохождение')).toBeInTheDocument();
    expect(screen.getByLabelText('Монеты: 21')).toHaveTextContent('21');
    expect(screen.getByLabelText('Звёзды: 22')).toHaveTextContent('22');
    expect(screen.getByLabelText('Опыт: 25')).toHaveTextContent('25');
    expect(screen.queryByText(/Новая домашняя площадка:/)).not.toBeInTheDocument();
  });

  it('omits zero first-clear rewards and the whole reward block when all values are zero', async () => {
    mockCatalog([
      card({ id: 'some-rewards', reward: { coins: 0, stars: 3, experience: 0 } }),
      card({
        id: 'no-rewards',
        title: 'Без награды',
        reward: { coins: 0, stars: 0, experience: 0 },
      }),
    ]);
    renderCatalog();

    expect(await screen.findByLabelText('Звёзды: 3')).toHaveTextContent('3');
    expect(screen.queryByLabelText('Монеты: 0')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Опыт: 0')).not.toBeInTheDocument();
    expect(screen.getAllByText('За первое прохождение')).toHaveLength(1);
  });

  it('keeps the created attempt id in the play URL for durable reload', async () => {
    mockCatalog([card({})]);
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Играть' }));

    await waitFor(() =>
      expect(screen.getByLabelText('location')).toHaveTextContent(
        '/bonus-games/00000000-0000-4000-8000-000000000601/play?attempt=attempt-new',
      ),
    );
  });

  it('shows two independent daily attempt allowances', async () => {
    mockCatalog(
      [
        card({ id: 'speed-game' }),
        card({ id: 'accuracy-game', skill_code: 'accuracy', title: 'Точная игра' }),
      ],
      { speedRemaining: 1, accuracyRemaining: 2 },
    );
    renderCatalog();

    expect(await screen.findByText('1 из 2 попыток')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Точность' }));
    expect(screen.getByText('2 из 2 попыток')).toBeInTheDocument();
  });

  it('blocks a new attempt when the selected skill has no attempts left', async () => {
    mockCatalog([card({})], { speedRemaining: 0 });
    renderCatalog();

    expect(await screen.findByText('0 из 2 попыток')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Попытки закончились' })).toBeDisabled();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('marks the next game unavailable when the daily attempts are exhausted', async () => {
    mockCatalog(
      [
        card({ id: 'completed-1', title: 'Первая игра', state: 'completed', is_completed: true }),
        card({
          id: 'completed-2',
          title: 'Вторая игра',
          sort_order: 2,
          state: 'completed',
          is_completed: true,
        }),
        card({ id: 'next-game', title: 'Третья игра', sort_order: 3 }),
      ],
      { speedRemaining: 0 },
    );
    renderCatalog();

    const nextGame = (await screen.findByRole('heading', { name: 'Третья игра' })).closest(
      'article',
    );
    expect(nextGame).not.toBeNull();
    expect(within(nextGame!).getByAltText('Площадка «Пляж»')).toHaveClass(
      'bonus-game-card__artwork--locked',
    );
    expect(within(nextGame!).getByRole('button', { name: 'Попытки закончились' })).toHaveClass(
      'bonus-game-card__hit-area--unavailable',
    );
  });

  it('does not expose a rejected catalog request error', async () => {
    mockCatalog([], { catalogFailure: new TypeError('private network topology') });
    renderCatalog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('private network topology')).toBeNull();
  });

  it('does not expose an unknown start error', async () => {
    mockCatalog([card({})], { startFailure: 'private start failure' });
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Играть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('private start failure')).toBeNull();
  });

  it('keeps the generic fallback when Amateur access details are malformed', async () => {
    mockCatalog([card({})], {
      startFailure: new ApiError(
        403,
        'amateur_level_required',
        'Не удалось выполнить запрос. Попробуйте ещё раз.',
        { goalsRemaining: 'unknown' },
      ),
    });
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Играть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(useAmateurAccessToastStore.getState()).toMatchObject({ sequence: 0, toast: null });
  });

  it('does not request inventory balances or paid unlocks', async () => {
    mockCatalog([card({})]);
    renderCatalog();

    await screen.findByRole('button', { name: 'Играть' });
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));
    expect(urls).not.toContain('/api/inventory/me');
    expect(urls.some((url) => url.endsWith('/unlock'))).toBe(false);
    expect(screen.queryByText(/Открыть за/)).not.toBeInTheDocument();
  });
});
