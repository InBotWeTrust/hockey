# Internal Chat — PR 3: Realtime plugin + WebSocket endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side realtime to chat. After this PR, two browser tabs subscribed to `GET /chat/ws?token=<jwt>` see each other's `message:new`, `message:deleted` and `chat:read` events live, fanned out through Redis pub/sub. The web client (PR 5) has nothing to do but `new WebSocket(...)`.

**Architecture:**
- `plugins/realtime.ts` — Fastify plugin owning one extra ioredis subscriber client (the existing `app.redis` stays in normal mode for `publish/get/set/incr`). Exposes `app.realtime.publish(channel, event)` and `app.realtime.subscribe(channel, handler) → unsubscribe`. A local `Map<channel, Set<handler>>` lets many WS sockets share one Redis SUBSCRIBE per channel per instance.
- `chat/events.ts` — translates a domain event into the right Redis channel(s) per spec §5.2: system chats → **one** `publish` to `chat:system:<chatId>` (Redis broadcasts); direct/group chats → fan-out `publish` to each `chat:user:<userId>` of all `chat_members`.
- `chat/ws.ts` — Fastify plugin registering `GET /chat/ws`. Verifies JWT from `?token=`, subscribes the socket to `chat:user:<userId>` plus every active `chat:system:<chatId>`, forwards Redis events as `{v:1,event}` JSON frames, runs server-side heartbeat (`ping` every 30s, drop if no `pong` in 10s), cleans up subscriptions on close.
- `chat/routes.ts` — three call-sites get a `publish*` hook after their DB write: `POST /chat/:id/messages`, `DELETE /chat/messages/:id`, `POST /chat/:id/read`. Reactions stay in PR 6.

**Tech Stack:** Fastify 4, `@fastify/websocket` ^10 (^11 is Fastify 5), ioredis (subscriber mode), zod (query parse), vitest + a real `app.listen({port:0})` for the WS integration test using the `ws` npm package as a client.

**Spec reference:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §5 (transport, channels, plugin, events, reconnect), §6.1 (file layout), §11 step 3 (PR scope), §10.1 / §10.12 (perf — hybrid fan-out, one Redis SUBSCRIBE per channel per instance).

**Out of scope (deferred):**
- Reaction publish events — reaction endpoints land in PR 6, then `events.ts` gets two more helpers.
- Web `ChatSocket` client + reconnect banner + bottom-nav badge — PR 5.
- Multi-instance shard awareness — `app.realtime` is in-process; Redis pub/sub itself already crosses instances. No instance-side cache invalidation needed for MVP.

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/server/src/plugins/realtime.ts` | Redis pub/sub plugin: `app.realtime.publish/subscribe`, local channel→handlers router, lifecycle (`onClose` quits both clients) |
| Create | `packages/server/src/chat/events.ts` | `publishMessageNew(app, chatId, chatType, dto)`, `publishMessageDeleted(app, chatId, chatType, messageId)`, `publishChatRead(app, chatId, chatType, userId, lastReadAt)` — choose channel by chat type, fan out for direct/group |
| Create | `packages/server/src/chat/ws.ts` | Fastify plugin registering `GET /chat/ws`: handshake (JWT in `?token=`), per-socket subscribe set, heartbeat, write JSON frames |
| Create | `packages/server/test/chat/realtime.test.ts` | Unit tests for `realtime` plugin: pub→sub routing, multi-handler on one channel, unsubscribe-last cleans up Redis |
| Create | `packages/server/test/chat/events.test.ts` | Unit tests for `events.ts` fan-out logic against a real DB + a stub `realtime.publish` recorder |
| Create | `packages/server/test/chat/ws.test.ts` | Integration test: `app.listen({port:0})`, real `ws` client, valid/invalid JWT, message delivery DM A↔B, system-chat broadcast, heartbeat |
| Modify | `packages/server/src/app.ts` | Register `realtimePlugin` after `redisPlugin`, register `chatWs` after `chatRoutes` |
| Modify | `packages/server/src/chat/routes.ts` | After `sendMessage` / `deleteMessage` / `markChatAsRead`: call corresponding `publish*` helper |
| Modify | `packages/server/package.json` | Add `@fastify/websocket` dep + `ws` and `@types/ws` devDeps |
| Modify | `CLAUDE.md` | Add one line to the Chat section: WS endpoint exists at `/chat/ws?token=…`, fan-out via `chat:user:*` / `chat:system:*` |

---

## Pre-flight

- [ ] **Step 0.1: On a fresh PR-3 branch with clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git switch -c feat/chat-pr3-realtime
git branch --show-current
```

Expected: branch `feat/chat-pr3-realtime`, working tree clean (or only the unrelated `IceCar` changes the user is doing in another window — leave them, do not stage them).

- [ ] **Step 0.2: Verify PR 1 + PR 2 surface is in place**

