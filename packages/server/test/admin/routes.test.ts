import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const ADMIN_TG_ID = '432014500';

describe.skipIf(!hasIntegrationEnv)('/admin/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminToken: string;
  let playerToken: string;
  let adminId: string;
  let playerId: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, user_wallet, user_equipment, user_sticks,
              training_session, day_pool, period_log, shot_session, event_log,
              payments, admin_inventory_items, feedback_messages,
              push_subscriptions, user_push_preferences
              restart identity cascade`,
    );

    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: ADMIN_TG_ID,
      displayName: 'Egor Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'player-1',
      displayName: 'Regular Player',
      timezone: 'Europe/Moscow',
    });
    adminId = admin.id;
    playerId = player.id;

    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: adminId });
    playerToken = await jwt.issueAccessToken({ sub: playerId });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('gates admin routes by global user role', async () => {
    const playerRes = await app.inject({
      method: 'GET',
      url: '/admin/summary',
      headers: auth(playerToken),
    });
    expect(playerRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: 'GET',
      url: '/admin/summary',
      headers: auth(adminToken),
    });
    expect(adminRes.statusCode).toBe(200);
    const adminSummary = adminRes.json();
    expect(adminSummary).toMatchObject({
      users: {
        total: 2,
        admins: 1,
        notifications: {
          subscribed: { count: 0, percent: 0 },
          types: {
            chatNewDialogMessage: { count: 0, percent: 0 },
            dailyGame: { count: 0, percent: 0 },
            trainingAvailable: { count: 0, percent: 0 },
            gameNews: { count: 0, percent: 0 },
          },
        },
      },
      gameCoreVersion: expect.any(Number),
    });
    expect(adminSummary.dashboard).toMatchObject({ period: '30d', periodDays: 30 });
    expect(adminSummary.dashboard.series).toHaveLength(30);

    const sevenDaysRes = await app.inject({
      method: 'GET',
      url: '/admin/summary?period=7d',
      headers: auth(adminToken),
    });
    expect(sevenDaysRes.statusCode).toBe(200);
    expect(sevenDaysRes.json().dashboard).toMatchObject({ period: '7d', periodDays: 7 });
    expect(sevenDaysRes.json().dashboard.series).toHaveLength(7);

    const invalidPeriodRes = await app.inject({
      method: 'GET',
      url: '/admin/summary?period=all',
      headers: auth(adminToken),
    });
    expect(invalidPeriodRes.statusCode).toBe(400);
  });

  it('lists anti-cheat mismatch logs with shot context', async () => {
    const poolInsert = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, game_core_version, daily_seed)
       values ($1, current_date, 'closed', 1, 42, 'daily-seed')
       returning id`,
      [playerId],
    );
    const dayPoolId = poolInsert.rows[0]!.id;
    const shotInsert = await pool.query<{ id: string }>(
      `insert into shot_session
         (user_id, mode, day_pool_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values ($1, 'daily', $2, 1, 3, 'shot-seed', '{}'::jsonb, 'save', 42)
       returning id`,
      [playerId, dayPoolId],
    );
    const shotSessionId = shotInsert.rows[0]!.id;
    await pool.query(
      `insert into event_log (user_id, type, payload)
       values ($1, 'shot_mismatch', $2::jsonb)`,
      [
        playerId,
        JSON.stringify({
          mode: 'daily',
          day_pool_id: dayPoolId,
          period_number: 1,
          shot_index: 3,
          claimed_result: 'goal',
          server_result: 'save',
        }),
      ],
    );

    const denied = await app.inject({
      method: 'GET',
      url: '/admin/mismatches',
      headers: auth(playerToken),
    });
    expect(denied.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/admin/mismatches?period=7d',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      period: '7d',
      periodDays: 7,
      total: 1,
      periodTotal: 1,
      last24h: 1,
      usersAffected: 1,
      logs: [
        expect.objectContaining({
          userId: playerId,
          userDisplayName: 'Regular Player',
          mode: 'daily',
          sessionId: dayPoolId,
          shotSessionId,
          periodNumber: 1,
          shotIndex: 3,
          claimedResult: 'goal',
          serverResult: 'save',
          gameCoreVersion: 42,
        }),
      ],
    });

    const invalid = await app.inject({
      method: 'GET',
      url: '/admin/mismatches?period=all',
      headers: auth(adminToken),
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('stores player feedback and lets admins mark it read manually', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: auth(playerToken),
      payload: {
        kind: 'review',
        rating: 5,
        message: 'Игра стала быстрее и приятнее.',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      feedback: {
        kind: 'review',
        rating: 5,
        message: 'Игра стала быстрее и приятнее.',
        isRead: false,
      },
    });
    const feedbackId = created.json().feedback.id;

    const denied = await app.inject({
      method: 'GET',
      url: '/admin/feedback',
      headers: auth(playerToken),
    });
    expect(denied.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/admin/feedback?status=unread',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      unreadCount: 1,
      feedback: [
        {
          id: feedbackId,
          userId: playerId,
          userDisplayName: 'Regular Player',
          kind: 'review',
          rating: 5,
          message: 'Игра стала быстрее и приятнее.',
          isRead: false,
        },
      ],
    });

    const markRead = await app.inject({
      method: 'PATCH',
      url: `/admin/feedback/${feedbackId}`,
      headers: auth(adminToken),
      payload: { isRead: true },
    });
    expect(markRead.statusCode).toBe(200);
    expect(markRead.json()).toMatchObject({
      feedback: {
        id: feedbackId,
        isRead: true,
        readBy: adminId,
        readByDisplayName: 'Egor Admin',
      },
    });

    const afterRead = await app.inject({
      method: 'GET',
      url: '/admin/feedback',
      headers: auth(adminToken),
    });
    expect(afterRead.statusCode).toBe(200);
    expect(afterRead.json()).toMatchObject({
      total: 1,
      unreadCount: 0,
      feedback: [expect.objectContaining({ id: feedbackId, isRead: true })],
    });

    const markUnread = await app.inject({
      method: 'PATCH',
      url: `/admin/feedback/${feedbackId}`,
      headers: auth(adminToken),
      payload: { isRead: false },
    });
    expect(markUnread.statusCode).toBe(200);
    expect(markUnread.json()).toMatchObject({
      feedback: {
        id: feedbackId,
        isRead: false,
        readAt: null,
        readBy: null,
      },
    });
  });

  it('reports news channel analytics and lets admins manage posts', async () => {
    const chats = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: auth(adminToken),
    });
    expect(chats.statusCode).toBe(200);
    const news = (
      chats.json() as Array<{ id: string; type: string; channelSlug?: string | null }>
    ).find((chat) => chat.type === 'channel' && chat.channelSlug === 'news');
    expect(news).toBeDefined();

    const created = await app.inject({
      method: 'POST',
      url: `/chat/${news!.id}/messages`,
      headers: auth(adminToken),
      payload: { content: '**Большой апдейт** уже в игре' },
    });
    expect(created.statusCode).toBe(201);
    const postId = created.json().id as string;

    const viewed = await app.inject({
      method: 'GET',
      url: `/chat/${news!.id}/messages`,
      headers: auth(playerToken),
    });
    expect(viewed.statusCode).toBe(200);

    const comment = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: auth(playerToken),
      payload: { content: 'Ждём турнир' },
    });
    expect(comment.statusCode).toBe(201);

    const reaction = await app.inject({
      method: 'POST',
      url: `/chat/messages/${postId}/reactions`,
      headers: auth(playerToken),
      payload: { emoji: '👍' },
    });
    expect(reaction.statusCode).toBe(201);

    const analytics = await app.inject({
      method: 'GET',
      url: '/admin/channel/news?period=7d',
      headers: auth(adminToken),
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json()).toMatchObject({
      channel: { id: news!.id, slug: 'news' },
      summary: {
        posts: 1,
        comments: 1,
        reactions: 1,
        likes: 1,
        viewEvents: 1,
        engagedUsers: 1,
      },
      posts: [
        expect.objectContaining({
          id: postId,
          content: '**Большой апдейт** уже в игре',
          comments: 1,
          reactionsCount: 1,
          likes: 1,
          viewers: 1,
          reactions: [{ emoji: '👍', count: 1 }],
        }),
      ],
    });
    expect(analytics.json().periods[0]).toMatchObject({
      comments: 1,
      reactions: 1,
      likes: 1,
      engagedUsers: 1,
    });

    const updated = await app.inject({
      method: 'PATCH',
      url: `/admin/channel/posts/${postId}`,
      headers: auth(adminToken),
      payload: { content: '__Обновлено__' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      post: {
        id: postId,
        content: '__Обновлено__',
      },
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/admin/channel/posts/${postId}`,
      headers: auth(adminToken),
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: 'GET',
      url: '/admin/channel/news?period=7d',
      headers: auth(adminToken),
    });
    expect(afterDelete.statusCode).toBe(200);
    expect(afterDelete.json().posts).toEqual([]);
  });

  it('lists and updates users', async () => {
    await pool.query(
      `update users
          set lifetime_shots_total = 20,
              lifetime_goals_total = 8,
              display_name = 'Regular Player',
              avatar_url = 'https://stale.example/avatar.jpg',
              display_source = 'vk',
              vk_first_name = 'Viktor',
              vk_last_name = 'Goalie',
              vk_avatar_url = 'https://vk.example/avatar.jpg'
        where id = $1`,
      [playerId],
    );
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, 'https://push.example/regular', 'p256dh', 'auth')`,
      [playerId],
    );
    await pool.query(
      `insert into user_push_preferences
         (user_id, chat_new_dialog_message, daily_game, training_available, game_news)
       values ($1, true, false, true, false)`,
      [playerId],
    );

    const list = await app.inject({
      method: 'GET',
      url: '/admin/users?q=Viktor&role=player&level=beginner&sort=goals_desc&minGoals=1&minAccuracy=1',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      users: [
        {
          id: playerId,
          displayName: 'Viktor Goalie',
          avatarUrl: 'https://vk.example/avatar.jpg',
          displaySource: 'vk',
          role: 'player',
          lifetimeGoalsTotal: 8,
          accuracy: 40,
          competitionLevel: 'beginner',
          identities: expect.arrayContaining([
            expect.objectContaining({
              source: 'vk',
              displayName: 'Viktor Goalie',
              avatarUrl: 'https://vk.example/avatar.jpg',
              active: true,
            }),
          ]),
          wallet: { pucks: 0 },
          pushNotifications: {
            subscribed: true,
            subscriptionCount: 1,
            types: {
              chatNewDialogMessage: true,
              dailyGame: false,
              trainingAvailable: true,
              gameNews: false,
            },
          },
        },
      ],
      notificationStats: {
        totalUsers: 2,
        subscribed: { count: 1, percent: 50 },
        types: {
          chatNewDialogMessage: { count: 1, percent: 50 },
          dailyGame: { count: 0, percent: 0 },
          trainingAvailable: { count: 1, percent: 50 },
          gameNews: { count: 0, percent: 0 },
        },
      },
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${playerId}`,
      headers: auth(adminToken),
      payload: {
        role: 'admin',
        wallet: { pucks: 250, goldPucks: 5 },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      user: {
        id: playerId,
        role: 'admin',
        wallet: { pucks: 250, goldPucks: 5 },
      },
    });

    const block = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${playerId}`,
      headers: auth(adminToken),
      payload: { isBlocked: true },
    });
    expect(block.statusCode).toBe(200);
    expect(block.json()).toMatchObject({
      user: { id: playerId, isBlocked: true },
    });

    const blockedMe = await app.inject({
      method: 'GET',
      url: '/me',
      headers: auth(playerToken),
    });
    expect(blockedMe.statusCode).toBe(403);

    const unblock = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${playerId}`,
      headers: auth(adminToken),
      payload: { isBlocked: false },
    });
    expect(unblock.statusCode).toBe(200);
    expect(unblock.json()).toMatchObject({
      user: { id: playerId, isBlocked: false },
    });

    const selfDemote = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${adminId}`,
      headers: auth(adminToken),
      payload: { role: 'player' },
    });
    expect(selfDemote.statusCode).toBe(409);
  });

  it('updates game settings', async () => {
    const update = await app.inject({
      method: 'PATCH',
      url: '/admin/game-settings/training.shots_limit',
      headers: auth(adminToken),
      payload: { value: 120 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      key: 'training.shots_limit',
      value: 120,
      updatedBy: adminId,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/admin/game-settings',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'training.shots_limit', value: 120 }),
      ]),
    );

    const speedUpdate = await app.inject({
      method: 'PATCH',
      url: '/admin/game-settings/daily.period_2.puck_speed_per_ms',
      headers: auth(adminToken),
      payload: { value: 1.72 },
    });
    expect(speedUpdate.statusCode).toBe(200);
    expect(speedUpdate.json()).toMatchObject({
      key: 'daily.period_2.puck_speed_per_ms',
      value: 1.72,
      updatedBy: adminId,
    });
  });

  it('lists payments with analytics and manages inventory', async () => {
    const createdItem = await app.inject({
      method: 'POST',
      url: '/admin/inventory',
      headers: auth(adminToken),
      payload: {
        photoUrl: 'https://cdn.example/stick.png',
        title: 'Клюшка',
        description: 'Бросает красиво',
        priceRub: 199,
      },
    });
    expect(createdItem.statusCode).toBe(200);
    expect(createdItem.json()).toMatchObject({
      item: {
        title: 'Клюшка',
        description: 'Бросает красиво',
        priceRub: 199,
        paymentsCount: 0,
      },
    });
    const itemId = createdItem.json().item.id;

    const updatedItem = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/${itemId}`,
      headers: auth(adminToken),
      payload: { priceRub: 249, title: 'Про-клюшка' },
    });
    expect(updatedItem.statusCode).toBe(200);
    expect(updatedItem.json()).toMatchObject({
      item: { id: itemId, title: 'Про-клюшка', priceRub: 249 },
    });

    await pool.query(
      `insert into payments
         (user_id, inventory_item_id, title, amount_rub, status, provider, provider_payment_id, paid_at)
       values
         ($1, $2, 'Про-клюшка', 249, 'paid', 'test', 'paid-1', now()),
         ($1, $2, 'Про-клюшка', 199, 'pending', 'test', 'pending-1', null)`,
      [playerId, itemId],
    );

    const payments = await app.inject({
      method: 'GET',
      url: '/admin/payments?q=Regular&status=paid&sort=amount_desc&minAmount=200',
      headers: auth(adminToken),
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json()).toMatchObject({
      total: 1,
      payments: [
        {
          userId: playerId,
          userDisplayName: 'Regular Player',
          title: 'Про-клюшка',
          amountRub: 249,
          status: 'paid',
        },
      ],
      analytics: {
        month: { revenueRub: 249, paidCount: 1 },
        quarter: { revenueRub: 249, paidCount: 1 },
        year: { revenueRub: 249, paidCount: 1 },
      },
    });

    const inventory = await app.inject({
      method: 'GET',
      url: '/admin/inventory',
      headers: auth(adminToken),
    });
    expect(inventory.statusCode).toBe(200);
    expect(inventory.json()).toMatchObject({
      items: [
        {
          id: itemId,
          title: 'Про-клюшка',
          paymentsCount: 2,
          paidRevenueRub: 249,
        },
      ],
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/admin/users/${playerId}`,
      headers: auth(adminToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      purchaseSummary: { totalRubSpent: 249, purchasesCount: 2 },
      purchases: expect.arrayContaining([
        expect.objectContaining({ title: 'Про-клюшка', amountRub: 249, status: 'paid' }),
      ]),
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/admin/inventory/${itemId}`,
      headers: auth(adminToken),
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: 'GET',
      url: '/admin/inventory',
      headers: auth(adminToken),
    });
    expect(afterDelete.json()).toMatchObject({ items: [] });
  });
});
