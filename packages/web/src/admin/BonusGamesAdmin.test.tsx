import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { AdminScreen } from './AdminScreen.js';
import { BonusGamesAdmin } from './BonusGamesAdmin.js';
import type { AdminBonusGame } from './api.js';

const bonusGame: AdminBonusGame = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'beach',
  title: 'Пляжный хоккей',
  skillCode: 'speed',
  description: 'Забейте 18 голов на пляже.',
  sortOrder: 1,
  status: 'active',
  accessType: 'paid',
  unlockPriceStars: 5,
  targetGoals: 18,
  qualificationRules: { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 240_000 },
  totalPeriods: 1,
  breakDurationMs: 30_000,
  useInventory: false,
  previewTitle: 'Первая квалификация',
  previewStory: 'История',
  previewArtworkUrl: '/bonus-games/previews/beach.webp',
  previewRevision: 1,
  periods: [
    {
      periodNumber: 1,
      durationMs: 240_000,
      shotsLimit: null,
      goalFrequency: 0.45,
      goalieFrequency: 0.5,
      shooterFrequency: 0.65,
      puckSpeedPerMs: 1.2,
      goaliePattern: 'linear',
      goalieAmplitude: 1,
      goalAmplitude: 220,
    },
  ],
  rewardCoins: 100,
  rewardStars: 1,
  rewardExperience: 50,
  goalkeeperReadyUrl: '/bonus-games/goalkeepers/beach-ready.webp',
  goalkeeperSaveUrl: '/bonus-games/goalkeepers/beach-save.webp',
  revision: 1,
  createdBy: 'admin',
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T10:00:00.000Z',
  archivedAt: null,
  arena: {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'beach-arena',
    title: 'Пляж',
    artworkUrl: '/bonus-games/arenas/beach.webp',
    thumbnailUrl: '/bonus-games/arenas/beach.webp',
    status: 'active',
    isSelectable: true,
  },
};

function renderAdmin(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminScreen />
    </QueryClientProvider>,
  );
}

function renderBonusGames(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BonusGamesAdmin />
    </QueryClientProvider>,
  );
  return client;
}

function renderBonusGamesInStrictMode(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <BonusGamesAdmin />
      </QueryClientProvider>
    </StrictMode>,
  );
}

function makeBonusGame(overrides: Partial<AdminBonusGame> = {}): AdminBonusGame {
  return {
    ...bonusGame,
    ...overrides,
    periods: overrides.periods ?? bonusGame.periods.map((period) => ({ ...period })),
    arena: { ...bonusGame.arena, ...overrides.arena },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), 'http://local').pathname;
}

function fillRequiredDraft(dialog: HTMLElement): void {
  fireEvent.change(within(dialog).getByLabelText('Код игры'), { target: { value: 'ice-test' } });
  fireEvent.change(within(dialog).getByLabelText('Название'), {
    target: { value: '  Ледовый тест  ' },
  });
  fireEvent.change(within(dialog).getByLabelText('Описание'), {
    target: { value: '  Черновик  ' },
  });
  fireEvent.change(within(dialog).getByLabelText('Код площадки'), {
    target: { value: 'ice-test-arena' },
  });
  fireEvent.change(within(dialog).getByLabelText('Название площадки'), {
    target: { value: '  Тестовый лёд  ' },
  });
}

async function openBonusEditor(game: AdminBonusGame = bonusGame): Promise<HTMLElement> {
  await screen.findByText(game.title);
  fireEvent.click(screen.getByRole('button', { name: `Редактировать ${game.title}` }));
  return screen.findByRole('dialog', { name: 'Редактирование бонусной игры' });
}

