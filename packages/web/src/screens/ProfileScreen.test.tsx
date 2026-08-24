import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';
import type { InventoryState } from '../api/inventory.js';
import type { HomeArenasResponse } from '../api/arenas.js';

type TelegramWebAppWindow = typeof window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

const emptyInventoryState: InventoryState = {
  balances: { tokens: 1000, stars: 3, experience: 77 },
  items: { stick: [], skates: [], nutrition: [] },
  equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
};

const ultimateOneStick = {
  id: 'stick-ultimate-one',
  kind: 'stick' as const,
  title: 'Ультимейт Ван 1',
  description: 'Комплект клюшек Ультимейт Ван на 1300 бросков. Ускоряет полёт шайбы.',
  imageUrl: '/inventory/stick-bronze.webp',
  currencyPrice: 1490,
  chargesPerPurchase: 1300,
  resourceUnit: 'shot' as const,
  rarity: 'common' as const,
  powerScore: 24,
  duelPeriodCost: 1,
  chargesAvailable: 1305,
  chargesReserved: 0,
};

const consumableInventoryState: InventoryState = {
  balances: { tokens: 1000, stars: 3, experience: 77 },
  items: {
    stick: [
      {
        id: 'stick-sharp',
        kind: 'stick',
        title: 'Острая клюшка',
        description: 'Быстрее выпускает шайбу из неудобной позиции.',
        imageUrl: '/inventory/sticks.webp',
        currencyPrice: 120,
        chargesPerPurchase: 5,
        resourceUnit: 'shot',
        rarity: 'rare',
        powerScore: 24,
        duelPeriodCost: 1,
        chargesAvailable: 3,
        chargesReserved: 1,
      },
    ],
    skates: [
      {
        id: 'skates-light',
        kind: 'skates',
        title: 'Лёгкие коньки',
        description: 'Добавляют рывок перед броском.',
        imageUrl: '/inventory/nutrition.webp',
        currencyPrice: 90,
        chargesPerPurchase: 5,
        resourceUnit: 'distance',
        rarity: 'common',
        powerScore: 12,
        duelPeriodCost: 1,
        chargesAvailable: 8500,
        chargesReserved: 0,
      },
    ],
    nutrition: [
      {
        id: 'nutrition-gel',
        kind: 'nutrition',
        title: 'Энергогель',
        description: 'Держит концентрацию в конце периода.',
        imageUrl: null,
        currencyPrice: 60,
        chargesPerPurchase: 300_000,
        resourceUnit: 'energy_ms',
        rarity: 'common',
        powerScore: 8,
        duelPeriodCost: 1,
        chargesAvailable: 300_000,
        chargesReserved: 0,
      },
    ],
  },
  equipped: {
    stickItemId: 'stick-sharp',
    skatesItemId: null,
    nutritionItemId: 'nutrition-gel',
  },
};

