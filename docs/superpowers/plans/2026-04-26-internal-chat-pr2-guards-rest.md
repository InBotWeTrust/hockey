# Internal Chat — PR 2: Guards + Service + REST routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the synchronous server-side surface of internal chat. After this PR a client can: list its chats, find/create a DM, paginate messages, send/delete a message, mark as read, search messages and users, fetch unread counts. No realtime yet — that's PR 3 (WebSocket + Redis pub/sub).

**Architecture:** Three layers in `packages/server/src/chat/`. (1) `guards.ts` — single source of truth for access checks (`canAccessChat`, `assertOwnsMessage`). (2) `service.ts` — pure business logic against the `Pool`, returns DTOs. (3) `routes.ts` — Fastify routes, zod-validated, delegate to service. Plus `cache.ts` for the Redis-cached unread-counts read path. All endpoints under `[preHandler: app.authenticate]`. Snake_case at the SQL boundary, camelCase in DTOs returned to clients.

**Tech Stack:** Fastify 4 + zod (request validation), `pg` Pool for SQL (LATERAL JOIN, advisory locks, pg_trgm), `ioredis` for unread cache + rate limit, vitest + `app.inject()` for tests.

**Spec reference:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §4 (guards), §5.5 (rate limit), §6 (API), §10.2/10.3/10.5/10.6 (perf).

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/server/src/chat/guards.ts` | `canAccessChat`, `assertCanAccessChat`, `assertOwnsMessage`, `getChatById`, `checkMembership` |
| Create | `packages/server/src/chat/service.ts` | All business operations: getMyChats, getMessages, sendMessage, deleteMessage, markChatAsRead, findOrCreateDM, searchUsers, searchMessages, getUnreadCounts |
| Create | `packages/server/src/chat/cache.ts` | Redis cache helpers: `getUnreadFromCache`, `setUnreadCache`, `invalidateUnreadCache`. Also `checkAndConsumeRateLimit`. |
| Create | `packages/server/src/chat/routes.ts` | All Fastify route registrations under one plugin function |
| Create | `packages/server/src/chat/dto.ts` | snake_case row → camelCase DTO conversion helpers |
| Create | `packages/server/src/chat/errors.ts` | Domain error classes: `ChatAccessDeniedError`, `MessageNotOwnedError`, `RateLimitedError` |
| Create | `packages/server/test/chat/guards.test.ts` | Access matrix: A vs B chat, system channel access, message ownership |
| Create | `packages/server/test/chat/service.test.ts` | All service functions, integration-level (real DB) |
| Create | `packages/server/test/chat/routes.test.ts` | All REST endpoints via `app.inject()` |
| Modify | `packages/server/src/app.ts` | Register `chatRoutes` plugin |
| Modify | `packages/server/src/plugins/errors.ts` | Map new domain errors to HTTP responses (only if existing patterns require) |
| Modify | `CLAUDE.md` | Update chat blurb to note REST endpoints exist |

---

## Pre-flight

- [ ] **Step 0.1: On the right branch with clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git branch --show-current
```

Expected: branch `feat/chat-pr2-guards-rest`, clean tree (or only untracked plan/spec docs from PR 1 already committed in main).

- [ ] **Step 0.2: Verify chat foundation in place**

```bash
ls packages/server/src/chat/
ls packages/server/db/migrations/004_chat.sql
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\d chats' | head -3
```

Expected: `seed.ts`, `seed-cli.ts`, `types.ts` exist. Migration `004_chat.sql` exists. `chats` table exists in dev DB.

- [ ] **Step 0.3: Sanity tests + db migrate**

```bash
pnpm --filter @hockey/server db:migrate
pnpm --filter @hockey/server test
```

Expected: `[migrate] up to date`. All tests pass (67/67 from PR 1).

---

## Task 1: Domain errors (`chat/errors.ts`)

Errors are referenced by all later layers, so they come first. Map them once in `errors.ts`; other plugins consume the existing `errorsPlugin`.

**Files:**
- Create: `packages/server/src/chat/errors.ts`

- [ ] **Step 1.1: Read existing error pattern**

```bash
cat packages/server/src/plugins/errors.ts
cat packages/server/src/auth/errors.ts 2>/dev/null || true
```

Note the pattern Fastify uses to convert thrown errors to HTTP responses. Likely `Error` with `statusCode` field.

- [ ] **Step 1.2: Write `errors.ts`**

```ts
// Domain errors thrown by service/guards. errorsPlugin maps them to HTTP via statusCode.

export class ChatAccessDeniedError extends Error {
  readonly statusCode = 403;
  readonly code = 'chat_access_denied';
  constructor(public readonly chatId: string) {
    super(`User does not have access to chat ${chatId}`);
    this.name = 'ChatAccessDeniedError';
  }
}

export class MessageNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'message_not_found';
  constructor(public readonly messageId: string) {
    super(`Message ${messageId} not found`);
    this.name = 'MessageNotFoundError';
  }
}

export class MessageNotOwnedError extends Error {
  readonly statusCode = 403;
  readonly code = 'message_not_owned';
  constructor(public readonly messageId: string) {
    super(`User does not own message ${messageId}`);
    this.name = 'MessageNotOwnedError';
  }
}

export class RateLimitedError extends Error {
  readonly statusCode = 429;
  readonly code = 'rate_limited';
  constructor(public readonly retryAfterSec: number) {
    super(`Rate limit exceeded; retry after ${retryAfterSec}s`);
    this.name = 'RateLimitedError';
  }
}

export class InvalidInputError extends Error {
  readonly statusCode = 400;
  readonly code = 'invalid_input';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
```

