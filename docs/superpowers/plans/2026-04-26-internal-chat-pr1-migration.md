# Internal Chat — PR 1: Migration + Types + Seed CLI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for internal chat: 4 SQL tables (chats, chat_members, messages, message_reactions) with indexes and a trigger; shared TypeScript types; CLI command to seed system channels. After this PR, the database schema is ready and an admin can create a system channel from the terminal.

**Architecture:** One SQL migration (`004_chat.sql`) following the existing `NNN_slug.sql` pattern in `packages/server/db/migrations/`. Runs via existing `pnpm db:migrate` runner. TS types live in `packages/server/src/chat/types.ts` (shared by routes/service/ws in subsequent PRs). Seed logic in `chat/seed.ts` exports a pure function `seedSystemChannel(pool, opts)`; thin CLI wrapper in `chat/seed-cli.ts` reads argv, loads env, runs the seed.

**Tech Stack:** Postgres 16 + `pg_trgm` extension; `pg` client (`Pool`); `tsx` for CLI execution; `vitest` for unit + integration tests; `zod` for env validation.

**Spec reference:** `docs/superpowers/specs/2026-04-26-internal-chat-design.md` §3 (DB), §6.6 (seed CLI), §10.5 (pg_trgm rationale).

---

## File Structure

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/server/db/migrations/004_chat.sql` | All chat DDL: 4 tables, indexes, pg_trgm extension + index, trigger |
| Create | `packages/server/src/chat/types.ts` | Row types matching SQL columns; DTO types for API responses |
| Create | `packages/server/src/chat/seed.ts` | `seedSystemChannel()` — idempotent function |
| Create | `packages/server/src/chat/seed-cli.ts` | CLI entry: parses argv, loads env, calls seed, exits |
| Create | `packages/server/test/chat/migration.test.ts` | Roundtrip insert/select on fresh test DB |
| Create | `packages/server/test/chat/seed.test.ts` | seedSystemChannel idempotency + happy path |
| Modify | `packages/server/src/config.ts` | Add `SYSTEM_USER_ID` env (optional uuid) to `AppConfig` and `MigrationConfig` |
| Modify | `packages/server/package.json` | Add `chat:seed` npm script |
| Modify | `.env.example` | Document `SYSTEM_USER_ID` |
| Modify | `CLAUDE.md` | Short Architecture note about chat (≤200 lines constraint preserved) |

---

## Pre-flight check

- [ ] **Step 0.1: Verify branch and clean tree**

```bash
cd "/Users/egorgumenyuk/Projects/Ultimate Hockey"
git status
git checkout -b feat/chat-pr1-migration
```

Expected: clean working tree, new branch.

- [ ] **Step 0.2: Verify Postgres + Redis are running**

```bash
brew services list | grep -E '(postgresql@16|redis)'
```

Expected: both `started`.

- [ ] **Step 0.3: Sanity-check current migrations apply**

```bash
pnpm --filter @hockey/server db:migrate
```

Expected: `[migrate] up to date` (003 already applied) or applies any missing.

---

## Task 1: Add `SYSTEM_USER_ID` to config

**Files:**
- Modify: `packages/server/src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1.1: Add `SYSTEM_USER_ID` to AppConfig schema**

Edit `packages/server/src/config.ts`. Add after `DAILY_SEED_SECRET` line:

```ts
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  REFRESH_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  DAILY_SEED_SECRET: z.string().min(16),
  SYSTEM_USER_ID: z.string().uuid().optional(),
});
```

`SYSTEM_USER_ID` is optional: it's only required when running `chat:seed`, not for the regular server boot.

- [ ] **Step 1.2: Add it to .env.example with explanation**

Edit `.env.example` — add at the very end:

```
# UUID of the system user account used as created_by for system chat channels.
# Set this to the id of any existing user row (e.g. an admin Telegram account
# that already logged in once). Required only when running `pnpm chat:seed`.
SYSTEM_USER_ID=
```

