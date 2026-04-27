# Chat PR 8 — Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship server endpoints + web UI for message reactions with optimistic updates, WS dedup of self-events, and one-reaction-per-user-per-message constraint. Adjacent: change `BottomNav` badge to count chats-with-unread instead of summing messages.

**Architecture:** Postgres migration `005` reduces UNIQUE on `message_reactions` to `(message_id, user_id)`. Server `addReaction` is a transactional `DELETE prev → INSERT ON CONFLICT DO NOTHING`, returning what changed; events publish only on actual DB changes. Web maintains `reactions[]` inside the existing `chatKeys.messages(chatId)` cache; mutations apply optimistic switch with rollback on error; WS events dedup self-emitted changes by comparing `event.userId` to current `meId`. `MessageActionsMenu` gains a 6-emoji shelf + a `+` button that opens `ReactionPicker` (3×8 grid). Reactions appear under each bubble in `ReactionBar` (flex-wrap pills).

**Tech Stack:** pnpm monorepo. `@hockey/server` Fastify 4 + Postgres 16 + Redis 7 (vitest + `app.inject()` + integration env `TEST_DATABASE_URL`/`TEST_REDIS_URL`). `@hockey/web` React 18 + Vite + TanStack Query + Zustand (vitest + jsdom + Testing Library).

**Spec:** `docs/superpowers/specs/2026-04-28-chat-pr8-reactions-design.md`.

**Branch:** `feat/chat-pr8-reactions` (already created from `main`, spec committed in `466f0fe`).

---

## File map

**Created:**
- `packages/server/db/migrations/005_chat_reaction_user_unique.sql`
- `packages/server/src/chat/whitelist.ts`
- `packages/server/test/chat/whitelist.test.ts`
- `packages/server/test/chat/service.reactions.test.ts`
- `packages/server/test/chat/events.reactions.test.ts`
- `packages/server/test/chat/routes.reactions.test.ts`
- `packages/web/src/chat/reactions.ts`
- `packages/web/src/chat/reactionsState.ts`
- `packages/web/src/chat/components/ReactionBar.tsx`
- `packages/web/src/chat/components/ReactionPicker.tsx`
- `packages/web/src/chat/test/reactions.test.ts`
- `packages/web/src/chat/test/reactionsState.test.ts`
- `packages/web/src/chat/test/ReactionBar.test.tsx`
- `packages/web/src/chat/test/ReactionPicker.test.tsx`
- `packages/web/src/chat/test/MessageActionsMenu.test.tsx`

**Modified:**
- `packages/server/src/chat/types.ts` — add `AddReactionResult`.
- `packages/server/src/chat/service.ts` — add `getMessageOr404`, `addReaction`, `removeReaction`.
- `packages/server/src/chat/events.ts` — add `publishReactionAdded`, `publishReactionRemoved`.
- `packages/server/src/chat/routes.ts` — register POST/DELETE `/chat/messages/:messageId/reactions`.
- `packages/server/test/chat/migration.test.ts` — append cases for new UNIQUE.
- `packages/web/src/chat/api.ts` — add `addReaction`, `removeReaction`, `AddReactionResponse`.
- `packages/web/src/chat/components/MessageActionsMenu.tsx` — emoji shelf + `+` button + new props.
- `packages/web/src/chat/components/ChatBubble.tsx` — `<ReactionBar>` slot + `onReact` prop.
- `packages/web/src/chat/screens/ChatRoomScreen.tsx` — `addMut`/`removeMut`, picker state, callbacks.
- `packages/web/src/chat/useChatSocket.ts` — replace `applyReactionChange` with `applyReactionEvent` patching `chatKeys.messages`.
- `packages/web/src/chat/chatStore.ts` — `totalUnread()` returns count of chats with `>0` unread.
- `packages/web/src/chat/test/chatStore.test.ts` — rewrite "sums" test, add new case.
- `packages/web/src/chat/test/useChatSocket.test.tsx` — replace old reaction test, add 6 new cases.
- `packages/web/src/chat/test/ChatRoomScreen.test.tsx` — extend with reaction flows.
- `packages/web/src/lib/queryKeys.ts` — remove `reactions(...)`.
- `CLAUDE.md` — append "PR 8 — реакции" line to chat paragraph.

---

## Pre-flight

- [ ] **Step 0.1: Verify branch state**

Run:
```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git log --oneline -3
```

Expected:
```
On branch feat/chat-pr8-reactions
nothing to commit, working tree clean

466f0fe docs(chat): PR 8 design spec — reactions + bottomnav badge semantics
1f7f7be fix(web): move BottomNav outside transform container; add box-sizing fix
...
```

If working tree is dirty or branch differs — stop and reconcile manually.

- [ ] **Step 0.2: Verify infra**

Run:
```bash
brew services list | grep -E 'postgresql|redis'
```

Expected: both `postgresql@16` and `redis` are `started`. If not, `brew services start postgresql@16 && brew services start redis`.

- [ ] **Step 0.3: Build game-core (server tests need its dist)**

Run:
```bash
pnpm --filter @hockey/game-core build
```

Expected: builds without errors. Skip on subsequent runs unless game-core changed.

---

## Phase 1: Migration 005 (one reaction per user per message)

### Task 1.1: Write the migration SQL

**Files:**
- Create: `packages/server/db/migrations/005_chat_reaction_user_unique.sql`

- [ ] **Step 1.1.1: Create the migration file**

Write `packages/server/db/migrations/005_chat_reaction_user_unique.sql`:

```sql
-- 005_chat_reaction_user_unique.sql
-- Reduce UNIQUE on message_reactions to (message_id, user_id):
-- one user may have at most one reaction on a given message.
-- See spec docs/superpowers/specs/2026-04-28-chat-pr8-reactions-design.md §3.

-- 1. Defensive dedup: keep the earliest reaction per (message, user).
delete from message_reactions r
 where r.id not in (
   select min(r2.id)
     from message_reactions r2
    where r2.message_id = r.message_id
      and r2.user_id = r.user_id
 );

-- 2. Drop the old composite UNIQUE generated by the inline
--    `unique (message_id, user_id, emoji)` in 004_chat.sql.
alter table message_reactions
  drop constraint if exists message_reactions_message_id_user_id_emoji_key;

-- 3. Install the new UNIQUE.
alter table message_reactions
  add constraint message_reactions_user_unique unique (message_id, user_id);
```

### Task 1.2: Migration tests

**Files:**
- Modify: `packages/server/test/chat/migration.test.ts` (append 2 new tests + adjust the existing reactions test)

- [ ] **Step 1.2.1: Replace the existing reactions test + add 2 new tests**

Open `packages/server/test/chat/migration.test.ts:90-115`. Replace the body of the existing `it('reactions enforce uniqueness on (message, user, emoji)', ...)` block (lines 90–115) and append two new tests **after** it.

Replace lines 90–115 with:

```ts
  it('reactions enforce uniqueness on (message, user) — only one reaction per user per message', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chat.rows[0].id, userA],
    );
    const messageId = msg.rows[0].id;

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );

    // Second reaction by SAME user on SAME message — even with a DIFFERENT emoji — must fail.
    const dup = pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`,
      [messageId, userA],
    );
    await expect(dup).rejects.toThrow(/duplicate key/);
  });

  it('a different user can react to the same message', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chat.rows[0].id, userA],
    );
    const messageId = msg.rows[0].id;

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );
    const ok = await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥') returning id`,
      [messageId, userB],
    );
    expect(ok.rowCount).toBe(1);
  });

  it('the same user can react to two DIFFERENT messages', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const m1 = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'one') returning id`,
      [chat.rows[0].id, userA],
    );
    const m2 = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'two') returning id`,
      [chat.rows[0].id, userA],
    );

    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥'), ($3, $2, '👍')`,
      [m1.rows[0].id, userA, m2.rows[0].id],
    );
    const r = await pool.query<{ cnt: string }>(
      `select count(*)::bigint as cnt from message_reactions where user_id = $1`,
      [userA],
    );
    expect(Number(r.rows[0].cnt)).toBe(2);
  });
```

Also rename the existing top-level `describe.skipIf(!hasIntegrationEnv)('chat migration 004', ...)` on line 11 to `describe.skipIf(!hasIntegrationEnv)('chat migrations 004 + 005', ...)`.

- [ ] **Step 1.2.2: Run the test (must FAIL)**

Run:
```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
pnpm --filter @hockey/server test -- test/chat/migration.test.ts
```

Expected: the new test "reactions enforce uniqueness on (message, user)" FAILS — current state still allows different emoji from same user. Old constraint accepts the second insert.

- [ ] **Step 1.2.3: Run migrations against the test DB**

The migration runner picks up new files from `db/migrations/` automatically when `applyMigrations` is called by `beforeAll`. So the new test file pickup is automatic — but if your local dev DB still has the old constraint, reset it before running other dev commands:

```bash
pnpm --filter @hockey/server db:migrate
```

- [ ] **Step 1.2.4: Re-run migration test (must PASS)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/migration.test.ts
```