- [ ] **Step 1.3: Typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: zero errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/server/src/chat/errors.ts
git commit -m "feat(server): chat domain errors"
```

---

## Task 2: Guards (`chat/guards.ts`) — TDD

**Files:**
- Create: `packages/server/src/chat/guards.ts`
- Create: `packages/server/test/chat/guards.test.ts`

- [ ] **Step 2.1: Write the failing test**

`packages/server/test/chat/guards.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  canAccessChat,
  assertCanAccessChat,
  assertOwnsMessage,
  checkMembership,
  getChatById,
} from '../../src/chat/guards.js';
import { ChatAccessDeniedError, MessageNotFoundError, MessageNotOwnedError } from '../../src/chat/errors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat guards', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;
  let dmAB: string;
  let systemChat: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(ins, ['Alice'])).rows[0].id;
    userB = (await pool.query(ins, ['Bob'])).rows[0].id;
    userC = (await pool.query(ins, ['Charlie'])).rows[0].id;

    // DM between A and B (members exist)
    const dm = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );

    // System channel — no chat_members until lazy upsert
    const sys = await pool.query(
      `insert into chats (type, name, created_by) values ('system', $1, $2) returning id`,
      ['Общий', userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('canAccessChat', () => {
    it('member of DM has access', async () => {
      const r = await canAccessChat(pool, userA, dmAB);
      expect(r).not.toBeNull();
      expect(r!.isMember).toBe(true);
      expect(r!.chat.id).toBe(dmAB);
    });

    it('non-member of DM has NO access', async () => {
      const r = await canAccessChat(pool, userC, dmAB);
      expect(r).toBeNull();
    });

    it('any user has access to system channel (without chat_members row)', async () => {
      const r = await canAccessChat(pool, userC, systemChat);
      expect(r).not.toBeNull();
      expect(r!.isMember).toBe(false);
      expect(r!.chat.type).toBe('system');
    });

    it('returns null for nonexistent chat', async () => {
      const r = await canAccessChat(pool, userA, '00000000-0000-0000-0000-000000000000');
      expect(r).toBeNull();
    });

    it('returns null for inactive (soft-deleted) chat', async () => {
      const inactive = await pool.query(
        `insert into chats (type, created_by, is_active) values ('direct', $1, false) returning id`,
        [userA],
      );
      const r = await canAccessChat(pool, userA, inactive.rows[0].id);
      expect(r).toBeNull();
    });
  });

  describe('assertCanAccessChat', () => {
    it('returns chat row when access granted', async () => {
      const chat = await assertCanAccessChat(pool, userA, dmAB);
      expect(chat.id).toBe(dmAB);
    });

    it('throws ChatAccessDeniedError for non-member', async () => {
      await expect(assertCanAccessChat(pool, userC, dmAB)).rejects.toBeInstanceOf(
        ChatAccessDeniedError,
      );
    });
  });

  describe('checkMembership', () => {
    it('true when row exists', async () => {
      expect(await checkMembership(pool, userA, dmAB)).toBe(true);
    });
    it('false when no row', async () => {
      expect(await checkMembership(pool, userC, dmAB)).toBe(false);
    });
  });

  describe('assertOwnsMessage', () => {
    it('returns message when sender matches', async () => {
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'mine') returning id`,
        [dmAB, userA],
      );
      const m = await assertOwnsMessage(pool, userA, msg.rows[0].id);
      expect(m.id).toBe(msg.rows[0].id);
      expect(m.sender_id).toBe(userA);
    });

    it('throws MessageNotOwnedError when sender differs', async () => {
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'theirs') returning id`,
        [dmAB, userA],
      );
      await expect(assertOwnsMessage(pool, userB, msg.rows[0].id)).rejects.toBeInstanceOf(
        MessageNotOwnedError,
      );
    });

    it('throws MessageNotFoundError for missing id', async () => {
      await expect(
        assertOwnsMessage(pool, userA, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(MessageNotFoundError);
    });
  });

  describe('getChatById', () => {
    it('returns row for active chat', async () => {
      const chat = await getChatById(pool, dmAB);
      expect(chat).not.toBeNull();
      expect(chat!.is_active).toBe(true);
    });
    it('returns null when chat does not exist', async () => {
      const chat = await getChatById(pool, '00000000-0000-0000-0000-000000000000');
      expect(chat).toBeNull();
    });
  });
});
```

- [ ] **Step 2.2: Run test, expect FAIL (no module)**

```bash
pnpm --filter @hockey/server test -- test/chat/guards.test.ts 2>&1 | tail -10
```

Expected: failure due to missing `guards.js` module.

- [ ] **Step 2.3: Implement `guards.ts`**

```ts
import type { Pool } from 'pg';
import type { ChatRow, MessageRow } from './types.js';
import {
  ChatAccessDeniedError,
  MessageNotFoundError,
  MessageNotOwnedError,
} from './errors.js';

export async function getChatById(pool: Pool, chatId: string): Promise<ChatRow | null> {
  const r = await pool.query<ChatRow>(
    `select * from chats where id = $1 and is_active = true limit 1`,
    [chatId],
  );
  return r.rowCount && r.rowCount > 0 ? r.rows[0]! : null;
}

export async function checkMembership(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `select exists(select 1 from chat_members where chat_id = $1 and user_id = $2) as exists`,
    [chatId, userId],
  );
  return r.rows[0]?.exists === true;
}

export interface AccessResult {
  chat: ChatRow;
  isMember: boolean; // false for system-channel access (lazy membership)
}