- [ ] **Step 1.3: Run typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: no errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/server/src/config.ts .env.example
git commit -m "feat(server): add SYSTEM_USER_ID config for chat seed"
```

---

## Task 2: Create migration `004_chat.sql`

**Files:**
- Create: `packages/server/db/migrations/004_chat.sql`

- [ ] **Step 2.1: Write the migration file**

Create `packages/server/db/migrations/004_chat.sql` with full content:

```sql
-- Internal chat foundation: chats, chat_members, messages, message_reactions.
-- See: docs/superpowers/specs/2026-04-26-internal-chat-design.md §3

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────
-- chats: top-level chat row. type discriminates DM / group / system channel.
-- entity_type/entity_id are reserved for future team/tournament wiring.
-- ─────────────────────────────────────────────────────────────────────────
create table chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'system')),
  name text,
  created_by uuid not null references users(id),
  entity_type text check (entity_type in ('team', 'tournament')),
  entity_id uuid,
  last_message_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chats_last_message
  on chats (last_message_at desc nulls last)
  where is_active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- chat_members: membership for direct/group chats. For system channels rows
-- are created lazily on first markAsRead or first message.
-- ─────────────────────────────────────────────────────────────────────────
create table chat_members (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

create index idx_chat_members_user on chat_members (user_id);
create index idx_chat_members_chat on chat_members (chat_id);

-- ─────────────────────────────────────────────────────────────────────────
-- messages: text messages with reply, soft-delete, generated tsvector for FT.
-- sender_id has no on-delete cascade — orphan messages survive user deletion.
-- ─────────────────────────────────────────────────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid not null references users(id),
  content text not null,
  reply_to_id uuid references messages(id) on delete set null,
  is_deleted boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('russian', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_messages_chat_created_alive
  on messages (chat_id, created_at desc)
  where is_deleted = false;

create index idx_messages_reply
  on messages (reply_to_id)
  where reply_to_id is not null;

create index idx_messages_search
  on messages using gin (search_vector);

-- ─────────────────────────────────────────────────────────────────────────
-- message_reactions: one row per (message, user, emoji). User can stack
-- multiple distinct emojis on the same message.
-- ─────────────────────────────────────────────────────────────────────────
create table message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji varchar(16) not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index idx_message_reactions_message on message_reactions (message_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: keep chats.last_message_at in sync with newest message.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function update_chat_last_message() returns trigger as $$
begin
  update chats
  set last_message_at = new.created_at, updated_at = now()
  where id = new.chat_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_update_chat_last_message
after insert on messages for each row
execute function update_chat_last_message();

-- ─────────────────────────────────────────────────────────────────────────
-- pg_trgm GIN index on users.display_name for fast user picker (LIKE %q%).
-- ─────────────────────────────────────────────────────────────────────────
create index idx_users_display_name_trgm
  on users using gin (display_name gin_trgm_ops);
```

- [ ] **Step 2.2: Apply migration to dev DB**

```bash
pnpm --filter @hockey/server db:migrate
```

Expected: `[migrate] applied: 004_chat.sql`.

- [ ] **Step 2.3: Verify schema with psql**

```bash
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\d chats'
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\d messages'
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\dx'
```

Expected:
- `chats` shows all columns with correct types and constraints.
- `messages.search_vector` shows as `tsvector` GENERATED.
- `\dx` lists `pgcrypto` AND `pg_trgm`.

- [ ] **Step 2.4: Apply to test DB and verify**

```bash
DATABASE_URL=postgres://hockey:hockey_dev_password@localhost:5432/hockey_test \
  pnpm --filter @hockey/server db:migrate
```

Expected: applies cleanly to `hockey_test` (or shows already applied if it shares migration state).

- [ ] **Step 2.5: Commit**

```bash
git add packages/server/db/migrations/004_chat.sql
git commit -m "feat(server): add chat tables migration (004_chat.sql)"
```

---

## Task 3: Migration roundtrip integration test

**Files:**
- Create: `packages/server/test/chat/migration.test.ts`

This test verifies the migration is correct end-to-end: it writes a row into each table and reads it back, confirming all FKs, defaults, and the trigger work.

- [ ] **Step 3.1: Write the failing test**

Create `packages/server/test/chat/migration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('chat migration 004', () => {
  let pool: Pool;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    // Seed two users (chat FKs require them).
    // Note: users.id has no default, must pass gen_random_uuid() explicitly.
    // Telegram identity lives in auth_providers (not needed for chat tests).
    const insertUser = `
      insert into users (id, display_name, timezone)
      values (gen_random_uuid(), $1, 'UTC')
      returning id
    `;
    const ra = await pool.query(insertUser, ['Alice']);
    const rb = await pool.query(insertUser, ['Bob']);
    userA = ra.rows[0].id;
    userB = rb.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates a direct chat and roundtrip-reads it', async () => {
    const ins = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning *`,
      [userA],
    );
    expect(ins.rows[0].type).toBe('direct');
    expect(ins.rows[0].is_active).toBe(true);
    expect(ins.rows[0].last_message_at).toBeNull();
    expect(ins.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('inserts members with unique (chat_id, user_id)', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = chat.rows[0].id;

    await pool.query(
      `insert into chat_members (chat_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member')`,
      [chatId, userA, userB],
    );

    const dup = pool.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2)`,
      [chatId, userA],
    );
    await expect(dup).rejects.toThrow(/duplicate key/);
  });

  it('inserts a message and trigger updates chats.last_message_at', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = chat.rows[0].id;

    const msg = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'привет, мир')
       returning id, search_vector::text`,
      [chatId, userA],
    );
    expect(msg.rows[0].search_vector).toContain("'привет'"); // russian dict

    const refreshed = await pool.query(
      `select last_message_at from chats where id = $1`,
      [chatId],
    );
    expect(refreshed.rows[0].last_message_at).toBeInstanceOf(Date);
  });

  it('reactions enforce uniqueness on (message, user, emoji)', async () => {
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
    await pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`,
      [messageId, userA],
    );

    const dup = pool.query(
      `insert into message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`,
      [messageId, userA],
    );
    await expect(dup).rejects.toThrow(/duplicate key/);
  });

  it('rejects invalid chat.type via CHECK', async () => {
    const bad = pool.query(
      `insert into chats (type, created_by) values ('weird', $1)`,
      [userA],
    );
    await expect(bad).rejects.toThrow(/check constraint/);
  });

  it('reply_to_id becomes NULL when parent message is deleted', async () => {
    const chat = await pool.query(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const parent = await pool.query(
      `insert into messages (chat_id, sender_id, content) values ($1, $2, 'parent') returning id`,
      [chat.rows[0].id, userA],
    );
    const reply = await pool.query(
      `insert into messages (chat_id, sender_id, content, reply_to_id) values ($1, $2, 'reply', $3) returning id`,
      [chat.rows[0].id, userA, parent.rows[0].id],
    );

    await pool.query(`delete from messages where id = $1`, [parent.rows[0].id]);

    const r = await pool.query(`select reply_to_id from messages where id = $1`, [reply.rows[0].id]);
    expect(r.rows[0].reply_to_id).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run test, expect to PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/migration.test.ts
```

Expected: 6 passing tests.

If any test fails, the migration itself is broken (not the test). Fix the migration, re-apply via `db:migrate`, and re-run.

- [ ] **Step 3.3: Commit**

```bash
git add packages/server/test/chat/migration.test.ts
git commit -m "test(server): integration test for chat migration"
```

---

## Task 4: Define TypeScript types

**Files:**
- Create: `packages/server/src/chat/types.ts`

These types are the single source of truth for chat data. They match the SQL columns exactly. Subsequent PRs (routes, service, ws) import from here.

- [ ] **Step 4.1: Create types file**

Create `packages/server/src/chat/types.ts`:

```ts
// Row types — one per chat table. snake_case to match SQL columns; conversion
// to camelCase happens at the API boundary (routes layer) in PR 2.

export type ChatType = 'direct' | 'group' | 'system';
export type ChatMemberRole = 'admin' | 'member';
export type EntityType = 'team' | 'tournament';

export interface ChatRow {
  id: string;
  type: ChatType;
  name: string | null;
  created_by: string;
  entity_type: EntityType | null;
  entity_id: string | null;
  last_message_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMemberRow {
  id: string;
  chat_id: string;
  user_id: string;
  role: ChatMemberRole;
  last_read_at: Date;
  joined_at: Date;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
  // search_vector is generated; not selected into typed rows.
}

export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

// DTOs — what the API returns to clients. camelCase, no internal flags exposed.

export interface ChatDTO {
  id: string;
  type: ChatType;
  name: string | null;
  entityType: EntityType | null;
  entityId: string | null;
  lastMessageAt: string | null; // ISO
  unreadCount: number;
  lastMessage: ChatMessageDTO | null;
  // For DMs: rendered name and avatar of the OTHER user. Null for group/system.
  dmCounterpart: { userId: string; displayName: string; avatarUrl: string | null } | null;
}

export interface ChatMessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  isDeleted: boolean;
  createdAt: string; // ISO
  reactions: ReactionGroupDTO[];
}

export interface ReactionGroupDTO {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

// WS event types. Discriminated union; serialized as JSON over the wire.

export type ChatEvent =
  | { type: 'message:new'; chatId: string; message: ChatMessageDTO }
  | { type: 'message:deleted'; chatId: string; messageId: string }
  | { type: 'reaction:added'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'reaction:removed'; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: 'chat:read'; chatId: string; userId: string; lastReadAt: string };

export interface ChatEventFrame {
  v: 1;
  event: ChatEvent;
}
```

- [ ] **Step 4.2: Run typecheck**

```bash
pnpm --filter @hockey/server typecheck
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add packages/server/src/chat/types.ts
git commit -m "feat(server): define chat row + DTO + event types"
```

---

## Task 5: Implement `seedSystemChannel`

**Files:**
- Create: `packages/server/src/chat/seed.ts`
- Create: `packages/server/test/chat/seed.test.ts`

The seed function is idempotent: calling it twice with the same name must not create two channels. It accepts a `created_by` UUID (the system user); `seed-cli.ts` resolves it from env.

- [ ] **Step 5.1: Write the failing test**

Create `packages/server/test/chat/seed.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { seedSystemChannel } from '../../src/chat/seed.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('seedSystemChannel', () => {
  let pool: Pool;
  let systemUserId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const r = await pool.query(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), $1, 'UTC') returning id`,
      ['System'],
    );
    systemUserId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`delete from chats`);
  });

  it('creates a new system chat with type=system and is_active=true', async () => {
    const result = await seedSystemChannel(pool, {
      name: 'Общий чат лиги',
      createdBy: systemUserId,
    });
    expect(result.created).toBe(true);
    expect(result.chat.type).toBe('system');
    expect(result.chat.name).toBe('Общий чат лиги');
    expect(result.chat.is_active).toBe(true);

    const rows = await pool.query(`select * from chats where type = 'system'`);
    expect(rows.rowCount).toBe(1);
  });

  it('is idempotent — calling twice with the same name yields the same chat', async () => {
    const r1 = await seedSystemChannel(pool, { name: 'X', createdBy: systemUserId });
    const r2 = await seedSystemChannel(pool, { name: 'X', createdBy: systemUserId });
    expect(r1.chat.id).toBe(r2.chat.id);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
  });

  it('does NOT create chat_members rows (members are lazy)', async () => {
    await seedSystemChannel(pool, { name: 'Y', createdBy: systemUserId });
    const m = await pool.query(`select count(*)::int as c from chat_members`);
    expect(m.rows[0].c).toBe(0);
  });

  it('rejects empty name', async () => {
    await expect(
      seedSystemChannel(pool, { name: '', createdBy: systemUserId }),
    ).rejects.toThrow(/name/i);
  });
});
```

- [ ] **Step 5.2: Run test, expect FAIL**

```bash
pnpm --filter @hockey/server test -- test/chat/seed.test.ts
```

Expected: fails with `Cannot find module '../../src/chat/seed.js'` or similar.

- [ ] **Step 5.3: Implement `seedSystemChannel`**

Create `packages/server/src/chat/seed.ts`:

```ts
import type { Pool } from 'pg';
import type { ChatRow } from './types.js';