Expected: ALL tests pass. New constraint enforces (message_id, user_id).

- [ ] **Step 1.2.5: Commit**

```bash
git add packages/server/db/migrations/005_chat_reaction_user_unique.sql \
        packages/server/test/chat/migration.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): migration 005 — one reaction per user per message

UNIQUE(message_id, user_id, emoji) → UNIQUE(message_id, user_id).
Includes a defensive DELETE for any pre-existing dupes (none expected
in MVP). Renames migration test describe block to cover 004 + 005.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Server emoji whitelist

### Task 2.1: Whitelist constant + type guard

**Files:**
- Create: `packages/server/src/chat/whitelist.ts`
- Test: `packages/server/test/chat/whitelist.test.ts`

- [ ] **Step 2.1.1: Write the failing test**

Create `packages/server/test/chat/whitelist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EMOJI_WHITELIST, isWhitelistEmoji } from '../../src/chat/whitelist.js';

describe('chat emoji whitelist', () => {
  it('has exactly 24 entries (3 rows × 8 cols in the picker)', () => {
    expect(EMOJI_WHITELIST.length).toBe(24);
  });

  it('all entries are unique', () => {
    expect(new Set(EMOJI_WHITELIST).size).toBe(EMOJI_WHITELIST.length);
  });

  it('isWhitelistEmoji accepts whitelisted values', () => {
    for (const e of EMOJI_WHITELIST) {
      expect(isWhitelistEmoji(e)).toBe(true);
    }
  });

  it('isWhitelistEmoji rejects unknown strings', () => {
    expect(isWhitelistEmoji('hello')).toBe(false);
    expect(isWhitelistEmoji('')).toBe(false);
    expect(isWhitelistEmoji('🦄')).toBe(false);
  });
});
```

- [ ] **Step 2.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/whitelist.test.ts
```

Expected: import error — module does not exist.

- [ ] **Step 2.1.3: Implement whitelist**

Create `packages/server/src/chat/whitelist.ts`:

```ts
// Single source of truth for allowed reaction emojis on the server.
// MUST stay in sync with packages/web/src/chat/reactions.ts (asserted
// by both whitelist.test.ts files via list length + content snapshot).

export const EMOJI_WHITELIST = [
  '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
  '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
  '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
] as const;

export type WhitelistEmoji = (typeof EMOJI_WHITELIST)[number];

export function isWhitelistEmoji(s: string): s is WhitelistEmoji {
  return (EMOJI_WHITELIST as readonly string[]).includes(s);
}
```

- [ ] **Step 2.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/whitelist.test.ts
```

Expected: 4 tests pass.

---

## Phase 3: Server `addReaction` / `removeReaction` / `getMessageOr404`

### Task 3.1: Test addReaction (first-add, switch, idempotent re-add)

**Files:**
- Create: `packages/server/test/chat/service.reactions.test.ts`
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/src/chat/types.ts`

- [ ] **Step 3.1.1: Write the failing test file**

Create `packages/server/test/chat/service.reactions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  addReaction,
  removeReaction,
  getMessageOr404,
} from '../../src/chat/service.js';
import { MessageNotFoundError } from '../../src/chat/errors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat reactions service', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
    const c = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    chatId = c.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query(`delete from message_reactions`);
    await pool.query(`delete from messages`);
    const m = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'hi') returning id`,
      [chatId, userA],
    );
    messageId = m.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('addReaction first-add: returns {added, removed:null}', async () => {
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: '🔥', removed: null });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('addReaction switch: deletes prev, inserts new, returns both', async () => {
    await addReaction(pool, messageId, userA, '❤️');
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: '🔥', removed: '❤️' });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('addReaction idempotent re-add: same emoji again is no-op, returns {added:null, removed:null}', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await addReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ added: null, removed: null });
    const rows = await pool.query<{ cnt: string }>(
      `select count(*)::bigint as cnt from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(Number(rows.rows[0]!.cnt)).toBe(1);
  });

  it('addReaction by a different user does not touch the first user', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await addReaction(pool, messageId, userB, '🔥');
    expect(r).toEqual({ added: '🔥', removed: null });
    const rows = await pool.query<{ user_id: string; emoji: string }>(
      `select user_id, emoji from message_reactions where message_id = $1 order by user_id`,
      [messageId],
    );
    expect(rows.rowCount).toBe(2);
  });

  it('removeReaction happy: returns {removed:true} and deletes the row', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await removeReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ removed: true });
    const rows = await pool.query(
      `select 1 from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('removeReaction no-op when nothing to remove: returns {removed:false}', async () => {
    const r = await removeReaction(pool, messageId, userA, '🔥');
    expect(r).toEqual({ removed: false });
  });

  it('removeReaction with a different emoji than what is set is a no-op', async () => {
    await addReaction(pool, messageId, userA, '🔥');
    const r = await removeReaction(pool, messageId, userA, '❤️');
    expect(r).toEqual({ removed: false });
    const rows = await pool.query<{ emoji: string }>(
      `select emoji from message_reactions where message_id = $1 and user_id = $2`,
      [messageId, userA],
    );
    expect(rows.rows.map((x) => x.emoji)).toEqual(['🔥']);
  });

  it('getMessageOr404 returns the message row when present', async () => {
    const m = await getMessageOr404(pool, messageId);
    expect(m.id).toBe(messageId);
    expect(m.chat_id).toBe(chatId);
  });

  it('getMessageOr404 throws MessageNotFoundError when missing', async () => {
    await expect(
      getMessageOr404(pool, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(MessageNotFoundError);
  });
});
```

- [ ] **Step 3.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/service.reactions.test.ts
```

Expected: import errors — `addReaction`, `removeReaction`, `getMessageOr404` not exported.

- [ ] **Step 3.1.3: Add `AddReactionResult` to types**

Open `packages/server/src/chat/types.ts`. After the `MessageReactionRow` interface (around line 48), append:

```ts
export interface AddReactionResult {
  added: string | null;
  removed: string | null;
}
```

- [ ] **Step 3.1.4: Implement service functions**

Open `packages/server/src/chat/service.ts`. At the very end of the file, append:

```ts
export async function getMessageOr404(
  pool: Pool,
  messageId: string,
): Promise<MessageRow> {
  const r = await pool.query<MessageRow>(
    `select * from messages where id = $1`,
    [messageId],
  );
  if (r.rowCount === 0) throw new MessageNotFoundError(messageId);
  return r.rows[0]!;
}

export async function addReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<import('./types.js').AddReactionResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Drop a previous reaction by this user on this message (only if it's a different emoji).
    const del = await client.query<{ emoji: string }>(
      `delete from message_reactions
       where message_id = $1 and user_id = $2 and emoji != $3
       returning emoji`,
      [messageId, userId, emoji],
    );
    // Insert the new one; if (message,user,emoji) already exists, no-op.
    const ins = await client.query<{ id: string }>(
      `insert into message_reactions (message_id, user_id, emoji)
       values ($1, $2, $3)
       on conflict (message_id, user_id) do nothing
       returning id`,
      [messageId, userId, emoji],
    );
    await client.query('commit');
    return {
      added: ins.rowCount && ins.rowCount > 0 ? emoji : null,
      removed: del.rowCount && del.rowCount > 0 ? del.rows[0]!.emoji : null,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ removed: boolean }> {
  const r = await pool.query(
    `delete from message_reactions
     where message_id = $1 and user_id = $2 and emoji = $3`,
    [messageId, userId, emoji],
  );
  return { removed: (r.rowCount ?? 0) > 0 };
}
```

- [ ] **Step 3.1.5: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/service.reactions.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 3.1.6: Run full server test suite (catch regressions)**

Run:
```bash
pnpm --filter @hockey/server test
```

Expected: all tests pass. The pre-existing `chat/service.test.ts` and `chat/migration.test.ts` keep passing.

- [ ] **Step 3.1.7: Commit**

```bash
git add packages/server/src/chat/whitelist.ts \
        packages/server/src/chat/types.ts \
        packages/server/src/chat/service.ts \
        packages/server/test/chat/whitelist.test.ts \
        packages/server/test/chat/service.reactions.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): server reactions whitelist + addReaction/removeReaction service

24-emoji whitelist (single source of truth for the server). addReaction
runs DELETE prev (different emoji) → INSERT ON CONFLICT DO NOTHING in
one transaction so the publish step can broadcast exactly the rows that
changed. removeReaction returns whether anything was deleted.
getMessageOr404 lets routes resolve chat-id from message-id and 404 on
missing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Server reaction events publisher

### Task 4.1: publishReactionAdded / publishReactionRemoved

**Files:**
- Modify: `packages/server/src/chat/events.ts`
- Create: `packages/server/test/chat/events.reactions.test.ts`

- [ ] **Step 4.1.1: Write the failing test**

Create `packages/server/test/chat/events.reactions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  publishReactionAdded,
  publishReactionRemoved,
  type EventPublisher,
} from '../../src/chat/events.js';
import type { ChatEvent } from '../../src/chat/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface RecordedPublish {
  channel: string;
  event: ChatEvent;
}

