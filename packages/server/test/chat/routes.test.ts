import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
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
const JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
const REFRESH_SECRET = 'test-refresh-secret-at-least-16-chars';

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
      JWT_SECRET,
      REFRESH_SECRET,
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
      accessSecret: JWT_SECRET,
      refreshSecret: REFRESH_SECRET,
    });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
    tokenC = await jwt.issueAccessToken({ sub: userC });
  });

  afterAll(async () => {
    await app.close();
  });

  async function waitForPushDeliveryRows(eventType: string): Promise<Array<{ id: string }>> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { rows } = await app.pg.query<{ id: string }>(
        `select id::text from push_delivery_log where event_type = $1`,
        [eventType],
      );
      if (rows.length > 0) return rows;
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    return [];
  }

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

  it('lets admins delete channel posts through the channel endpoint', async () => {
    await app.pg.query(`update users set role = 'admin' where id = $1`, [userA]);
    const chats = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(chats.statusCode).toBe(200);
    const news = (
      chats.json() as Array<{ id: string; type: string; channelSlug?: string | null }>
    ).find((chat) => chat.type === 'channel' && chat.channelSlug === 'news');
    expect(news).toBeDefined();

    const created = await app.inject({
      method: 'POST',
      url: `/chat/${news!.id}/messages`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: 'delete me' },
    });
    expect(created.statusCode).toBe(201);
    const postId = created.json().id as string;

    const denied = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/posts/${postId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(denied.statusCode).toBe(403);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/posts/${postId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleted.statusCode).toBe(204);

    const deletedPost = await app.inject({
      method: 'GET',
      url: `/chat/channel/posts/${postId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deletedPost.statusCode).toBe(404);
  });

  it('lets a sender edit their own regular chat message', async () => {
    const dm = await app.pg.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = dm.rows[0].id as string;
    await app.pg.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
      chatId,
      userA,
      userB,
    ]);

    const created = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: 'old' },
    });
    expect(created.statusCode).toBe(201);
    const messageId = created.json().id as string;

    const denied = await app.inject({
      method: 'PATCH',
      url: `/chat/messages/${messageId}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { content: 'stolen' },
    });
    expect(denied.statusCode).toBe(403);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/chat/messages/${messageId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: 'new' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toEqual(
      expect.objectContaining({
        id: messageId,
        content: 'new',
        isEdited: true,
      }),
    );
  });

  it('supports replies and one reaction per channel comment', async () => {
    await app.pg.query(`update users set role = 'admin' where id = $1`, [userA]);
    const chats = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(chats.statusCode).toBe(200);
    const news = (
      chats.json() as Array<{ id: string; type: string; channelSlug?: string | null }>
    ).find((chat) => chat.type === 'channel' && chat.channelSlug === 'news');
    expect(news).toBeDefined();

    const created = await app.inject({
      method: 'POST',
      url: `/chat/${news!.id}/messages`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: 'commentable post' },
    });
    expect(created.statusCode).toBe(201);
    const postId = created.json().id as string;

    const parent = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { content: 'first comment' },
    });
    expect(parent.statusCode).toBe(201);
    const parentId = parent.json().id as string;
    expect(parent.json()).toEqual(expect.objectContaining({ replyToId: null, reactions: [] }));

    const child = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { content: 'reply comment', replyToId: parentId },
    });
    expect(child.statusCode).toBe(201);
    const childId = child.json().id as string;
    expect(child.json()).toEqual(expect.objectContaining({ replyToId: parentId }));

    const fire = await app.inject({
      method: 'POST',
      url: `/chat/channel/comments/${childId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { emoji: '🔥' },
    });
    expect(fire.statusCode).toBe(201);
    expect(fire.json()).toEqual({ commentId: childId, emoji: '🔥', removed: null });

    const thumb = await app.inject({
      method: 'POST',
      url: `/chat/channel/comments/${childId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { emoji: '👍' },
    });
    expect(thumb.statusCode).toBe(201);
    expect(thumb.json()).toEqual({ commentId: childId, emoji: '👍', removed: '🔥' });

    const listForMe = await app.inject({
      method: 'GET',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listForMe.statusCode).toBe(200);
    const commentsForMe = listForMe.json() as Array<{
      id: string;
      replyToId: string | null;
      reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
    }>;
    expect(commentsForMe.find((comment) => comment.id === childId)).toEqual(
      expect.objectContaining({
        replyToId: parentId,
        reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
      }),
    );

    const listForOther = await app.inject({
      method: 'GET',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(listForOther.statusCode).toBe(200);
    const commentsForOther = listForOther.json() as Array<{
      id: string;
      reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
    }>;
    expect(commentsForOther.find((comment) => comment.id === childId)?.reactions).toEqual([
      { emoji: '👍', count: 1, reactedByMe: false },
    ]);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/comments/${childId}/reactions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { emoji: '👍' },
    });
    expect(removed.statusCode).toBe(204);

    const deniedCommentDelete = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/comments/${childId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(deniedCommentDelete.statusCode).toBe(403);

    const ownCommentDelete = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/comments/${childId}`,
      headers: { authorization: `Bearer ${tokenC}` },
    });
    expect(ownCommentDelete.statusCode).toBe(204);

    const adminCommentDelete = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/comments/${parentId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(adminCommentDelete.statusCode).toBe(204);

    const listAfterDelete = await app.inject({
      method: 'GET',
      url: `/chat/channel/posts/${postId}/comments`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listAfterDelete.statusCode).toBe(200);
    const afterDeleteIds = (listAfterDelete.json() as Array<{ id: string }>).map(
      (comment) => comment.id,
    );
    expect(afterDeleteIds).not.toContain(parentId);
    expect(afterDeleteIds).not.toContain(childId);
  });

  it('lets admins publish channel polls and users change or clear one vote', async () => {
    await app.pg.query(`update users set role = 'admin' where id = $1`, [userA]);
    await app.redis.del(`chat:rate:${userA}`, `chat:rate:${userB}`, `chat:rate:${userC}`);

    const chats = await app.inject({
      method: 'GET',
      url: '/chat/list',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(chats.statusCode).toBe(200);
    const news = (
      chats.json() as Array<{ id: string; type: string; channelSlug?: string | null }>
    ).find((chat) => chat.type === 'channel' && chat.channelSlug === 'news');
    expect(news).toBeDefined();

    const denied = await app.inject({
      method: 'POST',
      url: `/chat/${news!.id}/messages`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { content: 'Опрос без прав', pollOptions: ['Да'] },
    });
    expect(denied.statusCode).toBe(403);

    const created = await app.inject({
      method: 'POST',
      url: `/chat/${news.id}/messages`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: 'Кто победит?', pollOptions: ['Первые', 'Вторые'] },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as {
      id: string;
      poll: {
        totalVotes: number;
        myOptionId: string | null;
        options: Array<{ id: string; text: string; percent: number; selectedByMe: boolean }>;
      };
    };
    expect(createdBody.poll).toEqual(
      expect.objectContaining({
        totalVotes: 0,
        myOptionId: null,
      }),
    );
    expect(createdBody.poll.options.map((option) => option.text)).toEqual(['Первые', 'Вторые']);
    expect(createdBody.poll.options.map((option) => option.percent)).toEqual([0, 0]);
    const firstOptionId = createdBody.poll.options[0]!.id;
    const secondOptionId = createdBody.poll.options[1]!.id;

    const firstVote = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${createdBody.id}/poll/vote`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { optionId: firstOptionId },
    });
    expect(firstVote.statusCode).toBe(200);
    expect(firstVote.json().poll).toEqual(
      expect.objectContaining({
        totalVotes: 1,
        myOptionId: firstOptionId,
      }),
    );
    expect(
      firstVote.json().poll.options.map((option: { percent: number }) => option.percent),
    ).toEqual([100, 0]);

    const changedVote = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${createdBody.id}/poll/vote`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { optionId: secondOptionId },
    });
    expect(changedVote.statusCode).toBe(200);
    expect(changedVote.json().poll).toEqual(
      expect.objectContaining({
        totalVotes: 1,
        myOptionId: secondOptionId,
      }),
    );
    expect(
      changedVote.json().poll.options.map((option: { percent: number }) => option.percent),
    ).toEqual([0, 100]);

    const otherVote = await app.inject({
      method: 'POST',
      url: `/chat/channel/posts/${createdBody.id}/poll/vote`,
      headers: { authorization: `Bearer ${tokenC}` },
      payload: { optionId: firstOptionId },
    });
    expect(otherVote.statusCode).toBe(200);

    const postForB = await app.inject({
      method: 'GET',
      url: `/chat/channel/posts/${createdBody.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(postForB.statusCode).toBe(200);
    expect(postForB.json().poll).toEqual(
      expect.objectContaining({
        totalVotes: 2,
        myOptionId: secondOptionId,
      }),
    );
    expect(postForB.json().poll.options).toEqual([
      expect.objectContaining({ id: firstOptionId, percent: 50, selectedByMe: false }),
      expect.objectContaining({ id: secondOptionId, percent: 50, selectedByMe: true }),
    ]);

    const cleared = await app.inject({
      method: 'DELETE',
      url: `/chat/channel/posts/${createdBody.id}/poll/vote`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().poll).toEqual(
      expect.objectContaining({
        totalVotes: 1,
        myOptionId: null,
      }),
    );
    expect(cleared.json().poll.options).toEqual([
      expect.objectContaining({ id: firstOptionId, percent: 100, selectedByMe: false }),
      expect.objectContaining({ id: secondOptionId, percent: 0, selectedByMe: false }),
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

  it('queues a push only when a user sends the first direct message', async () => {
    const first = await app.pg.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Push Sender', 'UTC')
       returning id`,
    );
    const second = await app.pg.query<{ id: string }>(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), 'Push Recipient', 'UTC')
       returning id`,
    );
    const senderId = first.rows[0]!.id;
    const recipientId = second.rows[0]!.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const senderToken = await jwt.issueAccessToken({ sub: senderId });

    await app.pg.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, $2, $3, $4)`,
      [
        recipientId,
        `https://push.example.test/send/${recipientId}`,
        randomBytes(65).toString('base64url'),
        randomBytes(16).toString('base64url'),
      ],
    );

    const dm = await app.inject({
      method: 'POST',
      url: '/chat/dm',
      headers: { authorization: `Bearer ${senderToken}`, 'content-type': 'application/json' },
      payload: { otherUserId: recipientId },
    });
    expect(dm.statusCode).toBe(200);
    const { chatId } = dm.json();

    const firstMessage = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${senderToken}`, 'content-type': 'application/json' },
      payload: { content: 'Привет, сыграем?' },
    });
    expect(firstMessage.statusCode).toBe(201);

    const firstRows = await waitForPushDeliveryRows('chat.new_dialog_message');
    expect(firstRows).toHaveLength(1);
    const queued = await app.pg.query<{
      user_id: string;
      event_key: string;
      payload: { title: string; body: string; url: string; tag: string };
    }>(
      `select user_id::text, event_key, payload
         from push_delivery_log
        where event_type = 'chat.new_dialog_message'`,
    );
    expect(queued.rows[0]).toMatchObject({
      user_id: recipientId,
      event_key: `chat:new-dialog:${chatId}`,
      payload: expect.objectContaining({
        title: 'Новое сообщение от Push Sender',
        body: 'Привет, сыграем?',
        url: `/chat/${chatId}`,
        tag: `ultimate-hockey-dm-${chatId}`,
      }),
    });

    const secondMessage = await app.inject({
      method: 'POST',
      url: `/chat/${chatId}/messages`,
      headers: { authorization: `Bearer ${senderToken}`, 'content-type': 'application/json' },
      payload: { content: 'Я уже на льду' },
    });
    expect(secondMessage.statusCode).toBe(201);
    const afterSecond = await app.pg.query<{ count: string }>(
      `select count(*) from push_delivery_log where event_type = 'chat.new_dialog_message'`,
    );
    expect(Number(afterSecond.rows[0]!.count)).toBe(1);
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
