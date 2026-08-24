import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BonusGamesScreen } from './BonusGamesScreen.js';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}</output>;
}

function card(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-8000-000000000601',
    slug: 'beach',
    title: 'Пляж',
    description: 'Солнечная арена у моря',
    sort_order: 1,
    access_type: 'free',
    unlock_price_stars: 0,
    target_goals: 18,
    total_periods: 1,
    break_duration_ms: 30000,
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
  options: { stars?: number; unlockResponse?: Response } = {},
): void {
  const { stars = 3, unlockResponse } = options;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/bonus-games')) {
        return Promise.resolve(
          new Response(JSON.stringify({ games, active_attempt: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/api/inventory/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              balances: { tokens: 200, stars, experience: 100 },
              equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
              items: { stick: [], skates: [], nutrition: [] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.includes('/api/bonus-games/') && url.endsWith('/unlock') && init?.method === 'POST') {
        return Promise.resolve(
          unlockResponse ??
            new Response(JSON.stringify({ unlocked: true, star_balance: stars - 1 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    },
  );
}

function renderCatalog(): void {
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
}

describe('BonusGamesScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders server-provided sequence and paid states without deriving availability', async () => {
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
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 1,
        is_unlocked: false,
      }),
    ]);
    renderCatalog();

    expect(await screen.findByText('Нужно пройти: Пляж')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть за 1 звезду' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Играть снова' })).toBeInTheDocument();
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

    expect(screen.getByLabelText('location')).toHaveTextContent('/bonus-games/beach/play');
  });

  it('confirms the current server price and balance before one paid unlock request', async () => {
    mockCatalog(
      [
        card({
          state: 'purchase_required',
          access_type: 'paid',
          unlock_price_stars: 1,
          is_unlocked: false,
        }),
      ],
      {
        stars: 1,
        unlockResponse: new Response(
          JSON.stringify({
            error: { code: 'bonus_insufficient_stars', message: 'not enough stars' },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    );
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 1 звезду' }));
    expect(screen.getByRole('dialog', { name: 'Открыть игру?' })).toHaveTextContent(
      'Стоимость: 1 звезда. На балансе: 1 звезда.',
    );

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Открыть игру?' })).getByRole('button', {
        name: 'Открыть за 1 звезду',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Недостаточно звёзд для открытия бонус-игры.',
    );
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(
          ([input, init]) =>
            String(input).endsWith(
              '/api/bonus-games/00000000-0000-4000-8000-000000000601/unlock',
            ) && init?.method === 'POST',
        ),
    ).toHaveLength(1);
  });
});