function recorder(): { publisher: EventPublisher; records: RecordedPublish[] } {
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

function failingPublisher(): EventPublisher {
  return {
    async publish() {
      throw new Error('redis blew up');
    },
  };
}

describe.skipIf(!hasIntegrationEnv)('chat reaction events fan-out', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;
  let dmAB: string;
  let systemChat: string;
  const messageId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    const insU = `insert into users (id, display_name, timezone) values (gen_random_uuid(), $1, 'UTC') returning id`;
    userA = (await pool.query(insU, ['Alice'])).rows[0].id;
    userB = (await pool.query(insU, ['Bob'])).rows[0].id;
    const dm = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    dmAB = dm.rows[0].id;
    await pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [dmAB, userA, userB],
    );
    const sys = await pool.query(
      `insert into chats (type, name, created_by) values ('system', 'Лига', $1) returning id`,
      [userA],
    );
    systemChat = sys.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('publishReactionAdded for direct → fan-out to chat_members', async () => {
    const { publisher, records } = recorder();
    await publishReactionAdded(pool, publisher, dmAB, 'direct', messageId, userA, '🔥');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    for (const r of records) {
      expect(r.event.type).toBe('reaction:added');
      const ev = r.event as Extract<ChatEvent, { type: 'reaction:added' }>;
      expect(ev.messageId).toBe(messageId);
      expect(ev.userId).toBe(userA);
      expect(ev.emoji).toBe('🔥');
      expect(ev.chatId).toBe(dmAB);
    }
  });

  it('publishReactionAdded for system → exactly one publish to chat:system:<id>', async () => {
    const { publisher, records } = recorder();
    await publishReactionAdded(pool, publisher, systemChat, 'system', messageId, userA, '🔥');
    expect(records).toHaveLength(1);
    expect(records[0]!.channel).toBe(`chat:system:${systemChat}`);
    expect(records[0]!.event.type).toBe('reaction:added');
  });

  it('publishReactionRemoved routes the same way (DM)', async () => {
    const { publisher, records } = recorder();
    await publishReactionRemoved(pool, publisher, dmAB, 'direct', messageId, userA, '❤️');
    expect(records.map((r) => r.channel).sort()).toEqual(
      [`chat:user:${userA}`, `chat:user:${userB}`].sort(),
    );
    expect(records[0]!.event.type).toBe('reaction:removed');
  });

  it('Redis publish error is swallowed (best-effort delivery)', async () => {
    await expect(
      publishReactionAdded(pool, failingPublisher(), dmAB, 'direct', messageId, userA, '🔥'),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/events.reactions.test.ts
```

Expected: import errors — `publishReactionAdded`, `publishReactionRemoved` not exported.

- [ ] **Step 4.1.3: Implement publishers**

Open `packages/server/src/chat/events.ts`. At the end of the file, append:

```ts
export async function publishReactionAdded(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, {
    type: 'reaction:added',
    chatId,
    messageId,
    userId,
    emoji,
  });
}

export async function publishReactionRemoved(
  pool: Pool,
  publisher: EventPublisher,
  chatId: string,
  chatType: ChatType,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await fanOut(pool, publisher, chatId, chatType, {
    type: 'reaction:removed',
    chatId,
    messageId,
    userId,
    emoji,
  });
}
```

- [ ] **Step 4.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/events.reactions.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4.1.5: Commit**

```bash
git add packages/server/src/chat/events.ts \
        packages/server/test/chat/events.reactions.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): publish reaction:added / reaction:removed via fan-out

Routes through the existing fanOut helper so per-user (DM/group) and
per-system-channel routing match other chat events. Errors are swallowed
by safePublish — reactions are best-effort, like every other event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Server reaction routes

### Task 5.1: POST/DELETE /chat/messages/:messageId/reactions

**Files:**
- Create: `packages/server/test/chat/routes.reactions.test.ts`
- Modify: `packages/server/src/chat/routes.ts`

- [ ] **Step 5.1.1: Write the failing test**

Create `packages/server/test/chat/routes.reactions.test.ts`:

```ts
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
```

- [ ] **Step 5.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/routes.reactions.test.ts
```

Expected: 404 on every request — routes don't exist yet.

- [ ] **Step 5.1.3: Register routes**

Open `packages/server/src/chat/routes.ts`. At the **top** of the file, append `addReaction, removeReaction, getMessageOr404` to the existing import from `./service.js`:

```ts
import {
  getMyChats,
  getMessages,
  type GetMessagesOpts,
  sendMessage,
  type SendMessageOpts,
  deleteMessage,
  markChatAsRead,
  findOrCreateDM,
  searchUsers,
  searchMessages,
  getUnreadCounts,
  addReaction,
  removeReaction,
  getMessageOr404,
} from './service.js';
```

Append a new import at the top of the file:

```ts
import { EMOJI_WHITELIST } from './whitelist.js';
import { publishReactionAdded, publishReactionRemoved } from './events.js';
```

(`publishMessageNew, publishMessageDeleted, publishChatRead` is the existing line — extend it instead of adding a duplicate.)

Then, **at the very end** of the `chatRoutes` function body (after the `app.get('/chat/unread', ...)` block, before the closing `};`), append:

```ts
  app.post(
    '/chat/messages/:messageId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const { emoji } = z
        .object({ emoji: z.enum(EMOJI_WHITELIST) })
        .parse(req.body);
      const userId = req.user.id;
      const message = await getMessageOr404(app.pg, messageId);
      const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
      const result = await addReaction(app.pg, messageId, userId, emoji);
      if (result.removed) {
        await publishReactionRemoved(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          result.removed,
        );
      }
      if (result.added) {
        await publishReactionAdded(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          result.added,
        );
      }
      reply.code(201);
      return { messageId, emoji, removed: result.removed };
    },
  );

  app.delete(
    '/chat/messages/:messageId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const { emoji } = z
        .object({ emoji: z.enum(EMOJI_WHITELIST) })
        .parse(req.body);
      const userId = req.user.id;
      const message = await getMessageOr404(app.pg, messageId);
      const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
      const result = await removeReaction(app.pg, messageId, userId, emoji);
      if (result.removed) {
        await publishReactionRemoved(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          emoji,
        );
      }
      reply.code(204);
      return null;
    },
  );
```

- [ ] **Step 5.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/server test -- test/chat/routes.reactions.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5.1.5: Run full server suite**

Run:
```bash
pnpm --filter @hockey/server test
```

Expected: green.

- [ ] **Step 5.1.6: Commit**

```bash
git add packages/server/src/chat/routes.ts \
        packages/server/test/chat/routes.reactions.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): POST/DELETE /chat/messages/:id/reactions

Whitelist-validated through z.enum(EMOJI_WHITELIST). Routes resolve
chat from the message row (404 on missing) and gate by
assertCanAccessChat. Publishers fire only when the DB actually
changed — switch produces both reaction:removed and reaction:added,
idempotent re-add publishes nothing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Web reaction whitelist

### Task 6.1: web reactions.ts

**Files:**
- Create: `packages/web/src/chat/reactions.ts`
- Test: `packages/web/src/chat/test/reactions.test.ts`

- [ ] **Step 6.1.1: Write the failing test**

Create `packages/web/src/chat/test/reactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  EMOJI_WHITELIST,
  FAVORITE_EMOJI,
  isWhitelistEmoji,
} from '../reactions.js';

describe('web emoji whitelist', () => {
  it('has 24 entries', () => {
    expect(EMOJI_WHITELIST.length).toBe(24);
  });

  it('FAVORITE_EMOJI is the first 6 entries', () => {
    expect(FAVORITE_EMOJI).toHaveLength(6);
    expect(FAVORITE_EMOJI).toEqual(EMOJI_WHITELIST.slice(0, 6));
  });

  it('all entries are unique', () => {
    expect(new Set(EMOJI_WHITELIST).size).toBe(EMOJI_WHITELIST.length);
  });

  it('isWhitelistEmoji rejects unknown values', () => {
    expect(isWhitelistEmoji('🦄')).toBe(false);
    expect(isWhitelistEmoji('hello')).toBe(false);
  });

  it('matches the server-side whitelist (snapshot)', () => {
    // Lock the order. If you intentionally change the list, update both
    // packages/server/src/chat/whitelist.ts AND this snapshot.
    expect(EMOJI_WHITELIST).toEqual([
      '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
      '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
      '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
    ]);
  });
});
```

- [ ] **Step 6.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/reactions.test.ts
```

Expected: import error.

- [ ] **Step 6.1.3: Implement**

Create `packages/web/src/chat/reactions.ts`:

```ts
// Single source of truth for allowed reaction emojis on the web.
// MUST stay in sync with packages/server/src/chat/whitelist.ts.

export const EMOJI_WHITELIST = [
  '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
  '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
  '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
] as const;