```bash
ls packages/server/src/chat/{routes,service,guards,cache,types,errors,dto}.ts
ls packages/server/src/plugins/{db,redis,errors,auth}.ts
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\d chats' | head -3
```

Expected: all chat files exist; `chats` table exists. If the DB is missing, run `pnpm --filter @hockey/server db:migrate`.

- [ ] **Step 0.3: Baseline green tests**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test
```

Expected: all server tests pass (the PR 2 set, including chat guards/service/routes integration).

---

## Task 1: Add `@fastify/websocket` + `ws` test client

`@fastify/websocket@^10` is the version that supports Fastify 4 (^11 is for Fastify 5). The `ws` npm package is the de-facto Node WebSocket client; `@types/ws` provides types.

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1.1: Install runtime + dev deps**

```bash
pnpm --filter @hockey/server add @fastify/websocket@^10
pnpm --filter @hockey/server add -D ws @types/ws
```

Expected: `packages/server/package.json` gains `"@fastify/websocket": "^10.x.x"` in `dependencies`, `"ws"` and `"@types/ws"` in `devDependencies`. `pnpm-lock.yaml` updated.

- [ ] **Step 1.2: Verify install + workspace still typechecks**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: zero errors. (No code change yet — just a dep bump sanity-check.)

- [ ] **Step 1.3: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "chore(server): add @fastify/websocket + ws test client"
```

---

## Task 2: `plugins/realtime.ts` — contract + tests

The plugin owns a second ioredis client because ioredis blocks normal commands once a client enters subscriber mode. Local routing means N WS sockets in one process share one Redis SUBSCRIBE per channel.

**Files:**
- Create: `packages/server/src/plugins/realtime.ts`
- Create: `packages/server/test/chat/realtime.test.ts`

- [ ] **Step 2.1: Write the failing test**

`packages/server/test/chat/realtime.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { hasIntegrationEnv, getTestUrls, createTestRedis, resetRedis } from '../helpers/testDb.js';
import { redisPlugin } from '../../src/plugins/redis.js';
import { realtimePlugin } from '../../src/plugins/realtime.js';
import type { ChatEvent } from '../../src/chat/types.js';

function flush(): Promise<void> {
  // Give Redis pub/sub one tick + a small delay to deliver across two clients.
  return new Promise((r) => setTimeout(r, 30));
}

describe.skipIf(!hasIntegrationEnv)('realtime plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { redisUrl } = getTestUrls();
    const setup = createTestRedis();
    await resetRedis(setup);
    await setup.quit();

    app = Fastify({ logger: false });
    await app.register(redisPlugin, { url: redisUrl });
    await app.register(realtimePlugin);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const evt: ChatEvent = { type: 'chat:read', chatId: 'c1', userId: 'u1', lastReadAt: '2026-04-26T00:00:00Z' };

  it('subscribe → publish → handler called', async () => {
    const got: ChatEvent[] = [];
    const off = await app.realtime.subscribe('chat:user:u1', (e) => got.push(e));
    await app.realtime.publish('chat:user:u1', evt);
    await flush();
    expect(got).toEqual([evt]);
    await off();
  });

  it('two handlers on the same channel both fire (one Redis SUBSCRIBE under the hood)', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u2', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:user:u2', (e) => b.push(e));
    await app.realtime.publish('chat:user:u2', evt);
    await flush();
    expect(a).toEqual([evt]);
    expect(b).toEqual([evt]);
    await offA();
    await offB();
  });

  it('unsubscribing one of two leaves the other receiving', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u3', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:user:u3', (e) => b.push(e));
    await offA();
    await app.realtime.publish('chat:user:u3', evt);
    await flush();
    expect(a).toEqual([]);
    expect(b).toEqual([evt]);
    await offB();
  });

  it('after the last unsubscribe, a later publish to that channel is a no-op', async () => {
    const a: ChatEvent[] = [];
    const off = await app.realtime.subscribe('chat:user:u4', (e) => a.push(e));
    await off();
    await app.realtime.publish('chat:user:u4', evt);
    await flush();
    expect(a).toEqual([]);
  });

  it('different channels are isolated', async () => {
    const a: ChatEvent[] = [];
    const b: ChatEvent[] = [];
    const offA = await app.realtime.subscribe('chat:user:u5', (e) => a.push(e));
    const offB = await app.realtime.subscribe('chat:system:c5', (e) => b.push(e));
    await app.realtime.publish('chat:user:u5', evt);
    await flush();
    expect(a).toEqual([evt]);
    expect(b).toEqual([]);
    await offA();
    await offB();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
pnpm --filter @hockey/server test -- test/chat/realtime.test.ts
```

Expected: FAIL — `Cannot find module '../../src/plugins/realtime.js'` or similar.

- [ ] **Step 2.3: Write the minimal plugin**

