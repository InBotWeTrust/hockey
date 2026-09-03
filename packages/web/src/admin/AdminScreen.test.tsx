import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  return { promise: new Promise<Response>((next) => (resolve = next)), resolve };
}

function openAdminMenu(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Открыть меню администратора' }));
  return screen.getByRole('dialog', { name: 'Меню администратора' });
}

function selectAdminSection(name: string | RegExp): void {
  const menu = openAdminMenu();
  fireEvent.click(within(menu).getByRole('button', { name }));
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
    experience: 0,
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
    beginnerOnboardingCompleted: true,
    amateurOnboardingCompleted: true,
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
      coins: 0,
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

it('saves onboarding flags independently and updates persisted display only from server read-back', async () => {
  useAuthStore.getState().setSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin', displayName: 'Egor', role: 'admin' },
  });
  let patchBody: Record<string, unknown> | null = null;
  let authoritativeUser = makeAdminUser();
  const pendingDetail = deferredResponse();
  let detailRequested = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/admin/summary')) return new Response(JSON.stringify(makeAdminSummary()));
    if (url.includes('/admin/feedback')) {
      return new Response(
        JSON.stringify({
          feedback: [],
          total: 0,
          unreadCount: 0,
          ratingStats: { count: 0, average: null },
        }),
      );
    }
    if (url.endsWith('/admin/users/u1') && init?.method === 'PATCH') {
      patchBody = JSON.parse(String(init.body));
      authoritativeUser = { ...authoritativeUser, beginnerOnboardingCompleted: false };
      return new Response(JSON.stringify({ user: authoritativeUser }));
    }
    if (url.endsWith('/admin/users/u1')) {
      if (!detailRequested) {
        detailRequested = true;
        return pendingDetail.promise;
      }
      return new Response(
        JSON.stringify({
          user: authoritativeUser,
          purchaseSummary: { totalRubSpent: 0, purchasesCount: 0 },
          purchases: [],
          achievements: [],
          shotModes: [],
          events: [],
        }),
      );
    }
    if (url.includes('/admin/users')) {
      return new Response(
        JSON.stringify({
          users: [authoritativeUser],
          total: 1,
          limit: 20,
          offset: 0,
          notificationStats: makeNotificationStats(),
        }),
      );
    }
    return new Response('{}');
  });

  renderAdmin();
  fireEvent.click(await screen.findByRole('button', { name: 'Игроки' }));
  fireEvent.click(await screen.findByRole('button', { name: /Regular Player/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Игрок Regular Player' });
  expect(within(dialog).getByTestId('beginner-onboarding-status')).toHaveTextContent('Пройден');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Редактировать' }));
  const beginner = within(dialog).getByRole('checkbox', { name: 'Онбординг новичка пройден' });
  const amateur = within(dialog).getByRole('checkbox', { name: 'Онбординг любителя пройден' });
  expect(beginner).toBeChecked();
  expect(amateur).toBeChecked();
  fireEvent.click(beginner);
  expect(within(dialog).getByTestId('beginner-onboarding-status')).toHaveTextContent('Пройден');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Применить' }));

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toMatchObject({
    beginnerOnboardingCompleted: false,
    amateurOnboardingCompleted: true,
  });
  await waitFor(() =>
    expect(within(dialog).getByTestId('beginner-onboarding-status')).toHaveTextContent(
      'Не пройден',
    ),
  );
  expect(within(dialog).getByTestId('amateur-onboarding-status')).toHaveTextContent('Пройден');
  pendingDetail.resolve(
    new Response(
      JSON.stringify({
        user: makeAdminUser(),
        purchaseSummary: { totalRubSpent: 0, purchasesCount: 0 },
        purchases: [],
        achievements: [],
        shotModes: [],
        events: [],
      }),
    ),
  );
  await Promise.resolve();
  expect(within(dialog).getByTestId('beginner-onboarding-status')).toHaveTextContent('Не пройден');
});

it('keeps edit mode and authoritative onboarding display when player save fails', async () => {
  useAuthStore.getState().setSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin', displayName: 'Egor', role: 'admin' },
  });
  const user = makeAdminUser();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/admin/summary')) return new Response(JSON.stringify(makeAdminSummary()));
    if (url.includes('/admin/feedback'))
      return new Response(
        JSON.stringify({
          feedback: [],
          total: 0,
          unreadCount: 0,
          ratingStats: { count: 0, average: null },
        }),
      );
    if (url.endsWith('/admin/users/u1') && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ error: { code: 'failed', message: 'Не сохранено' } }), {
        status: 500,
      });
    }
    if (url.endsWith('/admin/users/u1'))
      return new Response(
        JSON.stringify({
          user,
          purchaseSummary: { totalRubSpent: 0, purchasesCount: 0 },
          purchases: [],
          achievements: [],
          shotModes: [],
          events: [],
        }),
      );
    if (url.includes('/admin/users'))
      return new Response(
        JSON.stringify({
          users: [user],
          total: 1,
          limit: 20,
          offset: 0,
          notificationStats: makeNotificationStats(),
        }),
      );
    return new Response('{}');
  });
  renderAdmin();
  fireEvent.click(await screen.findByRole('button', { name: 'Игроки' }));
  fireEvent.click(await screen.findByRole('button', { name: /Regular Player/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Игрок Regular Player' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Редактировать' }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Онбординг новичка пройден' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Применить' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось выполнить запрос');
  expect(
    within(dialog).getByRole('checkbox', { name: 'Онбординг новичка пройден' }),
  ).not.toBeChecked();
  expect(within(dialog).getByTestId('beginner-onboarding-status')).toHaveTextContent('Пройден');
});

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