export async function canAccessChat(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<AccessResult | null> {
  const chat = await getChatById(pool, chatId);
  if (!chat) return null;
  if (chat.type === 'system') return { chat, isMember: false };
  const isMember = await checkMembership(pool, userId, chatId);
  return isMember ? { chat, isMember: true } : null;
}

export async function assertCanAccessChat(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<ChatRow> {
  const result = await canAccessChat(pool, userId, chatId);
  if (!result) throw new ChatAccessDeniedError(chatId);
  return result.chat;
}

export async function assertOwnsMessage(
  pool: Pool,
  userId: string,
  messageId: string,
): Promise<MessageRow> {
  const r = await pool.query<MessageRow>(`select * from messages where id = $1 limit 1`, [
    messageId,
  ]);
  if (!r.rowCount) throw new MessageNotFoundError(messageId);
  const msg = r.rows[0]!;
  if (msg.sender_id !== userId) throw new MessageNotOwnedError(messageId);
  return msg;
}
```

- [ ] **Step 2.4: Run test, expect PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/guards.test.ts 2>&1 | tail -15
```

Expected: 14 passing tests.

- [ ] **Step 2.5: Commit**

```bash
git add packages/server/src/chat/guards.ts packages/server/test/chat/guards.test.ts
git commit -m "feat(server): chat access guards + tests"
```

---

## Task 3: DTO conversion helpers (`chat/dto.ts`)

Pure conversion: snake_case row → camelCase DTO. No DB calls.

**Files:**
- Create: `packages/server/src/chat/dto.ts`

- [ ] **Step 3.1: Write `dto.ts`**

```ts
import type {
  ChatRow,
  MessageRow,
  ChatDTO,
  ChatMessageDTO,
  MessageReactionRow,
  ReactionGroupDTO,
} from './types.js';

export function toChatMessageDTO(
  row: MessageRow,
  reactions: ReactionGroupDTO[] = [],
): ChatMessageDTO {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    content: row.is_deleted ? '' : row.content,
    replyToId: row.reply_to_id,
    isDeleted: row.is_deleted,
    createdAt: row.created_at.toISOString(),
    reactions,
  };
}

export interface ChatListAggregate {
  chat: ChatRow;
  lastMessage: MessageRow | null;
  unreadCount: number;
  dmCounterpart: ChatDTO['dmCounterpart'];
}

export function toChatDTO(agg: ChatListAggregate): ChatDTO {
  return {
    id: agg.chat.id,
    type: agg.chat.type,
    name: agg.chat.name,
    entityType: agg.chat.entity_type,
    entityId: agg.chat.entity_id,
    lastMessageAt: agg.chat.last_message_at?.toISOString() ?? null,
    unreadCount: agg.unreadCount,
    lastMessage: agg.lastMessage ? toChatMessageDTO(agg.lastMessage) : null,
    dmCounterpart: agg.dmCounterpart,
  };
}

export function groupReactions(
  rows: MessageReactionRow[],
  currentUserId: string,
): Map<string, ReactionGroupDTO[]> {
  // Result: messageId → grouped-by-emoji
  const out = new Map<string, Map<string, ReactionGroupDTO>>();
  for (const r of rows) {
    let perMessage = out.get(r.message_id);
    if (!perMessage) {
      perMessage = new Map();
      out.set(r.message_id, perMessage);
    }
    let group = perMessage.get(r.emoji);
    if (!group) {
      group = { emoji: r.emoji, count: 0, reactedByMe: false };
      perMessage.set(r.emoji, group);
    }
    group.count += 1;
    if (r.user_id === currentUserId) group.reactedByMe = true;
  }
  const result = new Map<string, ReactionGroupDTO[]>();
  for (const [msgId, byEmoji] of out) {
    result.set(msgId, [...byEmoji.values()]);
  }
  return result;
}
```

- [ ] **Step 3.2: Typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: zero errors.

- [ ] **Step 3.3: Commit**

```bash
git add packages/server/src/chat/dto.ts
git commit -m "feat(server): chat DTO conversion helpers"
```

---

## Task 4: Cache + rate-limit helpers (`chat/cache.ts`)

Pure helper functions over Redis. No business logic, just key shapes + TTLs.

**Files:**
- Create: `packages/server/src/chat/cache.ts`

- [ ] **Step 4.1: Write `cache.ts`**

```ts
import type { Redis } from 'ioredis';
import { RateLimitedError } from './errors.js';

const UNREAD_TTL_SECONDS = 10;
const RATE_LIMIT_TTL_SECONDS = 1;
const RATE_LIMIT_MAX = 5; // messages per second per user

const unreadKey = (userId: string) => `chat:unread:${userId}`;
const rateLimitKey = (userId: string) => `chat:rate:${userId}`;

export async function getUnreadFromCache(
  redis: Redis,
  userId: string,
): Promise<Record<string, number> | null> {
  const raw = await redis.get(unreadKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return null;
  }
}

export async function setUnreadCache(
  redis: Redis,
  userId: string,
  counts: Record<string, number>,
): Promise<void> {
  await redis.set(unreadKey(userId), JSON.stringify(counts), 'EX', UNREAD_TTL_SECONDS);
}

export async function invalidateUnreadCache(redis: Redis, userId: string): Promise<void> {
  await redis.del(unreadKey(userId));
}

export async function checkAndConsumeRateLimit(
  redis: Redis,
  userId: string,
): Promise<void> {
  const key = rateLimitKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_TTL_SECONDS);
  }
  if (count > RATE_LIMIT_MAX) {
    const ttl = await redis.ttl(key);
    throw new RateLimitedError(ttl > 0 ? ttl : RATE_LIMIT_TTL_SECONDS);
  }
}
```

- [ ] **Step 4.2: Typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

- [ ] **Step 4.3: Commit**

```bash
git add packages/server/src/chat/cache.ts
git commit -m "feat(server): chat unread cache + rate-limit helpers"
```

---

## Task 5: Service skeleton + getMyChats (TDD)

**Files:**
- Create: `packages/server/src/chat/service.ts`
- Create: `packages/server/test/chat/service.test.ts`

This task introduces `service.ts` and implements `getMyChats` with the LATERAL JOIN from spec §6.3, plus the DM counterpart join. Other service functions arrive in subsequent tasks.

- [ ] **Step 5.1: Write the failing test for getMyChats**

`packages/server/test/chat/service.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getMyChats } from '../../src/chat/service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat service', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let userC: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(ins, ['Alice'])).rows[0].id;
    userB = (await pool.query(ins, ['Bob'])).rows[0].id;
    userC = (await pool.query(ins, ['Charlie'])).rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean chats between tests; users persist.
    await pool.query(`delete from chat_members`);
    await pool.query(`delete from messages`);
    await pool.query(`delete from chats`);
  });

  describe('getMyChats', () => {
    it('returns empty when user has no chats and no system channels', async () => {
      const list = await getMyChats(pool, userA);
      expect(list).toEqual([]);
    });

    it('returns DM with counterpart info', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(dmId);
      expect(list[0]!.type).toBe('direct');
      expect(list[0]!.dmCounterpart?.userId).toBe(userB);
      expect(list[0]!.dmCounterpart?.displayName).toBe('Bob');
      expect(list[0]!.unreadCount).toBe(0);
      expect(list[0]!.lastMessage).toBeNull();
    });

    it('counts unread messages from others past last_read_at', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'),
         ($1, $3, now() - interval '1 hour')`,
        [dmId, userA, userB],
      );
      // Three messages from B (unread for A), one from A (own — not counted)
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values
         ($1, $2, 'hi 1'), ($1, $2, 'hi 2'), ($1, $2, 'hi 3'), ($1, $3, 'mine')`,
        [dmId, userB, userA],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.unreadCount).toBe(3);
      expect(list[0]!.lastMessage?.content).toBe('mine'); // newest
    });

    it('skips soft-deleted messages from last_message and unread count', async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'),
         ($1, $3, now() - interval '1 hour')`,
        [dmId, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values
         ($1, $2, 'visible', false), ($1, $2, 'gone', true)`,
        [dmId, userB],
      );

      const list = await getMyChats(pool, userA);
      expect(list[0]!.unreadCount).toBe(1);
      expect(list[0]!.lastMessage?.content).toBe('visible');
    });

    it('includes system channels even without chat_members row', async () => {
      await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1)`,
        [userA],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(1);
      expect(list[0]!.type).toBe('system');
      expect(list[0]!.name).toBe('Общий');
      expect(list[0]!.dmCounterpart).toBeNull();
    });

    it('orders by last_message_at desc, NULLS last', async () => {
      // Older DM with a message, newer DM without
      const old = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const oldId = old.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [oldId, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'old')`,
        [oldId, userB],
      );

      const empty = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [empty.rows[0].id, userA, userC],
      );

      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe(oldId); // has last_message_at
      expect(list[1]!.id).toBe(empty.rows[0].id); // null last_message_at
    });

    it('does not return inactive chats', async () => {
      const c = await pool.query(
        `insert into chats (type, created_by, is_active) values ('direct', $1, false) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2)`,
        [c.rows[0].id, userA],
      );
      const list = await getMyChats(pool, userA);
      expect(list).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 5.2: Run test, expect FAIL**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts 2>&1 | tail -10
```

Expected: missing module.

- [ ] **Step 5.3: Implement `service.ts` (skeleton + getMyChats)**

`packages/server/src/chat/service.ts`:

```ts
import type { Pool } from 'pg';
import type { ChatDTO, ChatRow, MessageRow } from './types.js';
import { toChatDTO, type ChatListAggregate } from './dto.js';

interface DmCounterpartRow {
  chat_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface MyChatsRow {
  // chat columns
  id: string;
  type: 'direct' | 'group' | 'system';
  name: string | null;
  created_by: string;
  entity_type: 'team' | 'tournament' | null;
  entity_id: string | null;
  last_message_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  // joined
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: Date | null;
  last_message_is_deleted: boolean | null;
  last_message_reply_to_id: string | null;
  last_message_updated_at: Date | null;
  unread_count: string; // bigint
}

export async function getMyChats(pool: Pool, userId: string): Promise<ChatDTO[]> {
  const sql = `
    with my_chat_ids as (
      select chat_id from chat_members where user_id = $1
      union
      select id from chats where type = 'system' and is_active = true
    )
    select
      c.*,
      lm.id as last_message_id,
      lm.content as last_message_content,
      lm.sender_id as last_message_sender_id,
      lm.created_at as last_message_created_at,
      lm.is_deleted as last_message_is_deleted,
      lm.reply_to_id as last_message_reply_to_id,
      lm.updated_at as last_message_updated_at,
      coalesce(unread.cnt, 0)::bigint as unread_count
    from chats c
    left join lateral (
      select id, content, sender_id, created_at, is_deleted, reply_to_id, updated_at
      from messages
      where chat_id = c.id and is_deleted = false
      order by created_at desc
      limit 1
    ) lm on true
    left join lateral (
      select count(*) as cnt
      from messages m
      left join chat_members cm
        on cm.chat_id = c.id and cm.user_id = $1
      where m.chat_id = c.id
        and m.is_deleted = false
        and m.sender_id != $1
        and m.created_at > coalesce(cm.last_read_at, '1970-01-01'::timestamptz)
    ) unread on true
    where c.id in (select chat_id from my_chat_ids)
      and c.is_active = true
    order by c.last_message_at desc nulls last
  `;
  const r = await pool.query<MyChatsRow>(sql, [userId]);
  if (r.rowCount === 0) return [];

  // Fetch DM counterparts in one batch
  const dmChatIds = r.rows.filter((row) => row.type === 'direct').map((row) => row.id);
  const counterparts = new Map<string, ChatDTO['dmCounterpart']>();
  if (dmChatIds.length > 0) {
    const cpSql = `
      select cm.chat_id, u.id as user_id, u.display_name, u.avatar_url
      from chat_members cm
      join users u on u.id = cm.user_id
      where cm.chat_id = any($1::uuid[]) and cm.user_id != $2
    `;
    const cp = await pool.query<DmCounterpartRow>(cpSql, [dmChatIds, userId]);
    for (const row of cp.rows) {
      counterparts.set(row.chat_id, {
        userId: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      });
    }
  }

  return r.rows.map((row) => {
    const chat: ChatRow = {
      id: row.id,
      type: row.type,
      name: row.name,
      created_by: row.created_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      last_message_at: row.last_message_at,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    const lastMessage: MessageRow | null = row.last_message_id
      ? {
          id: row.last_message_id,
          chat_id: row.id,
          sender_id: row.last_message_sender_id!,
          content: row.last_message_content!,
          reply_to_id: row.last_message_reply_to_id,
          is_deleted: row.last_message_is_deleted!,
          created_at: row.last_message_created_at!,
          updated_at: row.last_message_updated_at!,
        }
      : null;
    const agg: ChatListAggregate = {
      chat,
      lastMessage,
      unreadCount: Number(row.unread_count),
      dmCounterpart: row.type === 'direct' ? counterparts.get(row.id) ?? null : null,
    };
    return toChatDTO(agg);
  });
}
```

- [ ] **Step 5.4: Run test, expect PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts 2>&1 | tail -15
```

Expected: 7 passing tests in `getMyChats`.

- [ ] **Step 5.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): chat service getMyChats with LATERAL JOIN + tests"
```

---

## Task 6: getMessages pagination

**Files:**
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/test/chat/service.test.ts`

- [ ] **Step 6.1: Add failing test for getMessages**

Append inside the existing `describe.skipIf(!hasIntegrationEnv)('chat service', ...)` block in `service.test.ts`:

```ts
  describe('getMessages', () => {
    it('returns messages for a chat newest-first, limited to 50', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      // Insert 60 messages
      for (let i = 0; i < 60; i++) {
        await pool.query(
          `insert into messages (chat_id, sender_id, content, created_at) values ($1, $2, $3, now() - interval '1 minute' * $4)`,
          [dmId, userA, `msg${i}`, 60 - i],
        );
      }

      const page1 = await getMessages(pool, dmId, userA, { limit: 50 });
      expect(page1).toHaveLength(50);
      expect(page1[0]!.content).toBe('msg59'); // newest first
      expect(page1[49]!.content).toBe('msg10');
    });

    it('paginates with before-cursor', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      for (let i = 0; i < 60; i++) {
        await pool.query(
          `insert into messages (chat_id, sender_id, content, created_at) values ($1, $2, $3, now() - interval '1 minute' * $4)`,
          [dmId, userA, `msg${i}`, 60 - i],
        );
      }

      const page1 = await getMessages(pool, dmId, userA, { limit: 50 });
      const oldestOnPage1 = page1[49]!;
      const page2 = await getMessages(pool, dmId, userA, {
        limit: 50,
        before: oldestOnPage1.createdAt,
      });
      expect(page2).toHaveLength(10);
      expect(page2[0]!.content).toBe('msg9');
    });

    it('soft-deleted messages have content="" and isDeleted=true', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2)`,
        [dmId, userA],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content, is_deleted) values ($1, $2, 'gone', true)`,
        [dmId, userA],
      );
      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      expect(list[0]!.isDeleted).toBe(true);
      expect(list[0]!.content).toBe('');
    });

    it('groups reactions by emoji and flags reactedByMe', async () => {
      const { getMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
        [dmId, userA],
      );
      const messageId = msg.rows[0].id;
      await pool.query(
        `insert into message_reactions (message_id, user_id, emoji) values
         ($1, $2, '🔥'), ($1, $3, '🔥'), ($1, $2, '👍')`,
        [messageId, userA, userB],
      );

      const list = await getMessages(pool, dmId, userA, { limit: 50 });
      const m = list[0]!;
      const fire = m.reactions.find((r) => r.emoji === '🔥')!;
      const thumb = m.reactions.find((r) => r.emoji === '👍')!;
      expect(fire.count).toBe(2);
      expect(fire.reactedByMe).toBe(true);
      expect(thumb.count).toBe(1);
      expect(thumb.reactedByMe).toBe(true);
    });
  });