export interface SeedSystemChannelOpts {
  name: string;
  createdBy: string; // UUID of the system/admin user
}

export interface SeedSystemChannelResult {
  chat: ChatRow;
  created: boolean; // false when an existing channel with the same name was reused
}

export async function seedSystemChannel(
  pool: Pool,
  opts: SeedSystemChannelOpts,
): Promise<SeedSystemChannelResult> {
  const name = opts.name.trim();
  if (name.length === 0) {
    throw new Error('seedSystemChannel: name must be non-empty');
  }

  const existing = await pool.query<ChatRow>(
    `select * from chats where type = 'system' and name = $1 and is_active = true limit 1`,
    [name],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return { chat: existing.rows[0]!, created: false };
  }

  const inserted = await pool.query<ChatRow>(
    `insert into chats (type, name, created_by) values ('system', $1, $2) returning *`,
    [name, opts.createdBy],
  );
  return { chat: inserted.rows[0]!, created: true };
}
```

- [ ] **Step 5.4: Run test, expect PASS**

```bash
pnpm --filter @hockey/server test -- test/chat/seed.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5.5: Commit**

```bash
git add packages/server/src/chat/seed.ts packages/server/test/chat/seed.test.ts
git commit -m "feat(server): seedSystemChannel idempotent helper + tests"
```