function makeAdminSummary() {
  return {
    users: {
      total: 1,
      admins: 1,
      players: 0,
      newToday: 0,
      new7d: 0,
      new30d: 0,
      new365d: 0,
      newInPeriod: 0,
      activeToday: 0,
      activeYesterday: 0,
      active7d: 0,
      active30d: 0,
      active365d: 0,
      activeInPeriod: 0,
      activated: { count: 0, percent: 0 },
      notifications: makeNotificationStats(),
    },
    lifetime: { shots: 0, goals: 0 },
    active: { daily: 0, training: 0 },
    last24h: { shots: 0, goals: 0, mismatches: 0 },
    dashboard: {
      period: '30d',
      periodDays: 30,
      users: {
        total: 1,
        admins: 1,
        players: 0,
        newToday: 0,
        new7d: 0,
        new30d: 0,
        new365d: 0,
        newInPeriod: 0,
        activeToday: 0,
        activeYesterday: 0,
        active7d: 0,
        active30d: 0,
        active365d: 0,
        activeInPeriod: 0,
        activated: { count: 0, percent: 0 },
      },
      payments: {
        revenueTodayRub: 0,
        revenue30dRub: 0,
        revenuePeriodRub: 0,
        revenueMonthRub: 0,
        revenueQuarterRub: 0,
        revenueYearRub: 0,
        revenueTotalRub: 0,
        paidUsersTotal: 0,
        paidUsers30d: 0,
        paidUsersPeriod: 0,
        paidPayments30d: 0,
        paidPaymentsPeriod: 0,
        payerConversionPercent: 0,
        arpu30dRub: 0,
        arppu30dRub: 0,
        arpuPeriodRub: 0,
        arppuPeriodRub: 0,
      },
      game: {
        shotsToday: 0,
        goalsToday: 0,
        shots7d: 0,
        goals7d: 0,
        shots30d: 0,
        goals30d: 0,
        shotsPeriod: 0,
        goalsPeriod: 0,
        shotsTotal: 0,
        goalsTotal: 0,
        accuracy30d: 0,
        accuracyPeriod: 0,
        dailyPlayers30d: 0,
        trainingPlayers30d: 0,
        dailyPlayersPeriod: 0,
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
      feedback: { total: 0, unread: 0 },
      inventory: { activeItems: 1 },
      engagement: {
        avgDailyActivitySpanMinutes: 0,
        dauWauPercent: 0,
        wauMauPercent: 0,
      },
      notifications: makeNotificationStats(),
      series: [],
    },
    gameCoreVersion: 1,
  };
}

describe('AdminScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('keeps onboarding as a top-level admin tab', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    renderAdmin();
    expect(screen.getByRole('button', { name: 'Онбординг' })).toBeInTheDocument();
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
      if (url.includes('/admin/communications/dialogs')) {
        return new Response(
          JSON.stringify({
            unreadCount: 1,
            nextOffset: null,
            dialogs: [
              {
                chatId: '11111111-1111-4111-8111-111111111111',
                status: 'open',
                isNew: true,
                player: {
                  userId: 'u1',
                  displayName: 'Regular Player',
                  avatarUrl: null,
                  telegramId: '42',
                  vkId: null,
                },
                lastMessage: {
                  id: 'm1',
                  content: 'Нужна помощь',
                  createdAt: '2026-05-03T08:00:00.000Z',
                  fromOfficial: false,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/communications/official-account')) {
        return new Response(
          JSON.stringify({
            id: 'official',
            displayName: 'Ультимейт Хоккей',
            avatarUrl: '/icons/official-account.webp',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/tournaments/pending-applications')) {
        return new Response(JSON.stringify({ count: 2 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
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
            ratingStats: { count: 1, average: 4 },
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
                gameCoreVersion: 43,
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
      if (url.includes('/admin/duels/history')) {
        return new Response(JSON.stringify({ duels: [], total: 0, limit: 25, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/duel-templates')) {
        return new Response(
          JSON.stringify({
            templates: [
              {
                id: 'duel-template-1',
                title: 'Микс',
                description: 'Два периода: первый с лимитом 30 бросков, второй на скорость.',
                duelKind: 'express_plus',
                duelVariant: 'classic',
                isActive: true,
                startsAt: '2026-01-01T00:00:00.000Z',
                endsAt: '2100-01-01T00:00:00.000Z',
                totalPeriods: 2,
                shotsPerPeriod: 30,
                periodDurationMs: 180_000,
                breakDurationMs: 120_000,
                goalieId: 'rookie',
                periodSpeedPresets: [],
                periodRules: null,
                stakeAmount: 0,
                entryFeeAmount: 0,
                requiredInventoryItemId: null,
                inventoryChargesPerPeriod: 0,
                rankedEnabled: true,
                matchmakingEnabled: true,
                challengeTtlMs: 1_800_000,
                readyDurationMs: 300_000,
                readyNoShowCooldownMs: 300_000,
                matchmakingTimeoutMs: 300_000,
                rankedDailyLimit: 20,
                rankedSameOpponentLimit: 5,
                powerCap: 100,
                winPoints: 3,
                drawPoints: 1,
                winCurrencyReward: 5,
                drawCurrencyReward: 1,
                winStarReward: 2,
                createdAt: '2026-05-03T08:00:00.000Z',
                updatedAt: '2026-05-03T08:00:00.000Z',
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
                typeof init?.body === 'string' ? JSON.parse(init.body).title : 'Большая новость',
              body: typeof init?.body === 'string' ? JSON.parse(init.body).body : '{{postContent}}',
              trigger:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body).trigger
                  : 'Публикация новости',
              clickUrl:
                typeof init?.body === 'string'
                  ? JSON.parse(init.body).clickUrl
                  : '/chat/{{chatId}}',
              isEnabled: typeof init?.body === 'string' ? JSON.parse(init.body).isEnabled : true,
              updatedAt: '2026-05-03T08:10:00.000Z',
              updatedBy: 'admin',
              updatedByDisplayName: 'Egor',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/push-monitoring')) {
        return new Response(
          JSON.stringify({
            generatedAt: '2026-05-03T08:15:00.000Z',
            overview: {
              totalDeliveries: 3,
              queued: 1,
              processing: 0,
              sent: 2,
              partial: 0,
              failed: 0,
              skipped: 0,
              dueQueued: 1,
              staleProcessing: 0,
              subscriptionCount: 2,
              subscriptionSentCount: 2,
              subscriptionFailedCount: 0,
              clickedDeliveryCount: 1,
              clickCount: 1,
              failed24h: 0,
              partial24h: 0,
              sent24h: 2,
              skipped24h: 0,
              deliveryClickRate: 50,
              subscriptionClickRate: 50,
              oldestQueuedAt: '2026-05-03T08:00:00.000Z',
              oldestQueuedAgeSeconds: 900,
            },
            alerts: [],
            byStatus: [
              { status: 'queued', count: 1 },
              { status: 'processing', count: 0 },
              { status: 'sent', count: 2 },
              { status: 'partial', count: 0 },
              { status: 'failed', count: 0 },
              { status: 'skipped', count: 0 },
            ],
            byEventType: [
              {
                eventType: 'news.posted',
                total: 2,
                queued: 0,
                processing: 0,
                sent: 2,
                partial: 0,
                failed: 0,
                skipped: 0,
                subscriptionCount: 2,
                subscriptionSentCount: 2,
                subscriptionFailedCount: 0,
                clickedDeliveryCount: 1,
                clickCount: 1,
                deliveryClickRate: 50,
                subscriptionClickRate: 50,
                lastCreatedAt: '2026-05-03T08:00:00.000Z',
                lastUpdatedAt: '2026-05-03T08:10:00.000Z',
              },
            ],
            recent: [
              {
                id: 'delivery-1',
                userId: 'u1',
                userDisplayName: 'Regular Player',
                eventType: 'news.posted',
                eventKey: 'news:p1:u1',
                status: 'sent',
                attemptCount: 1,
                subscriptionCount: 1,
                sentCount: 1,
                failedCount: 0,
                clickCount: 1,
                clickedAt: '2026-05-03T08:12:00.000Z',
                lastErrorMessage: null,
                nextAttemptAt: '2026-05-03T08:00:00.000Z',
                createdAt: '2026-05-03T08:00:00.000Z',
                updatedAt: '2026-05-03T08:12:00.000Z',
              },
            ],
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
                defaultValue: 0.5,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.5,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.goalie_frequency',
                label: 'Скорость вратаря',
                description: '',
                type: 'number',
                defaultValue: 0.6,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.6,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.shooter_frequency',
                label: 'Скорость игрока',
                description: '',
                type: 'number',
                defaultValue: 0.75,
                min: 0.1,
                max: 3,
                step: 0.01,
                value: 0.75,
                updatedAt: null,
                updatedBy: null,
              },
              {
                key: 'daily.period_1.puck_speed_per_ms',
                label: 'Скорость шайбы',
                description: '',
                type: 'number',
                defaultValue: 1.25,
                min: 0.2,
                max: 5,
                step: 0.01,
                value: 1.25,
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
              {
                key: 'training.daily_cooldown_minutes',
                label: 'Блокировка дневной игры',
                description:
                  'Сколько минут дневная игра закрыта после первого броска в тренировке.',
                type: 'number',
                defaultValue: 30,
                min: 0,
                max: 1440,
                value: 30,
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
    expect((await screen.findAllByText('Обзор')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Ультимейт Хоккей')).toBeInTheDocument();
    expect(await screen.findByText('Активные пользователи')).toBeInTheDocument();
    expect(await screen.findByText('Активность за день и неделю')).toBeInTheDocument();
    expect(await screen.findByText('Выручка на игрока')).toBeInTheDocument();
    expect(screen.getByText('За 7 дней: 1 · за год: 1')).toBeInTheDocument();
    expect(screen.getByText('От первого до последнего входа за день')).toBeInTheDocument();
    expect(screen.getByText('0 авторов за 30 дней')).toBeInTheDocument();
    expect(screen.queryByText(/7д|среднее окно активности|1 авторов/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DAU|WAU|MAU|ARPU|ARPPU|Фидбек/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Период обзора' }));
    fireEvent.click(await screen.findByRole('option', { name: '90 дней' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/summary?period=90d', expect.any(Object)),
    );
    expect(screen.queryByRole('dialog', { name: 'Меню администратора' })).not.toBeInTheDocument();
    const adminMenu = openAdminMenu();
    const adminNavigation = within(adminMenu).getByRole('navigation', {
      name: 'Разделы администратора',
    });
    expect(within(adminNavigation).getAllByRole('button')).toHaveLength(13);
    expect(within(adminNavigation).getByRole('button', { name: 'Обзор' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(adminNavigation).getByRole('button', { name: 'Игроки' }));
    expect(screen.queryByRole('dialog', { name: 'Меню администратора' })).not.toBeInTheDocument();
    expect(await screen.findByText('Игроки (1)')).toBeInTheDocument();
    expect(screen.queryByText('1 из 2 пользователей')).not.toBeInTheDocument();
    expect(await screen.findByText('Regular Player')).toBeInTheDocument();

    const menuWithUnreadCount = openAdminMenu();
    expect(
      within(menuWithUnreadCount).getByRole('button', { name: 'Отзывы (2)' }),
    ).toBeInTheDocument();
    expect(
      within(menuWithUnreadCount).getByRole('button', { name: 'Турниры (2)' }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(menuWithUnreadCount).getByRole('button', {
        name: 'Закрыть меню администратора',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Меню администратора' })).not.toBeInTheDocument();

    openAdminMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Меню администратора' })).not.toBeInTheDocument();

    const menuClosedByBackdrop = openAdminMenu();
    fireEvent.mouseDown(menuClosedByBackdrop.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Меню администратора' })).not.toBeInTheDocument();

    selectAdminSection('Коммуникации');
    expect(screen.getByRole('tab', { name: 'Новости' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Диалоги' }));
    expect(await screen.findByText('Диалоги · новых 1')).toBeInTheDocument();
    expect(await screen.findByText('Нужна помощь')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Официальный аккаунт' }));
    expect(await screen.findByText(/Все администраторы отвечают/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Новости' }));
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

    selectAdminSection('Античит');
    expect(await screen.findByText('Логи (1)')).toBeInTheDocument();
    expect(await screen.findByText('Regular Player')).toBeInTheDocument();
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    expect(screen.getByText('Бросок')).toBeInTheDocument();
    expect(screen.getByText('Сейв')).toBeInTheDocument();

    selectAdminSection('Дуэли');
    expect(await screen.findByText('Шаблоны дуэлей (1)')).toBeInTheDocument();
    expect(await screen.findByText('Микс')).toBeInTheDocument();
    const duelStatus = screen.getByText('Активен');
    expect(duelStatus).toHaveStyle('align-self: start');
    expect(duelStatus).toHaveStyle('min-height: 34px');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать Микс' }));
    const duelDialog = await screen.findByRole('dialog', { name: 'Редактирование дуэли' });
    expect(within(duelDialog).getByText('Скорости по периодам')).toBeInTheDocument();
    expect(within(duelDialog).getAllByText('Скорость ворот')).toHaveLength(2);
    expect(within(duelDialog).getAllByText('Скорость вратаря')).toHaveLength(2);
    expect(within(duelDialog).getAllByText('Скорость игрока')).toHaveLength(2);
    expect(within(duelDialog).getAllByText('Скорость шайбы')).toHaveLength(2);
    expect(within(duelDialog).queryByText(/periodNumber/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    selectAdminSection('Уведомления');
    expect(await screen.findByText('Уведомления (2)')).toBeInTheDocument();
    expect(await screen.findByText('Мониторинг доставок')).toBeInTheDocument();
    expect(screen.getByText('Переходы 50%')).toBeInTheDocument();
    expect(screen.queryByText(/CTR/)).not.toBeInTheDocument();
    expect((await screen.findAllByText('Новости игры')).length).toBeGreaterThan(0);
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

    selectAdminSection('Отзывы (2)');
    expect(await screen.findByText('Обратная связь (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Непрочитанные').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Оценки')).toBeInTheDocument();
    expect(screen.getByText('Средняя')).toBeInTheDocument();
    expect(screen.getByText('4,0')).toBeInTheDocument();
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
    selectAdminSection('Игроки');

    fireEvent.click(screen.getByText('Regular Player'));
    expect(await screen.findByText('В игре с 01.05.2026')).toBeInTheDocument();
    expect(screen.getByText('МСК')).toBeInTheDocument();
    expect(screen.queryByText('Europe/Moscow')).not.toBeInTheDocument();
    expect(await screen.findByText('Первое сообщение в личке')).toBeInTheDocument();
    expect(screen.getByText('Истории покупок пока нет.')).toBeInTheDocument();

    selectAdminSection(/параметры/i);
    expect(await screen.findByText('Ежедневная игра')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ежедневная игра'));
    expect(await screen.findByText('Скорости 1-го периода')).toBeInTheDocument();
    expect(screen.queryByText('Скорость ворот')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Скорости 1-го периода/i }));
    expect(await screen.findByText('Скорость ворот')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(await screen.findByText('Тренировка'));
    expect(await screen.findByText('Лимит тренировки')).toBeInTheDocument();
    expect(await screen.findByText('Блокировка дневной игры')).toBeInTheDocument();
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

  it('round-trips every duel venue policy and saves challenge auto-cancel separately', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    let templatePatchBody: Record<string, unknown> | null = null;
    const duelTemplate = {
      id: 'duel-template-1',
      title: 'Классика',
      description: 'Три периода как ежедневная игра.',
      duelKind: 'classic',
      duelVariant: 'classic',
      isActive: true,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      totalPeriods: 3,
      shotsPerPeriod: 30,
      periodDurationMs: 300_000,
      breakDurationMs: 120_000,
      goalieId: 'rookie',
      periodSpeedPresets: [],
      periodRules: null,
      stakeAmount: 0,
      entryFeeAmount: 0,
      requiredInventoryItemId: null,
      inventoryChargesPerPeriod: 0,
      rankedEnabled: true,
      matchmakingEnabled: true,
      matchmakingVenuePolicy: 'neutral_default',
      challengeTtlMs: 1_800_000,
      readyDurationMs: 900_000,
      readyNoShowCooldownMs: 900_000,
      matchmakingTimeoutMs: 180_000,
      rankedDailyLimit: 100,
      rankedSameOpponentLimit: 100,
      powerCap: 100,
      winPoints: 3,
      drawPoints: 1,
      winCurrencyReward: 0,
      drawCurrencyReward: 0,
      winStarReward: 0,
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(JSON.stringify(makeAdminSummary()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/duels/history')) {
        return new Response(JSON.stringify({ duels: [], total: 0, limit: 25, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [],
            total: 0,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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
      if (url.includes('/admin/duel-templates/duel-template-1')) {
        templatePatchBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return new Response(JSON.stringify({ template: duelTemplate }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/duel-templates')) {
        return new Response(JSON.stringify({ templates: [duelTemplate] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();

    selectAdminSection('Дуэли');
    expect(await screen.findByText('Ответ 30 мин')).toBeInTheDocument();
    expect(screen.getByText('Ожидание 15 мин')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать Классика' }));

    const dialog = await screen.findByRole('dialog', { name: 'Редактирование дуэли' });
    expect(screen.getByLabelText('Площадка при автоматическом подборе')).toHaveTextContent(
      'Нейтральная стандартная',
    );
    fireEvent.click(screen.getByLabelText('Площадка при автоматическом подборе'));
    fireEvent.click(await screen.findByRole('option', { name: 'Случайный хозяин' }));
    expect(screen.getByLabelText('Площадка при автоматическом подборе')).toHaveTextContent(
      'Случайный хозяин',
    );
    fireEvent.click(screen.getByLabelText('Площадка при автоматическом подборе'));
    fireEvent.click(await screen.findByRole('option', { name: 'Случайная нейтральная' }));
    fireEvent.change(within(dialog).getByLabelText('Минут на ответ'), {
      target: { value: '15' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(templatePatchBody).not.toBeNull());
    const savedTemplatePatchBody = templatePatchBody as unknown as Record<string, unknown>;
    expect(savedTemplatePatchBody.challengeTtlMs).toBe(900_000);
    expect(savedTemplatePatchBody.readyDurationMs).toBe(900_000);
    expect(savedTemplatePatchBody.matchmakingVenuePolicy).toBe('random_unselected');
  });

  it('keeps the duel editor open and prevents duplicate submit while save is pending', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    let resolvePatch!: (response: Response) => void;
    const patchResponse = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    let patchCount = 0;
    const duelTemplate = {
      id: 'duel-template-1',
      title: 'Классика',
      description: 'Три периода как ежедневная игра.',
      duelKind: 'classic',
      duelVariant: 'classic',
      isActive: true,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      totalPeriods: 3,
      shotsPerPeriod: 30,
      periodDurationMs: 300_000,
      breakDurationMs: 120_000,
      goalieId: 'rookie',
      periodSpeedPresets: [],
      periodRules: null,
      stakeAmount: 0,
      entryFeeAmount: 0,
      requiredInventoryItemId: null,
      inventoryChargesPerPeriod: 0,
      rankedEnabled: true,
      matchmakingEnabled: true,
      matchmakingVenuePolicy: 'neutral_default',
      challengeTtlMs: 1_800_000,
      readyDurationMs: 900_000,
      readyNoShowCooldownMs: 900_000,
      matchmakingTimeoutMs: 180_000,
      rankedDailyLimit: 100,
      rankedSameOpponentLimit: 100,
      powerCap: 100,
      winPoints: 3,
      drawPoints: 1,
      winCurrencyReward: 0,
      drawCurrencyReward: 0,
      winStarReward: 0,
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(JSON.stringify(makeAdminSummary()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/duels/history')) {
        return new Response(JSON.stringify({ duels: [], total: 0, limit: 25, offset: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [],
            total: 0,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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
      if (url.includes('/admin/duel-templates/duel-template-1')) {
        patchCount += 1;
        return patchResponse;
      }
      if (url.includes('/admin/duel-templates')) {
        return new Response(JSON.stringify({ templates: [duelTemplate] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();
    selectAdminSection('Дуэли');
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать Классика' }));
    const dialog = await screen.findByRole('dialog', { name: 'Редактирование дуэли' });
    const saveButton = within(dialog).getByRole('button', { name: 'Сохранить' });
    saveButton.click();
    saveButton.click();
    await waitFor(() => expect(patchCount).toBe(1));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('dialog', { name: 'Редактирование дуэли' })).toBeInTheDocument();

    await act(async () => {
      resolvePatch(
        new Response(
          JSON.stringify({
            error: { code: 'internal_database_trace', message: 'password=secret stack trace' },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
      );
      await patchResponse;
    });
    expect(
      await within(dialog).findByText('Не удалось выполнить запрос. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/password=secret/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeEnabled();
  });

  it('saves inventory gameplay with comma decimal inputs', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    let itemPatchBody: Record<string, unknown> | null = null;
    let gameplayPatchBody: Record<string, unknown> | null = null;
    const inventoryItem = {
      id: '11111111-1111-1111-1111-111111111111',
      photoUrl: '/inventory/stick.webp',
      title: 'Ультимейт Ван 1',
      description: 'Комплект клюшек',
      priceRub: 1490,
      itemKind: 'stick',
      currencyPrice: 1490,
      chargesPerPurchase: 1300,
      lowStockThreshold: 10,
      duelPeriodCost: 0,
      effectPuckSpeedDelta: 0.1,
      effectShooterFrequencyDelta: 0,
      effectGoalieFrequencyDelta: 0,
      effectGoalFrequencyDelta: 0,
      effectShotZoneMultiplier: 1,
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
      paymentsCount: 0,
      paidRevenueRub: 0,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(JSON.stringify(makeAdminSummary()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [],
            total: 0,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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
      if (url.includes('/admin/inventory/11111111-1111-1111-1111-111111111111/gameplay')) {
        gameplayPatchBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/inventory/11111111-1111-1111-1111-111111111111')) {
        itemPatchBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return new Response(JSON.stringify({ item: inventoryItem }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/inventory')) {
        return new Response(JSON.stringify({ items: [inventoryItem] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();

    selectAdminSection('Инвентарь');
    expect(await screen.findByText('Ультимейт Ван 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    const dialog = await screen.findByRole('dialog', { name: 'Редактирование предмета' });
    const inputs = within(dialog).getAllByRole('textbox');
    fireEvent.change(inputs[3]!, { target: { value: '1490,00' } });
    fireEvent.change(inputs[4]!, { target: { value: '2490,00' } });
    fireEvent.change(within(dialog).getByLabelText(/Порог пульсации/), {
      target: { value: '12' },
    });
    fireEvent.change(inputs[8]!, { target: { value: '10,5' } });
    fireEvent.change(inputs[9]!, { target: { value: '0,25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(gameplayPatchBody).not.toBeNull());
    const savedItemPatchBody = itemPatchBody as unknown as Record<string, unknown>;
    const savedGameplayPatchBody = gameplayPatchBody as unknown as Record<string, unknown>;
    expect(savedItemPatchBody.priceRub).toBe(1490);
    expect(savedGameplayPatchBody.currencyPrice).toBe(2490);
    expect(savedGameplayPatchBody.chargesPerPurchase).toBe(1300);
    expect(savedGameplayPatchBody.lowStockThreshold).toBe(12);
    expect(savedGameplayPatchBody.duelPeriodCost).toBe(0);
    expect(savedGameplayPatchBody.effectPuckSpeedDelta).toBeCloseTo(0.105, 5);
    expect(savedGameplayPatchBody.effectShooterFrequencyDelta).toBe(0.25);
    expect(savedGameplayPatchBody.effectShotZoneMultiplier).toBe(1);
  });

  it('shows only skate tuning fields while editing skates', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    const inventoryItem = {
      id: '22222222-2222-2222-2222-222222222222',
      photoUrl: '/inventory/skates.webp',
      title: 'Разгон',
      description: 'Комплект коньков',
      priceRub: 490,
      itemKind: 'skates',
      currencyPrice: 490,
      chargesPerPurchase: 8500,
      lowStockThreshold: 50,
      duelPeriodCost: 0,
      effectPuckSpeedDelta: 0,
      effectShooterFrequencyDelta: 0,
      effectGoalieFrequencyDelta: 0,
      effectGoalFrequencyDelta: 0,
      effectShotZoneMultiplier: 1,
      effectStumbleIntervalMinRolls: 90,
      effectStumbleIntervalMaxRolls: 130,
      effectStumbleDurationMinMs: 500,
      effectStumbleDurationMaxMs: 700,
      effectStumbleOffsetMinPx: 20,
      effectStumbleOffsetMaxPx: 45,
      effectStumbleRecoveryMinMs: 200,
      effectStumbleRecoveryMaxMs: 300,
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
      paymentsCount: 0,
      paidRevenueRub: 0,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(JSON.stringify(makeAdminSummary()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [],
            total: 0,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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
      if (url.includes('/admin/inventory')) {
        return new Response(JSON.stringify({ items: [inventoryItem] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderAdmin();

    selectAdminSection('Инвентарь');
    expect(await screen.findByText('Разгон')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    const dialog = await screen.findByRole('dialog', { name: 'Редактирование предмета' });
    expect(within(dialog).getByLabelText(/Порог пульсации/)).toHaveValue('50');
    expect(
      within(dialog).getByText(
        'Когда остаток станет не больше этого числа, иконка начнёт пульсировать.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Коньки и спотыкание')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Коньки расходуются в прокатах и управляют спотыканием без рабочего инвентаря.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Энергия и усталость')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Шайба +пункты')).not.toBeInTheDocument();
  });

  it('keeps weekly challenges inside the achievements admin section', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin', displayName: 'Egor', role: 'admin' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/summary')) {
        return new Response(
          JSON.stringify({
            users: {
              total: 1,
              admins: 1,
              players: 0,
              newToday: 0,
              new7d: 0,
              new30d: 0,
              new365d: 0,
              newInPeriod: 0,
              activeToday: 0,
              activeYesterday: 0,
              active7d: 0,
              active30d: 0,
              active365d: 0,
              activeInPeriod: 0,
              activated: { count: 0, percent: 0 },
              notifications: makeNotificationStats(),
            },
            lifetime: { shots: 0, goals: 0 },
            active: { daily: 0, training: 0 },
            last24h: { shots: 0, goals: 0, mismatches: 0 },
            dashboard: {
              period: '30d',
              periodDays: 30,
              users: {
                total: 1,
                admins: 1,
                players: 0,
                newToday: 0,
                new7d: 0,
                new30d: 0,
                new365d: 0,
                newInPeriod: 0,
                activeToday: 0,
                activeYesterday: 0,
                active7d: 0,
                active30d: 0,
                active365d: 0,
                activeInPeriod: 0,
                activated: { count: 0, percent: 0 },
              },
              payments: {
                revenueTodayRub: 0,
                revenue30dRub: 0,
                revenuePeriodRub: 0,
                revenueMonthRub: 0,
                revenueQuarterRub: 0,
                revenueYearRub: 0,
                revenueTotalRub: 0,
                paidUsersTotal: 0,
                paidUsers30d: 0,
                paidUsersPeriod: 0,
                paidPayments30d: 0,
                paidPaymentsPeriod: 0,
                payerConversionPercent: 0,
                arpu30dRub: 0,
                arppu30dRub: 0,
                arpuPeriodRub: 0,
                arppuPeriodRub: 0,
              },
              game: {
                shotsToday: 0,
                goalsToday: 0,
                shots7d: 0,
                goals7d: 0,
                shots30d: 0,
                goals30d: 0,
                shotsPeriod: 0,
                goalsPeriod: 0,
                shotsTotal: 0,
                goalsTotal: 0,
                accuracy30d: 0,
                accuracyPeriod: 0,
                dailyPlayers30d: 0,
                trainingPlayers30d: 0,
                dailyPlayersPeriod: 0,
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
              feedback: { total: 0, unread: 0 },
              inventory: { activeItems: 0 },
              engagement: {
                avgDailyActivitySpanMinutes: 0,
                dauWauPercent: 0,
                wauMauPercent: 0,
              },
              notifications: makeNotificationStats(),
              series: [],
            },
            gameCoreVersion: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/achievements')) {
        return new Response(
          JSON.stringify({
            achievements: [
              {
                id: 'first-goal',
                photoUrl: '/achievements/first-goal.webp',
                title: 'Первая шайба',
                description: 'Забросить первую шайбу',
                requirement: 'Забросить первую шайбу в игре',
                category: 'daily',
                availability: 'active',
                futureTag: null,
                rewardCurrency: 10,
                rewardStars: 1,
                rewardExperience: 5,
                sortOrder: 1,
                createdAt: '2026-05-01T00:00:00.000Z',
                updatedAt: '2026-05-01T00:00:00.000Z',
                completedCount: 12,
                claimedCount: 8,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/weekly-challenges')) {
        return new Response(
          JSON.stringify({
            challenges: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                title: 'Неделя снайпера',
                description: '',
                joinOpenAt: '2026-06-01T09:00:00.000Z',
                startAt: '2026-06-02T09:00:00.000Z',
                endAt: '2026-06-09T09:00:00.000Z',
                isActive: true,
                joinEnabled: true,
                rewardCoins: 100,
                rewardStars: 5,
                rewardExperience: 50,
                tasks: [],
                stats: {
                  participantsCount: 0,
                  completedCount: 0,
                  rewardClaimedCount: 0,
                  declinedCount: 0,
                },
                players: [],
                createdAt: '2026-06-01T09:00:00.000Z',
                updatedAt: '2026-06-01T09:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/admin/users')) {
        return new Response(
          JSON.stringify({
            users: [],
            total: 0,
            limit: 20,
            offset: 0,
            notificationStats: makeNotificationStats(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
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

    expect(screen.queryByRole('button', { name: 'Челленджи' })).not.toBeInTheDocument();
    selectAdminSection('Задания');

    expect(await screen.findByText('Первая шайба')).toBeInTheDocument();
    expect(screen.getByText('Выполнили игроков')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('tab', { name: 'Челленджи' }));
    expect(await screen.findByText('Еженедельные челленджи (1)')).toBeInTheDocument();
    expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
  });
});