```

- [ ] **Step 6.2: Run test, expect FAIL**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts -t "getMessages" 2>&1 | tail -15
```

Expected: failure (`getMessages is not a function`).

- [ ] **Step 6.3: Add `getMessages` to `service.ts`**

Append at the bottom:

```ts
import type { ChatMessageDTO, MessageReactionRow } from './types.js';
import { groupReactions, toChatMessageDTO } from './dto.js';

export interface GetMessagesOpts {
  limit: number;
  before?: string; // ISO timestamp; messages older than this
}

export async function getMessages(
  pool: Pool,
  chatId: string,
  currentUserId: string,
  opts: GetMessagesOpts,
): Promise<ChatMessageDTO[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const params: unknown[] = [chatId];
  let beforeClause = '';
  if (opts.before) {
    params.push(opts.before);
    beforeClause = `and m.created_at < $${params.length}`;
  }
  params.push(limit);
  const sql = `
    select m.*
    from messages m
    where m.chat_id = $1
      ${beforeClause}
    order by m.created_at desc
    limit $${params.length}
  `;
  const r = await pool.query<MessageRow>(sql, params);
  if (r.rowCount === 0) return [];

  // Batch reactions by message_id
  const messageIds = r.rows.map((row) => row.id);
  const rxns = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = any($1::uuid[])`,
    [messageIds],
  );
  const grouped = groupReactions(rxns.rows, currentUserId);

  return r.rows.map((row) => toChatMessageDTO(row, grouped.get(row.id) ?? []));
}
```

(The `import type` at the top of the file should be merged with existing imports — adjust as needed.)

- [ ] **Step 6.4: Run test, expect PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts 2>&1 | tail -10
```