export type WhitelistEmoji = (typeof EMOJI_WHITELIST)[number];

// Top row shown in the long-press action menu shelf.
export const FAVORITE_EMOJI = EMOJI_WHITELIST.slice(0, 6) as readonly WhitelistEmoji[];

export function isWhitelistEmoji(s: string): s is WhitelistEmoji {
  return (EMOJI_WHITELIST as readonly string[]).includes(s);
}
```

- [ ] **Step 6.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/reactions.test.ts
```

Expected: 5 tests pass.

---

## Phase 7: Web reactionsState (pure functions for optimistic + WS patches)

### Task 7.1: Pure reaction state mutators

**Files:**
- Create: `packages/web/src/chat/reactionsState.ts`
- Test: `packages/web/src/chat/test/reactionsState.test.ts`

- [ ] **Step 7.1.1: Write the failing test**

Create `packages/web/src/chat/test/reactionsState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  applyReactionEventToMessage,
  switchMyReactionTo,
  removeMyReaction,
} from '../reactionsState.js';
import type { ChatMessageDTO } from '../api.js';

const baseMsg: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: 'u-other',
  content: 'hi',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T00:00:00.000Z',
  reactions: [],
};

const ME = 'me-id';
const OTHER = 'other-id';

describe('applyReactionEventToMessage — WS event handler', () => {
  it('adds a new pill from a stranger (count 1, reactedByMe=false)', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:added', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('increments existing pill from a stranger', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:added', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 3, reactedByMe: false }]);
  });

  it('decrements existing pill from a stranger; pill disappears at 0', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:removed', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([]);
  });

  it('reaction:removed for missing pill is a no-op (returns same reference)', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:removed', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(baseMsg);
  });

  it('dedup: my own added when reactedByMe is already true → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:added', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(m);
  });

  it('dedup: my own removed when reactedByMe is already false → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:removed', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(m);
  });

  it('my own added that has not been optimistically applied → applied, reactedByMe=true', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:added', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });
});

describe('switchMyReactionTo — optimistic switch', () => {
  it('first-add: creates new pill with reactedByMe=true', () => {
    const next = switchMyReactionTo(baseMsg, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('switch: drops my prev (different emoji), adds new', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '❤️', count: 3, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toContainEqual({ emoji: '❤️', count: 2, reactedByMe: false });
    expect(next.reactions).toContainEqual({ emoji: '🔥', count: 1, reactedByMe: true });
  });

  it('switch where my prev had count=1 → prev pill disappears', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '❤️', count: 1, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('idempotent: setting the same emoji that is already mine → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next).toBe(m);
  });

  it('add to a pill that exists from strangers → I join (count+1, reactedByMe=true)', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 3, reactedByMe: true }]);
  });
});

describe('removeMyReaction — optimistic remove', () => {
  it('removes my pill, count 1 → pill gone', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = removeMyReaction(m, '🔥');
    expect(next.reactions).toEqual([]);
  });

  it('removes my pill, count 3 → count=2, reactedByMe=false', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 3, reactedByMe: true }] };
    const next = removeMyReaction(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 2, reactedByMe: false }]);
  });

  it('no-op when pill not mine', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] };
    const next = removeMyReaction(m, '🔥');
    expect(next).toBe(m);
  });

  it('no-op when pill not present', () => {
    const next = removeMyReaction(baseMsg, '🔥');
    expect(next).toBe(baseMsg);
  });
});
```

- [ ] **Step 7.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/reactionsState.test.ts
```

Expected: import error.

- [ ] **Step 7.1.3: Implement**

Create `packages/web/src/chat/reactionsState.ts`:

```ts
import type { ChatMessageDTO, ReactionGroupDTO } from './api.js';

interface ReactionEvent {
  type: 'reaction:added' | 'reaction:removed';
  userId: string;
  emoji: string;
}

// Apply a WS reaction event to a single message DTO. Returns the same
// reference when nothing changes (so React.memo / setQueryData stay cheap).
// Self-events are deduped against the local optimistic state via meId.
export function applyReactionEventToMessage(
  m: ChatMessageDTO,
  event: ReactionEvent,
  meId: string | null,
): ChatMessageDTO {
  const isMine = meId !== null && event.userId === meId;
  const existing = m.reactions.find((r) => r.emoji === event.emoji);

  if (event.type === 'reaction:added') {
    if (isMine && existing?.reactedByMe) return m;
    if (existing) {
      return {
        ...m,
        reactions: m.reactions.map((r) =>
          r.emoji === event.emoji
            ? { ...r, count: r.count + 1, reactedByMe: isMine ? true : r.reactedByMe }
            : r,
        ),
      };
    }
    return {
      ...m,
      reactions: [...m.reactions, { emoji: event.emoji, count: 1, reactedByMe: isMine }],
    };
  }

  // reaction:removed
  if (!existing) return m;
  if (isMine && existing.reactedByMe === false) return m;
  const nextCount = existing.count - 1;
  if (nextCount <= 0) {
    return { ...m, reactions: m.reactions.filter((r) => r.emoji !== event.emoji) };
  }
  return {
    ...m,
    reactions: m.reactions.map((r) =>
      r.emoji === event.emoji
        ? { ...r, count: nextCount, reactedByMe: isMine ? false : r.reactedByMe }
        : r,
    ),
  };
}

// Optimistic: drop my prev reaction (any other emoji) and add `emoji` as mine.
// Returns the same reference if I'm already on `emoji`.
export function switchMyReactionTo(
  m: ChatMessageDTO,
  emoji: string,
): ChatMessageDTO {
  const mine = m.reactions.find((r) => r.reactedByMe);
  if (mine?.emoji === emoji) return m;

  let reactions: ReactionGroupDTO[] = m.reactions;

  // Drop mine.
  if (mine) {
    const nextCount = mine.count - 1;
    if (nextCount <= 0) {
      reactions = reactions.filter((r) => r.emoji !== mine.emoji);
    } else {
      reactions = reactions.map((r) =>
        r.emoji === mine.emoji ? { ...r, count: nextCount, reactedByMe: false } : r,
      );
    }
  }

  // Add new.
  const target = reactions.find((r) => r.emoji === emoji);
  if (target) {
    reactions = reactions.map((r) =>
      r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r,
    );
  } else {
    reactions = [...reactions, { emoji, count: 1, reactedByMe: true }];
  }

  return { ...m, reactions };
}

// Optimistic: remove my reaction with this emoji. No-op if not mine.
export function removeMyReaction(
  m: ChatMessageDTO,
  emoji: string,
): ChatMessageDTO {
  const target = m.reactions.find((r) => r.emoji === emoji);
  if (!target || !target.reactedByMe) return m;
  const nextCount = target.count - 1;
  if (nextCount <= 0) {
    return { ...m, reactions: m.reactions.filter((r) => r.emoji !== emoji) };
  }
  return {
    ...m,
    reactions: m.reactions.map((r) =>
      r.emoji === emoji ? { ...r, count: nextCount, reactedByMe: false } : r,
    ),
  };
}
```

- [ ] **Step 7.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/reactionsState.test.ts
```

Expected: 14 tests pass.

- [ ] **Step 7.1.5: Commit Phase 6 + 7**

```bash
git add packages/web/src/chat/reactions.ts \
        packages/web/src/chat/reactionsState.ts \
        packages/web/src/chat/test/reactions.test.ts \
        packages/web/src/chat/test/reactionsState.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): web emoji whitelist + pure reaction state mutators

Adds EMOJI_WHITELIST (24, mirrors server) and FAVORITE_EMOJI (top 6)
plus pure helpers: applyReactionEventToMessage handles WS events with
self-dedup; switchMyReactionTo/removeMyReaction power optimistic
mutations. All return the same reference on no-op so React.memo and
setQueryData skip unnecessary re-renders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Web API client + queryKeys cleanup + WS handler rewrite

### Task 8.1: API client `addReaction` / `removeReaction`

**Files:**
- Modify: `packages/web/src/chat/api.ts`

- [ ] **Step 8.1.1: Append to api.ts**

Open `packages/web/src/chat/api.ts`. At the very bottom, append:

```ts
export interface AddReactionResponse {
  messageId: string;
  emoji: string;
  removed: string | null;
}