`packages/server/src/plugins/realtime.ts`:

```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import type { ChatEvent } from '../chat/types.js';

export type RealtimeHandler = (event: ChatEvent) => void;
export type Unsubscribe = () => Promise<void>;

export interface Realtime {
  publish(channel: string, event: ChatEvent): Promise<void>;
  subscribe(channel: string, handler: RealtimeHandler): Promise<Unsubscribe>;
}

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  // Inherit URL from the existing redis client so prod & test share one config source.
  const url = (app.redis.options as { connectionName?: string } & Record<string, unknown>);
  // ioredis exposes the connection options object as .options; we reuse it for the sub client.
  const subClient = app.redis.duplicate();
  await subClient.connect().catch(() => undefined); // duplicate() may auto-connect; ignore if already connected

  const handlers = new Map<string, Set<RealtimeHandler>>();

  subClient.on('message', (channel, payload) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    let parsed: ChatEvent;
    try {
      parsed = JSON.parse(payload) as ChatEvent;
    } catch (err) {
      app.log.warn({ err, channel }, 'realtime: malformed payload');
      return;
    }
    for (const h of set) {
      try {
        h(parsed);
      } catch (err) {
        app.log.warn({ err, channel }, 'realtime: handler threw');
      }
    }
  });

  const realtime: Realtime = {
    async publish(channel, event) {
      await app.redis.publish(channel, JSON.stringify(event));
    },
    async subscribe(channel, handler) {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
        await subClient.subscribe(channel);
      }
      set.add(handler);

      let unsubscribed = false;
      return async () => {
        if (unsubscribed) return;
        unsubscribed = true;
        const cur = handlers.get(channel);
        if (!cur) return;
        cur.delete(handler);
        if (cur.size === 0) {
          handlers.delete(channel);
          await subClient.unsubscribe(channel);
        }
      };
    },
  };

  app.decorate('realtime', realtime);
  app.addHook('onClose', async () => {
    handlers.clear();
    await subClient.quit().catch(() => undefined);
  });

  // Suppress unused var lint without changing public surface.
  void url;
};

export const realtimePlugin = fp(plugin, { name: 'realtime', dependencies: ['redis'] });
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
pnpm --filter @hockey/server test -- test/chat/realtime.test.ts
```

Expected: 5/5 pass. If a test flakes due to pub/sub delivery latency, raise the `flush()` delay to 60ms — do not lower the assertions.

- [ ] **Step 2.5: Typecheck + lint**

```bash
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/server lint
```

Expected: zero errors.

- [ ] **Step 2.6: Commit**

```bash
git add packages/server/src/plugins/realtime.ts packages/server/test/chat/realtime.test.ts
git commit -m "feat(server): realtime pub/sub plugin with handler routing"
```

---

## Task 3: `chat/events.ts` — domain → channel mapping + tests

This is the layer where "we sent a message" turns into "publish to N user channels OR 1 system channel". `routes.ts` calls these; tests verify routing.

**Files:**
- Create: `packages/server/src/chat/events.ts`
- Create: `packages/server/test/chat/events.test.ts`

- [ ] **Step 3.1: Write the failing test**