Expected: all `getMessages` tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): chat service getMessages with pagination + reactions batch"
```

---

## Task 7: sendMessage + deleteMessage + markChatAsRead

These three operations are small, related, and share test fixtures. Combined into one task with three sub-step groups.

**Files:**
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/test/chat/service.test.ts`

- [ ] **Step 7.1: Add tests for sendMessage**

Append:

```ts
  describe('sendMessage', () => {
    let dmId: string;
    beforeEach(async () => {
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dmId, userA, userB],
      );
    });

    it('inserts a message and returns DTO', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const dto = await sendMessage(pool, { chatId: dmId, senderId: userA, content: 'hi' });
      expect(dto.content).toBe('hi');
      expect(dto.senderId).toBe(userA);
      expect(dto.chatId).toBe(dmId);
      expect(dto.replyToId).toBeNull();
      expect(dto.isDeleted).toBe(false);
    });

    it('preserves replyToId when provided', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const first = await sendMessage(pool, { chatId: dmId, senderId: userA, content: 'parent' });
      const reply = await sendMessage(pool, {
        chatId: dmId,
        senderId: userB,
        content: 'reply',
        replyToId: first.id,
      });
      expect(reply.replyToId).toBe(first.id);
    });

    it('lazy-upserts chat_member for system channel sender', async () => {
      const { sendMessage } = await import('../../src/chat/service.js');
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      const before = await pool.query(`select count(*) as c from chat_members where chat_id = $1`, [
        sys.rows[0].id,
      ]);
      expect(Number(before.rows[0].c)).toBe(0);
      await sendMessage(pool, { chatId: sys.rows[0].id, senderId: userC, content: 'first' });
      const after = await pool.query(`select count(*) as c from chat_members where chat_id = $1`, [
        sys.rows[0].id,
      ]);
      expect(Number(after.rows[0].c)).toBe(1);
    });
  });

  describe('deleteMessage', () => {
    it('soft-deletes: sets is_deleted=true and content=""', async () => {
      const { deleteMessage } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const msg = await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'gone') returning id`,
        [dm.rows[0].id, userA],
      );
      await deleteMessage(pool, msg.rows[0].id);
      const r = await pool.query(`select content, is_deleted from messages where id = $1`, [msg.rows[0].id]);
      expect(r.rows[0].is_deleted).toBe(true);
      expect(r.rows[0].content).toBe('');
    });
  });

  describe('markChatAsRead', () => {
    it('updates last_read_at when membership exists', async () => {
      const { markChatAsRead } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      const dmId = dm.rows[0].id;
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values ($1, $2, now() - interval '1 day')`,
        [dmId, userA],
      );
      await markChatAsRead(pool, dmId, userA);
      const r = await pool.query(
        `select last_read_at from chat_members where chat_id = $1 and user_id = $2`,
        [dmId, userA],
      );
      const ts = r.rows[0].last_read_at as Date;
      expect(Date.now() - ts.getTime()).toBeLessThan(2000);
    });

    it('lazy-creates chat_members row for system channel readers', async () => {
      const { markChatAsRead } = await import('../../src/chat/service.js');
      const sys = await pool.query(
        `insert into chats (type, name, created_by) values ('system', 'Общий', $1) returning id`,
        [userA],
      );
      await markChatAsRead(pool, sys.rows[0].id, userC);
      const r = await pool.query(
        `select count(*) as c from chat_members where chat_id = $1 and user_id = $2`,
        [sys.rows[0].id, userC],
      );
      expect(Number(r.rows[0].c)).toBe(1);
    });
  });
```

- [ ] **Step 7.2: Run tests, expect FAIL**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts 2>&1 | tail -15
```

- [ ] **Step 7.3: Implement the three functions in `service.ts`**

Append:

```ts
export interface SendMessageOpts {
  chatId: string;
  senderId: string;
  content: string;
  replyToId?: string;
}

export async function sendMessage(pool: Pool, opts: SendMessageOpts): Promise<ChatMessageDTO> {
  // Lazy-upsert chat_members for system-channel senders so unread/lastRead works downstream.
  await pool.query(
    `insert into chat_members (chat_id, user_id) values ($1, $2)
     on conflict (chat_id, user_id) do nothing`,
    [opts.chatId, opts.senderId],
  );
  const r = await pool.query<MessageRow>(
    `insert into messages (chat_id, sender_id, content, reply_to_id)
     values ($1, $2, $3, $4) returning *`,
    [opts.chatId, opts.senderId, opts.content, opts.replyToId ?? null],
  );
  return toChatMessageDTO(r.rows[0]!);
}

export async function deleteMessage(pool: Pool, messageId: string): Promise<void> {
  await pool.query(
    `update messages set is_deleted = true, content = '', updated_at = now() where id = $1`,
    [messageId],
  );
}

export async function markChatAsRead(
  pool: Pool,
  chatId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into chat_members (chat_id, user_id, last_read_at)
     values ($1, $2, now())
     on conflict (chat_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [chatId, userId],
  );
}
```

- [ ] **Step 7.4: Run tests, expect PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/service.test.ts 2>&1 | tail -15
```

- [ ] **Step 7.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): sendMessage, deleteMessage, markChatAsRead"
```

---

## Task 8: findOrCreateDM (advisory lock)

**Files:**
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/test/chat/service.test.ts`

- [ ] **Step 8.1: Add failing test**

```ts
  describe('findOrCreateDM', () => {
    it('creates a new DM and returns chatId', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      const r = await findOrCreateDM(pool, userA, userB);
      expect(r.chatId).toBeTruthy();
      expect(r.created).toBe(true);

      const chat = await pool.query(`select * from chats where id = $1`, [r.chatId]);
      expect(chat.rows[0].type).toBe('direct');

      const members = await pool.query(
        `select user_id from chat_members where chat_id = $1 order by user_id`,
        [r.chatId],
      );
      expect(members.rowCount).toBe(2);
    });

    it('is idempotent: second call returns the same chatId', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      const r1 = await findOrCreateDM(pool, userA, userB);
      const r2 = await findOrCreateDM(pool, userB, userA); // reversed order
      expect(r2.chatId).toBe(r1.chatId);
      expect(r2.created).toBe(false);
    });

    it('rejects self-DM', async () => {
      const { findOrCreateDM } = await import('../../src/chat/service.js');
      await expect(findOrCreateDM(pool, userA, userA)).rejects.toThrow(/self/i);
    });
  });
```

- [ ] **Step 8.2: Run, expect FAIL**

- [ ] **Step 8.3: Implement findOrCreateDM**

```ts
import { InvalidInputError } from './errors.js';

export interface FindOrCreateDMResult {
  chatId: string;
  created: boolean;
}

export async function findOrCreateDM(
  pool: Pool,
  userA: string,
  userB: string,
): Promise<FindOrCreateDMResult> {
  if (userA === userB) {
    throw new InvalidInputError('Cannot create a DM with yourself');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Advisory lock keyed on the unordered pair (LEAST, GREATEST).
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended(least($1, $2)::text || greatest($1, $2)::text, 0))`,
      [userA, userB],
    );

    const existing = await client.query<{ id: string }>(
      `select c.id
       from chats c
       join chat_members m1 on m1.chat_id = c.id and m1.user_id = $1
       join chat_members m2 on m2.chat_id = c.id and m2.user_id = $2
       where c.type = 'direct' and c.is_active = true
       limit 1`,
      [userA, userB],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('commit');
      return { chatId: existing.rows[0]!.id, created: false };
    }

    const created = await client.query<{ id: string }>(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = created.rows[0]!.id;
    await client.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [chatId, userA, userB],
    );
    await client.query('commit');
    return { chatId, created: true };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 8.4: Run tests, expect PASS**

- [ ] **Step 8.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): findOrCreateDM with pair advisory lock"
```

---

## Task 9: searchUsers + searchMessages

**Files:**
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/test/chat/service.test.ts`

- [ ] **Step 9.1: Add tests**

```ts
  describe('searchUsers', () => {
    it('returns users matching trigram similarity, excluding self', async () => {
      const { searchUsers } = await import('../../src/chat/service.js');
      const list = await searchUsers(pool, userA, { q: 'bo', limit: 10 });
      expect(list.find((u) => u.userId === userB)).toBeTruthy();
      expect(list.find((u) => u.userId === userA)).toBeFalsy();
    });

    it('returns empty for very short queries', async () => {
      const { searchUsers } = await import('../../src/chat/service.js');
      const list = await searchUsers(pool, userA, { q: '', limit: 10 });
      expect(list).toEqual([]);
    });
  });

  describe('searchMessages', () => {
    it('returns full-text matches in user-accessible chats', async () => {
      const { searchMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dm.rows[0].id, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values
         ($1, $2, 'hello world'),
         ($1, $2, 'привет мир'),
         ($1, $2, 'unrelated text')`,
        [dm.rows[0].id, userA],
      );
      const found = await searchMessages(pool, userA, { q: 'мир', limit: 10 });
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found[0]!.content).toContain('мир');
    });

    it('does not return messages from chats the user has no access to', async () => {
      const { searchMessages } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userB],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
        [dm.rows[0].id, userB, userC],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values ($1, $2, 'secret payload')`,
        [dm.rows[0].id, userB],
      );
      const found = await searchMessages(pool, userA, { q: 'secret', limit: 10 });
      expect(found).toEqual([]);
    });
  });
```

- [ ] **Step 9.2: Run, expect FAIL**

- [ ] **Step 9.3: Implement search functions**

```ts
export interface UserPickerItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function searchUsers(
  pool: Pool,
  currentUserId: string,
  opts: { q: string; limit: number },
): Promise<UserPickerItem[]> {
  const q = opts.q.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(opts.limit, 1), 50);
  const r = await pool.query<{ id: string; display_name: string; avatar_url: string | null }>(
    `select id, display_name, avatar_url from users
     where id != $1 and display_name ilike '%' || $2 || '%'
     order by similarity(display_name, $2) desc
     limit $3`,
    [currentUserId, q, limit],
  );
  return r.rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));
}

export interface MessageSearchHit {
  id: string;
  chatId: string;
  content: string;
  senderName: string;
  createdAt: string;
}

export async function searchMessages(
  pool: Pool,
  currentUserId: string,
  opts: { q: string; limit: number },
): Promise<MessageSearchHit[]> {
  const q = opts.q.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const r = await pool.query<{
    id: string;
    chat_id: string;
    content: string;
    sender_name: string;
    created_at: Date;
  }>(
    `select m.id, m.chat_id, m.content, u.display_name as sender_name, m.created_at
     from messages m
     join users u on u.id = m.sender_id
     where m.chat_id in (
       select chat_id from chat_members where user_id = $1
       union
       select id from chats where type = 'system' and is_active = true
     )
       and m.is_deleted = false
       and m.search_vector @@ plainto_tsquery('russian', $2)
     order by m.created_at desc
     limit $3`,
    [currentUserId, q, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    content: row.content,
    senderName: row.sender_name,
    createdAt: row.created_at.toISOString(),
  }));
}
```

- [ ] **Step 9.4: Run tests, expect PASS**

- [ ] **Step 9.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): chat searchUsers (pg_trgm) + searchMessages (full-text)"
```

---

## Task 10: getUnreadCounts (with cache)

**Files:**
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/test/chat/service.test.ts`

