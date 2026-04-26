import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
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
import type { ChatEventFrame } from '../../src/chat/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

function nextFrame(ws: WebSocket, predicate: (f: ChatEventFrame) => boolean): Promise<ChatEventFrame> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const frame = JSON.parse(raw.toString()) as ChatEventFrame;
        if (predicate(frame)) {
          ws.off('message', onMessage);
          ws.off('close', onClose);
          resolve(frame);
        }
      } catch (err) {
        ws.off('message', onMessage);
        ws.off('close', onClose);
        reject(err);
      }
    };
    const onClose = (code: number) => {
      ws.off('message', onMessage);
      reject(new Error(`socket closed before frame: ${code}`));
    };
    ws.on('message', onMessage);
    ws.once('close', onClose);
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === ws.OPEN) return resolve();
    ws.once('open', () => resolve());
    ws.once('error', reject);
    ws.once('close', (code) => reject(new Error(`closed before open: ${code}`)));
  });
}

describe.skipIf(!hasIntegrationEnv)('chat WebSocket', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;
  let userA: string;
  let userB: string;
  let userC: string;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let dmAB: string;
  let systemChat: string;
  let config: AppConfig;

  beforeAll(async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const setupPool = createTestPool();
    await resetDatabase(setupPool);
    await applyMigrations(setupPool, MIGRATIONS_DIR);
    await setupPool.end();
    const setupRedis = createTestRedis();
    await resetRedis(setupRedis);
    await setupRedis.quit();

    config = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 0,
      LOG_LEVEL: 'warn',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: 'test-jwt-secret-at-least-16-chars',
      REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
      TELEGRAM_BOT_TOKEN: 'test-telegram-bot-token',
      DAILY_SEED_SECRET: 'test-daily-seed-secret-at-least-16',
    };
    app = await buildApp({ config });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = addr.replace(/^http/, 'ws');

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await app.pg.query(ins, ['Alice'])).rows[0].id;
    userB = (await app.pg.query(ins, ['Bob'])).rows[0].id;
    userC = (await app.pg.query(ins, ['Charlie'])).rows[0].id;

    const dm = await app.pg.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await app.pg.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );

    const sys = await app.pg.query(
      `insert into chats (type, name, created_by) values ('system', $1, $2) returning id`,
      ['Общий', userA],
    );
    systemChat = sys.rows[0].id;

    const jwt = createJwt({ accessSecret: config.JWT_SECRET, refreshSecret: config.REFRESH_SECRET });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
    tokenC = await jwt.issueAccessToken({ sub: userC });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects connection without token (close 4401)', async () => {
    const ws = new WebSocket(`${baseUrl}/chat/ws`);
    const code = await new Promise<number>((resolve, reject) => {
      ws.once('close', (c) => resolve(c));
      ws.once('error', () => undefined); // expected — server may RST after close
      setTimeout(() => reject(new Error('no close')), 2000);
    });
    expect(code).toBe(4401);
  });

  it('rejects connection with bogus token (close 4401)', async () => {
    const ws = new WebSocket(`${baseUrl}/chat/ws?token=not-a-jwt`);
    const code = await new Promise<number>((resolve, reject) => {
      ws.once('close', (c) => resolve(c));
      ws.once('error', () => undefined);
      setTimeout(() => reject(new Error('no close')), 2000);
    });
    expect(code).toBe(4401);
  });

  it('A receives message:new when B posts to DM A↔B', async () => {
    const wsA = new WebSocket(`${baseUrl}/chat/ws?token=${tokenA}`);
    await waitOpen(wsA);

    const incoming = nextFrame(
      wsA,
      (f) => f.event.type === 'message:new' && f.event.chatId === dmAB,
    );

    const post = await app.inject({
      method: 'POST',
      url: `/chat/${dmAB}/messages`,
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      payload: { content: 'привет' },
    });
    expect(post.statusCode).toBe(201);

    const frame = await incoming;
    expect(frame.v).toBe(1);
    expect(frame.event.type).toBe('message:new');
    if (frame.event.type === 'message:new') {
      expect(frame.event.chatId).toBe(dmAB);
      expect(frame.event.message.content).toBe('привет');
      expect(frame.event.message.senderId).toBe(userB);
    }

    wsA.close();
  });

  it('any connected client receives message:new posted to a system chat', async () => {
    const wsC = new WebSocket(`${baseUrl}/chat/ws?token=${tokenC}`);
    await waitOpen(wsC);

    const incoming = nextFrame(
      wsC,
      (f) => f.event.type === 'message:new' && f.event.chatId === systemChat,
    );

    const post = await app.inject({
      method: 'POST',
      url: `/chat/${systemChat}/messages`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { content: 'broadcast' },
    });
    expect(post.statusCode).toBe(201);

    const frame = await incoming;
    if (frame.event.type === 'message:new') {
      expect(frame.event.chatId).toBe(systemChat);
      expect(frame.event.message.content).toBe('broadcast');
    }

    wsC.close();
  });

  it('A receives message:deleted when A deletes own message', async () => {
    const wsA = new WebSocket(`${baseUrl}/chat/ws?token=${tokenA}`);
    await waitOpen(wsA);

    const post = await app.inject({
      method: 'POST',
      url: `/chat/${dmAB}/messages`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { content: 'to delete' },
    });
    const sentMsgId = post.json().id as string;

    // Drain the message:new frame for that message before asserting on delete.
    await nextFrame(
      wsA,
      (f) =>
        f.event.type === 'message:new' &&
        (f.event as { message: { id: string } }).message.id === sentMsgId,
    );

    const incoming = nextFrame(
      wsA,
      (f) =>
        f.event.type === 'message:deleted' &&
        (f.event as { messageId: string }).messageId === sentMsgId,
    );

    const del = await app.inject({
      method: 'DELETE',
      url: `/chat/messages/${sentMsgId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.statusCode).toBe(204);

    const frame = await incoming;
    if (frame.event.type === 'message:deleted') {
      expect(frame.event.chatId).toBe(dmAB);
      expect(frame.event.messageId).toBe(sentMsgId);
    }

    wsA.close();
  });

  it('A receives chat:read on /chat/:id/read for the same user (other-tab sync)', async () => {
    const wsA = new WebSocket(`${baseUrl}/chat/ws?token=${tokenA}`);
    await waitOpen(wsA);

    const incoming = nextFrame(
      wsA,
      (f) =>
        f.event.type === 'chat:read' &&
        f.event.chatId === dmAB &&
        f.event.userId === userA,
    );

    const r = await app.inject({
      method: 'POST',
      url: `/chat/${dmAB}/read`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(204);

    const frame = await incoming;
    expect(frame.event.type).toBe('chat:read');

    wsA.close();
  });

  it('does NOT leak DM A↔B messages to user C', async () => {
    const wsC = new WebSocket(`${baseUrl}/chat/ws?token=${tokenC}`);
    await waitOpen(wsC);

    let leaked = false;
    const onMessage = (raw: WebSocket.RawData) => {
      const frame = JSON.parse(raw.toString()) as ChatEventFrame;
      if (frame.event.type === 'message:new' && frame.event.chatId === dmAB) {
        leaked = true;
      }
    };
    wsC.on('message', onMessage);

    // Set up the sentinel barrier BEFORE either POST: it must catch the
    // post-leak system broadcast, not race with a stale earlier frame.
    const sentinel = nextFrame(
      wsC,
      (f) =>
        f.event.type === 'message:new' &&
        f.event.chatId === systemChat &&
        f.event.message.content === 'leak-test-sentinel',
    );

    // The (potentially) leaking publish first. Must NOT reach wsC.
    const leakPost = await app.inject({
      method: 'POST',
      url: `/chat/${dmAB}/messages`,
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      payload: { content: 'private' },
    });
    expect(leakPost.statusCode).toBe(201);

    // Then the sentinel publish on a channel wsC IS subscribed to.
    // When the sentinel frame arrives, the Redis round-trip for both publishes
    // has provably completed in order — so any leak would already have landed.
    const sentinelPost = await app.inject({
      method: 'POST',
      url: `/chat/${systemChat}/messages`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { content: 'leak-test-sentinel' },
    });
    expect(sentinelPost.statusCode).toBe(201);

    await sentinel;
    expect(leaked).toBe(false);

    wsC.off('message', onMessage);
    wsC.close();
  });
});
