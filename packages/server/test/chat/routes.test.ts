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

    const jwt = createJwt({
      accessSecret: config.JWT_SECRET,
      refreshSecret: config.REFRESH_SECRET,
    });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
    tokenC = await jwt.issueAccessToken({ sub: userC });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /chat/list returns the default news channel for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({
        type: 'channel',
        name: 'Новости игры',
        channelSlug: 'news',
      }),
    ]);
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

  it('GET /users/:id returns public stats and achievements', async () => {
    await app.pg.query(
      `update users
          set lifetime_shots_total = 30,
              lifetime_goals_total = 10,
              level = 2
        where id = $1`,
      [userB],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/users/${userB}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: userB,
      displayName: 'Bob',
      competitionLevel: 'amateur',
      stats: {
        shots: 30,
        goals: 10,
        accuracy: 33,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
    });
    const body = res.json() as {
      achievements: Array<{ id: string; isUnlocked: boolean; unlockedAt?: string }>;
    };
    expect(
      body.achievements
        .filter((achievement) => achievement.isUnlocked)
        .map((achievement) => achievement.id),
    ).toEqual(['first-goal']);
    expect(
      body.achievements.find((achievement) => achievement.id === 'first-goal')?.unlockedAt,
    ).toEqual(expect.any(String));
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

  describe('GET /chat/:chatId/messages — after / around cursors', () => {
    async function freshChatWithMessages(
      count: number,
      gapMs = 1000,
    ): Promise<{
      chatId: string;
      ids: string[];
    }> {
      const dm = await app.inject({
        method: 'POST',
        url: '/chat/dm',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        payload: { otherUserId: userB },
      });
      const { chatId } = dm.json() as { chatId: string };
      const baseTime = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const r = await app.pg.query<{ id: string }>(
          `insert into messages (chat_id, sender_id, content, created_at)
           values ($1, $2, $3, to_timestamp($4)) returning id`,
          [chatId, userA, `m${i}`, (baseTime + i * gapMs) / 1000],
        );
        ids.push(r.rows[0]!.id);
      }
      return { chatId, ids };
    }

    it('after=<iso>: returns only messages newer than the cursor, ascending', async () => {
      const { chatId } = await freshChatWithMessages(5, 10_000);
      // Read m1's actual timestamp as ISO and use it as the cursor.
      const m1 = await app.pg.query<{ created_at: Date }>(
        `select created_at from messages where chat_id = $1 and content = 'm1'`,
        [chatId],
      );
      const cursor = m1.rows[0]!.created_at.toISOString();

      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?after=${encodeURIComponent(cursor)}&limit=10`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ content: string }>;
      expect(body.map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
    });

    it('around=<uuid>&radius=2: returns 2*radius+1 messages centered on anchor, ascending', async () => {
      const { chatId, ids } = await freshChatWithMessages(7);
      const anchor = ids[3]!;
      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?around=${anchor}&radius=2`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ content: string }>;
      expect(body.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    });

    it('around=<uuid>: returns 404 when the anchor message does not exist', async () => {
      const { chatId } = await freshChatWithMessages(1);
      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?around=00000000-0000-0000-0000-000000000000&radius=5`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('around=<uuid>: returns 404 when the anchor belongs to a different chat', async () => {
      const { chatId } = await freshChatWithMessages(1);
      // Create a second DM userA<->userC and put a message there.
      const otherDm = await app.inject({
        method: 'POST',
        url: '/chat/dm',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        payload: { otherUserId: userC },
      });
      const otherChatId = (otherDm.json() as { chatId: string }).chatId;
      const otherMsg = await app.pg.query<{ id: string }>(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'cross-chat') returning id`,
        [otherChatId, userA],
      );
      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?around=${otherMsg.rows[0]!.id}&radius=5`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('around=<uuid>: returns 404 when the anchor is soft-deleted', async () => {
      const { chatId } = await freshChatWithMessages(1);
      const r = await app.pg.query<{ id: string }>(
        `insert into messages (chat_id, sender_id, content, is_deleted)
         values ($1, $2, '', true) returning id`,
        [chatId, userA],
      );
      const anchor = r.rows[0]!.id;
      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?around=${anchor}&radius=5`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('around + before simultaneously → 400 (mutual exclusion)', async () => {
      const { chatId, ids } = await freshChatWithMessages(1);
      const res = await app.inject({
        method: 'GET',
        url: `/chat/${chatId}/messages?around=${ids[0]}&before=${encodeURIComponent(new Date().toISOString())}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