function renderProfile(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/profile/settings" element={<div>settings screen</div>} />
          <Route path="/inventory" element={<div>inventory screen</div>} />
          <Route path="/achievements" element={<div>achievements screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const telegramProfile = {
  id: 'u1',
  displayName: 'Alice T',
  role: 'player',
  avatarUrl: 'tg.png',
  grip: 'right',
  competitionLevel: 'beginner',
  stats: {
    shots: 128,
    goals: 64,
    accuracy: 50,
    playStreakDays: 7,
    bestPlayStreakDays: 12,
  },
  achievements: [
    {
      id: 'first-goal',
      photoUrl: '/achievements/first-goal.webp',
      title: 'Первая шайба',
      description: 'Первый гол всегда самый шумный.',
      requirement: 'Забить 1 гол.',
      isUnlocked: true,
      unlockedAt: '2026-05-02T08:00:00.000Z',
    },
    {
      id: 'amateur-ticket',
      photoUrl: '/achievements/amateur-ticket.webp',
      title: 'Билет в любители',
      description: 'Ты готов к любительским дуэлям и турнирам.',
      requirement: 'Открыть уровень «Любитель».',
      isUnlocked: false,
    },
  ],
  displaySource: 'telegram',
  linkedProviders: ['telegram', 'vk'],
  unclaimedAchievementsCount: 1,
  tgFirstName: 'Alice',
  tgLastName: 'T',
  tgAvatarUrl: 'tg.png',
  tgUsername: 'alice',
  vkFirstName: 'Vera',
  vkLastName: 'V',
  vkAvatarUrl: 'vk.png',
  vkUsername: 'vera',
};

const homeArenas: HomeArenasResponse = {
  arenas: [
    {
      id: 'default-arena',
      selection_id: null,
      slug: 'default',
      title: 'По умолчанию',
      artwork_url: '/arenas/default.webp',
      thumbnail_url: '/arenas/default-thumb.webp',
    },
    {
      id: 'beach-arena',
      selection_id: 'a1e80a1d-5b27-470f-8e4d-2102b1c10222',
      slug: 'beach',
      title: 'Пляж',
      artwork_url: '/arenas/beach.webp',
      thumbnail_url: '/arenas/beach-thumb.webp',
    },
  ],
  selected_arena: {
    id: 'default-arena',
    selection_id: null,
    slug: 'default',
    title: 'По умолчанию',
    artwork_url: '/arenas/default.webp',
    thumbnail_url: '/arenas/default-thumb.webp',
  },
};

function getFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function mockProfileFetch(
  profile: typeof telegramProfile,
  inventory: InventoryState = emptyInventoryState,
  options: {
    homeArenaSelection?: (init: RequestInit | undefined) => Response | Promise<Response>;
  } = {},
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = getFetchUrl(input);
    if (url.endsWith('/api/me')) {
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/inventory/me')) {
      return new Response(JSON.stringify(inventory), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/me/home-arenas')) {
      return new Response(JSON.stringify(homeArenas), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/me/home-arena') && options.homeArenaSelection !== undefined) {
      return options.homeArenaSelection(init);
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function textWithoutWhitespace(text: string): string {
  return text.replace(/\s/g, '');
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as TelegramWebAppWindow).Telegram;
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice T' },
    });
    vi.restoreAllMocks();
  });

  it('shows the locker profile with identity, resources and clickable hotspots', async () => {
    mockProfileFetch(telegramProfile);

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    expect(screen.getByText('Alice T')).toBeInTheDocument();
    expect(screen.getByText('Уровень: Новичок')).toBeInTheDocument();
    expect(screen.queryByText('id u1')).not.toBeInTheDocument();
    expect(screen.queryByText('Валюта')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Монеты: 1000')).toBeInTheDocument();
    expect(await screen.findByLabelText('Звёзды: 3')).toBeInTheDocument();
    expect(await screen.findByLabelText('Опыт: 77')).toBeInTheDocument();
    expect(
      await screen.findByText((text) => text.replace(/\s/g, '') === '1000'),
    ).toBeInTheDocument();
    expect(await screen.findByText('77')).toBeInTheDocument();
    expect(screen.queryByText('Ранг')).not.toBeInTheDocument();
    expect(screen.queryByText('Броски')).not.toBeInTheDocument();
    expect(screen.queryByText('Вратарей пройдено')).not.toBeInTheDocument();
    expect(screen.queryByText('Аккаунт и хват игрока')).not.toBeInTheDocument();
    expect(screen.queryByText('Уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Пуш-уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Обратная связь')).not.toBeInTheDocument();
    expect(screen.queryByText('Форма обратной связи')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Тестовый пуш/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Шайба.*статистика/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать домашнюю площадку' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Клюшка.*Обычная клюшка.*Базовая/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Коньки.*Обычные коньки.*Базовая/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Питание.*Нет купленных/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Достижения.*получено/i })).toBeInTheDocument();
    expect(
      document.querySelector(
        '.profile-locker-hotspot--achievements .profile-locker-hotspot__count',
      ),
    ).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Настройки профиля' })).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-achievement-medals.webp"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-hoodie-training.webp"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-jersey-hanger.webp"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-rink-photo-frame.webp"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-nutrition-cans.webp"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-hockey-stick.webp"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Первый гол всегда самый шумный.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Шайба.*статистика/i }));
    const statsDialog = screen.getByRole('dialog', { name: 'Статистика' });
    expect(within(statsDialog).getByText('Броски')).toBeInTheDocument();
    expect(within(statsDialog).getByText('128')).toBeInTheDocument();
    expect(within(statsDialog).getByText('Голы')).toBeInTheDocument();
    expect(within(statsDialog).getByText('64')).toBeInTheDocument();
    expect(within(statsDialog).getByText('Точность')).toBeInTheDocument();
    expect(within(statsDialog).getByText('50%')).toBeInTheDocument();
    expect(within(statsDialog).getByText('Дней подряд')).toBeInTheDocument();
    expect(within(statsDialog).getByText('7')).toBeInTheDocument();
    expect(within(statsDialog).getByText('(12)')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Статистика' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Достижения.*получено/i }));
    const achievementsDialog = screen.getByRole('dialog', { name: 'Достижения' });
    expect(document.body.firstElementChild).toHaveAttribute('inert');
    expect(within(achievementsDialog).getByText('Достижения (2)')).toBeInTheDocument();
    expect(within(achievementsDialog).queryByText(/Всего достижений/i)).not.toBeInTheDocument();
    expect(
      within(achievementsDialog).getByRole('button', { name: /Первая шайба.*получено/i }),
    ).toBeInTheDocument();
    expect(
      within(achievementsDialog).getByRole('button', { name: /Билет в любители.*не получено/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(achievementsDialog).getByRole('button', { name: /Первая шайба.*получено/i }),
    );
    const achievementDetailsDialog = screen.getByRole('dialog', { name: 'Первая шайба' });
    expect(achievementDetailsDialog).toBeInTheDocument();
    expect(screen.getByText('Первый гол всегда самый шумный.')).toBeInTheDocument();
    expect(screen.getByText(/Забить 1 гол/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Понятно' })).not.toBeInTheDocument();
    fireEvent.click(within(achievementDetailsDialog).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Первая шайба' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Награды ждут получения.*1/i }));
    expect(screen.getByText('achievements screen')).toBeInTheDocument();
  });

  it('opens the rink photograph selector with only server-listed home arenas', async () => {
    // Break caught: making the decorative photo non-interactive or reconstructing options client-side.
    mockProfileFetch(telegramProfile);

    renderProfile();

    const rinkPhoto = await screen.findByRole('button', { name: 'Выбрать домашнюю площадку' });
    rinkPhoto.focus();
    expect(rinkPhoto).toHaveFocus();
    fireEvent.keyDown(rinkPhoto, { key: 'Enter' });
    fireEvent.click(rinkPhoto);

    const dialog = await screen.findByRole('dialog', { name: 'Домашняя площадка' });
    await waitFor(() => {
      expect(within(dialog).getByRole('radio', { name: 'По умолчанию' })).toHaveFocus();
    });
    expect(within(dialog).getByRole('radio', { name: 'По умолчанию' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Пляж' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: 'Космос' })).not.toBeInTheDocument();
    expect(document.querySelector('.profile-locker-prop--rink-photo')).toBeInTheDocument();
  });

  it('returns focus to the rink photograph after every selector close path', async () => {
    // Break caught: closing the modal could strand keyboard focus on removed UI or elsewhere in Profile.
    const selectedBeach = homeArenas.arenas[1]!;
    const fetchSpy = mockProfileFetch(telegramProfile, emptyInventoryState, {
      homeArenaSelection: (init) => {
        expect(init?.method).toBe('PATCH');
        expect(init?.body).toBe(JSON.stringify({ arena_theme_id: selectedBeach.selection_id }));
        return new Response(JSON.stringify({ selected_arena: selectedBeach }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    renderProfile();

    const rinkPhoto = await screen.findByRole('button', { name: 'Выбрать домашнюю площадку' });

    fireEvent.click(rinkPhoto);
    const escapeDialog = await screen.findByRole('dialog', { name: 'Домашняя площадка' });
    fireEvent.keyDown(within(escapeDialog).getByRole('radio', { name: 'По умолчанию' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(rinkPhoto).toHaveFocus());
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/me/home-arena', expect.anything());

    fireEvent.click(rinkPhoto);
    const closeDialog = await screen.findByRole('dialog', { name: 'Домашняя площадка' });
    fireEvent.click(within(closeDialog).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(rinkPhoto).toHaveFocus());

    fireEvent.click(rinkPhoto);
    const cancelDialog = await screen.findByRole('dialog', { name: 'Домашняя площадка' });
    fireEvent.click(within(cancelDialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(rinkPhoto).toHaveFocus());

    fireEvent.click(rinkPhoto);
    const saveDialog = await screen.findByRole('dialog', { name: 'Домашняя площадка' });
    fireEvent.click(within(saveDialog).getByRole('radio', { name: 'Пляж' }));
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(rinkPhoto).toHaveFocus());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/me/home-arena',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('shows the hockey jersey for amateur players', async () => {
    mockProfileFetch({ ...telegramProfile, competitionLevel: 'amateur' });

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-jersey-hanger.webp"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-hoodie-training.webp"]'),
    ).not.toBeInTheDocument();
  });

  it('shows the carbon profile stick when the player owns an ultimate stick', async () => {
    mockProfileFetch(telegramProfile, {
      ...emptyInventoryState,
      items: {
        ...emptyInventoryState.items,
        stick: [ultimateOneStick],
      },
    });

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        document.querySelector('img[src="/inventory/profile-stick-carbon-red.webp"]'),
      ).toBeInTheDocument();
    });
    expect(
      document.querySelector('img[src="/inventory/profile-hockey-stick.webp"]'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the default profile stick when the ultimate stick has no available shots', async () => {
    mockProfileFetch(telegramProfile, {
      ...emptyInventoryState,
      items: {
        ...emptyInventoryState.items,
        stick: [{ ...ultimateOneStick, chargesAvailable: 0, chargesReserved: 1 }],
      },
    });

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        document.querySelector('img[src="/inventory/profile-hockey-stick.webp"]'),
      ).toBeInTheDocument();
    });
    expect(
      document.querySelector('img[src="/inventory/profile-stick-carbon-red.webp"]'),
    ).not.toBeInTheDocument();
  });

  it('shows exact resource balances instead of compact labels', async () => {
    mockProfileFetch(telegramProfile, {
      ...emptyInventoryState,
      balances: { tokens: 100_449, stars: 100_000, experience: 1_000_000 },
    });

    renderProfile();

    expect(await screen.findByLabelText('Монеты: 100449')).toBeInTheDocument();
    expect(await screen.findByLabelText('Звёзды: 100000')).toBeInTheDocument();
    expect(await screen.findByLabelText('Опыт: 1000000')).toBeInTheDocument();
    expect(
      await screen.findByText((text) => textWithoutWhitespace(text) === '100449'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText((text) => textWithoutWhitespace(text) === '100000'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText((text) => textWithoutWhitespace(text) === '1000000'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/тыс/)).not.toBeInTheDocument();
    expect(screen.queryByText(/млн/)).not.toBeInTheDocument();
  });

  it('hides decorative achievement medals until the player has an unlocked achievement', async () => {
    mockProfileFetch({
      ...telegramProfile,
      achievements: telegramProfile.achievements.map((achievement) => ({
        ...achievement,
        isUnlocked: false,
      })),
      unclaimedAchievementsCount: 0,
    });

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-achievement-medals.webp"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-rink-photo-frame.webp"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Достижения: 0 получено/i })).toBeInTheDocument();
  });

  it('opens settings from the header button', async () => {
    mockProfileFetch(telegramProfile);

    renderProfile();

    const settingsButton = await screen.findByRole('button', { name: 'Настройки профиля' });
    fireEvent.click(settingsButton);

    expect(screen.getByText('settings screen')).toBeInTheDocument();
  });

  it('hides notification settings inside Telegram Mini App', async () => {
    (window as TelegramWebAppWindow).Telegram = {
      WebApp: {
        initData: 'query_id=q&user=%7B%22id%22%3A42%7D&auth_date=1&hash=h',
      },
    };
    const fetchMock = mockProfileFetch(telegramProfile);

    renderProfile();

    expect(await screen.findByLabelText('Раздевалка игрока')).toBeInTheDocument();
    expect(screen.queryByText('Уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Пуш-уведомления')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /уведомления/i })).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => getFetchUrl(call[0]));
    expect(urls.some((url) => url.includes('/api/push/'))).toBe(false);
  });

  it('renders consumable equipment slots and picker details', async () => {
    mockProfileFetch(telegramProfile, consumableInventoryState);

    renderProfile();

    expect(
      await screen.findByRole('button', { name: /Клюшка.*Острая клюшка/i }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.profile-locker-hotspot--stick .profile-locker-hotspot__count'),
    ).toHaveTextContent('3');
    expect(
      document.querySelector('.profile-locker-hotspot--skates .profile-locker-hotspot__count'),
    ).toHaveTextContent('8 500');
    expect(
      document.querySelector('.profile-locker-hotspot--nutrition .profile-locker-hotspot__count'),
    ).toHaveTextContent('5 мин');
    expect(
      screen.getByRole('button', { name: /Коньки.*Обычные коньки.*Базовая.*8\s500 прокатов/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Питание.*Энергогель.*5 минут энергии/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Осталось 3 броска')).not.toBeInTheDocument();
    expect(screen.queryByText('Осталось 5 минут энергии')).not.toBeInTheDocument();
    expect(screen.queryByText('Бросок +24')).not.toBeInTheDocument();
    expect(screen.queryByText('выбрано')).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src^="/inventory/stick-silver.webp"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src^="/inventory/nutrition-bronze.webp"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('img[src="/inventory/profile-nutrition-cans.webp"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('img[src="/inventory/sticks.webp"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Клюшка.*Острая клюшка/i }));

    const dialog = screen.getByRole('dialog', { name: 'Клюшка' });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Выберите клюшку, с которой будете начинать матчи. Перед стартом игры выбор можно изменить',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Острая клюшка')).toBeInTheDocument();
    expect(
      within(dialog).queryByText('Быстрее выпускает шайбу из неудобной позиции.'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Ускоряет полёт шайбы на 24 пункта/)).toBeInTheDocument();
    expect(within(dialog).queryByText('На 3 броска')).not.toBeInTheDocument();
    const stockLabel = within(dialog).getByText('Осталось 3 броска');
    expect(stockLabel).toBeInTheDocument();
    expect(stockLabel).toHaveStyle({ fontWeight: '920' });
    expect(within(dialog).queryByText('Цена: 120')).not.toBeInTheDocument();
    expect(within(dialog).getByText('1 забронирован')).toBeInTheDocument();
    expect(within(dialog).queryByText('Активировано')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Экипировать')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Не брать')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Острая клюшка/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    fireEvent.click(screen.getByRole('button', { name: /Коньки.*Обычные коньки/i }));
    const skatesDialog = screen.getByRole('dialog', { name: 'Коньки' });
    expect(within(skatesDialog).getByText('Лёгкие коньки')).toBeInTheDocument();
    expect(within(skatesDialog).getByText('Защищают от спотыканий')).toBeInTheDocument();
    expect(within(skatesDialog).queryByText(/Ускоряет игрока.*пункт/)).not.toBeInTheDocument();
    fireEvent.click(within(skatesDialog).getByRole('button', { name: 'Закрыть' }));

    fireEvent.click(screen.getByRole('button', { name: /Питание.*Энергогель/i }));
    const nutritionDialog = screen.getByRole('dialog', { name: 'Питание' });
    expect(within(nutritionDialog).getByText('Энергогель')).toBeInTheDocument();
    expect(within(nutritionDialog).getByText('Запас энергии: 5 мин')).toBeInTheDocument();
    expect(within(nutritionDialog).queryByText(/Добавляет энергию.*пункт/)).not.toBeInTheDocument();
  });

  it('shows base required equipment and offers the shop inside missing nutrition details', async () => {
    mockProfileFetch(telegramProfile, emptyInventoryState);

    renderProfile();

    fireEvent.click(
      await screen.findByRole('button', { name: /Клюшка.*Обычная клюшка.*Базовая/i }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Клюшка' });
    expect(within(dialog).getByText('Обычная клюшка')).toBeInTheDocument();
    expect(within(dialog).queryByText('Без клюшки')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    fireEvent.click(screen.getByRole('button', { name: /Питание.*Нет купленных/i }));

    const nutritionDialog = screen.getByRole('dialog', { name: 'Питание' });
    expect(
      within(nutritionDialog).getByText('Купленных предметов этого типа пока нет.'),
    ).toBeInTheDocument();
    fireEvent.click(within(nutritionDialog).getByRole('button', { name: 'В магазин' }));
    expect(screen.getByText('inventory screen')).toBeInTheDocument();
  });
});
