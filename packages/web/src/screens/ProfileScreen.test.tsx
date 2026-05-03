import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

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
    if (url.endsWith('/api/push/config')) {
      return new Response(JSON.stringify({ supported: true, publicKey: 'test-key' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/push/preferences')) {
      const preferences = {
        chatNewDialogMessage: true,
        dailyGame: true,
        trainingAvailable: true,
        gameNews: true,
      };
      const patch =
        init?.method === 'PATCH' && typeof init.body === 'string'
          ? (JSON.parse(init.body) as Partial<typeof preferences>)
          : {};
      return new Response(JSON.stringify({ ...preferences, ...patch }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/push/test')) {
      return new Response(JSON.stringify({ total: 1, sent: 1, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/feedback') && init?.method === 'POST') {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      return new Response(
        JSON.stringify({
          feedback: {
            id: 'feedback-1',
            ...body,
            rating: body.kind === 'review' ? body.rating : null,
            isRead: false,
            createdAt: '2026-05-03T08:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
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
    const achievementsLabel = screen.getByText('Достижения (1/2)');
    expect(screen.getByText('Новичок')).toBeInTheDocument();
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
    expect(screen.getByText('Уведомления')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Включить уведомления/i })).toBeInTheDocument();
    const notificationSettings = await screen.findByRole('button', {
      name: 'Настройки уведомлений',
    });
    expect(notificationSettings).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('switch', { name: 'Первое сообщение в личке' }),
    ).not.toBeInTheDocument();
    fireEvent.click(notificationSettings);
    expect(screen.getByRole('switch', { name: 'Первое сообщение в личке' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Ежедневная игра' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Тренировка доступна' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Новости игры' })).toBeInTheDocument();
    expect(screen.getByText('Обратная связь')).toBeInTheDocument();
    expect(screen.getByText('Форма обратной связи')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Тестовый пуш/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Первая шайба.*получено/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Билет в любители.*не получено/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Первый гол всегда самый шумный.')).not.toBeInTheDocument();
    expect(statsLabel.compareDocumentPosition(achievementsLabel)).toBe(
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

  it('shows a test push button for admins', async () => {
    mockProfileFetch({ ...telegramProfile, role: 'admin' });

    renderProfile();

    const testButton = await screen.findByRole('button', { name: /Тестовый пуш/i });
    fireEvent.click(testButton);

    expect(await screen.findByText('Тестовый пуш отправлен')).toBeInTheDocument();
  });

  it('saves push preference switches', async () => {
    const fetchMock = mockProfileFetch(telegramProfile);

    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Настройки уведомлений' }));
    const chatSwitch = await screen.findByRole('switch', { name: 'Первое сообщение в личке' });
    fireEvent.click(chatSwitch);

    expect(await screen.findByRole('switch', { name: 'Первое сообщение в личке' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/push/preferences',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ chatNewDialogMessage: false }),
      }),
    );
  });

  it('submits feedback from the profile modal', async () => {
    const fetchMock = mockProfileFetch(telegramProfile);

    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: 'Написать в обратную связь' }));
    expect(screen.getByRole('dialog', { name: 'Обратная связь' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '0 из 5' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: '5 из 5' }));
    fireEvent.change(screen.getByLabelText('Сообщение'), {
      target: { value: 'Очень нравится новый режим.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText('Спасибо, сообщение сохранено')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'review',
          rating: 5,
          message: 'Очень нравится новый режим.',
        }),
      }),
    );
  });
});
