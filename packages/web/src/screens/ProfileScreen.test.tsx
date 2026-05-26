import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

type TelegramWebAppWindow = typeof window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

const inventoryState = {
  balances: { tokens: 1000, stars: 3, experience: 77 },
  items: { stick: [], skates: [], nutrition: [] },
  equipped: { stickItemId: null, skatesItemId: null, nutritionItemId: null },
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
  tgFirstName: 'Alice',
  tgLastName: 'T',
  tgAvatarUrl: 'tg.png',
  tgUsername: 'alice',
  vkFirstName: 'Vera',
  vkLastName: 'V',
  vkAvatarUrl: 'vk.png',
  vkUsername: 'vera',
};

function getFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function mockProfileFetch(profile: typeof telegramProfile) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = getFetchUrl(input);
    if (url.endsWith('/api/me')) {
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/inventory/me')) {
      return new Response(JSON.stringify(inventoryState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
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

  it('shows profile stats, achievements and a header settings button', async () => {
    mockProfileFetch(telegramProfile);

    renderProfile();

    const statsLabel = await screen.findByText('Статистика');
    const equipmentLabel = screen.getByText('Экипировка');
    const achievementsLabel = screen.getByText('Достижения (1/2)');
    expect(screen.getByText('Уровень: Новичок')).toBeInTheDocument();
    expect(screen.getByText('Монеты')).toBeInTheDocument();
    expect(screen.getByText('Звёзды')).toBeInTheDocument();
    expect(screen.getByText('Опыт')).toBeInTheDocument();
    expect(
      await screen.findByText((text) => text.replace(/\s/g, '') === '1000'),
    ).toBeInTheDocument();
    expect(await screen.findByText('77')).toBeInTheDocument();
    expect(screen.queryByText('Ранг')).not.toBeInTheDocument();
    expect(screen.getByText('Броски')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Голы')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('Точность')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Дней подряд')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.queryByText('Вратарей пройдено')).not.toBeInTheDocument();
    expect(screen.queryByText('Аккаунт и хват игрока')).not.toBeInTheDocument();
    expect(screen.queryByText('Уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Пуш-уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Обратная связь')).not.toBeInTheDocument();
    expect(screen.queryByText('Форма обратной связи')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Тестовый пуш/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Первая шайба.*получено/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Билет в любители.*не получено/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Первый гол всегда самый шумный.')).not.toBeInTheDocument();
    expect(statsLabel.compareDocumentPosition(achievementsLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(statsLabel.compareDocumentPosition(equipmentLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(equipmentLabel.compareDocumentPosition(achievementsLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(screen.getByRole('button', { name: /Первая шайба.*получено/i }));
    expect(screen.getByRole('dialog', { name: 'Первая шайба' })).toBeInTheDocument();
    expect(screen.getByText('Первый гол всегда самый шумный.')).toBeInTheDocument();
    expect(screen.getByText(/Забить 1 гол/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Понятно' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Первая шайба' })).not.toBeInTheDocument();

    const settingsButton = screen.getByRole('button', { name: 'Настройки' });
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

    expect(await screen.findByText('Статистика')).toBeInTheDocument();
    expect(screen.queryByText('Уведомления')).not.toBeInTheDocument();
    expect(screen.queryByText('Пуш-уведомления')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /уведомления/i })).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => getFetchUrl(call[0]));
    expect(urls.some((url) => url.includes('/api/push/'))).toBe(false);
  });
});