export function addReaction(
  messageId: string,
  emoji: string,
): Promise<AddReactionResponse> {
  return apiFetch<AddReactionResponse>(`/chat/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

export function removeReaction(messageId: string, emoji: string): Promise<void> {
  return apiFetch<void>(`/chat/messages/${messageId}/reactions`, {
    method: 'DELETE',
    body: JSON.stringify({ emoji }),
  });
}
```

### Task 8.2: Remove dead `chatKeys.reactions`

**Files:**
- Modify: `packages/web/src/lib/queryKeys.ts`

- [ ] **Step 8.2.1: Delete the line**

Open `packages/web/src/lib/queryKeys.ts`. Delete this line:

```ts
  reactions: (messageId: string) => [...chatKeys.all, 'reactions', messageId] as const,
```

The resulting file:

```ts
export const chatKeys = {
  all: ['chat'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  messages: (chatId: string) => [...chatKeys.all, 'messages', chatId] as const,
  search: (q: string) => [...chatKeys.all, 'search', q] as const,
  users: (q: string) => [...chatKeys.all, 'users', q] as const,
  unread: () => [...chatKeys.all, 'unread'] as const,
};
```

### Task 8.3: Rewrite useChatSocket reaction handler + update its tests

**Files:**
- Modify: `packages/web/src/chat/useChatSocket.ts`
- Modify: `packages/web/src/chat/test/useChatSocket.test.tsx`

- [ ] **Step 8.3.1: Rewrite the reaction tests first (TDD)**

Open `packages/web/src/chat/test/useChatSocket.test.tsx`. Find the test on line 258 — `it('reaction:added: invalidates the reactions key (PR 6 will mount that query)', ...)` — and replace it with the following six tests (paste them in place of that single test):

```ts
  it('reaction:added (stranger): inserts pill in chatKeys.messages cache, count 1, reactedByMe=false', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z', reactions: [] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('reaction:removed (stranger): decrements; pill disappears at 0', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([]);
  });

  it('reaction:added (self) is deduped when reactedByMe already true', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: SELF, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: SELF, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('reaction:removed (self) is deduped when pill no longer mine', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: SELF, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: SELF, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    // No-op: count not double-decremented to 0.
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('reaction:added when no cache exists for the chat: no crash, no patch', async () => {
    expect(qc.getQueryData(chatKeys.messages('c-unknown'))).toBeUndefined();
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c-unknown', messageId: 'm', userId: OTHER, emoji: '🔥' },
      });
    });
    expect(qc.getQueryData(chatKeys.messages('c-unknown'))).toBeUndefined();
  });

  it('switch via two stranger events (removed prev + added new) keeps state consistent', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '❤️', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '❤️' },
      });
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });
```

If `ChatMessageDTO` is not yet imported in this test file, add to the imports at the top:

```ts
import type { ChatMessageDTO } from '../api.js';
```

Also remove the now-unused `chatKeys.reactions` reference. Search for `chatKeys.reactions` in the file — if no occurrences remain, no further change needed.

- [ ] **Step 8.3.2: Run tests (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/useChatSocket.test.tsx
```

Expected: 6 new tests fail (current `applyReactionChange` only does `invalidateQueries`, doesn't patch the cache).

- [ ] **Step 8.3.3: Rewrite `applyReactionChange` in useChatSocket.ts**

Open `packages/web/src/chat/useChatSocket.ts`. Replace the existing `applyReactionChange` function (around line 51) with:

```ts
import { applyReactionEventToMessage } from './reactionsState.js';

function applyReactionEvent(
  qc: QueryClient,
  meId: string | null,
  event: Extract<ChatEvent, { type: 'reaction:added' | 'reaction:removed' }>,
): void {
  qc.setQueryData<InfinitePages | undefined>(chatKeys.messages(event.chatId), (old) => {
    if (!old) return old;
    let touched = false;
    const pages = old.pages.map((page) =>
      page.map((m) => {
        if (m.id !== event.messageId) return m;
        const next = applyReactionEventToMessage(m, event, meId);
        if (next === m) return m;
        touched = true;
        return next;
      }),
    );
    return touched ? { ...old, pages } : old;
  });
}
```

Then in the same file, find the switch arm in the `onEvent` callback (around line 83):

```ts
          case 'reaction:added':
          case 'reaction:removed':
            applyReactionChange(qc, event.messageId);
            return;
```

Replace it with:

```ts
          case 'reaction:added':
          case 'reaction:removed':
            applyReactionEvent(qc, useAuthStore.getState().user?.id ?? null, event);
            return;
```

Delete the now-unused `applyReactionChange` function.

- [ ] **Step 8.3.4: Run tests (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/useChatSocket.test.tsx
```

Expected: all tests pass (existing + 6 new).

- [ ] **Step 8.3.5: Commit Phase 8**

```bash
git add packages/web/src/chat/api.ts \
        packages/web/src/chat/useChatSocket.ts \
        packages/web/src/chat/test/useChatSocket.test.tsx \
        packages/web/src/lib/queryKeys.ts
git commit -m "$(cat <<'EOF'
feat(chat): web reactions API client + WS handler patches messages cache

addReaction/removeReaction wrappers over apiFetch. The WS handler now
patches chatKeys.messages(chatId) directly with applyReactionEventToMessage
(self-dedup against local optimistic state) instead of invalidating the
unmounted chatKeys.reactions key. queryKeys.ts loses the dead key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: ReactionBar component

### Task 9.1

**Files:**
- Create: `packages/web/src/chat/components/ReactionBar.tsx`
- Test: `packages/web/src/chat/test/ReactionBar.test.tsx`

- [ ] **Step 9.1.1: Write the failing test**

Create `packages/web/src/chat/test/ReactionBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionBar } from '../components/ReactionBar.js';
import type { ReactionGroupDTO } from '../api.js';

describe('ReactionBar', () => {
  it('returns null when reactions are empty', () => {
    const { container } = render(<ReactionBar reactions={[]} onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per reaction with emoji + count', () => {
    const reactions: ReactionGroupDTO[] = [
      { emoji: '🔥', count: 3, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ];
    render(<ReactionBar reactions={reactions} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /🔥 3/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /❤️ 1/ })).toBeInTheDocument();
  });

  it('my reaction uses pill--dark, others use plain pill', () => {
    const reactions: ReactionGroupDTO[] = [
      { emoji: '🔥', count: 3, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ];
    render(<ReactionBar reactions={reactions} onToggle={() => {}} />);
    const mine = screen.getByRole('button', { name: /🔥 3/ });
    const theirs = screen.getByRole('button', { name: /❤️ 1/ });
    expect(mine.className).toMatch(/pill--dark/);
    expect(theirs.className).toMatch(/\bpill\b/);
    expect(theirs.className).not.toMatch(/pill--dark/);
  });

  it('clicking a pill calls onToggle with that emoji', async () => {
    const reactions: ReactionGroupDTO[] = [{ emoji: '🔥', count: 1, reactedByMe: true }];
    const onToggle = vi.fn();
    render(<ReactionBar reactions={reactions} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /🔥 1/ }));
    expect(onToggle).toHaveBeenCalledWith('🔥');
  });
});
```

- [ ] **Step 9.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/ReactionBar.test.tsx
```

Expected: import error.

- [ ] **Step 9.1.3: Implement**

Create `packages/web/src/chat/components/ReactionBar.tsx`:

```tsx
import type { ReactionGroupDTO } from '../api.js';

interface Props {
  reactions: ReactionGroupDTO[];
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, onToggle }: Props): JSX.Element | null {
  if (reactions.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
      }}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={`${r.emoji} ${r.count}`}
          className={r.reactedByMe ? 'pill pill--dark' : 'pill'}
          onClick={() => onToggle(r.emoji)}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14 }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/ReactionBar.test.tsx
```

Expected: 4 tests pass.

---

## Phase 10: ReactionPicker component

### Task 10.1

**Files:**
- Create: `packages/web/src/chat/components/ReactionPicker.tsx`
- Test: `packages/web/src/chat/test/ReactionPicker.test.tsx`

- [ ] **Step 10.1.1: Write the failing test**

Create `packages/web/src/chat/test/ReactionPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { EMOJI_WHITELIST } from '../reactions.js';

const anchor: DOMRect = {
  top: 100, left: 100, right: 200, bottom: 200, width: 100, height: 100,
  x: 100, y: 100, toJSON: () => ({}),
};

describe('ReactionPicker', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <ReactionPicker open={false} anchorRect={null} onPick={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all 24 whitelist emojis when open', () => {
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={() => {}} />,
    );
    for (const e of EMOJI_WHITELIST) {
      expect(screen.getByRole('button', { name: e })).toBeInTheDocument();
    }
  });

  it('clicking an emoji calls onPick + onClose', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={onPick} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '🔥' }));
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={onClose} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the backdrop calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={onClose} />,
    );
    const backdrop = document.querySelector('[data-reaction-picker-backdrop]');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/ReactionPicker.test.tsx
```

Expected: import error.

- [ ] **Step 10.1.3: Implement**

Create `packages/web/src/chat/components/ReactionPicker.tsx`:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_WHITELIST } from '../reactions.js';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 144;
const PANEL_GAP = 8;
const SAFE_MARGIN = 12;