- [ ] **Step 10.1: Add tests (uses real Redis)**

```ts
  describe('getUnreadCounts', () => {
    it('returns map of chatId -> count', async () => {
      const { getUnreadCounts } = await import('../../src/chat/service.js');
      const dm = await pool.query(
        `insert into chats (type, created_by) values ('direct', $1) returning id`,
        [userA],
      );
      await pool.query(
        `insert into chat_members (chat_id, user_id, last_read_at) values
         ($1, $2, now() - interval '1 hour'), ($1, $3, now() - interval '1 hour')`,
        [dm.rows[0].id, userA, userB],
      );
      await pool.query(
        `insert into messages (chat_id, sender_id, content) values
         ($1, $2, 'a'), ($1, $2, 'b')`,
        [dm.rows[0].id, userB],
      );

      const map = await getUnreadCounts(pool, userA);
      expect(map[dm.rows[0].id]).toBe(2);
    });
  });
```

- [ ] **Step 10.2: Run, expect FAIL**

- [ ] **Step 10.3: Implement (NO cache yet — service-level only)**

```ts
export async function getUnreadCounts(
  pool: Pool,
  userId: string,
): Promise<Record<string, number>> {
  const sql = `
    select m.chat_id, count(m.id)::bigint as cnt
    from messages m
    join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = $1
    where m.created_at > cm.last_read_at
      and m.sender_id != $1
      and m.is_deleted = false
    group by m.chat_id
  `;
  const r = await pool.query<{ chat_id: string; cnt: string }>(sql, [userId]);
  const out: Record<string, number> = {};
  for (const row of r.rows) {
    out[row.chat_id] = Number(row.cnt);
  }
  return out;
}
```

