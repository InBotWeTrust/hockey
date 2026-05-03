import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminScreen } from './AdminScreen.js';
import { useAuthStore } from '../auth/authStore.js';

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

function makeAdminUser() {
  return {
    id: 'u1',
    displayName: 'Regular Player',
    avatarUrl: null,
    displaySource: 'telegram',
    role: 'player',
    grip: 'right',
    level: 1,
    xp: 0,
    timezone: 'Europe/Moscow',
    createdAt: '2026-05-01T10:00:00.000Z',
    lastSeenAt: null,
    isBlocked: false,
    blockedAt: null,
    blockedBy: null,
    blockedByDisplayName: null,
    lifetimeShotsTotal: 12,
    lifetimeGoalsTotal: 6,
    accuracy: 50,
    competitionLevel: 'beginner',
    identities: [
      {
        source: 'custom',
        label: 'Кастом',
        displayName: 'Regular Player',
        avatarUrl: null,
        id: 'u1',
        username: null,
        linked: true,
        active: false,
      },
      {
        source: 'telegram',
        label: 'TG',
        displayName: 'Regular Player',
        avatarUrl: null,
        id: '42',
        username: 'regular',
        linked: true,
        active: true,
      },
      {
        source: 'vk',
        label: 'VK',
        displayName: 'VK',
        avatarUrl: null,
        id: null,
        username: null,
        linked: false,
        active: false,
      },
    ],
    providers: { telegram: { id: '42', username: 'regular' }, vk: null },
    wallet: {
      shotsCurrent: 25,
      shotsMax: 25,
      shotsBonus: 0,
      pucks: 0,
      goldPucks: 0,
      wheelSpins: 2,
      trainingEnergy: 0,
    },
    pushNotifications: {
      subscribed: true,
      subscriptionCount: 1,
      types: {
        chatNewDialogMessage: true,
        dailyGame: true,
        trainingAvailable: false,
        gameNews: true,
      },
    },
  };
}

function makeNotificationStats() {
  return {
    totalUsers: 2,
    subscribed: { count: 1, percent: 50 },
    types: {
      chatNewDialogMessage: { count: 1, percent: 50 },
      dailyGame: { count: 1, percent: 50 },
      trainingAvailable: { count: 0, percent: 0 },
      gameNews: { count: 1, percent: 50 },
    },
  };
}

