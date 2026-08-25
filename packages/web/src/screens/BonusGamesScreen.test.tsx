import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  options: {
    stars?: number;
    catalogFailure?: unknown;
    balanceFailure?: unknown;
    unlockFailure?: unknown;
    unlockResponse?: Response;
    startFailure?: unknown;
  } = {},
): void {
  const {
    stars = 3,
    catalogFailure,
    balanceFailure,
    unlockFailure,
    unlockResponse,
    startFailure,
  } = options;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/bonus-games')) {
        if (catalogFailure !== undefined) return Promise.reject(catalogFailure);
        return Promise.resolve(
          new Response(JSON.stringify({ games, active_attempt: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/api/inventory/me')) {
        if (balanceFailure !== undefined) return Promise.reject(balanceFailure);
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
        if (unlockFailure !== undefined) return Promise.reject(unlockFailure);
        return Promise.resolve(
          unlockResponse ??
            new Response(JSON.stringify({ unlocked: true, star_balance: stars - 1 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
        );
      }
      if (
        url.includes('/api/bonus-games/') &&
        url.endsWith('/attempts') &&
        init?.method === 'POST'
      ) {
        if (startFailure !== undefined) return Promise.reject(startFailure);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attempt: {
                id: 'attempt-new',
                game_id: '00000000-0000-4000-8000-000000000601',
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

  it('shows the subsection title without repeating the parent sections label', async () => {
    mockCatalog([]);
    renderCatalog();

    expect(await screen.findByRole('heading', { name: 'Бонусные игры' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.queryByText('Разделы')).not.toBeInTheDocument();
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
    expect(dialog).toHaveTextContent('площадка открывается для домашних матчей');

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

  it('uses action buttons for availability without rendering a separate status line', async () => {
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

    expect(await screen.findByRole('button', { name: 'Открыть за 1 звезду' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Играть снова' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыта' })).toBeInTheDocument();
    expect(screen.getByText('Повторная игра без награды')).toBeInTheDocument();
    expect(screen.queryByText('Нужно пройти: Пляж')).not.toBeInTheDocument();
    expect(screen.queryByText('Готова к игре')).not.toBeInTheDocument();
  });

  it('focuses arena thumbnails on the location above the ice', async () => {
    mockCatalog([card({ id: 'north-pole', slug: 'north-pole', title: 'Северный полюс' })]);
    renderCatalog();

    expect(await screen.findByAltText('Площадка «Пляж»')).toHaveStyle({
      objectPosition: 'center top',
    });
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

  it('uses the authoritative arena thumbnail even when a seeded slug has a bundled asset', async () => {
    mockCatalog([
      card({
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

  it('renders first-clear rewards as accessible resource icons', async () => {
    mockCatalog([
      card({
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 22,
        target_goals: 21,
        total_periods: 2,
        period_rules: [
          { ...card({}).period_rules[0], shots_limit: 5 },
          { ...card({}).period_rules[0], period_number: 2, shots_limit: 16 },
        ],
        reward: { coins: 21, stars: 22, experience: 25 },
      }),
    ]);
    renderCatalog();

    expect(await screen.findByText('Цель: 21 шайба · 2 периода · 21 бросок')).toBeInTheDocument();
    expect(screen.getByText('За первое прохождение')).toBeInTheDocument();
    expect(screen.getByLabelText('Монеты: 21')).toHaveTextContent('21');
    expect(screen.getByLabelText('Звёзды: 22')).toHaveTextContent('22');
    expect(screen.getByLabelText('Опыт: 25')).toHaveTextContent('25');
    expect(screen.queryByText(/Новая домашняя площадка:/)).not.toBeInTheDocument();
  });

  it('omits zero first-clear rewards and the whole reward block when all values are zero', async () => {
    mockCatalog([
      card({ id: 'some-rewards', reward: { coins: 0, stars: 3, experience: 0 } }),
      card({ id: 'no-rewards', title: 'Без награды', reward: { coins: 0, stars: 0, experience: 0 } }),
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

    expect(await screen.findByLabelText('location')).toHaveTextContent(
      '/bonus-games/00000000-0000-4000-8000-000000000601/play?attempt=attempt-new',
    );
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
    const unlockCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(
        ([input, init]) => String(input).endsWith('/unlock') && init?.method === 'POST',
      );
    expect(JSON.parse(String(unlockCall?.[1]?.body))).toEqual({ expected_price_stars: 1 });
  });

  it('focuses the purchase modal and restores its exact trigger after Escape', async () => {
    mockCatalog([
      card({
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 1,
        is_unlocked: false,
      }),
    ]);
    renderCatalog();
    const trigger = await screen.findByRole('button', { name: 'Открыть за 1 звезду' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Открыть игру?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus(),
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Открыть игру?' })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('refreshes the catalog and requires a fresh confirmation when the locked price changed', async () => {
    let currentGames = [
      card({
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 1,
        is_unlocked: false,
      }),
    ];
    let catalogRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/bonus-games')) {
          catalogRequests += 1;
          return Promise.resolve(
            new Response(JSON.stringify({ games: currentGames, active_attempt: null }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (url.endsWith('/api/inventory/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                balances: { tokens: 0, stars: 5, experience: 0 },
                equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
                items: { stick: [], skates: [], nutrition: [] },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (url.endsWith('/unlock') && init?.method === 'POST') {
          currentGames = [
            card({
              state: 'purchase_required',
              access_type: 'paid',
              unlock_price_stars: 2,
              is_unlocked: false,
            }),
          ];
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: 'bonus_price_changed', message: 'internal current price is 2' },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    );
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 1 звезду' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Открыть игру?' })).getByRole('button', {
        name: 'Открыть за 1 звезду',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Цена игры изменилась. Проверьте каталог и подтвердите открытие снова.',
    );
    expect(screen.queryByRole('dialog', { name: 'Открыть игру?' })).toBeNull();
    await waitFor(() => expect(catalogRequests).toBe(2));
    expect(screen.getByRole('button', { name: /Открыть за 2/ })).toBeInTheDocument();
    expect(screen.queryByText(/internal current price/i)).toBeNull();
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

  it('does not expose a rejected balance request error', async () => {
    mockCatalog([card({ state: 'purchase_required', access_type: 'paid', is_unlocked: false })], {
      balanceFailure: new Error('private balance failure'),
    });
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 0 звёзд' }));

    expect(screen.getByRole('dialog', { name: 'Открыть игру?' })).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('private balance failure')).toBeNull();
  });

  it('does not expose a rejected purchase error', async () => {
    mockCatalog([card({ state: 'purchase_required', access_type: 'paid', is_unlocked: false })], {
      unlockFailure: new TypeError('private payment transport'),
    });
    renderCatalog();

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть за 0 звёзд' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Открыть игру?' })).getByRole('button', {
        name: 'Открыть за 0 звёзд',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('private payment transport')).toBeNull();
  });
});