- [ ] **Step 10.4: Run tests, expect PASS**

- [ ] **Step 10.5: Commit**

```bash
git add packages/server/src/chat/service.ts packages/server/test/chat/service.test.ts
git commit -m "feat(server): chat service getUnreadCounts"
```

---

## Task 11: Routes plugin (`chat/routes.ts`)

This task is large but mostly mechanical: zod schemas + route handlers that call service. Test via `app.inject()`.

**Files:**
- Create: `packages/server/src/chat/routes.ts`
- Create: `packages/server/test/chat/routes.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 11.1: Read existing route pattern**

```bash
cat packages/server/src/routes/me.ts
cat packages/server/src/duel/daily/routes.ts | head -80
cat packages/server/src/app.ts
```

Note: routes register as Fastify plugin functions; `app.authenticate` is the auth pre-handler; zod validates body/params.

- [ ] **Step 11.2: Implement `routes.ts`**

Create `packages/server/src/chat/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getMyChats,
  getMessages,
  sendMessage,
  deleteMessage,
  markChatAsRead,
  findOrCreateDM,
  searchUsers,
  searchMessages,
  getUnreadCounts,
} from './service.js';
import { assertCanAccessChat, assertOwnsMessage } from './guards.js';
import { checkAndConsumeRateLimit, invalidateUnreadCache, getUnreadFromCache, setUnreadCache } from './cache.js';

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/chat/list', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user!.id;
    return await getMyChats(app.db, userId);
  });

  app.post('/chat/dm', { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ otherUserId: uuid }).parse(req.body);
    const userId = req.user!.id;
    return await findOrCreateDM(app.db, userId, body.otherUserId);
  });

  app.get('/chat/users', { preHandler: [app.authenticate] }, async (req) => {
    const query = z.object({
      q: z.string().min(1).max(100),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    return await searchUsers(app.db, req.user!.id, query);
  });

  app.get('/chat/:chatId/messages', { preHandler: [app.authenticate] }, async (req) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const query = z.object({
      before: isoDate.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    await assertCanAccessChat(app.db, req.user!.id, chatId);
    return await getMessages(app.db, chatId, req.user!.id, query);
  });

  app.post('/chat/:chatId/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const body = z.object({
      content: z.string().min(1).max(4000),
      replyToId: uuid.optional(),
    }).parse(req.body);
    const userId = req.user!.id;
    await assertCanAccessChat(app.db, userId, chatId);
    await checkAndConsumeRateLimit(app.redis, userId);
    const dto = await sendMessage(app.db, {
      chatId,
      senderId: userId,
      content: body.content,
      replyToId: body.replyToId,
    });
    // Invalidate unread cache for all members so they get fresh counts on next /chat/unread.
    // For DM/group: select members and del their cache. For system: skip — too many users.
    const members = await app.db.query<{ user_id: string }>(
      `select user_id from chat_members where chat_id = $1`,
      [chatId],
    );
    await Promise.all(members.rows.map((m) => invalidateUnreadCache(app.redis, m.user_id)));
    reply.code(201);
    return dto;
  });

  app.delete('/chat/messages/:messageId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { messageId } = z.object({ messageId: uuid }).parse(req.params);
    await assertOwnsMessage(app.db, req.user!.id, messageId);
    await deleteMessage(app.db, messageId);
    reply.code(204);
    return null;
  });

  app.post('/chat/:chatId/read', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const userId = req.user!.id;
    await assertCanAccessChat(app.db, userId, chatId);
    await markChatAsRead(app.db, chatId, userId);
    await invalidateUnreadCache(app.redis, userId);
    reply.code(204);
    return null;
  });

  app.get('/chat/search', { preHandler: [app.authenticate] }, async (req) => {
    const query = z.object({
      q: z.string().min(1).max(200),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    return await searchMessages(app.db, req.user!.id, query);
  });

  app.get('/chat/unread', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user!.id;
    const cached = await getUnreadFromCache(app.redis, userId);
    if (cached) return cached;
    const counts = await getUnreadCounts(app.db, userId);
    await setUnreadCache(app.redis, userId, counts);
    return counts;
  });
}
```

- [ ] **Step 11.3: Mount in `app.ts`**

Edit `packages/server/src/app.ts`. Find where existing routes register (after `authPlugin`) and add `await app.register(chatRoutes)`. Import at top: `import { chatRoutes } from './chat/routes.js';`. Don't break anything else.

- [ ] **Step 11.4: Write `routes.test.ts`**

Create `packages/server/test/chat/routes.test.ts`. Outline:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { hasIntegrationEnv, getTestUrls, createTestPool, createTestRedis, resetDatabase, resetRedis } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { signAccessToken } from '../../src/auth/jwt.js';
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
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    await redis.quit();

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    app = await buildApp();
    await app.ready();

    const ins = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await app.db.query(ins, ['Alice'])).rows[0].id;
    userB = (await app.db.query(ins, ['Bob'])).rows[0].id;
    userC = (await app.db.query(ins, ['Charlie'])).rows[0].id;

    tokenA = await signAccessToken({ sub: userA }, app.config.JWT_SECRET);
    tokenB = await signAccessToken({ sub: userB }, app.config.JWT_SECRET);
    tokenC = await signAccessToken({ sub: userC }, app.config.JWT_SECRET);
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
    expect(list.json().some((c: any) => c.id === chatId)).toBe(true);
  });

  it('POST /chat/:id/messages → GET messages', async () => {
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
    expect(msgs.json()).toHaveLength(1);
    expect(msgs.json()[0].content).toBe('hi B');
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

  it('GET /chat/users returns trigram matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/users?q=Bo&limit=5',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.some((u: any) => u.userId === userB)).toBe(true);
    expect(list.some((u: any) => u.userId === userA)).toBe(false);
  });

  it('GET /chat/unread returns map and uses Redis cache on second call', async () => {
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
});
```