`packages/server/test/chat/events.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  publishMessageNew,
  publishMessageDeleted,
  publishChatRead,
  type EventPublisher,
} from '../../src/chat/events.js';
import type { ChatEvent, ChatMessageDTO } from '../../src/chat/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface RecordedPublish {
  channel: string;
  event: ChatEvent;
}

function recorder(): {
  publisher: EventPublisher;
  records: RecordedPublish[];
} {
  const records: RecordedPublish[] = [];
  return {
    records,
    publisher: {
      async publish(channel, event) {
        records.push({ channel, event });
      },
    },
  };
}

describe.skipIf(!hasIntegrationEnv)('chat events fan-out', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;
  let dmAB: string;
  let groupABC: string;
  let systemChat: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
    userC = (await pool.query(insU, ['Charlie'])).rows[0].id;

    const dm = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );

    const grp = await pool.query(
      `insert into chats (type, name, created_by) values ('group', $1, $2) returning id`,
      ['Squad', userA],
    );
    groupABC = grp.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3), ($1, $4)`,
      [groupABC, userA, userB, userC],
    );

    const sys = await pool.query(
      `insert into chats (type, name, created_by) values ('system', $1, $2) returning id`,
      ['Общий чат лиги', userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const fakeMsg = (chatId: string): ChatMessageDTO => ({
    id: '00000000-0000-0000-0000-000000000001',
    chatId,
    senderId: '00000000-0000-0000-0000-000000000002',
    content: 'hi',
    replyToId: null,
    isDeleted: false,
    createdAt: '2026-04-26T00:00:00.000Z',
    reactions: [],
  });

  it('DM message:new → publish per chat_member', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, dmAB, 'direct', fakeMsg(dmAB));
    const channels = records.map((r) => r.channel).sort();
    expect(channels).toEqual([`chat:user:${userA}`, `chat:user:${userB}`].sort());
    for (const r of records) {
      expect(r.event.type).toBe('message:new');
      expect((r.event as Extract<ChatEvent, { type: 'message:new' }>).chatId).toBe(dmAB);
    }
  });

  it('group message:new → publish per chat_member (3 fans)', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, groupABC, 'group', fakeMsg(groupABC));
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`, `chat:user:${userC}`].sort(),
    );
  });

  it('system message:new → exactly one publish to chat:system:<chatId>', async () => {
    const { publisher, records } = recorder();
    await publishMessageNew(pool, publisher, systemChat, 'system', fakeMsg(systemChat));
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
    expect(records[0]!.event.type).toBe('message:new');
  });

  it('publishMessageDeleted routes the same way (DM → fan-out)', async () => {
    const { publisher, records } = recorder();
    await publishMessageDeleted(pool, publisher, dmAB, 'direct', 'msg-id-x');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    expect(records[0]!.event.type).toBe('message:deleted');
  });

  it('publishMessageDeleted system → 1 publish', async () => {
    const { publisher, records } = recorder();
    await publishMessageDeleted(pool, publisher, systemChat, 'system', 'msg-id-x');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
  });

  it('publishChatRead DM → notifies the reader only (other tabs of same user)', async () => {
    const { publisher, records } = recorder();
    await publishChatRead(pool, publisher, dmAB, 'direct', userA, '2026-04-26T00:00:00.000Z');
    // chat:read is per-user (other reader's tabs) — we publish to ONLY the reader's user channel.
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:user:${userA}`);
    expect(records[0]!.event.type).toBe('chat:read');
  });

  it('publishChatRead system → reader-only too', async () => {
    const { publisher, records } = recorder();
    await publishChatRead(pool, publisher, systemChat, 'system', userC, '2026-04-26T00:00:00.000Z');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:user:${userC}`);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm --filter @hockey/server test -- test/chat/events.test.ts
```

Expected: FAIL — `Cannot find module '../../src/chat/events.js'`.

- [ ] **Step 3.3: Write `events.ts`**

`packages/server/src/chat/events.ts`:

```ts
import type { Pool } from 'pg';
import type { ChatEvent, ChatMessageDTO, ChatType } from './types.js';

// EventPublisher is the slice of `app.realtime` we need. Decoupling the
// publisher from the Fastify app lets us unit-test fan-out without booting
// Redis subscriptions.
export interface EventPublisher {
  publish(channel: string, event: ChatEvent): Promise<void>;
}

const userChannel = (userId: string) => `chat:user:${userId}`;
const systemChannel = (chatId: string) => `chat:system:${chatId}`;

async function getMemberIds(pool: Pool, chatId: string): Promise<string[]> {
  const r = await pool.query<{ user_id: string }>(
    `select user_id from chat_members where chat_id = $1`,
    [chatId],
  );
  return r.rows.map((row) => row.user_id);
}

async function fanOut(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  event: ChatEvent,
): Promise<void> {
  if (chatType === 'system') {
    await publisher.publish(systemChannel(chatId), event);
    return;
  }
  const userIds = await getMemberIds(pool, chatId);
  await Promise.all(userIds.map((uid) => publisher.publish(userChannel(uid), event)));
}

export async function publishMessageNew(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  message: ChatMessageDTO,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, { type: 'message:new', chatId, message });
}

export async function publishMessageDeleted(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, { type: 'message:deleted', chatId, messageId });
}

// chat:read is intentionally NOT broadcast to all members — read-receipts of
// the form "Alice has read this" are out of scope (spec §2). We only notify
// the reader's own other tabs so their unread badge resets in sync.
export async function publishChatRead(
  _pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  _chatType: ChatType,
  userId: string,
  lastReadAt: string,
): Promise<void> {
  await publisher.publish(userChannel(userId), {
    type: 'chat:read',
    chatId,
    userId,
    lastReadAt,
  });
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm --filter @hockey/server test -- test/chat/events.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 3.5: Typecheck + lint**

```bash
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/server lint
```

Expected: zero errors.

- [ ] **Step 3.6: Commit**

```bash
git add packages/server/src/chat/events.ts packages/server/test/chat/events.test.ts
git commit -m "feat(server): chat domain → realtime channel fan-out"
```

---

## Task 4: Wire `realtime` plugin into `app.ts`

Plugin order matters: `realtime` depends on `redis`. Register after `redisPlugin`, before chat routes (which will call `app.realtime` in PR 3 Task 6).

**Files:**
- Modify: `packages/server/src/app.ts`

- [ ] **Step 4.1: Edit `app.ts`**

`packages/server/src/app.ts`, add the import and the registration. Final contents (only the diff matters; full file shown so the reader can paste verbatim):

```ts
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { errorsPlugin } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { realtimePlugin } from './plugins/realtime.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { dailyRoutes } from './duel/daily/routes.js';
import { chatRoutes } from './chat/routes.js';

export interface BuildAppOptions {
  config?: AppConfig;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const loggerOptions =
    config.NODE_ENV === 'development'
      ? {
          level: config.LOG_LEVEL,
          transport: { target: 'pino-pretty', options: { colorize: true } },
        }
      : { level: config.LOG_LEVEL };

  const app = Fastify({ logger: loggerOptions });

  await app.register(errorsPlugin);
  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });
  await app.register(redisPlugin, { url: config.REDIS_URL });
  await app.register(realtimePlugin);
  await app.register(authPlugin, { accessSecret: config.JWT_SECRET });
  await app.register(healthRoutes);
  await app.register(authRoutes, {
    telegramBotToken: config.TELEGRAM_BOT_TOKEN,
    accessSecret: config.JWT_SECRET,
    refreshSecret: config.REFRESH_SECRET,
    devLoginEnabled: config.NODE_ENV !== 'production',
  });
  await app.register(meRoutes);
  await app.register(dailyRoutes, { dailySeedSecret: config.DAILY_SEED_SECRET });
  await app.register(chatRoutes);

  return app;
}
```

- [ ] **Step 4.2: Verify previous tests still pass**

```bash
pnpm --filter @hockey/server test
```

Expected: every PR 1+2 test still green; the new realtime + events tests pass too.

- [ ] **Step 4.3: Commit**

```bash
git add packages/server/src/app.ts
git commit -m "feat(server): register realtime plugin in app"
```

---

## Task 5: `chat/ws.ts` — WebSocket endpoint with handshake + heartbeat

This is the user-facing realtime entrypoint. It owns one WS connection's lifetime: handshake → subscribe → forward → heartbeat → unsubscribe.

**Files:**
- Create: `packages/server/src/chat/ws.ts`

- [ ] **Step 5.1: Read `@fastify/websocket` quickstart for v10**

```bash
cat node_modules/@fastify/websocket/README.md | head -100
```

Confirm: `app.register(fastifyWebsocket)` then `app.get('/path', { websocket: true }, (socket, req) => { socket.send(...); socket.on('message', ...) })`. The first handler arg is the WS itself (an instance of `WebSocket` from the `ws` lib), `req` is the Fastify request.

If the README disagrees with this shape (the v10 API renamed once: pre-10.0 used `(connection, req)` where `connection.socket` was the WS), follow the README. The example below assumes the v10 final API: `(socket, req)` where `socket` is the raw WebSocket.

- [ ] **Step 5.2: Write `ws.ts`**

`packages/server/src/chat/ws.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import type { ChatEvent, ChatEventFrame } from './types.js';
import type { Unsubscribe } from '../plugins/realtime.js';