describe('bonus games admin', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'admin', displayName: 'Администратор', role: 'admin' },
    });
    vi.restoreAllMocks();
  });

  it('keeps all active game actions in one compact row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ games: [bonusGame] }));
    renderBonusGames();
    await screen.findByText(bonusGame.title);

    const actions = screen.getByTestId(`bonus-game-actions-${bonusGame.id}`);
    expect(actions).toHaveClass('admin-card-actions--single-row');
    for (const name of [
      `Редактировать ${bonusGame.title}`,
      'Выше',
      'Ниже',
      `Архивировать ${bonusGame.title}`,
    ]) {
      expect(within(actions).getByRole('button', { name })).toHaveClass('admin-compact-btn');
    }
    expect(within(actions).getByText('В архив')).toBeInTheDocument();
  });

  it('fetches the bonus catalog only on its tab and exposes the complete editor and archive copy', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/bonus-games')) {
        return new Response(JSON.stringify({ games: [bonusGame] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(JSON.stringify({ users: [], total: 0, limit: 20, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/feedback')) {
        return new Response(
          JSON.stringify({
            feedback: [],
            total: 0,
            unreadCount: 0,
            ratingStats: { count: 0, average: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню администратора' }));
    const adminMenu = screen.getByRole('dialog', { name: 'Меню администратора' });
    expect(within(adminMenu).getByRole('button', { name: 'Бонусные игры' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/admin/bonus-games')),
    ).toBe(false);

    fireEvent.click(within(adminMenu).getByRole('button', { name: 'Бонусные игры' }));

    expect(await screen.findByText('Пляжный хоккей')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('/admin/bonus-games')),
      ).toBe(true);
    });
    expect(screen.getByRole('img', { name: 'Площадка «Пляж»' })).toHaveAttribute(
      'src',
      '/bonus-games/arenas/beach.webp',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать Пляжный хоккей' }));
    const editor = await screen.findByRole('dialog', { name: 'Редактирование бонусной игры' });
    for (const label of [
      'Название',
      'Описание',
      'Порядок',
      'Статус',
      'Доступ',
      'Цена в звёздах',
      'Нужно голов',
      'Навык',
      'Активное время, мс',
      'Обязательная серия (0 — нет)',
      'Периодов',
      'Перерыв, мс',
      'Частота ворот',
      'Частота вратаря',
      'Частота игрока',
      'Скорость шайбы',
      'Паттерн вратаря',
      'Амплитуда вратаря',
      'Амплитуда ворот',
      'Награда: монеты',
      'Награда: звёзды',
      'Награда: опыт',
      'Код игры',
      'Код площадки',
      'Фон площадки',
      'Миниатюра площадки',
      'Вратарь: готов',
      'Вратарь: сейв',
      'Заголовок превью',
      'История',
      'Иллюстрация превью 1200×800',
      'Ревизия превью',
      'Использовать инвентарь',
    ]) {
      expect(within(editor).getByLabelText(label)).toBeInTheDocument();
    }
    for (const uploadLabel of [
      'Загрузить фон площадки',
      'Загрузить миниатюру площадки',
      'Загрузить обычное изображение вратаря',
      'Загрузить изображение сейва вратаря',
    ]) {
      expect(within(editor).getByLabelText(uploadLabel)).toBeInTheDocument();
    }

    fireEvent.click(within(editor).getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Архивировать Пляжный хоккей' }));
    const archive = await screen.findByRole('dialog', { name: 'Архивировать бонусную игру' });
    expect(
      within(archive).getByText(
        'Новые попытки станут недоступны. Активные попытки продолжатся по сохранённым снимкам правил.',
      ),
    ).toBeInTheDocument();
  });

  it('restores focus to the exact Create, Edit, and Archive triggers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ games: [bonusGame] }));
    renderBonusGames();
    await screen.findByText(bonusGame.title);

    const create = screen.getByRole('button', { name: 'Создать' });
    create.focus();
    fireEvent.click(create);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Новая бонусная игра' })).getByRole('button', {
        name: 'Отмена',
      }),
    );
    await waitFor(() => expect(create).toHaveFocus());

    const edit = screen.getByRole('button', { name: `Редактировать ${bonusGame.title}` });
    edit.focus();
    fireEvent.click(edit);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Редактирование бонусной игры' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(edit).toHaveFocus());

    const archive = screen.getByRole('button', { name: `Архивировать ${bonusGame.title}` });
    archive.focus();
    fireEvent.click(archive);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Архивировать бонусную игру' })).getByRole(
        'button',
        { name: 'Отмена' },
      ),
    );
    await waitFor(() => expect(archive).toHaveFocus());
  });

  it('submits exact trimmed create and patch payloads', async () => {
    const bodies: Array<{ method: string; path: string; body: unknown }> = [];
    let games: AdminBonusGame[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      const method = init?.method ?? 'GET';
      if (path === '/api/admin/bonus-games' && method === 'GET') {
        return jsonResponse({ games });
      }
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      bodies.push({ method, path, body });
      const saved = makeBonusGame({
        id: games[0]?.id ?? '33333333-3333-4333-8333-333333333333',
        title: 'Ледовый тест',
        status: 'draft',
        accessType: 'paid',
        unlockPriceStars: 0,
      });
      games = [saved];
      return jsonResponse({ game: saved }, method === 'POST' ? 201 : 200);
    });

    renderBonusGames();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const createDialog = await screen.findByRole('dialog', { name: 'Новая бонусная игра' });
    fillRequiredDraft(createDialog);
    fireEvent.change(within(createDialog).getByLabelText('Доступ'), {
      target: { value: 'paid' },
    });
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      method: 'POST',
      path: '/api/admin/bonus-games',
      body: {
        slug: 'ice-test',
        title: 'Ледовый тест',
        description: 'Черновик',
        sortOrder: 1,
        status: 'draft',
        accessType: 'paid',
        unlockPriceStars: 0,
        targetGoals: 18,
        skillCode: 'speed',
        qualificationRules: { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 240_000 },
        totalPeriods: 1,
        breakDurationMs: 0,
        useInventory: false,
        previewTitle: '',
        previewStory: '',
        previewArtworkUrl: '',
        previewRevision: 1,
        periods: [
          {
            periodNumber: 1,
            durationMs: 240_000,
            shotsLimit: null,
            goalFrequency: 0.45,
            goalieFrequency: 0.5,
            shooterFrequency: 0.65,
            puckSpeedPerMs: 1.2,
            goaliePattern: 'linear',
            goalieAmplitude: 1,
            goalAmplitude: 220,
          },
        ],
        rewardCoins: 0,
        rewardStars: 0,
        rewardExperience: 0,
        goalkeeperReadyUrl: '',
        goalkeeperSaveUrl: '',
        arena: {
          slug: 'ice-test-arena',
          title: 'Тестовый лёд',
          artworkUrl: '',
          thumbnailUrl: '',
          status: 'active',
          isSelectable: false,
        },
      },
    });

    const editDialog = await openBonusEditor(games[0]!);
    fireEvent.change(within(editDialog).getByLabelText('Название'), {
      target: { value: '  Обновлённый лёд  ' },
    });
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({
      method: 'PATCH',
      path: '/api/admin/bonus-games/33333333-3333-4333-8333-333333333333',
      body: {
        slug: 'beach',
        title: 'Обновлённый лёд',
        description: 'Забейте 18 голов на пляже.',
        sortOrder: 1,
        status: 'draft',
        accessType: 'paid',
        unlockPriceStars: 0,
        targetGoals: 18,
        qualificationRules: { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 240_000 },
        totalPeriods: 1,
        breakDurationMs: 30_000,
        useInventory: false,
        previewTitle: 'Первая квалификация',
        previewStory: 'История',
        previewArtworkUrl: '/bonus-games/previews/beach.webp',
        previewRevision: 1,
        periods: bonusGame.periods,
        rewardCoins: 100,
        rewardStars: 1,
        rewardExperience: 50,
        goalkeeperReadyUrl: '/bonus-games/goalkeepers/beach-ready.webp',
        goalkeeperSaveUrl: '/bonus-games/goalkeepers/beach-save.webp',
        arena: {
          slug: 'beach-arena',
          title: 'Пляж',
          artworkUrl: '/bonus-games/arenas/beach.webp',
          thumbnailUrl: '/bonus-games/arenas/beach.webp',
          status: 'active',
          isSelectable: true,
        },
      },
    });
  });

  it('separates draft validation from activation validation and trims active media', async () => {
    let savedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      const method = init?.method ?? 'GET';
      if (path === '/api/admin/bonus-games' && method === 'GET') {
        return jsonResponse({ games: [] });
      }
      savedBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return jsonResponse({ game: makeBonusGame({ status: 'active' }) }, 201);
    });

    renderBonusGames();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая бонусная игра' });
    fillRequiredDraft(dialog);
    fireEvent.change(within(dialog).getByLabelText('Доступ'), { target: { value: 'paid' } });
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeEnabled();

    fireEvent.change(within(dialog).getByLabelText('Статус'), { target: { value: 'active' } });
    expect(
      within(dialog).getByText('Для платной игры укажите цену в звёздах.'),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Цена в звёздах'), { target: { value: '5' } });
    for (const label of ['Фон площадки', 'Миниатюра площадки', 'Вратарь: готов', 'Вратарь: сейв']) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value: '   ' } });
    }
    expect(
      within(dialog).getByText('Для активной игры загрузите все медиа и активируйте площадку.'),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Фон площадки'), {
      target: { value: '  /bonus-games/arenas/beach.webp  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Миниатюра площадки'), {
      target: { value: '  /bonus-games/arenas/beach.webp  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Вратарь: готов'), {
      target: { value: '  /bonus-games/goalkeepers/beach-ready.webp  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Вратарь: сейв'), {
      target: { value: '  /bonus-games/goalkeepers/beach-save.webp  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Заголовок превью'), {
      target: { value: '  Первая квалификация  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('История'), {
      target: { value: '  Первый шаг к большому хоккею.  ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Иллюстрация превью 1200×800'), {
      target: { value: '  /bonus-games/previews/beach.webp  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(savedBody).not.toBeNull());
    expect(savedBody).toMatchObject({
      unlockPriceStars: 5,
      goalkeeperReadyUrl: '/bonus-games/goalkeepers/beach-ready.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/beach-save.webp',
      arena: {
        artworkUrl: '/bonus-games/arenas/beach.webp',
        thumbnailUrl: '/bonus-games/arenas/beach.webp',
      },
    });
  });

  it('resizes contiguous periods and rejects exact server boundary violations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ games: [] }));
    renderBonusGames();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая бонусная игра' });
    fillRequiredDraft(dialog);
    fireEvent.change(within(dialog).getByLabelText('Периодов'), { target: { value: '2' } });
    expect(within(dialog).getByRole('region', { name: '1-й период' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: '2-й период' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getAllByLabelText('Длительность, мс')[1]!, {
      target: { value: '999' },
    });
    expect(within(dialog).getByText('Проверьте параметры периодов.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    fireEvent.change(within(dialog).getAllByLabelText('Длительность, мс')[1]!, {
      target: { value: '10800000' },
    });
    expect(within(dialog).queryByText('Проверьте параметры периодов.')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getAllByLabelText('Паттерн вратаря')[1]!, {
      target: { value: 'feint' },
    });
    expect(within(dialog).getByText('Проверьте параметры периодов.')).toBeInTheDocument();
  });

  it('routes editor archive through confirmation with one DELETE and one invalidation', async () => {
    const calls: Array<{ method: string; path: string }> = [];
    let getCount = 0;
    const archive = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path });
      if (method === 'GET') {
        getCount += 1;
        return jsonResponse({ games: [bonusGame] });
      }
      if (method === 'DELETE') return archive.promise;
      return jsonResponse({ game: bonusGame });
    });

    renderBonusGames();
    const editor = await openBonusEditor();
    fireEvent.change(within(editor).getByLabelText('Статус'), { target: { value: 'archived' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить' }));
    const confirm = await screen.findByRole('dialog', { name: 'Архивировать бонусную игру' });
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    const archiveButton = within(confirm).getByRole('button', {
      name: 'Архивировать Пляжный хоккей',
    });
    archiveButton.click();
    archiveButton.click();
    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'DELETE')).toEqual([
        {
          method: 'DELETE',
          path: '/api/admin/bonus-games/11111111-1111-4111-8111-111111111111',
        },
      ]),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(confirm);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('dialog', { name: 'Архивировать бонусную игру' })).toBeInTheDocument();

    await act(async () => {
      archive.resolve(jsonResponse({ game: makeBonusGame({ status: 'archived' }) }));
      await archive.promise;
    });
    await waitFor(() => expect(getCount).toBe(2));
    expect(
      screen.queryByRole('dialog', { name: 'Архивировать бонусную игру' }),
    ).not.toBeInTheDocument();
  });

  it('warns that reorder changes future progression before sending the exact request', async () => {
    const second = makeBonusGame({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Ледяной замок',
      sortOrder: 2,
    });
    let reorderBody: unknown = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === '/api/admin/bonus-games/reorder') {
        reorderBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return jsonResponse({ games: [second, bonusGame] });
      }
      return jsonResponse({ games: [bonusGame, second] });
    });

    renderBonusGames();
    await screen.findByText('Ледяной замок');
    fireEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);
    const confirmation = await screen.findByRole('dialog', { name: 'Изменить порядок игр?' });
    expect(confirmation).toHaveTextContent(
      'Изменение порядка перестроит условия прохождения для будущих попыток.',
    );
    expect(reorderBody).toBeNull();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Изменить порядок' }));
    await waitFor(() =>
      expect(reorderBody).toEqual({
        skillCode: 'speed',
        gameIds: ['44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111'],
      }),
    );
  });

  it('validates WebP files locally and sends an ASCII-safe Unicode filename header', async () => {
    const upload = deferredResponse();
    const uploadCalls: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path.includes('/media/')) {
        uploadCalls.push(init ?? {});
        return upload.promise;
      }
      return jsonResponse({ games: [bonusGame] });
    });

    renderBonusGames();
    const editor = await openBonusEditor();
    const picker = within(editor).getByLabelText('Загрузить фон площадки');
    fireEvent.change(picker, {
      target: { files: [new File([new Uint8Array([1])], 'goalie.png', { type: 'image/png' })] },
    });
    expect(
      await within(editor).findByText('Можно загрузить только файл WebP.'),
    ).toBeInTheDocument();
    expect(uploadCalls).toHaveLength(0);
    fireEvent.change(picker, {
      target: { files: [new File([], 'empty.webp', { type: 'image/webp' })] },
    });
    expect(await within(editor).findByText('Файл WebP пустой.')).toBeInTheDocument();
    expect(uploadCalls).toHaveLength(0);

    fireEvent.change(picker, {
      target: {
        files: [new File([new Uint8Array([1])], 'вратарь готов.webp', { type: 'image/webp' })],
      },
    });
    await waitFor(() => expect(uploadCalls).toHaveLength(1));
    const header = new Headers(uploadCalls[0]!.headers).get('X-File-Name');
    expect(header).not.toBeNull();
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    expect(new Headers(uploadCalls[0]!.headers).get('Content-Type')).toBe('image/webp');

    await act(async () => {
      upload.resolve(
        jsonResponse({
          media: {
            id: '55555555-5555-4555-8555-555555555555',
            url: '/api/media/55555555-5555-4555-8555-555555555555?t=safe',
            kind: 'arena',
            key: 'bonus-games/arena/file.webp',
            contentType: 'image/webp',
            size: 1,
            originalName: 'вратарь готов.webp',
            createdAt: '2026-08-24T00:00:00.000Z',
          },
        }),
      );
      await upload.promise;
    });
    await waitFor(() =>
      expect(within(editor).getByLabelText('Фон площадки')).toHaveValue(
        '/api/media/55555555-5555-4555-8555-555555555555?t=safe',
      ),
    );
  });

  it('applies the current deferred upload under StrictMode and includes it in the save payload', async () => {
    const upload = deferredResponse();
    let patchBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path.includes('/media/')) return upload.promise;
      if (path === `/api/admin/bonus-games/${bonusGame.id}` && init?.method === 'PATCH') {
        patchBody = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        return jsonResponse({ game: bonusGame });
      }
      return jsonResponse({ games: [bonusGame] });
    });

    renderBonusGamesInStrictMode();
    const editor = await openBonusEditor();
    fireEvent.change(within(editor).getByLabelText('Загрузить миниатюру площадки'), {
      target: {
        files: [new File([new Uint8Array([1])], 'strict-ready.webp', { type: 'image/webp' })],
      },
    });
    await act(async () => {
      upload.resolve(
        jsonResponse({
          media: {
            id: '66666666-6666-4666-8666-666666666666',
            url: '/api/media/66666666-6666-4666-8666-666666666666?t=current',
            kind: 'thumbnail',
            key: 'bonus-games/thumbnail/strict-ready.webp',
            contentType: 'image/webp',
            size: 1,
            originalName: 'strict-ready.webp',
            createdAt: '2026-08-24T00:00:00.000Z',
          },
        }),
      );
      await upload.promise;
    });
    await waitFor(() =>
      expect(within(editor).getByLabelText('Миниатюра площадки')).toHaveValue(
        '/api/media/66666666-6666-4666-8666-666666666666?t=current',
      ),
    );

    fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(patchBody).not.toBeNull());
    expect(patchBody).toMatchObject({
      arena: {
        thumbnailUrl: '/api/media/66666666-6666-4666-8666-666666666666?t=current',
      },
    });
  });

  it('ignores deferred upload completion after a real StrictMode unmount', async () => {
    const upload = deferredResponse();
    let patchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path.includes('/media/')) return upload.promise;
      if (init?.method === 'PATCH') patchCount += 1;
      return jsonResponse({ games: [bonusGame] });
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const rendered = renderBonusGamesInStrictMode();
    const editor = await openBonusEditor();
    fireEvent.change(within(editor).getByLabelText('Загрузить обычное изображение вратаря'), {
      target: {
        files: [new File([new Uint8Array([1])], 'unmounted.webp', { type: 'image/webp' })],
      },
    });
    rendered.unmount();
    await act(async () => {
      upload.resolve(
        jsonResponse({
          media: {
            id: '77777777-7777-4777-8777-777777777777',
            url: '/api/media/77777777-7777-4777-8777-777777777777?t=late',
            kind: 'goalkeeper_ready',
            key: 'bonus-games/goalkeeper-ready/unmounted.webp',
            contentType: 'image/webp',
            size: 1,
            originalName: 'unmounted.webp',
            createdAt: '2026-08-24T00:00:00.000Z',
          },
        }),
      );
      await upload.promise;
    });

    expect(screen.queryByRole('dialog', { name: 'Редактирование бонусной игры' })).toBeNull();
    expect(patchCount).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps manual media edits and blocks save, dismiss, and duplicate upload while pending', async () => {
    const upload = deferredResponse();
    let uploadCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path.includes('/media/')) {
        uploadCount += 1;
        return upload.promise;
      }
      return jsonResponse({ games: [bonusGame] });
    });

    renderBonusGames();
    const editor = await openBonusEditor();
    const picker = within(editor).getByLabelText('Загрузить фон площадки');
    const file = new File([new Uint8Array([1])], 'ready.webp', { type: 'image/webp' });
    fireEvent.change(picker, { target: { files: [file] } });
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() => expect(uploadCount).toBe(1));
    fireEvent.change(within(editor).getByLabelText('Фон площадки'), {
      target: { value: '/manual/newer.webp' },
    });
    expect(within(editor).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(within(editor).getByRole('button', { name: 'Отмена' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(editor.parentElement!);
    expect(
      screen.getByRole('dialog', { name: 'Редактирование бонусной игры' }),
    ).toBeInTheDocument();

    await act(async () => {
      upload.resolve(
        jsonResponse({
          media: {
            id: '55555555-5555-4555-8555-555555555555',
            url: '/api/media/old-upload?t=stale',
            kind: 'arena',
            key: 'bonus-games/arena/file.webp',
            contentType: 'image/webp',
            size: 1,
            originalName: 'ready.webp',
            createdAt: '2026-08-24T00:00:00.000Z',
          },
        }),
      );
      await upload.promise;
    });
    await waitFor(() =>
      expect(within(editor).getByLabelText('Фон площадки')).toHaveValue('/manual/newer.webp'),
    );
  });

  it('synchronously guards duplicate save and restores controls with a safe error after failure', async () => {
    const save = deferredResponse();
    let saveCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === '/api/admin/bonus-games' && init?.method === 'POST') {
        saveCount += 1;
        return save.promise;
      }
      return jsonResponse({ games: [] });
    });

    renderBonusGames();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая бонусная игра' });
    fillRequiredDraft(dialog);
    const saveButton = within(dialog).getByRole('button', { name: 'Сохранить' });
    saveButton.click();
    saveButton.click();
    await waitFor(() => expect(saveCount).toBe(1));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('dialog', { name: 'Новая бонусная игра' })).toBeInTheDocument();

    await act(async () => {
      save.resolve(
        jsonResponse(
          { error: { code: 'internal_database_trace', message: 'password=secret stack trace' } },
          500,
        ),
      );
      await save.promise;
    });
    expect(
      await within(dialog).findByText('Не удалось выполнить запрос. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/password=secret/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeEnabled();
  });
});