- [ ] **Step 11.5: Verify the auth helper signature**

Likely `signAccessToken({ sub }, secret)` exists in `packages/server/src/auth/jwt.ts`. If the helper has a different signature, adjust the test imports/usage to match. Read the actual file once and adapt:

```bash
cat packages/server/src/auth/jwt.ts | head -30
```

If e.g. `signAccessToken(payload, opts)` takes a config object instead, fix the calls accordingly.

- [ ] **Step 11.6: Run all chat tests**

```bash
pnpm --filter @hockey/server test -- test/chat/ 2>&1 | tail -25
```

Expected: all green (guards, service, routes — many tests).

- [ ] **Step 11.7: Commit**

```bash
git add packages/server/src/chat/routes.ts packages/server/src/app.ts packages/server/test/chat/routes.test.ts
git commit -m "feat(server): chat REST routes + integration tests"
```

---

## Task 12: CLAUDE.md update + final checks + push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 12.1: Update chat blurb in CLAUDE.md**

Replace the existing "### Чат (в работе ...)" paragraph with:

```markdown
### Чат (PR 2 — REST готов; PR 3 — realtime в работе)

Внутренний мессенджер: DM 1-на-1, системные каналы, задел под чаты команд/турниров (`chats.entity_type/entity_id`). Таблицы: `chats`, `chat_members`, `messages`, `message_reactions` (миграция `004_chat.sql`). RLS нет — проверки в `chat/guards.ts` (`assertCanAccessChat`, `assertOwnsMessage`). Сервис `chat/service.ts`: `getMyChats` (LATERAL JOIN), `findOrCreateDM` (advisory lock на пару), `getMessages` (before-cursor + батч-реакции), `sendMessage`/`deleteMessage`/`markChatAsRead`, `searchUsers` (pg_trgm), `searchMessages` (tsvector russian), `getUnreadCounts` (Redis-cache 10s). REST под `/chat/*` (см. `routes.ts`). Rate limit 5 msg/sec через Redis INCR. Realtime (WebSocket + Redis pub/sub) — PR 3. Системные каналы создаются через `pnpm chat:seed "<name>"` + `SYSTEM_USER_ID` env. Спек: `docs/superpowers/specs/2026-04-26-internal-chat-design.md`.
```

Verify ≤200 lines:

```bash
wc -l "/Users/egorgumenyuk/Projects/Ultimate Hockey/CLAUDE.md"
```

If over, trim something else (e.g. older roadmap reference). Aim ≤195 to leave headroom for PR 3.

- [ ] **Step 12.2: Run full server test suite + typecheck + lint**

```bash
pnpm --filter @hockey/server test 2>&1 | tail -10
pnpm typecheck 2>&1 | tail -10
pnpm lint 2>&1 | tail -10
```

All must be green. If any of these fail, fix before pushing.

- [ ] **Step 12.3: Commit CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: update chat blurb to reflect PR 2 REST surface"
```

- [ ] **Step 12.4: Push and open PR**

```bash
git push -u origin feat/chat-pr2-guards-rest
gh pr create --title "feat(chat): PR 2 — guards + service + REST routes" --body "..."
```

---

## Verification (full PR check)

```bash
git checkout feat/chat-pr2-guards-rest
pnpm install
pnpm --filter @hockey/server db:migrate
pnpm --filter @hockey/server test -- test/chat/
```

Manual smoke test (after `pnpm dev:server` running):

```bash
# Login two users via /auth/dev to grab tokens A and B (existing dev flow).
TOKEN_A=...
TOKEN_B=...
USER_B_ID=...

# Create a DM
curl -s -X POST localhost:3000/chat/dm \
  -H "Authorization: Bearer $TOKEN_A" -H 'content-type: application/json' \
  -d "{\"otherUserId\":\"$USER_B_ID\"}"

# List my chats
curl -s localhost:3000/chat/list -H "Authorization: Bearer $TOKEN_A" | jq

# Send a message (replace CHAT_ID)
CHAT_ID=...
curl -s -X POST "localhost:3000/chat/$CHAT_ID/messages" \
  -H "Authorization: Bearer $TOKEN_A" -H 'content-type: application/json' \
  -d '{"content":"hello world"}'

# B reads them
curl -s "localhost:3000/chat/$CHAT_ID/messages" -H "Authorization: Bearer $TOKEN_B" | jq

# B's unread
curl -s localhost:3000/chat/unread -H "Authorization: Bearer $TOKEN_B" | jq
```

Expected: all 200/201/204 codes, unread map reflects sent messages, list includes the DM with `dmCounterpart` populated.

---

## Out of scope (later PRs)

- WebSocket endpoint + Redis pub/sub (`plugins/realtime.ts`, `chat/ws.ts`, `chat/events.ts`) — PR 3.
- Web frontend (api/store/screens/components) — PR 4–5.
- Reactions endpoints (`POST /chat/messages/:id/reactions`) — PR 6.
- Long-press menu, reply preview, soft-delete UX — PR 8.

After this PR is merged, write a fresh implementation plan for PR 3 (Realtime) before starting it.