---

## Task 6: Implement CLI entry `seed-cli.ts`

**Files:**
- Create: `packages/server/src/chat/seed-cli.ts`
- Modify: `packages/server/package.json`

The CLI is a thin shell around `seedSystemChannel`. It loads env (via existing `loadDotEnv`), resolves `SYSTEM_USER_ID`, runs the seed, and prints a one-line result. No tests for this file — it's just argv plumbing; the function it calls is fully tested.

- [ ] **Step 6.1: Create CLI script**

Create `packages/server/src/chat/seed-cli.ts`:

```ts
import { loadDotEnv } from '../env.js';
import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { seedSystemChannel } from './seed.js';

loadDotEnv();

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    process.stderr.write('Usage: pnpm chat:seed "<channel name>"\n');
    process.exit(1);
  }

  const systemUserId = process.env.SYSTEM_USER_ID;
  if (!systemUserId) {
    process.stderr.write(
      'SYSTEM_USER_ID env var is required. Set it in .env to a UUID of a real user row\n' +
        '(e.g. an admin Telegram account that already logged in once).\n',
    );
    process.exit(1);
  }

  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const result = await seedSystemChannel(pool, { name, createdBy: systemUserId });
    if (result.created) {
      console.log(`[chat:seed] created system channel "${result.chat.name}" (${result.chat.id})`);
    } else {
      console.log(`[chat:seed] system channel "${result.chat.name}" already exists (${result.chat.id})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  process.stderr.write(`[chat:seed] failed: ${msg}\n`);
  process.exit(1);
});
```

- [ ] **Step 6.2: Add npm script**

Edit `packages/server/package.json`. Add `"chat:seed"` after `"db:migrate"`:

```json
{
  "name": "@hockey/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "db:migrate": "tsx src/db/migrate-cli.ts",
    "chat:seed": "tsx src/chat/seed-cli.ts"
  },
  ...
}
```

(Keep `dependencies` / `devDependencies` blocks as-is; only the `scripts` block changes.)

- [ ] **Step 6.3: Manual smoke test (without SYSTEM_USER_ID)**

```bash
pnpm --filter @hockey/server chat:seed "Общий чат лиги"
```

Expected: stderr message about missing `SYSTEM_USER_ID`, exit code 1.

- [ ] **Step 6.4: Manual smoke test (with SYSTEM_USER_ID)**

First find or create a user UUID. If you've logged in via dev-button at least once, list users and pick one:

```bash
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c \
  "select id, display_name from users limit 5;"