export interface ChatWsOptions {
  accessSecret: string;
  // Server-side ping interval (ms). Default 30s per spec §5.1.
  pingIntervalMs?: number;
  // Time after a ping to wait for pong before closing. Default 10s.
  pongTimeoutMs?: number;
}

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_HEARTBEAT_LOST = 4408;

function send(socket: WebSocket, event: ChatEvent): void {
  if (socket.readyState !== socket.OPEN) return;
  const frame: ChatEventFrame = { v: 1, event };
  socket.send(JSON.stringify(frame));
}

export const chatWs: FastifyPluginAsync<ChatWsOptions> = async (app, opts) => {
  await app.register(fastifyWebsocket);

  const pingIntervalMs = opts.pingIntervalMs ?? 30_000;
  const pongTimeoutMs = opts.pongTimeoutMs ?? 10_000;

  app.get('/chat/ws', { websocket: true }, async (socket: WebSocket, req) => {
    // 1. Auth — token in query string (browsers can't set Authorization on new WebSocket()).
    const token = (req.query as { token?: string } | undefined)?.token;
    if (!token) {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }
    let userId: string;
    try {
      const payload = await verifyAccessToken(token, opts.accessSecret);
      userId = payload.sub;
    } catch {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }

    // 2. Build subscription set: own user channel + every active system channel.
    const offs: Unsubscribe[] = [];

    const userOff = await app.realtime.subscribe(`chat:user:${userId}`, (e) => send(socket, e));
    offs.push(userOff);

    const sysRows = await app.pg.query<{ id: string }>(
      `select id from chats where type = 'system' and is_active = true`,
    );
    for (const row of sysRows.rows) {
      const off = await app.realtime.subscribe(`chat:system:${row.id}`, (e) => send(socket, e));
      offs.push(off);
    }

    // 3. Heartbeat — server pings, expects pong before deadline.
    let pongDeadline: NodeJS.Timeout | null = null;
    const interval = setInterval(() => {
      if (socket.readyState !== socket.OPEN) return;
      socket.ping();
      if (pongDeadline) clearTimeout(pongDeadline);
      pongDeadline = setTimeout(() => {
        if (socket.readyState === socket.OPEN) {
          socket.close(CLOSE_HEARTBEAT_LOST, 'heartbeat lost');
        }
      }, pongTimeoutMs);
    }, pingIntervalMs);

    socket.on('pong', () => {
      if (pongDeadline) {
        clearTimeout(pongDeadline);
        pongDeadline = null;
      }
    });

    // 4. We don't accept any client-initiated frames in this PR — clients post
    //    via REST. Drop incoming text messages silently; future PRs may handle
    //    typing or presence.
    socket.on('message', () => undefined);

    // 5. Cleanup on close.
    const cleanup = async () => {
      clearInterval(interval);
      if (pongDeadline) clearTimeout(pongDeadline);
      pongDeadline = null;
      // Run unsubscribes sequentially; each is a quick Redis op or local-only.
      for (const off of offs) {
        try { await off(); } catch (err) { app.log.warn({ err }, 'ws: unsubscribe failed'); }
      }
    };
    socket.on('close', cleanup);
    socket.on('error', (err) => {
      app.log.warn({ err, userId }, 'ws: socket error');
    });
  });
};
```

- [ ] **Step 5.3: Typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: zero errors. If `@fastify/websocket` types disagree with `(socket: WebSocket, req)` (some versions wrap in `SocketStream`), follow the actual signature: import `SocketStream` and use `socket.socket` as the WS, but keep the rest of the body identical. Adjust the test in Task 7 accordingly.

- [ ] **Step 5.4: Lint**

```bash
pnpm --filter @hockey/server lint
```

Expected: zero errors.

- [ ] **Step 5.5: Commit**

```bash
git add packages/server/src/chat/ws.ts
git commit -m "feat(server): chat WebSocket endpoint with handshake + heartbeat"
```

---

## Task 6: Hook `publish*` calls into `chat/routes.ts`

After every successful DB write that should be visible to other tabs/users, fire the matching event. Keep the publish strictly *after* the cache invalidation already there, so a `GET /chat/unread` racing the WS event reads fresh DB values.

**Files:**
- Modify: `packages/server/src/chat/routes.ts`

- [ ] **Step 6.1: Edit `routes.ts`**

Add the import:

```ts
import { publishMessageNew, publishMessageDeleted, publishChatRead } from './events.js';
```

Modify three handlers. The exact diffs:

**(a) `POST /chat/:chatId/messages` — after `invalidateUnreadCache` Promise.all:**

```ts
    const dto = await sendMessage(app.pg, sendOpts);
    // Invalidate unread cache for all current members so they see fresh counts.
    const members = await app.pg.query<{ user_id: string }>(
      `select user_id from chat_members where chat_id = $1`,
      [chatId],
    );
    await Promise.all(members.rows.map((m) => invalidateUnreadCache(app.redis, m.user_id)));
    await publishMessageNew(app.pg, app.realtime, chatId, chat.type, dto);
    reply.code(201);
    return dto;