describe('AdminScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('starts with dashboard and renders game settings for admins', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(
          JSON.stringify({
            users: {
              total: 2,
              admins: 1,
              notifications: makeNotificationStats(),
            },
            lifetime: { shots: 12, goals: 6 },
            active: { daily: 0, training: 0 },
            last24h: { shots: 0, goals: 0, mismatches: 0 },
            dashboard: {
              period: '30d',
              periodDays: 30,
              users: {
                total: 2,
                admins: 1,
                players: 1,
                newToday: 1,
                new7d: 1,
                new30d: 1,
                new365d: 1,
                newInPeriod: 1,
                activeToday: 1,
                activeYesterday: 0,
                active7d: 1,
                active30d: 1,
                active365d: 1,
                activeInPeriod: 1,
                activated: { count: 1, percent: 50 },
              },
              payments: {
                revenueTodayRub: 0,
                revenue30dRub: 100,
                revenuePeriodRub: 100,
                revenueMonthRub: 100,
                revenueQuarterRub: 100,
                revenueYearRub: 100,
                revenueTotalRub: 100,
                paidUsersTotal: 1,
                paidUsers30d: 1,
                paidUsersPeriod: 1,
                paidPayments30d: 1,
                paidPaymentsPeriod: 1,
                payerConversionPercent: 50,
                arpu30dRub: 50,
                arppu30dRub: 100,
                arpuPeriodRub: 50,
                arppuPeriodRub: 100,
              },
              game: {
                shotsToday: 0,
                goalsToday: 0,
                shots7d: 12,
                goals7d: 6,
                shots30d: 12,
                goals30d: 6,
                shotsPeriod: 12,
                goalsPeriod: 6,
                shotsTotal: 12,
                goalsTotal: 6,
                accuracy30d: 50,
                accuracyPeriod: 50,
                dailyPlayers30d: 1,
                trainingPlayers30d: 0,
                dailyPlayersPeriod: 1,
                trainingPlayersPeriod: 0,
                activeDailyPools: 0,
                activeTrainingSessions: 0,
                mismatches30d: 0,
                mismatchesPeriod: 0,
              },
              chat: {
                messagesToday: 0,
                messages7d: 0,
                messages30d: 0,
                activeUsers30d: 0,
                messagesPeriod: 0,
                activeUsersPeriod: 0,
              },
              feedback: { total: 1, unread: 1 },
              inventory: { activeItems: 0 },
              engagement: {
                avgDailyActivitySpanMinutes: 0,
                dauWauPercent: 100,
                wauMauPercent: 100,
              },
              notifications: makeNotificationStats(),
              series: [
                {
                  date: '2026-05-03T00:00:00.000Z',
                  newUsers: 1,
                  activeUsers: 1,
                  revenueRub: 100,
                  shots: 12,
                  goals: 6,
                  messages: 0,
                },
              ],
            },
            gameCoreVersion: 3,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/feedback/fb1')) {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : { isRead: true };
        return new Response(
          JSON.stringify({
            feedback: {
              id: 'fb1',
              userId: 'u1',
              userDisplayName: 'Regular Player',
              userAvatarUrl: null,
              kind: 'review',
              rating: 4,
              message: 'Очень нравится ежедневная игра.',
              isRead: body.isRead,
              readAt: body.isRead ? '2026-05-03T08:10:00.000Z' : null,
              readBy: body.isRead ? 'admin' : null,
              readByDisplayName: body.isRead ? 'Egor' : null,
              createdAt: '2026-05-03T08:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/channel/posts/p1')) {
        return new Response(
          JSON.stringify({
            post: {
              id: 'p1',
              content:
                typeof init?.body === 'string' ? JSON.parse(init.body).content : 'Новый текст',
            },
            ok: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/channel/news')) {
        return new Response(
          JSON.stringify({
            channel: {
              id: 'news',
              name: 'Новости игры',
              slug: 'news',
              createdAt: '2026-05-01T10:00:00.000Z',
            },
            period: '30d',
            summary: {
              totalUsers: 2,
              posts: 1,
              comments: 3,
              reactions: 4,
              likes: 2,
              viewEvents: 2,
              views: 5,
              engagedUsers: 2,
              engagementRate: 100,
            },
            periods: [
              {
                periodStart: '2026-05-03T00:00:00.000Z',
                posts: 1,
                comments: 3,
                commenters: 2,
                reactions: 4,
                reactors: 2,
                likes: 2,
                viewEvents: 2,
                views: 5,
                viewers: 2,
                engagedUsers: 2,
                engagementRate: 100,
              },
            ],
            posts: [
              {
                id: 'p1',
                chatId: 'news',
                content: '**Жирный пост**',
                createdAt: '2026-05-03T08:00:00.000Z',
                updatedAt: '2026-05-03T08:00:00.000Z',
                comments: 3,
                commenters: 2,
                reactionsCount: 4,
                reactionUsers: 2,
                likes: 2,
                views: 5,
                viewers: 2,
                reactions: [{ emoji: '👍', count: 2 }],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/feedback')) {
        return new Response(
          JSON.stringify({
            feedback: [
              {
                id: 'fb1',
                userId: 'u1',
                userDisplayName: 'Regular Player',
                userAvatarUrl: null,
                kind: 'review',
                rating: 4,
                message: 'Очень нравится ежедневная игра.',
                isRead: false,
                readAt: null,
                readBy: null,
                readByDisplayName: null,
                createdAt: '2026-05-03T08:00:00.000Z',
              },
            ],
            total: 1,
            unreadCount: 2,
            limit: 50,
            offset: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/mismatches')) {
        return new Response(
          JSON.stringify({
            period: '30d',
            periodDays: 30,
            total: 1,
            periodTotal: 1,
            last24h: 1,
            usersAffected: 1,
            logs: [
              {
                id: 'm1',
                userId: 'u1',
                userDisplayName: 'Regular Player',
                userAvatarUrl: null,
                createdAt: '2026-05-03T08:00:00.000Z',
                mode: 'daily',
                sessionId: 'session-1',
                shotSessionId: 'shot-1',
                periodNumber: 2,
                shotIndex: 7,
                claimedResult: 'goal',
                serverResult: 'save',
                gameCoreVersion: 42,
                payload: {
                  mode: 'daily',
                  day_pool_id: 'session-1',
                  period_number: 2,
                  shot_index: 7,
                  claimed_result: 'goal',
                  server_result: 'save',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/notifications/news.posted')) {
        return new Response(
          JSON.stringify({
            notification: {
              key: 'news.posted',
              category: 'news',
              title:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body).title
                  : 'Большая новость',
              body:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body).body
                  : '{{postContent}}',
              trigger:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body).trigger
                  : 'Публикация новости',
              clickUrl:
                typeof init?.body === 'string' ? JSON.parse(init.body).clickUrl : '/chat/{{chatId}}',
              isEnabled:
                typeof init?.body === 'string' ? JSON.parse(init.body).isEnabled : true,
              updatedAt: '2026-05-03T08:10:00.000Z',
              updatedBy: 'admin',
              updatedByDisplayName: 'Egor',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/notifications')) {
        return new Response(
          JSON.stringify({
            notifications: [
              {
                key: 'news.posted',
                category: 'news',
                title: 'Новости игры',
                body: '{{postContent}}',
                trigger: 'Админ публикует новый пост в новостном канале.',
                clickUrl: '/chat/{{chatId}}',
                isEnabled: true,
                updatedAt: '2026-05-03T08:00:00.000Z',
                updatedBy: null,
                updatedByDisplayName: null,
              },
              {
                key: 'training.available',
                category: 'training',
                title: 'Тренировка доступна',
                body: 'Можно снова потренироваться.',
                trigger: 'Через 24 часа после прошлой тренировки.',
                clickUrl: '/',
                isEnabled: false,
                updatedAt: '2026-05-03T08:00:00.000Z',
                updatedBy: null,
                updatedByDisplayName: null,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/users/u1')) {
        return new Response(
          JSON.stringify({
            user: makeAdminUser(),
            purchaseSummary: { totalRubSpent: 0, purchasesCount: 0 },
            purchases: [],
            achievements: [],
            shotModes: [],
            events: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [makeAdminUser()],
            total: 1,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/game-settings')) {
        return new Response(
          JSON.stringify({
            gameCoreVersion: 3,
            settings: [
              {
                key: 'daily.period_1.goal_frequency',
                label: 'Скорость ворот',
                description: '',
                type: 'number',
                defaultValue: 0.55,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.55,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.goalie_frequency',
                label: 'Скорость вратаря',
                description: '',
                type: 'number',
                defaultValue: 0.65,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.65,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.shooter_frequency',
                label: 'Скорость игрока',
                description: '',
                type: 'number',
                defaultValue: 0.8,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.8,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.puck_speed_per_ms',
                label: 'Скорость шайбы',
                description: '',
                type: 'number',
                defaultValue: 1.3,
                min: 0.2,
                max: 5,
                step: 0.01,
                value: 1.3,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'training.shots_limit',
                label: 'Лимит тренировки',
                description: '',
                type: 'number',
                defaultValue: 500,
                min: 1,
                max: 1000,
                value: 500,
                updatedAt: null,
                updatedBy: null,
              },
            ],
            balance: { goalies: [], sticks: [], dailyPeriodSpeedPresets: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    renderAdmin();

    expect(screen.queryByRole('button', { name: 'Обзор' })).not.toBeInTheDocument();
    expect((await screen.findAllByText('Дашборд')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Ultimate Hockey')).toBeInTheDocument();
    expect(await screen.findByText('Активные пользователи')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Период дашборда' }));
    fireEvent.click(await screen.findByRole('option', { name: '90 дней' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/summary?period=90d', expect.any(Object)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Игроки' }));
    expect(await screen.findByText('Игроки (1)')).toBeInTheDocument();
    expect(screen.queryByText('1 из 2 пользователей')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Отзывы (2)' })).toBeInTheDocument();
    expect(await screen.findByText('Regular Player')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Канал' }));
    expect(await screen.findByText('Новостной канал')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Вовлеченность/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Посты/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Вовлеченность/ }));
    expect(await screen.findByText('Вовлеченность по дням')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(await screen.findByRole('button', { name: /Посты/ }));
    expect(await screen.findByText('Жирный пост')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать пост' }));
    fireEvent.change(await screen.findByLabelText('Текст поста'), {
      target: { value: '__Новый текст__' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/channel/posts/p1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ content: '__Новый текст__' }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Удалить пост' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/channel/posts/p1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Античит' }));
    expect(await screen.findByText('Логи (1)')).toBeInTheDocument();
    expect(await screen.findByText('Regular Player')).toBeInTheDocument();
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    expect(screen.getByText('Бросок')).toBeInTheDocument();
    expect(screen.getByText('Сейв')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Уведомления' }));
    expect(await screen.findByText('Уведомления (2)')).toBeInTheDocument();
    expect(await screen.findByText('Новости игры')).toBeInTheDocument();
    expect(screen.getByText('/chat/{{chatId}}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать Новости игры' }));
    fireEvent.change(await screen.findByLabelText('Заголовок'), {
      target: { value: 'Большая новость' },
    });
    fireEvent.change(await screen.findByLabelText('Текст'), {
      target: { value: 'Матч уже в игре' },
    });
    fireEvent.change(await screen.findByLabelText('Триггер'), {
      target: { value: 'Публикация новости' },
    });
    fireEvent.change(await screen.findByLabelText('Путь при клике'), {
      target: { value: '/chat/news' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/notifications/news.posted',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            title: 'Большая новость',
            body: 'Матч уже в игре',
            trigger: 'Публикация новости',
            clickUrl: '/chat/news',
            isEnabled: true,
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отзывы (2)' }));
    expect(await screen.findByText('Обратная связь (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Непрочитанные').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Очень нравится ежедневная игра.')).toBeInTheDocument();
    expect(screen.queryByText('Новое')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Прочитать' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/feedback/fb1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isRead: true }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Игроки' }));

    fireEvent.click(screen.getByText('Regular Player'));
    expect(await screen.findByText('В игре с 01.05.2026')).toBeInTheDocument();
    expect(await screen.findByText('Первое сообщение в личке')).toBeInTheDocument();
    expect(screen.getByText('Истории покупок пока нет.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /параметры/i }));
    expect(await screen.findByText('Ежедневная игра')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ежедневная игра'));
    expect(await screen.findByText('Скорости 1-го периода')).toBeInTheDocument();
    expect(screen.queryByText('Скорость ворот')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Скорости 1-го периода/i }));
    expect(await screen.findByText('Скорость ворот')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(await screen.findByText('Тренировка'));
    expect(await screen.findByText('Лимит тренировки')).toBeInTheDocument();
  });

  it('shows access denial for players', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'Player', role: 'player' },
    });

    renderAdmin();

    expect(screen.getByText('Нет доступа')).toBeInTheDocument();
  });
});