```

Otherwise insert a stub directly (users.id has no default — pass gen_random_uuid()):

```bash
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c \
  "insert into users (id, display_name, timezone) values (gen_random_uuid(), 'admin', 'UTC') returning id;"
```

Copy the returned UUID and set in `.env`:

```
SYSTEM_USER_ID=<paste-uuid-here>
```

Then run:

```bash
pnpm --filter @hockey/server chat:seed "Общий чат лиги"
```

Expected: `[chat:seed] created system channel "Общий чат лиги" (<uuid>)`.

Run it again:

```bash
pnpm --filter @hockey/server chat:seed "Общий чат лиги"
```

Expected: `[chat:seed] system channel "Общий чат лиги" already exists (<same uuid>)`.

Verify in psql:

```bash
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c \
  "select id, type, name, is_active from chats;"
```

Expected: exactly one `system` row.

- [ ] **Step 6.5: Commit**

```bash
git add packages/server/src/chat/seed-cli.ts packages/server/package.json
git commit -m "feat(server): chat:seed CLI command for system channels"
```

---

## Task 7: Update CLAUDE.md (architecture note)

**Files:**
- Modify: `CLAUDE.md` (≤200 lines constraint preserved)

CLAUDE.md is required to stay short. We add a one-line entry to Architecture and update the project intro paragraph. Cut something stale to make room.

- [ ] **Step 7.1: Read current CLAUDE.md and check line count**

```bash
wc -l "/Users/egorgumenyuk/Projects/Ultimate Hockey/CLAUDE.md"
```

Expected: ≤200. Note current value.

- [ ] **Step 7.2: Add chat blurb to Architecture section**

In `CLAUDE.md`, find the section that ends with the daily-game architecture description (the paragraph mentioning `shot_session` and `mode ∈ daily|story`). Add a new paragraph after it:

```markdown
### Чат (PR 1+ — DM, системные каналы, realtime)