```

Note: `chat.type` comes from `assertCanAccessChat`, which already returns the `ChatRow`. Capture it:

```ts
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    await checkAndConsumeRateLimit(app.redis, userId);
```

(If `assertCanAccessChat`'s current return is `Promise<ChatRow>` — confirm in `guards.ts` — capture as above. If it returns `void`, skip and load with a small `select type from chats where id = $1` next to the existing select.)

**(b) `DELETE /chat/messages/:messageId` — after `deleteMessage`:**

The current handler has the message id but not the chat id. `assertOwnsMessage` returns the `MessageRow`, which has `chat_id`. Use it:

```ts
  app.delete(
    '/chat/messages/:messageId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const message = await assertOwnsMessage(app.pg, req.user.id, messageId);
      await deleteMessage(app.pg, messageId);
      // Need the chat type to choose the channel; one cheap select.
      const chatRow = await app.pg.query<{ type: 'direct' | 'group' | 'system' }>(
        `select type from chats where id = $1`,
        [message.chat_id],
      );
      if (chatRow.rowCount && chatRow.rowCount > 0) {
        await publishMessageDeleted(
          app.pg,
          app.realtime,
          message.chat_id,
          chatRow.rows[0]!.type,
          messageId,
        );
      }
      reply.code(204);
      return null;
    },
  );
```

**(c) `POST /chat/:chatId/read` — after `markChatAsRead`:**

```ts
  app.post('/chat/:chatId/read', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const userId = req.user.id;
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    await markChatAsRead(app.pg, chatId, userId);
    await invalidateUnreadCache(app.redis, userId);
    await publishChatRead(app.pg, app.realtime, chatId, chat.type, userId, new Date().toISOString());
    reply.code(204);
    return null;
  });