function panelPosition(anchor: DOMRect): { top: number; left: number } {
  const above = anchor.top - PANEL_HEIGHT - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - PANEL_HEIGHT - SAFE_MARGIN;
  const top =
    above >= SAFE_MARGIN
      ? above
      : below <= maxTop
      ? below
      : Math.max(SAFE_MARGIN, maxTop);
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

export function ReactionPicker({
  open,
  anchorRect,
  onPick,
  onClose,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !anchorRect) return null;
  const pos = panelPosition(anchorRect);

  return createPortal(
    <>
      <div
        data-reaction-picker-backdrop
        aria-hidden
        onPointerDown={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.04)', zIndex: 850 }}
      />
      <div
        role="dialog"
        aria-label="Выбор реакции"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: PANEL_WIDTH,
          padding: 8,
          borderRadius: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 6,
          zIndex: 851,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        {EMOJI_WHITELIST.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            onClick={() => {
              onPick(e);
              onClose();
            }}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 22,
              padding: 0,
              lineHeight: 1,
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 10.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/ReactionPicker.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 10.1.5: Commit Phase 9 + 10**

```bash
git add packages/web/src/chat/components/ReactionBar.tsx \
        packages/web/src/chat/components/ReactionPicker.tsx \
        packages/web/src/chat/test/ReactionBar.test.tsx \
        packages/web/src/chat/test/ReactionPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat): ReactionBar + ReactionPicker components

ReactionBar: flex-wrap row of pills under bubbles. Mine = .pill--dark,
others = .pill, click → onToggle. ReactionPicker: 3×8 grid in a portal
with the same panelPosition logic as MessageActionsMenu (clamped to
viewport). Escape and backdrop click close it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 11: MessageActionsMenu — emoji shelf + `+`

### Task 11.1

**Files:**
- Modify: `packages/web/src/chat/components/MessageActionsMenu.tsx`
- Create: `packages/web/src/chat/test/MessageActionsMenu.test.tsx`

- [ ] **Step 11.1.1: Write the failing test**

Create `packages/web/src/chat/test/MessageActionsMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActionsMenu } from '../components/MessageActionsMenu.js';
import { FAVORITE_EMOJI } from '../reactions.js';

const anchor: DOMRect = {
  top: 100, left: 100, right: 200, bottom: 200, width: 100, height: 100,
  x: 100, y: 100, toJSON: () => ({}),
};

function defaults() {
  return {
    open: true,
    anchorRect: anchor,
    isOwn: true,
    onReply: vi.fn(),
    onDelete: vi.fn(),
    onPickEmoji: vi.fn(),
    onMoreEmoji: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('MessageActionsMenu', () => {
  it('renders the 6 favorite emoji shelf and the + button', () => {
    render(<MessageActionsMenu {...defaults()} />);
    for (const e of FAVORITE_EMOJI) {
      expect(screen.getByRole('button', { name: e })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /ещё реакции/i })).toBeInTheDocument();
  });

  it('still renders Ответить + Удалить for own messages', () => {
    render(<MessageActionsMenu {...defaults()} />);
    expect(screen.getByRole('menuitem', { name: /ответить/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /удалить/i })).toBeInTheDocument();
  });

  it('hides Удалить for non-own messages', () => {
    render(<MessageActionsMenu {...defaults()} isOwn={false} />);
    expect(screen.queryByRole('menuitem', { name: /удалить/i })).not.toBeInTheDocument();
  });

  it('clicking a favorite calls onPickEmoji + onClose', async () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    await userEvent.click(screen.getByRole('button', { name: FAVORITE_EMOJI[0]! }));
    expect(props.onPickEmoji).toHaveBeenCalledWith(FAVORITE_EMOJI[0]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clicking + calls onMoreEmoji (parent decides what to do with the menu)', async () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    await userEvent.click(screen.getByRole('button', { name: /ещё реакции/i }));
    expect(props.onMoreEmoji).toHaveBeenCalled();
  });

  it('clicking Ответить calls onReply + onClose', async () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /ответить/i }));
    expect(props.onReply).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('clicking Удалить calls onDelete + onClose', async () => {
    const props = defaults();
    render(<MessageActionsMenu {...props} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /удалить/i }));
    expect(props.onDelete).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 11.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/MessageActionsMenu.test.tsx
```

Expected: tests fail because shelf and `+` don't exist yet, and `onPickEmoji`/`onMoreEmoji` aren't part of props.

- [ ] **Step 11.1.3: Update MessageActionsMenu**

Replace the entire contents of `packages/web/src/chat/components/MessageActionsMenu.tsx` with:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Reply, Trash2, SmilePlus } from 'lucide-react';
import { FAVORITE_EMOJI } from '../reactions.js';

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onPickEmoji: (emoji: string) => void;
  onMoreEmoji: () => void;
  onClose: () => void;
}

const PANEL_GAP = 8;
const SAFE_MARGIN = 12;
const PANEL_WIDTH = 320;
// Heights include the new 44px shelf (emojis + `+` button + dividers).
const PANEL_HEIGHT_OWN = 140;
const PANEL_HEIGHT_OTHER = 92;

function panelPosition(anchor: DOMRect, height: number): { top: number; left: number } {
  const above = anchor.top - height - PANEL_GAP;
  const below = anchor.bottom + PANEL_GAP;
  const maxTop = window.innerHeight - height - SAFE_MARGIN;
  let top: number;
  if (above >= SAFE_MARGIN) top = above;
  else if (below <= maxTop) top = below;
  else top = Math.max(SAFE_MARGIN, maxTop);
  const wantedLeft = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const maxLeft = window.innerWidth - PANEL_WIDTH - SAFE_MARGIN;
  const left = Math.min(Math.max(SAFE_MARGIN, wantedLeft), Math.max(SAFE_MARGIN, maxLeft));
  return { top, left };
}

export function MessageActionsMenu({
  open,
  anchorRect,
  isOwn,
  onReply,
  onDelete,
  onPickEmoji,
  onMoreEmoji,
  onClose,
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const height = isOwn ? PANEL_HEIGHT_OWN : PANEL_HEIGHT_OTHER;
  const pos = panelPosition(anchorRect, height);

  return createPortal(
    <>
      <div
        aria-hidden
        onPointerDown={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.04)',
          zIndex: 800,
        }}
      />
      <div
        role="menu"
        aria-label="Действия с сообщением"
        className="glass"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: PANEL_WIDTH,
          padding: 6,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 801,
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px',
            borderBottom: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          {FAVORITE_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={e}
              onClick={() => {
                onPickEmoji(e);
                onClose();
              }}
              style={{
                flex: 1,
                height: 32,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 20,
                padding: 0,
                lineHeight: 1,
                borderRadius: 8,
              }}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            aria-label="Ещё реакции"
            onClick={onMoreEmoji}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink)',
            }}
          >
            <SmilePlus size={18} />
          </button>
        </div>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onReply();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 12,
            textAlign: 'left',
          }}
        >
          <Reply size={16} />
          Ответить
        </button>
        {isOwn && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDelete();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: 'rgb(220, 38, 38)',
              fontSize: 14,
              cursor: 'pointer',
              borderRadius: 12,
              textAlign: 'left',
            }}
          >
            <Trash2 size={16} />
            Удалить
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 11.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/MessageActionsMenu.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 11.1.5: Commit**

```bash
git add packages/web/src/chat/components/MessageActionsMenu.tsx \
        packages/web/src/chat/test/MessageActionsMenu.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat): MessageActionsMenu — emoji shelf + 'more' button

Long-press menu now leads with a 6-favorite emoji shelf and a SmilePlus
'more' button, then the existing Reply/Delete items below a divider.
Shelf taps fire onPickEmoji + onClose; the more button fires onMoreEmoji
(parent decides whether to swap menu for ReactionPicker).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 12: ChatBubble + ChatRoomScreen integration

### Task 12.1: ChatBubble accepts `<ReactionBar>` slot

**Files:**
- Modify: `packages/web/src/chat/components/ChatBubble.tsx`

- [ ] **Step 12.1.1: Update ChatBubble**

Open `packages/web/src/chat/components/ChatBubble.tsx`. Find the `Props` interface and add `onReact: (emoji: string) => void;`. Then in the JSX, after the rendered message content (immediately before the closing element of the bubble container), insert:

```tsx
        <ReactionBar
          reactions={message.reactions}
          onToggle={onReact}
        />
```

Add the import:

```ts
import { ReactionBar } from './ReactionBar.js';
```

The exact location of the slot depends on the current ChatBubble structure — locate the JSX element that wraps the message content (`<div>` with `glass`/`glass-dark` className) and place `<ReactionBar>` as its **last child**.

### Task 12.2: ChatRoomScreen — mutations + wire-up

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`

- [ ] **Step 12.2.1: Add imports**

Open `packages/web/src/chat/screens/ChatRoomScreen.tsx`. Extend the existing import from `../api.js`:

```ts
import {
  deleteMessage,
  fetchMessages,
  markChatAsRead,
  sendMessage,
  addReaction,
  removeReaction,
  type ChatDTO,
  type ChatMessageDTO,
} from '../api.js';
```

Add new imports:

```ts
import { ReactionPicker } from '../components/ReactionPicker.js';
import { switchMyReactionTo, removeMyReaction } from '../reactionsState.js';
```

- [ ] **Step 12.2.2: Add picker state + mutations**

Below the existing `useState` calls (around line 47, near `actionTarget`), add:

```ts
  const [pickerTarget, setPickerTarget] = useState<{
    messageId: string;
    anchorRect: DOMRect;
  } | null>(null);
```

After the `deleteMut` declaration (around line 196), append:

```ts
  const addMut = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      addReaction(messageId, emoji),
    onMutate: ({ messageId, emoji }) => {
      const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        let touched = false;
        const pages = old.pages.map((page) =>
          page.map((m) => {
            if (m.id !== messageId) return m;
            const next = switchMyReactionTo(m, emoji);
            if (next === m) return m;
            touched = true;
            return next;
          }),
        );
        return touched ? { ...old, pages } : old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
    },
  });

  const removeMut = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      removeReaction(messageId, emoji),
    onMutate: ({ messageId, emoji }) => {
      const prev = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      queryClient.setQueryData<InfinitePages | undefined>(chatKeys.messages(chatId), (old) => {
        if (!old) return old;
        let touched = false;
        const pages = old.pages.map((page) =>
          page.map((m) => {
            if (m.id !== messageId) return m;
            const next = removeMyReaction(m, emoji);
            if (next === m) return m;
            touched = true;
            return next;
          }),
        );
        return touched ? { ...old, pages } : old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(chatKeys.messages(chatId), ctx.prev);
    },
  });
```

- [ ] **Step 12.2.3: Add callbacks**

After the existing `onDeleteId` callback (around line 207), append:

```ts
  const onToggleReaction = useCallback(
    (messageId: string, emoji: string): void => {
      const all = queryClient.getQueryData<InfinitePages>(chatKeys.messages(chatId));
      const msg = all?.pages.flat().find((m) => m.id === messageId);
      const existing = msg?.reactions.find((r) => r.emoji === emoji);
      if (existing?.reactedByMe) {
        removeMut.mutate({ messageId, emoji });
      } else {
        addMut.mutate({ messageId, emoji });
      }
    },
    [queryClient, chatId, addMut, removeMut],
  );

  const onPickEmojiFromMenu = useCallback(
    (emoji: string): void => {
      if (actionTarget) addMut.mutate({ messageId: actionTarget.message.id, emoji });
    },
    [actionTarget, addMut],
  );

  const onMoreEmoji = useCallback((): void => {
    if (!actionTarget) return;
    setPickerTarget({ messageId: actionTarget.message.id, anchorRect: actionTarget.anchorRect });
    setActionTarget(null);
  }, [actionTarget]);

  const onPickFromPicker = useCallback(
    (emoji: string): void => {
      if (pickerTarget) addMut.mutate({ messageId: pickerTarget.messageId, emoji });
      setPickerTarget(null);
    },
    [pickerTarget, addMut],
  );
```

- [ ] **Step 12.2.4: Pass `onReact` into ChatBubble + extend MessageActionsMenu props + add ReactionPicker**

In the JSX list rendering messages (around line 295), update the `<ChatBubble>`:

```tsx
            <ChatBubble
              key={m.id}
              message={m}
              isOwn={isOwn}
              replyTo={replyTo}
              onRequestActions={onRequestActions}
              onReact={(emoji) => onToggleReaction(m.id, emoji)}
            />
```

Update the `<MessageActionsMenu>` block (around line 323) to include the new props:

```tsx
      <MessageActionsMenu
        open={actionTarget !== null}
        anchorRect={actionTarget?.anchorRect ?? null}
        isOwn={actionIsOwn}
        onReply={() => actionMessage && onReplyTo(actionMessage)}
        onDelete={() => actionMessage && onDeleteId(actionMessage.id)}
        onPickEmoji={onPickEmojiFromMenu}
        onMoreEmoji={onMoreEmoji}
        onClose={onCloseActions}
      />
      <ReactionPicker
        open={pickerTarget !== null}
        anchorRect={pickerTarget?.anchorRect ?? null}
        onPick={onPickFromPicker}
        onClose={() => setPickerTarget(null)}
      />
```

- [ ] **Step 12.2.5: Run typecheck**

Run:
```bash
pnpm --filter @hockey/web typecheck
```

Expected: clean. If TS complains about a missing prop on `ChatBubble` — make sure Step 12.1.1 ran (added `onReact` to its Props).

### Task 12.3: ChatRoomScreen integration tests

**Files:**
- Modify: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

- [ ] **Step 12.3.1: Append integration cases**

Open `packages/web/src/chat/test/ChatRoomScreen.test.tsx`. At the **end** of the outer `describe('ChatRoomScreen', ...)` block (just before its closing `});`), append:

```ts
  it('long-press → menu shelf → tap favorite → POST sent + optimistic count+1', async () => {
    // Pre-seed cache so render is synchronous-ish.
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'hi', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z', reactions: [] }]],
      pageParams: [undefined],
    });
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ messageId: 'm0', emoji: '👍', removed: null }),
    } as Response);

    renderRoom('c1');
    const bubble = await screen.findByText('hi');
    // simulate long-press by directly calling the existing onRequestActions path
    // — most projects in this repo trigger via a synthetic pointer event
    // (see useLongPress.test.tsx). Use the same shape here.
    fireEvent.pointerDown(bubble, { pointerId: 1 });
    await new Promise((r) => setTimeout(r, 600));
    fireEvent.pointerUp(bubble, { pointerId: 1 });

    // Tap a favorite emoji (e.g. first FAVORITE_EMOJI = 👍).
    const favorite = await screen.findByRole('button', { name: '👍' });
    await userEvent.click(favorite);

    // POST was issued.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/chat\/messages\/m0\/reactions$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ emoji: '👍' }) }),
    );

    // Optimistic patch present in cache.
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
  });

  it('tap on own pill → DELETE + optimistic count-1', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: SELF, content: 'hi', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '👍', count: 1, reactedByMe: true }] }]],
      pageParams: [undefined],
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null } as Response);

    renderRoom('c1');
    const pill = await screen.findByRole('button', { name: /👍 1/ });
    await userEvent.click(pill);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/chat\/messages\/m0\/reactions$/),
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ emoji: '👍' }) }),
    );

    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([]);
  });

  it('POST failure rolls back optimistic patch', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'hi', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z', reactions: [] }]],
      pageParams: [undefined],
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);

    renderRoom('c1');
    const bubble = await screen.findByText('hi');
    fireEvent.pointerDown(bubble, { pointerId: 1 });
    await new Promise((r) => setTimeout(r, 600));
    fireEvent.pointerUp(bubble, { pointerId: 1 });

    const favorite = await screen.findByRole('button', { name: '👍' });
    await userEvent.click(favorite);

    // Wait a tick for the rejection to land.
    await new Promise((r) => setTimeout(r, 0));

    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([]);
  });
