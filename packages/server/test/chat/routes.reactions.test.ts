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

describe.skipIf(!hasIntegrationEnv)('chat reaction routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userA: string;
  let userB: string;
  let userC: string;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const setupPool = createTestPool();
    await resetDatabase(setupPool);
    await applyMigrations(setupPool, MIGRATIONS_DIR);
    await setupPool.end();
    const setupRedis = createTestRedis();
    await resetRedis(setupRedis);
    await setupRedis.quit();

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

    // DM chat A↔B, message from A.
    const dm = await app.pg.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    chatId = dm.rows[0].id;
    await app.pg.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [chatId, userA, userB],
    );
    const m = await app.pg.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chatId, userA],
    );
    messageId = m.rows[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST reactions: 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST reactions: 201 happy + body {messageId, emoji, removed:null}', async () => {
    await app.pg.query(`delete from message_reactions where message_id = $1`, [messageId]);
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ messageId, emoji: '🔥', removed: null });
  });

  it('POST reactions: switch returns the previous emoji in `removed`', async () => {
    await app.pg.query(`delete from message_reactions where message_id = $1`, [messageId]);
    await app.pg.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '❤️')`,
      [messageId, userA],
    );
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ messageId, emoji: '🔥', removed: '❤️' });
  });

  it('POST reactions: 400 on emoji outside the whitelist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: 'lol' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST reactions: 403 from a user not in the chat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenC}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST reactions: 404 on non-existent messageId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/chat/messages/00000000-0000-0000-0000-000000000000/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE reactions: 204 happy', async () => {
    await app.pg.query(`delete from message_reactions where message_id = $1`, [messageId]);
    await app.pg.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(204);
    const remaining = await app.pg.query(
      `select 1 from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(remaining.rowCount).toBe(0);
  });

  it('DELETE reactions: 204 even when nothing to remove (no-op)', async () => {
    await app.pg.query(`delete from message_reactions where message_id = $1`, [messageId]);
    const res = await app.inject({
      method: 'DELETE',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE reactions: 403 from a non-member', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/chat/messages/${messageId}/reactions`,
      headers: { authorization: `Bearer ${tokenC}`, 'content-type': 'application/json' },
      payload: { emoji: '🔥' },
    });
    expect(res.statusCode).toBe(403);
  });
});