```

- [ ] **Step 6.2: Run all server tests**

```bash
pnpm --filter @hockey/server test
```

Expected: every PR 1+2 test passes (the existing `routes.test.ts` should be unaffected because it only checks status codes / bodies, and we're not subscribing in those tests so publish is a no-op against zero handlers). The new `realtime.test.ts` and `events.test.ts` pass.

- [ ] **Step 6.3: Typecheck + lint**

```bash
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/server lint
```

Expected: zero errors.

- [ ] **Step 6.4: Commit**

```bash
git add packages/server/src/chat/routes.ts
git commit -m "feat(server): publish chat events on send/delete/read"
```

---

## Task 7: Register `chatWs` in `app.ts`

Done last for the server side because all three pieces (`realtime`, `events`, `routes` publish hooks) must already be live.

**Files:**
- Modify: `packages/server/src/app.ts`

- [ ] **Step 7.1: Edit `app.ts`**

Add:

```ts
import { chatWs } from './chat/ws.js';
```

After `await app.register(chatRoutes);`:

```ts
  await app.register(chatWs, { accessSecret: config.JWT_SECRET });
```

- [ ] **Step 7.2: Smoke that the app boots**

```bash
pnpm --filter @hockey/server test -- test/chat/routes.test.ts
```

Expected: green. (This test boots the full app via `buildApp` — if WS registration is broken, this surfaces it before the dedicated WS test.)

- [ ] **Step 7.3: Commit**

```bash
git add packages/server/src/app.ts
git commit -m "feat(server): mount chat WS endpoint"
```

---

## Task 8: Integration test — real WebSocket round-trip

Spin up a real listener with `app.listen({ port: 0 })`, drive a `ws` client, prove the loop closes: client A connects, client B `POST /chat/:id/messages`, A receives `message:new`.

**Files:**
- Create: `packages/server/test/chat/ws.test.ts`

- [ ] **Step 8.1: Write the failing test**

`packages/server/test/chat/ws.test.ts`:

```ts
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
    const wsC = new WebSocket(`${baseUrl}/chat/ws?token=${await createJwt({
      accessSecret: config.JWT_SECRET,
      refreshSecret: config.REFRESH_SECRET,
    }).issueAccessToken({ sub: userC })}`);
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

    // Send first
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
      (f) => f.event.type === 'message:new' && (f.event as { message: { id: string } }).message.id === sentMsgId,
    );

    const incoming = nextFrame(
      wsA,
      (f) => f.event.type === 'message:deleted' && (f.event as { messageId: string }).messageId === sentMsgId,
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
      (f) => f.event.type === 'chat:read' && f.event.chatId === dmAB && f.event.userId === userA,
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
    const tokenC = await createJwt({
      accessSecret: config.JWT_SECRET,
      refreshSecret: config.REFRESH_SECRET,
    }).issueAccessToken({ sub: userC });
    const wsC = new WebSocket(`${baseUrl}/chat/ws?token=${tokenC}`);
    await waitOpen(wsC);

    let leaked = false;
    wsC.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as ChatEventFrame;
      if (frame.event.type === 'message:new' && frame.event.chatId === dmAB) {
        leaked = true;
      }
    });

    await app.inject({
      method: 'POST',
      url: `/chat/${dmAB}/messages`,
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      payload: { content: 'private' },
    });

    // Wait long enough that the publish + Redis round-trip finishes.
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);

    wsC.close();
  });
});
```

- [ ] **Step 8.2: Run the WS test**

```bash
pnpm --filter @hockey/server test -- test/chat/ws.test.ts
```

Expected: 7/7 pass. If a pub/sub timing flake hits, raise the 150ms wait in the leak test, **but never** weaken the leak assertion. If `tokenC` rejects with 4401, double-check `userId` extraction in `ws.ts`.

- [ ] **Step 8.3: Run the full server suite**

```bash
pnpm --filter @hockey/server test
```

Expected: every test green — PR 1, PR 2, and the new `realtime`, `events`, `ws` tests.

- [ ] **Step 8.4: Typecheck + lint**

```bash
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/server lint
```

Expected: zero errors.

- [ ] **Step 8.5: Commit**

```bash
git add packages/server/test/chat/ws.test.ts
git commit -m "test(server): integration tests for chat WS round-trip"
```

---

## Task 9: Update `CLAUDE.md`

One short addition to the existing Chat section. Project rule: keep `CLAUDE.md` ≤ 200 lines — trim to fit if needed.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 9.1: Find the Chat section**

```bash
grep -n "^### Чат" CLAUDE.md
wc -l CLAUDE.md
```

Expected: locate the section header. Confirm current line count.

- [ ] **Step 9.2: Edit the section header to mention PR3, append one line**

The current line is along the lines of "Чат (PR 1+2 — БД + REST готовы; PR 3 — realtime)". Update to "Чат (PR 1+2+3 готовы — БД, REST, realtime)" and append, after the rate-limit sentence, one short line:

```
Realtime — `@fastify/websocket` на `GET /chat/ws?token=<accessJWT>`. Сервер subscribe-ит сокет на `chat:user:<userId>` и на каждый активный `chat:system:<chatId>`. Publish — из `chat/events.ts`: для DM/group fan-out по `chat_members`, для system один broadcast (`§5.2 спека`). Кадры — `{v:1,event:ChatEvent}`. Heartbeat ping/pong 30s/10s.
```

If adding the line pushes over 200, trim something redundant (e.g., shorten the rate-limit/Redis-cache sentence) so total stays ≤ 200.

- [ ] **Step 9.3: Verify length budget**

```bash
wc -l CLAUDE.md
```

Expected: ≤ 200.

- [ ] **Step 9.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note chat WS endpoint + realtime fan-out"
```