```

These tests assume the existing test file already exposes:
- `qc` (the local `QueryClient`),
- `fetchMock` (`vi.spyOn(global, 'fetch')` or similar),
- `SELF` / `OTHER` constants,
- `renderRoom(chatId)` helper,
- top-level imports for `screen`, `fireEvent`, `userEvent`, `chatKeys`, `ChatMessageDTO`.

If any of these is missing in the current file, port it from `useChatSocket.test.tsx` patterns (the test setup is the same: `MemoryRouter`, mocked WS, `fetchMock` swap). If the existing file uses a different render helper / signature, adapt the calls but keep the assertions identical.

- [ ] **Step 12.3.2: Run web tests**

Run:
```bash
pnpm --filter @hockey/web test
```

Expected: all green. Existing ChatRoomScreen tests still pass; new reaction integration tests pass.

If a test depends on a helper that's absent, fix the helper and re-run — don't relax the assertion.

- [ ] **Step 12.3.3: Run typecheck + lint**

Run:
```bash
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web lint
```

Expected: clean.

- [ ] **Step 12.3.4: Commit**

```bash
git add packages/web/src/chat/components/ChatBubble.tsx \
        packages/web/src/chat/screens/ChatRoomScreen.tsx \
        packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat): wire reactions into ChatBubble + ChatRoomScreen

ChatBubble exposes onReact and renders ReactionBar. ChatRoomScreen owns
addMut/removeMut with switchMyReactionTo / removeMyReaction optimistic
patches and rollback on error. Long-press menu's emoji shelf and the
'+' button drive ReactionPicker. WS events from useChatSocket dedup
self-events against the local optimistic state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 13: BottomNav badge — chats with unread, not message sum

### Task 13.1

**Files:**
- Modify: `packages/web/src/chat/chatStore.ts`
- Modify: `packages/web/src/chat/test/chatStore.test.ts`

- [ ] **Step 13.1.1: Rewrite the failing test**

Open `packages/web/src/chat/test/chatStore.test.ts`. Replace the test on line 22 (`it('totalUnread sums over unreadByChat', ...)`) with:

