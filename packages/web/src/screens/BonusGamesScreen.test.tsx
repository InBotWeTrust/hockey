import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BonusGamesScreen } from './BonusGamesScreen.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');

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
    stars?: number;
    catalogFailure?: unknown;
    balanceFailure?: unknown;
    unlockFailure?: unknown;
    unlockResponse?: Response;
    startFailure?: unknown;
    abandonFailure?: unknown;
  } = {},
): void {
  const {
    stars = 3,
    catalogFailure,
    balanceFailure,
    unlockFailure,
    unlockResponse,
    startFailure,
    abandonFailure,
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
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
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
    localStorage.clear();
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
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Дальше' })).toHaveClass(
      'section-label',
      'sections-group__title',
    );
    expect(screen.getByLabelText('Игра пройдена')).toBeInTheDocument();
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
      'bonus-game-card__action--repeat',
    );
    expect(within(completedCard!).queryByLabelText('Монеты: 100')).not.toBeInTheDocument();
  });

  it('keeps a conflicting repeat action clickable and visibly dark', async () => {
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
    fireEvent.click(repeatButton);
    expect(screen.getByRole('dialog', { name: 'Уже идёт другая игра' })).toBeInTheDocument();
    const style = document.createElement('style');
    style.textContent = designSystemCss;
    document.head.append(style);
    try {
      expect(getComputedStyle(repeatButton).backgroundColor).toBe('rgb(15, 23, 42)');
      expect(getComputedStyle(repeatButton).opacity).toBe('1');
    } finally {
      style.remove();
    }
  });

  it('keeps the featured card artwork wide and focused on the upper location', async () => {
    mockCatalog([card({ id: 'north-pole', slug: 'north-pole', title: 'Северный полюс' })]);
    renderCatalog();

    const artwork = await screen.findByAltText('Площадка «Пляж»');
    expect(artwork).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp?v=20260827-generated-arenas-v3',
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
      '/bonus-games/arenas/beach.webp?v=20260827-generated-arenas-v3',
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
        state: 'purchase_required',
        access_type: 'paid',
        unlock_price_stars: 22,
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

    expect(
      await screen.findByText('21 голов из 21 бросков · 2 периода · 21 бросок'),
    ).toBeInTheDocument();
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