---

## Final verification

- [ ] **Step F.1: Full workspace typecheck + lint + tests**

```bash
pnpm typecheck
pnpm lint
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test
```

Expected: every command exits 0.

- [ ] **Step F.2: Manual smoke (only if you have local Postgres + Redis up)**

```bash
brew services start postgresql@16 && brew services start redis
pnpm --filter @hockey/server db:migrate
pnpm dev:server
```

In another shell, get a dev token and connect a WS client:

```bash
curl -s -X POST localhost:3000/auth/dev -H 'content-type: application/json' \
  -d '{"telegramId":1,"displayName":"WSTest"}' | tee /tmp/dev.json
TOKEN=$(jq -r .accessToken /tmp/dev.json)
node -e "const W=require('ws'); const w=new W('ws://localhost:3000/chat/ws?token=$TOKEN'); \
  w.on('open',()=>console.log('open')); \
  w.on('message',(m)=>console.log('frame',m.toString())); \
  w.on('close',(c)=>console.log('close',c));"
```

Expected: `open`, then process stays alive. Post a message via REST in a third shell to a chat that user is a member of and watch the frame land in shell 2. Close shell 2 with Ctrl-C.

- [ ] **Step F.3: Push + open PR**

```bash
git push -u origin feat/chat-pr3-realtime
gh pr create --base main --title "feat(chat): PR 3 — realtime plugin + WebSocket endpoint" \
  --body "$(cat <<'EOF'
## Summary
- `plugins/realtime.ts`: ioredis pub/sub plugin with per-channel local handler routing (one Redis SUBSCRIBE per channel per instance).
- `chat/events.ts`: domain → channel fan-out per spec §5.2 (system → 1 broadcast, direct/group → fan-out by chat_members).
- `chat/ws.ts`: `GET /chat/ws?token=<jwt>` — handshake via `verifyAccessToken`, subscribes socket to `chat:user:<userId>` + every active `chat:system:<id>`, server-side ping/pong heartbeat (30s/10s), unsub on close.
- `chat/routes.ts`: publish `message:new` on send, `message:deleted` on delete, `chat:read` on read.

Spec: `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §5, §6.1, §11 step 3.

PR1 (migration) and PR2 (guards + REST) prerequisites already on main.

## Test plan
- [x] `pnpm --filter @hockey/server test` — realtime plugin (5), events fan-out (7), WS integration (7), all PR1+PR2 tests still green.
- [x] `pnpm typecheck && pnpm lint` clean across the workspace.
- [ ] Manual: two browser tabs / `wscat` clients on `/chat/ws?token=...`, REST `POST` from one delivers a frame to the other; non-member client does not see DM frames.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened. Return the URL to the user.

---

## Self-review checklist (run before declaring done)

- **Spec coverage** — §5.1 (transport, JWT in query, close 4401, heartbeat) ✓ Task 5; §5.2 (hybrid channels) ✓ Task 3; §5.3 (two ioredis clients, local router) ✓ Task 2; §5.4 (event union + frame `{v:1,event}`) ✓ Task 5; §5.5 reconnect/rate-limit — reconnect is client-side (PR 5); rate limit already in PR 2 (untouched here); §6.1 file layout ✓ all tasks; §10.1 perf (system broadcast → 1 publish) ✓ Task 3 + test; §10.12 (one Redis sub per channel per instance) ✓ Task 2 + tests.
- **Placeholder scan** — no TBDs, every code block is full implementation, every test asserts a concrete value.
- **Type consistency** — `EventPublisher.publish(channel, event)` matches `app.realtime.publish(...)` signature; `Unsubscribe = () => Promise<void>` used both in plugin and WS; `ChatEvent` / `ChatEventFrame` reused from PR 1 `types.ts`.
- **Out of scope respected** — no reaction publish (saves PR 6 surface), no client/web changes (PR 5), no migration changes (PR 1 done).