```ts
  it('totalUnread counts chats with >0 unread (not message sum)', () => {
    useChatStore.getState().setUnread({ 'chat-A': 2, 'chat-B': 5, 'chat-C': 0 });
    expect(useChatStore.getState().totalUnread()).toBe(2);
  });

  it('totalUnread is 0 when all chats are zero', () => {
    useChatStore.getState().setUnread({ 'chat-A': 0, 'chat-B': 0 });
    expect(useChatStore.getState().totalUnread()).toBe(0);
  });

  it('totalUnread is 0 when map is empty', () => {
    expect(useChatStore.getState().totalUnread()).toBe(0);
  });
```

- [ ] **Step 13.1.2: Run test (must FAIL)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/chatStore.test.ts
```

Expected: the new "counts chats with >0" test fails (`totalUnread` still returns 7).

- [ ] **Step 13.1.3: Update chatStore.totalUnread**

Open `packages/web/src/chat/chatStore.ts`. Replace the `totalUnread` implementation (line 21):

```ts
  totalUnread() {
    let chats = 0;
    for (const v of Object.values(get().unreadByChat)) {
      if (v > 0) chats += 1;
    }
    return chats;
  },
```

- [ ] **Step 13.1.4: Run test (must PASS)**

Run:
```bash
pnpm --filter @hockey/web test -- src/chat/test/chatStore.test.ts
```

Expected: green.

- [ ] **Step 13.1.5: Run full web suite + server suite (full regression check)**

Run:
```bash
pnpm --filter @hockey/web test
pnpm --filter @hockey/server test
pnpm typecheck
pnpm lint
```

Expected: all green.

- [ ] **Step 13.1.6: Commit**

```bash
git add packages/web/src/chat/chatStore.ts \
        packages/web/src/chat/test/chatStore.test.ts
git commit -m "$(cat <<'EOF'
fix(chat): BottomNav badge counts chats with unread, not message sum

totalUnread() now returns the number of chats with >0 unread messages.
The badge UI (BottomNav) reads the same value, so 10 unread across 2
chats now shows as '2' instead of '10' — matches user expectation
(badge = 'how many threads need my attention').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 14: CLAUDE.md update

### Task 14.1

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 14.1.1: Append a one-line PR 8 note to the chat paragraph**

Open `CLAUDE.md`. Find the chat paragraph (the one starting `### Чат (PR 1+2+3+4+5+6+7 — БД, REST, ...)`). Update its opening line and append a short PR 8 line at the **end of the same paragraph**.

Update opening:

```
### Чат (PR 1+2+3+4+5+6+7+8 — БД, REST, серверный realtime, web MVP, web realtime, UI polish, global search, реакции)
```

At the end of the paragraph (after the existing `Спек: ...` reference), append:

```
PR 8 — реакции: миграция `005` ужесточает UNIQUE до `(message_id, user_id)` (одна реакция на юзера на сообщение); серверные `addReaction` (DELETE prev → INSERT ON CONFLICT) и `removeReaction` + endpoint'ы `POST/DELETE /chat/messages/:id/reactions` с zod-enum whitelist 24 эмодзи; events `publishReactionAdded/Removed` через `fanOut`. Web: `EMOJI_WHITELIST` дублируется в `chat/reactions.ts`, `ReactionBar` под bubble (flex-wrap, своя — `.pill--dark`), `ReactionPicker` (3×8) + эмодзи-полка (6 favorites + `+`) в `MessageActionsMenu`; мутации `addMut/removeMut` через `switchMyReactionTo`/`removeMyReaction` с rollback; `useChatSocket.applyReactionEvent` патчит `chatKeys.messages` и дедупит self-events по `event.userId === meId`. `chatStore.totalUnread()` теперь считает чаты с непрочитанным, не сумму. Спек: `docs/superpowers/specs/2026-04-28-chat-pr8-reactions-design.md`.
```

- [ ] **Step 14.1.2: Verify CLAUDE.md is still ≤ 200 lines**

Run:
```bash
wc -l CLAUDE.md
```

Expected: ≤ 200. If over, trim earlier paragraphs (NOT this new one) — short PR 8 line takes priority over older verbose ones.

- [ ] **Step 14.1.3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: note PR 8 reactions in CLAUDE.md chat paragraph

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 15: Final verification + finishing-a-development-branch

### Task 15.1: Full regression sweep

- [ ] **Step 15.1.1: Run everything**

Run:
```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all green.

If anything fails — fix at the source, re-run, then move on. Do not commit failures forward.

### Task 15.2: Manual smoke (optional but recommended)

- [ ] **Step 15.2.1: Boot dev servers**

In one terminal:
```bash
pnpm dev:server
```

In another:
```bash
pnpm dev:web
```

- [ ] **Step 15.2.2: Two-tab smoke**

Open `http://localhost:5173` in two browser windows. Login each as a different dev user (`/auth/dev` button on `LoginScreen`). Open a DM:

1. User A long-presses a message → menu opens → tap 👍 → pill appears under bubble.
2. User B (other tab) sees the pill appear in realtime.
3. A long-presses the same message → tap `+` → picker → tap 🎉 → A's pill switches from 👍 to 🎉; B sees both removed/added events fire.
4. A taps own 🎉 pill → it disappears for both.
5. Reload A — reactions persist.

If anything diverges, capture the bug, file it as a follow-up task in the plan, but DO NOT skip the next step.

### Task 15.3: Finishing the branch

- [ ] **Step 15.3.1: Use the finishing-a-development-branch skill**

Invoke:
```
Skill: superpowers:finishing-a-development-branch
```

It will guide through: review checklist → push → open PR → squash-merge to main → wait for `deploy.yml` → smoke `https://hockey.inbotwetrust.ru/api/health`.

- [ ] **Step 15.3.2: Reminder before merge**

Before squash-merging, **remind the user**:
- Confirm prod env / `005_chat_reaction_user_unique.sql` migration: deploy.yml runs `migrate-cli.js` which auto-applies new SQL files in order. No manual SSH.
- After deploy completes, manually verify in prod via the same two-tab smoke (Step 15.2.2) on `https://hockey.inbotwetrust.ru`.
- The SSH `up --force-recreate` workaround documented in the GHCR memory may apply — if smoke passes but the app behaves like the old image, ssh manually and `docker compose up -d --force-recreate web server` (see `~/.claude/projects/.../memory/project_ghcr_blackhole_workaround.md`).

---

## Self-Review

**Spec coverage check** (against `2026-04-28-chat-pr8-reactions-design.md`):
- §3 Migration 005 → Phase 1 ✓
- §4.1 service.addReaction/removeReaction → Phase 3 ✓
- §4.1 getMessageOr404 → Phase 3 (Step 3.1.4) ✓
- §4.2 publishReactionAdded/Removed → Phase 4 ✓
- §4.3 POST/DELETE routes + zod whitelist + 404 mapping → Phase 5 ✓
- §4.4 whitelist single source via snapshot test → Phase 2 (server) + Phase 6 (web) ✓
- §5.1 EMOJI_WHITELIST + isWhitelistEmoji + FAVORITE_EMOJI → Phase 6 ✓
- §5.2 api.ts addReaction/removeReaction → Phase 8 (Task 8.1) ✓
- §5.3 useChatSocket.applyReactionEvent → Phase 8 (Task 8.3) ✓
- §5.4 chatStore reaction events stay no-op → covered (no change to chatStore for that; the existing `applyEvent` no-op stays) ✓
- §5.5 lib/queryKeys.ts removes reactions → Phase 8 (Task 8.2) ✓
- §6.1 ReactionBar → Phase 9 ✓
- §6.2 ReactionPicker → Phase 10 ✓
- §6.3 MessageActionsMenu shelf + `+` → Phase 11 ✓
- §6.4 ChatBubble slot → Phase 12 (Task 12.1) ✓
- §6.5 ChatRoomScreen mutations + picker state → Phase 12 (Task 12.2) ✓
- §7 UX flows → covered via integration tests in Phase 12 (Task 12.3) ✓
- §8 dedup rules → tests in Phase 8 (Task 8.3.1) ✓
- §9 BottomNav badge → Phase 13 ✓
- §10 server tests → Phases 1, 3, 4, 5 ✓
- §10 web tests → Phases 6, 7, 9, 10, 11, 12, 13 ✓
- §11 file map → all paths covered ✓
- §13 verification → Phase 15 ✓

**Placeholder scan:** none. Every step lists exact file path, exact code, exact command, expected outcome.

**Type consistency:** `AddReactionResult` declared in Phase 3.1.3 (server types.ts), used in Phase 3.1.4 (service.ts) and consumed by routes in Phase 5.1.3 — names match. `applyReactionEventToMessage` (Phase 7.1.3) is imported in Phase 8.3.3 — name matches. `switchMyReactionTo` / `removeMyReaction` (Phase 7) used in Phase 12 — names match. `EMOJI_WHITELIST` / `FAVORITE_EMOJI` exports — names match across server and web. `onPickEmoji` / `onMoreEmoji` props on `MessageActionsMenu` declared in Phase 11.1.3 and consumed in Phase 12.2.4 — match. `onReact` prop on `ChatBubble` declared in Phase 12.1.1 and passed in Phase 12.2.4 — match.

No drift detected.
