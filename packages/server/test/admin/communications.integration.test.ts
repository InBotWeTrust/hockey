import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { findOrCreateDM, sendMessage } from '../../src/chat/service.js';
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
const OFFICIAL_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const PLAYER_ID = '33333333-3333-4333-8333-333333333333';
const PLAYER_PROVIDER_ID = '44444444-4444-4444-8444-444444444444';

describe.skipIf(!hasIntegrationEnv)('official communications admin inbox', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let chatId: string;
  let adminToken: string;
  let playerToken: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.query(
      `insert into users (id, display_name, timezone, role, account_kind, avatar_url)
       values ($1, 'Ультимейт Хоккей', 'Europe/Moscow', 'player', 'player',
               '/icons/official-account.webp'),
              ($2, 'Администратор', 'Europe/Moscow', 'admin', 'player', null),
              ($3, 'Алексей', 'Europe/Moscow', 'player', 'player', null)`,
      [OFFICIAL_ID, ADMIN_ID, PLAYER_ID],
    );
    await initPool.query(
      `insert into auth_providers (id, user_id, provider, provider_uid)
       values ($1, $2, 'telegram', '777001')`,
      [PLAYER_PROVIDER_ID, PLAYER_ID],
    );
    chatId = (await findOrCreateDM(initPool, OFFICIAL_ID, PLAYER_ID)).chatId;
    await sendMessage(initPool, {
      chatId,
      senderId: OFFICIAL_ID,
      content: 'Добро пожаловать!',
    });
    await initPool.query(`update users set account_kind = 'official' where id = $1`, [OFFICIAL_ID]);
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
        SYSTEM_USER_ID: OFFICIAL_ID,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: ADMIN_ID });
    playerToken = await jwt.issueAccessToken({ sub: PLAYER_ID });
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it('restores existing official conversations in the shared inbox at startup', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/admin/communications/dialogs?status=open',
      headers: auth(adminToken),
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      dialogs: [
        {
          chatId,
          status: 'open',
          player: { userId: PLAYER_ID, displayName: 'Алексей' },
        },
      ],
    });
  });

  it('delivers player feedback directly to the official dialog and shared admin inbox', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/feedback/direct',
      headers: auth(playerToken),
      payload: { message: 'Подскажите по турниру' },
    });

    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ chatId });

    const dialogMessages = await app.inject({
      method: 'GET',
      url: `/admin/communications/dialogs/${chatId}/messages`,
      headers: auth(adminToken),
    });
    expect(dialogMessages.statusCode).toBe(200);
    expect(dialogMessages.json()).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ senderId: PLAYER_ID, content: 'Подскажите по турниру' }),
        ]),
      }),
    );
  });

  it('does not expose the official account as a player profile', async () => {
    const profile = await app.inject({
      method: 'GET',
      url: `/users/${OFFICIAL_ID}`,
      headers: auth(playerToken),
    });

    expect(profile.statusCode).toBe(404);
  });

  it('lists, reads, replies, closes and reopens a shared official dialog', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: '/admin/communications/dialogs?status=open',
      headers: auth(playerToken),
    });
    expect(denied.statusCode).toBe(403);

    const playerMessage = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: auth(playerToken),
      payload: { content: 'Нужна помощь' },
    });
    expect(playerMessage.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: '/admin/communications/dialogs?status=new&q=777001',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      unreadCount: 1,
      dialogs: [
        {
          chatId,
          status: 'open',
          isNew: true,
          player: { userId: PLAYER_ID, displayName: 'Алексей', telegramId: '777001' },
        },
      ],
    });

    const messages = await app.inject({
      method: 'GET',
      url: `/admin/communications/dialogs/${chatId}/messages`,
      headers: auth(adminToken),
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'Нужна помощь' })]),
    );

    const reply = await app.inject({
      method: 'POST',
      url: `/admin/communications/dialogs/${chatId}/messages`,
      headers: auth(adminToken),
      payload: { content: 'Мы уже помогаем', attachmentIds: [] },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({ senderId: OFFICIAL_ID, content: 'Мы уже помогаем' });

    const closed = await app.inject({
      method: 'PATCH',
      url: `/admin/communications/dialogs/${chatId}`,
      headers: auth(adminToken),
      payload: { status: 'closed', markRead: true },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ status: 'closed' });

    await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: auth(playerToken),
      payload: { content: 'Есть ещё вопрос' },
    });
    const state = await pool.query<{ status: string }>(
      `select status from official_dialog_state where chat_id = $1`,
      [chatId],
    );
    expect(state.rows[0]?.status).toBe('open');
    const audit = await pool.query<{ count: string }>(
      `select count(*)::text as count from event_log
        where user_id = $1 and type = 'admin_official_dialog_message_sent'`,
      [ADMIN_ID],
    );
    expect(audit.rows[0]?.count).toBe('1');
  });
});
