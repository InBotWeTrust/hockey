import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';
import { createJwt } from '../../src/auth/jwt.js';
import {
  hasIntegrationEnv,
  getTestUrls,
  createTestPool,
  createTestRedis,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userA: string;
  let userB: string;
  let userC: string;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  beforeAll(async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const setupPool = createTestPool();
    await resetDatabase(setupPool);
    await applyMigrations(setupPool, MIGRATIONS_DIR);
    await setupPool.end();
    const setupRedis = createTestRedis();
    await resetRedis(setupRedis);
    await setupRedis.quit();

    // Build a real app with a fully inline test config so CI doesn't need
    // production-style env vars (only TEST_DATABASE_URL/TEST_REDIS_URL are set).
    const config: AppConfig = {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'warn',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: 'test-jwt-secret-at-least-16-chars',
      REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
      TELEGRAM_BOT_TOKEN: 'test-telegram-bot-token',
      DAILY_SEED_SECRET: 'test-daily-seed-secret-at-least-16',
    };
    app = await buildApp({ config });
    await app.ready();

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await app.pg.query(ins, ['Alice'])).rows[0].id;
    userB = (await app.pg.query(ins, ['Bob'])).rows[0].id;
    userC = (await app.pg.query(ins, ['Charlie'])).rows[0].id;

    const jwt = createJwt({ accessSecret: config.JWT_SECRET, refreshSecret: config.REFRESH_SECRET });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
    tokenC = await jwt.issueAccessToken({ sub: userC });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /chat/list returns empty for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /chat/dm + GET /chat/list flow', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { otherUserId: userB },
    });
    expect(dm.statusCode).toBe(200);
    const { chatId } = dm.json();

    const list = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.json().some((c: { id: string }) => c.id === chatId)).toBe(true);
  });

  it('POST /chat/:id/messages -> GET messages', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { otherUserId: userB },
    });
    const { chatId } = dm.json();

    const sent = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { content: 'hi B' },
    });
    expect(sent.statusCode).toBe(201);

    const msgs = await app.inject({
      method: 'GET',
      url: `/chat/${chatId}/messages?limit=10`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(msgs.statusCode).toBe(200);
    const list = msgs.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].content).toBe('hi B');
  });

  it('GET /chat/:id/messages 403 for non-member', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { otherUserId: userB },
    });
    const { chatId } = dm.json();
    const res = await app.inject({
      method: 'GET',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${tokenC}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /chat/messages/:id 403 for non-owner', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { otherUserId: userB },
    });
    const { chatId } = dm.json();
    const sent = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { content: 'mine' },
    });
    const messageId = sent.json().id;
    const del = await app.inject({
      method: 'DELETE',
      url: `/chat/messages/${messageId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(del.statusCode).toBe(403);
  });

  it('POST /chat/:id/read works', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { otherUserId: userB },
    });
    const { chatId } = dm.json();
    const res = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/read`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('GET /chat/users returns trigram matches, excluding self', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/users?q=Bo&limit=5',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const list: Array<{ userId: string }> = res.json();
    expect(list.some((u) => u.userId === userB)).toBe(true);
    expect(list.some((u) => u.userId === userA)).toBe(false);
  });

  it('GET /chat/unread returns map and uses cache on second call', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/chat/unread',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res1.statusCode).toBe(200);
    const res2 = await app.inject({
      method: 'GET',
      url: '/chat/unread',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual(res1.json());
  });

  it('rate limits POST /chat/:id/messages after 5/sec', async () => {
    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${tokenC}`, 'content-type': 'application/json' },
      payload: { otherUserId: userA },
    });
    const { chatId } = dm.json();
    const results = await Promise.all(
      Array.from({ length: 7 }).map(() =>
        app.inject({
          method: 'POST',
          url: `/chat/${chatId}/messages`,
          headers: { authorization: `Bearer ${tokenC}`, 'content-type': 'application/json' },
          payload: { content: 'spam' },
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  it('GET /chat/list 401 without bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/chat/list' });
    expect(res.statusCode).toBe(401);
  });
});