Внутренний мессенджер: DM 1-на-1, системные каналы (создаются через `pnpm chat:seed "<name>"`, требует `SYSTEM_USER_ID` в env), задел под чаты команд/турниров (`chats.entity_type/entity_id`). Таблицы: `chats`, `chat_members`, `messages`, `message_reactions` (миграция `004_chat.sql`). Realtime через WebSocket + Redis pub/sub поднимается в PR 3. Спек: `docs/superpowers/specs/2026-04-26-internal-chat-design.md`. План PR 1: `docs/superpowers/plans/2026-04-26-internal-chat-pr1-migration.md`.
```

If adding this section pushes file over 200 lines, trim something stale (e.g. references to PRs already merged).

- [ ] **Step 7.3: Verify line count**

```bash
wc -l "/Users/egorgumenyuk/Projects/Ultimate Hockey/CLAUDE.md"
```

Expected: ≤200.

- [ ] **Step 7.4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note chat foundation in CLAUDE.md"
```

---

## Task 8: Final checks + push

- [ ] **Step 8.1: Run full server test suite**

```bash
pnpm --filter @hockey/server test
```

Expected: all green, including new chat tests.

- [ ] **Step 8.2: Run typecheck on whole monorepo**

```bash
pnpm typecheck
```

Expected: no errors anywhere.

- [ ] **Step 8.3: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 8.4: Push and open PR**

```bash
git push -u origin feat/chat-pr1-migration
```

Open PR on GitHub. Title: `feat(chat): PR 1 — migration + types + seed CLI`. Body should reference the spec section §3 and §6.6.

---

## Verification (full PR check)

Anyone reviewing or re-running the PR locally:

```bash
git checkout feat/chat-pr1-migration
pnpm install
pnpm --filter @hockey/server db:migrate
pnpm --filter @hockey/server test -- test/chat/
PGPASSWORD=hockey_dev_password psql -h localhost -U hockey -d hockey -c '\d chats'
```

Expected:
- All chat tests pass.
- `\d chats` shows 4 chat tables, all indexes from §3.5 of spec, trigger `trg_update_chat_last_message`.
- `\dx` shows `pgcrypto` and `pg_trgm`.

---

## Out of scope (handled in later PRs)

- REST routes (`GET /chat/list`, `POST /chat/dm`, etc.) — PR 2.
- WebSocket endpoint + Redis pub/sub — PR 3.
- Web frontend (api/store/screens) — PR 4–5.
- Reactions, search, long-press menu — PR 6–8.

After this PR is merged, **stop and write a fresh implementation plan for PR 2** (Guards + REST + Service layer) before starting it. Do not pre-plan PR 2 from this document — assumptions may change after PR 1 review.
