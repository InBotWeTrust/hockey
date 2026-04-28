# VK ID OAuth + display_source switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить вход через VK ID OAuth с PKCE как второй провайдер, поля профиля для обоих провайдеров и переключатель источника отображаемого имени/аватара.

**Architecture:** Клиент инициирует PKCE-флоу (`startVkOAuth` → редирект на `id.vk.com/authorize`), на `/auth/vk/callback` обменивает `code` через серверный `POST /auth/vk`, который дёргает `id.vk.com/oauth2/auth` + `oauth2/user_info`, делает find-or-link-or-create по `vk_id`, пересчитывает «эффективный» профиль и выдаёт обычные access/refresh JWT. Линковка к существующему юзеру — через `Authorization: Bearer` на запросе.

**Tech Stack:** Fastify 4 + Postgres 16 (raw SQL миграции) + Redis 7 (для refresh-токенов и rate-limit, ничего нового). React 18 + Vite 5 + react-router-dom + Zustand persist. Тесты: vitest + `app.inject()` + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-04-28-vk-id-oauth-and-display-source-design.md`

---

## Task 1: Миграция 010_vk_auth_and_display_source

**Files:**
- Create: `packages/server/db/migrations/010_vk_auth_and_display_source.sql`

- [ ] **Step 1: Создать миграционный файл**

Содержимое `packages/server/db/migrations/010_vk_auth_and_display_source.sql`:

```sql
-- Per-provider profile fields (mirrored on users for fast access).
alter table users
  add column tg_first_name text,
  add column tg_last_name  text,
  add column tg_avatar_url text,
  add column tg_username   text,
  add column vk_first_name text,
  add column vk_last_name  text,
  add column vk_avatar_url text,
  add column vk_username   text,
  add column display_source text not null default 'telegram'
    check (display_source in ('telegram', 'vk'));

-- Backfill tg_* from existing auth_providers.provider_data + users.avatar_url.
-- Pre-this migration users.avatar_url was always Telegram-sourced.
update users u set
  tg_first_name = nullif(ap.provider_data->>'firstName', ''),
  tg_last_name  = nullif(ap.provider_data->>'lastName', ''),
  tg_username   = nullif(ap.provider_data->>'username', ''),
  tg_avatar_url = u.avatar_url
from auth_providers ap
where ap.user_id = u.id and ap.provider = 'telegram';
```

- [ ] **Step 2: Прогнать миграцию локально**

Run: `pnpm --filter @hockey/server db:migrate`
Expected: лог `applied 010_vk_auth_and_display_source.sql`. Если уже была версия 010 на ветке — переиграй имя.

- [ ] **Step 3: Проверить схему**

Run: `psql $DATABASE_URL -c '\d users'`
Expected: видны колонки `tg_first_name`, `vk_first_name`, `display_source` (default `'telegram'`, check constraint).

Run: `psql $DATABASE_URL -c "select count(*) from users where tg_first_name is not null"`
Expected: число > 0 (если в локальной БД были TG-юзера) или 0 на пустой.

- [ ] **Step 4: Commit**

```bash
git add packages/server/db/migrations/010_vk_auth_and_display_source.sql
git commit -m "feat(db): migration 010 — vk_*/tg_* profile fields + display_source"
```

---

## Task 2: VK exchange + profile (`auth/vk.ts`)

**Files:**
- Create: `packages/server/src/auth/vk.ts`
- Test: `packages/server/test/auth/vk.test.ts`

- [ ] **Step 1: Failing test**

Содержимое `packages/server/test/auth/vk.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { exchangeVkCode, fetchVkProfile } from '../../src/auth/vk.js';

function mockJsonFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('exchangeVkCode', () => {
  it('posts form-urlencoded body to id.vk.com/oauth2/auth and returns user_id', async () => {
    let captured: { url?: string; body?: string; method?: string; headers?: Headers } = {};
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      captured = {
        url,
        body: init.body as string,
        method: init.method,
        headers: new Headers(init.headers),
      };
      return new Response(
        JSON.stringify({ user_id: 12345, access_token: 'vk_at', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const result = await exchangeVkCode({
      code: 'C',
      redirectUri: 'http://x/cb',
      codeVerifier: 'V',
      deviceId: 'D',
      appId: '777',
      fetchImpl,
    });

    expect(result).toEqual({ vkUserId: 12345, accessToken: 'vk_at', expiresIn: 3600 });
    expect(captured.url).toBe('https://id.vk.com/oauth2/auth');
    expect(captured.method).toBe('POST');
    expect(captured.headers?.get('content-type')).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(captured.body!);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('C');
    expect(params.get('client_id')).toBe('777');
    expect(params.get('redirect_uri')).toBe('http://x/cb');
    expect(params.get('code_verifier')).toBe('V');
    expect(params.get('device_id')).toBe('D');
  });

  it('throws when VK returns error', async () => {
    const fetchImpl = mockJsonFetch({ error: 'invalid_grant', error_description: 'bad code' });
    await expect(
      exchangeVkCode({
        code: 'C', redirectUri: 'r', codeVerifier: 'v', deviceId: 'd', appId: '1', fetchImpl,
      }),
    ).rejects.toThrow(/bad code/);
  });

  it('throws on missing user_id', async () => {
    const fetchImpl = mockJsonFetch({ access_token: 'x' });
    await expect(
      exchangeVkCode({
        code: 'C', redirectUri: 'r', codeVerifier: 'v', deviceId: 'd', appId: '1', fetchImpl,
      }),
    ).rejects.toThrow(/vk_invalid_user_id/);
  });
});

describe('fetchVkProfile', () => {
  it('parses user_info response', async () => {
    const fetchImpl = mockJsonFetch({
      user: { first_name: 'Иван', last_name: 'Иванов', avatar: 'https://avatar', screen_name: 'ivan' },
    });
    const profile = await fetchVkProfile({ accessToken: 'at', appId: '1', fetchImpl });
    expect(profile).toEqual({
      firstName: 'Иван',
      lastName: 'Иванов',
      avatarUrl: 'https://avatar',
      screenName: 'ivan',
    });
  });

  it('returns empty object on malformed response', async () => {
    const fetchImpl = mockJsonFetch({});
    const profile = await fetchVkProfile({ accessToken: 'at', appId: '1', fetchImpl });
    expect(profile).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm --filter @hockey/server test -- test/auth/vk.test.ts`
Expected: FAIL — модуль `src/auth/vk.ts` не существует.

- [ ] **Step 3: Implement vk.ts**

Содержимое `packages/server/src/auth/vk.ts`:

```ts
const TOKEN_URL = 'https://id.vk.com/oauth2/auth';
const USERINFO_URL = 'https://id.vk.com/oauth2/user_info';

export interface VkExchangeResult {
  vkUserId: number;
  accessToken: string;
  expiresIn: number;
}

export interface VkProfile {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  screenName?: string;
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  deviceId: string;
  appId: string;
  fetchImpl?: typeof fetch;
}

export async function exchangeVkCode(input: ExchangeInput): Promise<VkExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    device_id: input.deviceId,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
    user_id?: number;
    access_token?: string;
    expires_in?: number;
  };
  if (data.error) {
    throw new Error(`vk_oauth: ${data.error_description ?? data.error}`);
  }
  if (typeof data.user_id !== 'number' || data.user_id <= 0) {
    throw new Error('vk_invalid_user_id');
  }
  return {
    vkUserId: data.user_id,
    accessToken: data.access_token ?? '',
    expiresIn: data.expires_in ?? 0,
  };
}

export interface UserInfoInput {
  accessToken: string;
  appId: string;
  fetchImpl?: typeof fetch;
}

export async function fetchVkProfile(input: UserInfoInput): Promise<VkProfile> {
  if (!input.accessToken) return {};
  const body = new URLSearchParams({
    access_token: input.accessToken,
    client_id: input.appId,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(USERINFO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: {
      first_name?: string;
      last_name?: string;
      avatar?: string;
      screen_name?: string;
    };
  };
  const u = data.user;
  if (!u) return {};
  const profile: VkProfile = {};
  if (u.first_name) profile.firstName = u.first_name;
  if (u.last_name) profile.lastName = u.last_name;
  if (u.avatar) profile.avatarUrl = u.avatar;
  if (u.screen_name) profile.screenName = u.screen_name;
  return profile;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/auth/vk.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/vk.ts packages/server/test/auth/vk.test.ts
git commit -m "feat(server): VK ID OAuth code exchange + user_info"
```

---

## Task 3: Effective profile resolver (`auth/profile.ts`)

**Files:**
- Create: `packages/server/src/auth/profile.ts`
- Test: `packages/server/test/auth/profile.test.ts`

- [ ] **Step 1: Failing test**

Содержимое `packages/server/test/auth/profile.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recomputeEffectiveProfile } from '../../src/auth/profile.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function makeUser(pool: Pool, fields: Record<string, string | null>): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, display_name, timezone) values ($1, $2, 'UTC')`,
    [id, 'placeholder'],
  );
  const cols = Object.keys(fields);
  if (cols.length > 0) {
    await pool.query(
      `update users set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
      [id, ...cols.map((c) => fields[c])],
    );
  }
  return id;
}

describe.skipIf(!hasIntegrationEnv)('recomputeEffectiveProfile', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    await pool.query('truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade');
  });

  it('telegram source: takes tg_* fields', async () => {
    const id = await makeUser(pool, {
      display_source: 'telegram',
      tg_first_name: 'Иван', tg_last_name: 'Иванов', tg_avatar_url: 'tg.png',
      vk_first_name: 'OTHER', vk_last_name: 'NAME', vk_avatar_url: 'vk.png',
    });
    await recomputeEffectiveProfile(pool, id);
    const r = await pool.query('select display_name, avatar_url from users where id = $1', [id]);
    expect(r.rows[0].display_name).toBe('Иван Иванов');
    expect(r.rows[0].avatar_url).toBe('tg.png');
  });

  it('vk source: takes vk_* fields', async () => {
    const id = await makeUser(pool, {
      display_source: 'vk',
      tg_first_name: 'TG', tg_last_name: 'TG',
      vk_first_name: 'Пётр', vk_last_name: 'Петров', vk_avatar_url: 'vk.png',
    });
    await recomputeEffectiveProfile(pool, id);
    const r = await pool.query('select display_name, avatar_url from users where id = $1', [id]);
    expect(r.rows[0].display_name).toBe('Пётр Петров');
    expect(r.rows[0].avatar_url).toBe('vk.png');
  });

  it('falls back to "Player" when source fields are null', async () => {
    const id = await makeUser(pool, { display_source: 'vk' });
    await recomputeEffectiveProfile(pool, id);
    const r = await pool.query('select display_name, avatar_url from users where id = $1', [id]);
    expect(r.rows[0].display_name).toBe('Player');
    expect(r.rows[0].avatar_url).toBeNull();
  });

  it('handles only-first-name (no surname)', async () => {
    const id = await makeUser(pool, {
      display_source: 'telegram',
      tg_first_name: 'Mononym',
    });
    await recomputeEffectiveProfile(pool, id);
    const r = await pool.query('select display_name from users where id = $1', [id]);
    expect(r.rows[0].display_name).toBe('Mononym');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm --filter @hockey/server test -- test/auth/profile.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Implement profile.ts**

Содержимое `packages/server/src/auth/profile.ts`:

```ts
import type { Pool } from 'pg';

export async function recomputeEffectiveProfile(pool: Pool, userId: string): Promise<void> {
  const { rows } = await pool.query<{
    display_source: string;
    tg_first_name: string | null;
    tg_last_name: string | null;
    tg_avatar_url: string | null;
    vk_first_name: string | null;
    vk_last_name: string | null;
    vk_avatar_url: string | null;
  }>(
    `select display_source,
            tg_first_name, tg_last_name, tg_avatar_url,
            vk_first_name, vk_last_name, vk_avatar_url
       from users where id = $1`,
    [userId],
  );
  if (rows.length === 0) return;
  const row = rows[0]!;
  const isVk = row.display_source === 'vk';
  const first = isVk ? row.vk_first_name : row.tg_first_name;
  const last = isVk ? row.vk_last_name : row.tg_last_name;
  const avatar = isVk ? row.vk_avatar_url : row.tg_avatar_url;
  const displayName = [first, last].filter(Boolean).join(' ').trim() || 'Player';
  await pool.query(
    'update users set display_name = $1, avatar_url = $2 where id = $3',
    [displayName, avatar, userId],
  );
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/auth/profile.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/profile.ts packages/server/test/auth/profile.test.ts
git commit -m "feat(server): recomputeEffectiveProfile resolves display from source provider"
```

---

## Task 4: Расширить findOrCreateTelegramUser tg_* полями

**Files:**
- Modify: `packages/server/src/auth/users.ts`
- Modify: `packages/server/test/auth/users.test.ts` (добавить assertions)

- [ ] **Step 1: Добавить assert на tg_* в существующий тест**

В `packages/server/test/auth/users.test.ts` после теста «creates user + wallet ...» добавить:

```ts
  it('persists tg_* mirror fields and recomputes display_name', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '999',
      displayName: 'Ignored',
      firstName: 'Иван',
      lastName: 'Иванов',
      avatarUrl: 'tg.png',
      username: 'ivan',
    });
    const row = await pool.query(
      `select tg_first_name, tg_last_name, tg_avatar_url, tg_username,
              display_name, avatar_url, display_source
         from users where id = $1`,
      [user.id],
    );
    expect(row.rows[0]).toMatchObject({
      tg_first_name: 'Иван',
      tg_last_name: 'Иванов',
      tg_avatar_url: 'tg.png',
      tg_username: 'ivan',
      display_name: 'Иван Иванов',
      avatar_url: 'tg.png',
      display_source: 'telegram',
    });
  });

  it('updates tg_* fields on subsequent login (avatar/name change)', async () => {
    await findOrCreateTelegramUser(pool, {
      providerUid: '888', displayName: 'Original', firstName: 'A', lastName: 'B',
      avatarUrl: 'old.png',
    });
    const updated = await findOrCreateTelegramUser(pool, {
      providerUid: '888', displayName: 'Original', firstName: 'A2', lastName: 'B2',
      avatarUrl: 'new.png',
    });
    const row = await pool.query(
      'select tg_first_name, tg_avatar_url, display_name from users where id = $1',
      [updated.id],
    );
    expect(row.rows[0]).toMatchObject({
      tg_first_name: 'A2',
      tg_avatar_url: 'new.png',
      display_name: 'A2 B2',
    });
  });
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: новые два теста FAIL — поля `tg_*` не пишутся.

- [ ] **Step 3: Обновить findOrCreateTelegramUser**

В `packages/server/src/auth/users.ts` заменить функцию `findOrCreateTelegramUser` целиком:

```ts
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { recomputeEffectiveProfile } from './profile.js';

export interface FindOrCreateInput {
  providerUid: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
}

export interface AppUser {
  id: string;
  displayName: string;
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const providerData = JSON.stringify({
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
  });

  const existing = await pool.query<{ id: string; display_name: string; timezone: string }>(
    `select u.id, u.display_name, u.timezone
       from users u
       join auth_providers ap on ap.user_id = u.id
      where ap.provider = 'telegram' and ap.provider_uid = $1`,
    [input.providerUid],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0]!;
    const shouldBackfillTz =
      row.timezone === 'UTC' &&
      input.timezone !== undefined &&
      input.timezone !== 'UTC';
    await Promise.all([
      pool.query(
        `update users set
           tg_first_name = $1,
           tg_last_name  = $2,
           tg_avatar_url = $3,
           tg_username   = $4
         where id = $5`,
        [
          input.firstName ?? null,
          input.lastName ?? null,
          input.avatarUrl ?? null,
          input.username ?? null,
          row.id,
        ],
      ),
      shouldBackfillTz
        ? pool.query(
            `update users set timezone = $1 where id = $2 and timezone = 'UTC'`,
            [input.timezone, row.id],
          )
        : Promise.resolve(),
      pool.query(
        `update auth_providers set provider_data = $1
          where user_id = $2 and provider = 'telegram'`,
        [providerData, row.id],
      ),
    ]);
    await recomputeEffectiveProfile(pool, row.id);
    const after = await pool.query<{ display_name: string }>(
      'select display_name from users where id = $1',
      [row.id],
    );
    return { id: row.id, displayName: after.rows[0]!.display_name };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const userId = randomUUID();
    const providerId = randomUUID();
    await client.query(
      `insert into users (
         id, display_name, avatar_url, timezone,
         tg_first_name, tg_last_name, tg_avatar_url, tg_username,
         display_source
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'telegram')`,
      [
        userId,
        input.displayName,
        input.avatarUrl ?? null,
        input.timezone ?? 'UTC',
        input.firstName ?? null,
        input.lastName ?? null,
        input.avatarUrl ?? null,
        input.username ?? null,
      ],
    );
    await client.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values ($1, $2, $3, $4, $5)`,
      [providerId, userId, 'telegram', input.providerUid, providerData],
    );
    await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
    await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
    await client.query(
      "insert into user_sticks (user_id, stick_id) values ($1, 'training')",
      [userId],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  await recomputeEffectiveProfile(pool, userId);
  const after = await pool.query<{ display_name: string }>(
    'select display_name from users where id = $1',
    [userId],
  );
  return { id: userId, displayName: after.rows[0]!.display_name };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: все тесты passed (включая существующие).

- [ ] **Step 5: Прогнать всю server-test-suite на регрессии**

Run: `pnpm --filter @hockey/server test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/auth/users.ts packages/server/test/auth/users.test.ts
git commit -m "feat(server): mirror tg_* fields on users + recompute display on TG login"
```

---

## Task 5: findOrLinkOrCreateVkUser

**Files:**
- Modify: `packages/server/src/auth/users.ts` (новая функция)
- Test: `packages/server/test/auth/users.test.ts` (новый describe-блок)

- [ ] **Step 1: Failing test**

В `packages/server/test/auth/users.test.ts` добавить **в конец файла**:

```ts
import { findOrLinkOrCreateVkUser } from '../../src/auth/users.js';

describe.skipIf(!hasIntegrationEnv)('findOrLinkOrCreateVkUser', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    await pool.query('truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade');
  });

  it('creates a brand-new VK user with display_source=vk', async () => {
    const result = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 100,
      profile: { firstName: 'Иван', lastName: 'Петров', avatarUrl: 'vk.png', screenName: 'ivan' },
    });
    expect(result.kind).toBe('created');
    const u = await pool.query('select display_source, vk_first_name, display_name, avatar_url from users where id = $1', [result.userId]);
    expect(u.rows[0]).toMatchObject({
      display_source: 'vk',
      vk_first_name: 'Иван',
      display_name: 'Иван Петров',
      avatar_url: 'vk.png',
    });
    const ap = await pool.query('select provider, provider_uid from auth_providers where user_id = $1', [result.userId]);
    expect(ap.rows[0]).toEqual({ provider: 'vk', provider_uid: '100' });
    const wallet = await pool.query('select * from user_wallet where user_id = $1', [result.userId]);
    expect(wallet.rowCount).toBe(1);
  });

  it('logs in existing VK user and updates vk_* fields', async () => {
    const first = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 200, profile: { firstName: 'A', lastName: 'B' },
    });
    const second = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 200, profile: { firstName: 'A2', lastName: 'B2', avatarUrl: 'new.png' },
    });
    expect(second.kind).toBe('matched');
    expect(second.userId).toBe(first.userId);
    const u = await pool.query('select vk_first_name, vk_avatar_url, display_name, avatar_url from users where id = $1', [first.userId]);
    expect(u.rows[0]).toMatchObject({
      vk_first_name: 'A2',
      vk_avatar_url: 'new.png',
      display_name: 'A2 B2',
      avatar_url: 'new.png',
    });
  });

  it('links VK to existing user when currentUserId provided and VK is unlinked', async () => {
    const tg = await findOrCreateTelegramUser(pool, {
      providerUid: 'tg1', displayName: 'TG User', firstName: 'TG', lastName: 'Name',
    });
    const result = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 300,
      profile: { firstName: 'Vk', lastName: 'Surname' },
      currentUserId: tg.id,
    });
    expect(result.kind).toBe('linked');
    expect(result.userId).toBe(tg.id);
    const ap = await pool.query(
      'select provider from auth_providers where user_id = $1 order by provider',
      [tg.id],
    );
    expect(ap.rows.map((r) => r.provider)).toEqual(['telegram', 'vk']);
    const u = await pool.query('select vk_first_name, display_source from users where id = $1', [tg.id]);
    expect(u.rows[0]).toMatchObject({ vk_first_name: 'Vk', display_source: 'telegram' });
  });

  it('rejects with vk_already_linked if vk_id belongs to another user', async () => {
    const tg = await findOrCreateTelegramUser(pool, { providerUid: 'tg2', displayName: 'TG' });
    const otherVk = await findOrLinkOrCreateVkUser(pool, { vkUserId: 400, profile: {} });
    expect(otherVk.userId).not.toBe(tg.id);
    await expect(
      findOrLinkOrCreateVkUser(pool, {
        vkUserId: 400, profile: {}, currentUserId: tg.id,
      }),
    ).rejects.toThrow(/vk_already_linked/);
  });

  it('no-op when vk_id already linked to currentUser (just refreshes vk_*)', async () => {
    const r = await findOrLinkOrCreateVkUser(pool, { vkUserId: 500, profile: { firstName: 'Old' } });
    const again = await findOrLinkOrCreateVkUser(pool, {
      vkUserId: 500, profile: { firstName: 'New' }, currentUserId: r.userId,
    });
    expect(again.kind).toBe('noop');
    expect(again.userId).toBe(r.userId);
    const u = await pool.query('select vk_first_name from users where id = $1', [r.userId]);
    expect(u.rows[0].vk_first_name).toBe('New');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (функция отсутствует)

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: FAIL on import.

- [ ] **Step 3: Implement findOrLinkOrCreateVkUser**

В `packages/server/src/auth/users.ts` **добавить в конец файла**:

```ts
export interface VkLinkInput {
  vkUserId: number;
  profile: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    screenName?: string;
  };
  currentUserId?: string;
  timezone?: string;
}

export type VkLinkResult =
  | { kind: 'created'; userId: string }
  | { kind: 'matched'; userId: string }
  | { kind: 'linked'; userId: string }
  | { kind: 'noop'; userId: string };

export class VkAlreadyLinkedError extends Error {
  constructor() {
    super('vk_already_linked');
    this.name = 'VkAlreadyLinkedError';
  }
}

const VK_ADVISORY_PREFIX = 'vk_link:';

async function withVkAdvisoryLock<T>(
  pool: Pool,
  vkUserId: number,
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1))`,
      [`${VK_ADVISORY_PREFIX}${vkUserId}`],
    );
    return await fn(client);
  } finally {
    client.release();
  }
}

async function updateVkFields(
  exec: import('pg').PoolClient | Pool,
  userId: string,
  profile: VkLinkInput['profile'],
): Promise<void> {
  await exec.query(
    `update users set
       vk_first_name = $1,
       vk_last_name  = $2,
       vk_avatar_url = $3,
       vk_username   = $4
     where id = $5`,
    [
      profile.firstName ?? null,
      profile.lastName ?? null,
      profile.avatarUrl ?? null,
      profile.screenName ?? null,
      userId,
    ],
  );
}

export async function findOrLinkOrCreateVkUser(
  pool: Pool,
  input: VkLinkInput,
): Promise<VkLinkResult> {
  const vkUid = String(input.vkUserId);

  const existing = await pool.query<{ user_id: string }>(
    `select user_id from auth_providers
      where provider = 'vk' and provider_uid = $1`,
    [vkUid],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const ownerId = existing.rows[0]!.user_id;
    if (input.currentUserId && input.currentUserId !== ownerId) {
      throw new VkAlreadyLinkedError();
    }
    await updateVkFields(pool, ownerId, input.profile);
    await recomputeEffectiveProfile(pool, ownerId);
    return {
      kind: input.currentUserId === ownerId ? 'noop' : 'matched',
      userId: ownerId,
    };
  }

  if (input.currentUserId) {
    const userId = input.currentUserId;
    await pool.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values ($1, $2, 'vk', $3, $4)`,
      [randomUUID(), userId, vkUid, JSON.stringify(input.profile)],
    );
    await updateVkFields(pool, userId, input.profile);
    await recomputeEffectiveProfile(pool, userId);
    return { kind: 'linked', userId };
  }

  return await withVkAdvisoryLock(pool, input.vkUserId, async (client) => {
    const recheck = await client.query<{ user_id: string }>(
      `select user_id from auth_providers
        where provider = 'vk' and provider_uid = $1`,
      [vkUid],
    );
    if (recheck.rowCount && recheck.rowCount > 0) {
      const ownerId = recheck.rows[0]!.user_id;
      await updateVkFields(client, ownerId, input.profile);
      await recomputeEffectiveProfile(pool, ownerId);
      return { kind: 'matched', userId: ownerId };
    }

    const userId = randomUUID();
    const providerId = randomUUID();
    const fallbackName =
      [input.profile.firstName, input.profile.lastName].filter(Boolean).join(' ').trim() ||
      'Player';
    await client.query('begin');
    try {
      await client.query(
        `insert into users (
           id, display_name, avatar_url, timezone,
           vk_first_name, vk_last_name, vk_avatar_url, vk_username,
           display_source
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'vk')`,
        [
          userId,
          fallbackName,
          input.profile.avatarUrl ?? null,
          input.timezone ?? 'UTC',
          input.profile.firstName ?? null,
          input.profile.lastName ?? null,
          input.profile.avatarUrl ?? null,
          input.profile.screenName ?? null,
        ],
      );
      await client.query(
        `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
         values ($1, $2, 'vk', $3, $4)`,
        [providerId, userId, vkUid, JSON.stringify(input.profile)],
      );
      await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
      await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
      await client.query(
        "insert into user_sticks (user_id, stick_id) values ($1, 'training')",
        [userId],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
    await recomputeEffectiveProfile(pool, userId);
    return { kind: 'created', userId };
  });
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/users.ts packages/server/test/auth/users.test.ts
git commit -m "feat(server): findOrLinkOrCreateVkUser with advisory-lock + 5-branch state machine"
```

---

## Task 6: VK_APP_ID config + опциональный access-token decode

**Files:**
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/auth/jwt.ts` (новая функция)
- Test: `packages/server/test/auth/jwt.test.ts` (новый describe)
- Modify: `.env.example`

- [ ] **Step 1: Failing test for tryReadAccessToken**

В `packages/server/test/auth/jwt.test.ts` **в конец файла** добавить:

```ts
import { tryReadAccessTokenFromHeader } from '../../src/auth/jwt.js';

describe('tryReadAccessTokenFromHeader', () => {
  const SECRET = 'a-secret-key-32-chars-min-1234567890';
  const jwt = createJwt({ accessSecret: SECRET, refreshSecret: SECRET });

  it('returns null on missing header', async () => {
    expect(await tryReadAccessTokenFromHeader(undefined, SECRET)).toBeNull();
    expect(await tryReadAccessTokenFromHeader('', SECRET)).toBeNull();
    expect(await tryReadAccessTokenFromHeader('Token foo', SECRET)).toBeNull();
  });

  it('returns null on invalid token', async () => {
    expect(await tryReadAccessTokenFromHeader('Bearer not-a-jwt', SECRET)).toBeNull();
  });

  it('returns sub for valid token', async () => {
    const token = await jwt.issueAccessToken({ sub: 'user-x' });
    expect(await tryReadAccessTokenFromHeader(`Bearer ${token}`, SECRET)).toBe('user-x');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm --filter @hockey/server test -- test/auth/jwt.test.ts`
Expected: FAIL — функция не экспортируется.

- [ ] **Step 3: Add tryReadAccessTokenFromHeader**

В `packages/server/src/auth/jwt.ts` **в конец файла** добавить:

```ts
export async function tryReadAccessTokenFromHeader(
  header: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const payload = await verifyAccessToken(token, secret);
    return payload.sub;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/auth/jwt.test.ts`
Expected: все passed.

- [ ] **Step 5: Add VK_APP_ID to config**

В `packages/server/src/config.ts` добавить в `schema`:

```ts
  VK_APP_ID: z.string().min(1).optional(),
```

(порядок не принципиален, можно после `TELEGRAM_BOT_TOKEN`).

- [ ] **Step 6: Update .env.example**

В `.env.example` добавить:

```
# VK ID OAuth (id.vk.com). Optional — when missing, /auth/vk responds 503.
VK_APP_ID=
```

- [ ] **Step 7: Run config tests**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts`
Expected: passed (VK_APP_ID опционален, не должен ломать существующее).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/auth/jwt.ts packages/server/test/auth/jwt.test.ts packages/server/src/config.ts .env.example
git commit -m "feat(server): VK_APP_ID config + tryReadAccessTokenFromHeader helper"
```

---

## Task 7: POST /auth/vk endpoint

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/routes/auth-vk.test.ts`

- [ ] **Step 1: Failing integration test**

Содержимое `packages/server/test/routes/auth-vk.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import * as vkModule from '../../src/auth/vk.js';
import { findOrCreateTelegramUser, findOrLinkOrCreateVkUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasIntegrationEnv, makeTestConfig, resetDatabase, createTestPool, makeJwtFor } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

function mockVkExchange(vkUserId: number, profile: vkModule.VkProfile) {
  vi.spyOn(vkModule, 'exchangeVkCode').mockResolvedValue({
    vkUserId, accessToken: 'fake_at', expiresIn: 3600,
  });
  vi.spyOn(vkModule, 'fetchVkProfile').mockResolvedValue(profile);
}

describe.skipIf(!hasIntegrationEnv)('POST /auth/vk', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
    app = await buildApp({ config: makeTestConfig({ VK_APP_ID: 'test-vk-app' }) });
    await app.ready();
  });

  afterAll(async () => { await app.close(); vi.restoreAllMocks(); });

  beforeEach(async () => {
    await app.pg.query('truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade');
    vi.restoreAllMocks();
  });

  const baseBody = {
    code: 'C', codeVerifier: 'V', deviceId: 'D',
    redirectUri: 'http://localhost:5173/auth/vk/callback',
  };

  it('creates new user on first VK login', async () => {
    mockVkExchange(1001, { firstName: 'Иван', lastName: 'И.', avatarUrl: 'vk.png' });
    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.displayName).toBe('Иван И.');
    expect(body.accessToken).toBeTypeOf('string');
    const ap = await app.pg.query("select provider, provider_uid from auth_providers where user_id = $1", [body.user.id]);
    expect(ap.rows[0]).toEqual({ provider: 'vk', provider_uid: '1001' });
  });

  it('logs in existing VK user (matched branch)', async () => {
    const created = await findOrLinkOrCreateVkUser(app.pg, { vkUserId: 1002, profile: { firstName: 'A', lastName: 'B' } });
    mockVkExchange(1002, { firstName: 'A2', lastName: 'B2' });
    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(created.userId);
    expect(res.json().user.displayName).toBe('A2 B2');
  });

  it('links VK to current user when Bearer present (linked branch)', async () => {
    const tg = await findOrCreateTelegramUser(app.pg, { providerUid: 'tg-link', displayName: 'TG' });
    const accessToken = await makeJwtFor(tg.id);
    mockVkExchange(1003, { firstName: 'Vk', lastName: 'Surname' });
    const res = await app.inject({
      method: 'POST', url: '/auth/vk',
      payload: baseBody,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(tg.id);
    const ap = await app.pg.query(
      "select provider from auth_providers where user_id = $1 order by provider",
      [tg.id],
    );
    expect(ap.rows.map((r: { provider: string }) => r.provider)).toEqual(['telegram', 'vk']);
  });

  it('returns 409 when VK already linked to another user', async () => {
    const otherVk = await findOrLinkOrCreateVkUser(app.pg, { vkUserId: 1004, profile: {} });
    const tg = await findOrCreateTelegramUser(app.pg, { providerUid: 'tg-conflict', displayName: 'TG' });
    expect(otherVk.userId).not.toBe(tg.id);
    const accessToken = await makeJwtFor(tg.id);
    mockVkExchange(1004, {});
    const res = await app.inject({
      method: 'POST', url: '/auth/vk', payload: baseBody,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('vk_already_linked');
  });

  it('returns 401 when VK exchange fails', async () => {
    vi.spyOn(vkModule, 'exchangeVkCode').mockRejectedValue(new Error('vk_oauth: bad code'));
    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 on missing fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: { code: 'x' } });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Add helpers makeTestConfig and makeJwtFor**

Сначала проверь что в `packages/server/test/helpers/testDb.ts` есть функции `makeTestConfig`, `makeJwtFor`. Если нет — добавь:

```bash
grep -E "makeTestConfig|makeJwtFor" packages/server/test/helpers/testDb.ts
```

Если функций нет, добавить в `packages/server/test/helpers/testDb.ts`:

```ts
import { createJwt } from '../../src/auth/jwt.js';
import type { AppConfig } from '../../src/config.js';

const TEST_SECRETS = {
  JWT_SECRET: 'test-jwt-secret-min-16-chars',
  REFRESH_SECRET: 'test-refresh-secret-min-16-chars',
  DAILY_SEED_SECRET: 'test-daily-secret-min-16-chars-1234',
};

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 0,
    LOG_LEVEL: 'warn',
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    REDIS_URL: process.env.TEST_REDIS_URL!,
    TELEGRAM_BOT_TOKEN: 'test-tg-token',
    ...TEST_SECRETS,
    ...overrides,
  } as AppConfig;
}

export async function makeJwtFor(userId: string): Promise<string> {
  const jwt = createJwt({
    accessSecret: TEST_SECRETS.JWT_SECRET,
    refreshSecret: TEST_SECRETS.REFRESH_SECRET,
  });
  return await jwt.issueAccessToken({ sub: userId });
}
```

Если другие тесты уже строят config иначе — переиспользуй их подход; цель — чтобы `app.inject` работал в тестах.

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test -- test/routes/auth-vk.test.ts`
Expected: FAIL — роута `/auth/vk` нет.

- [ ] **Step 4: Add /auth/vk route**

В `packages/server/src/routes/auth.ts`:

1. В импорты добавить:

```ts
import { exchangeVkCode, fetchVkProfile } from '../auth/vk.js';
import { findOrLinkOrCreateVkUser, VkAlreadyLinkedError } from '../auth/users.js';
import { tryReadAccessTokenFromHeader } from '../auth/jwt.js';
```

2. В `AuthRoutesOptions` добавить `vkAppId?: string;`.

3. В zod-схемах добавить:

```ts
const vkBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  deviceId: z.string().default(''),
  redirectUri: z.string().url(),
  timezone: z.string().optional(),
});
```

4. **Перед** `app.post('/auth/refresh', ...)` добавить роут `/auth/vk`:

```ts
  app.post('/auth/vk', async (req, reply) => {
    if (!opts.vkAppId) {
      throw new AppError('service_unavailable', 'vk auth disabled', 503);
    }
    const parsed = vkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid vk payload', 400);
    }
    const currentUserId = await tryReadAccessTokenFromHeader(
      req.headers.authorization,
      opts.accessSecret,
    );

    let exchange;
    try {
      exchange = await exchangeVkCode({
        code: parsed.data.code,
        redirectUri: parsed.data.redirectUri,
        codeVerifier: parsed.data.codeVerifier,
        deviceId: parsed.data.deviceId,
        appId: opts.vkAppId,
      });
    } catch (err) {
      req.log.warn({ err }, 'vk exchange failed');
      throw new AppError('unauthenticated', 'vk auth failed', 401);
    }

    const profile = await fetchVkProfile({
      accessToken: exchange.accessToken,
      appId: opts.vkAppId,
    }).catch(() => ({}));

    let result;
    try {
      result = await findOrLinkOrCreateVkUser(app.pg, {
        vkUserId: exchange.vkUserId,
        profile,
        ...(currentUserId !== null ? { currentUserId } : {}),
        ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      });
    } catch (err) {
      if (err instanceof VkAlreadyLinkedError) {
        throw new AppError('vk_already_linked', 'vk account already linked to another user', 409);
      }
      throw err;
    }

    const { rows } = await app.pg.query<{ display_name: string }>(
      'select display_name from users where id = $1',
      [result.userId],
    );
    const displayName = rows[0]!.display_name;

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: result.userId }),
      jwt.issueRefreshToken({ sub: result.userId }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: result.userId,
      ttlSec: refresh.expSec,
    });

    reply.send({
      accessToken,
      refreshToken: refresh.token,
      user: { id: result.userId, displayName },
    });
  });
```

5. В `packages/server/src/app.ts` в регистрации `authRoutes` добавить параметр:

```ts
  await app.register(authRoutes, {
    telegramBotToken: config.TELEGRAM_BOT_TOKEN,
    accessSecret: config.JWT_SECRET,
    refreshSecret: config.REFRESH_SECRET,
    devLoginEnabled: config.NODE_ENV !== 'production',
    ...(config.VK_APP_ID !== undefined ? { vkAppId: config.VK_APP_ID } : {}),
  });
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/routes/auth-vk.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Run all server tests for regressions**

Run: `pnpm --filter @hockey/server test`
Expected: всё зелёное. Если падают другие тесты, использующие `buildApp` — добавь `VK_APP_ID` в `makeTestConfig` дефолт или сохрани его undefined (он опционален).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/app.ts packages/server/test/routes/auth-vk.test.ts packages/server/test/helpers/testDb.ts
git commit -m "feat(server): POST /auth/vk endpoint with PKCE exchange + linking"
```

---

## Task 8: Расширить GET/PATCH /me с displaySource

**Files:**
- Modify: `packages/server/src/routes/me.ts`
- Test: `packages/server/test/routes/me.test.ts` (новый или расширить существующий)

- [ ] **Step 1: Найти существующий me-test**

Run: `find packages/server/test/routes -name "*me*"`
Expected: либо `me.test.ts` существует, либо нет — тогда создать новый.

- [ ] **Step 2: Failing test**

В `packages/server/test/routes/me.test.ts` (создать если не было) добавить describe:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser, findOrLinkOrCreateVkUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasIntegrationEnv, makeTestConfig, resetDatabase, createTestPool, makeJwtFor } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('/me with displaySource', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
    app = await buildApp({ config: makeTestConfig() });
    await app.ready();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => {
    await app.pg.query('truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade');
  });

  it('GET /me returns linkedProviders and source-mirrored fields', async () => {
    const tg = await findOrCreateTelegramUser(app.pg, {
      providerUid: 'tg', displayName: 'TG', firstName: 'Иван', lastName: 'Иванов', avatarUrl: 'tg.png', username: 'ivan',
    });
    await findOrLinkOrCreateVkUser(app.pg, {
      vkUserId: 1, profile: { firstName: 'Vk', lastName: 'Surname', avatarUrl: 'vk.png' }, currentUserId: tg.id,
    });
    const token = await makeJwtFor(tg.id);
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      displaySource: 'telegram',
      linkedProviders: expect.arrayContaining(['telegram', 'vk']),
      tgFirstName: 'Иван', tgLastName: 'Иванов', tgUsername: 'ivan',
      vkFirstName: 'Vk', vkLastName: 'Surname', vkAvatarUrl: 'vk.png',
    });
  });

  it('PATCH /me { displaySource: "vk" } switches source and recomputes display', async () => {
    const tg = await findOrCreateTelegramUser(app.pg, {
      providerUid: 'tg2', displayName: 'TG', firstName: 'TG', lastName: 'X', avatarUrl: 'tg.png',
    });
    await findOrLinkOrCreateVkUser(app.pg, {
      vkUserId: 2, profile: { firstName: 'Vk', lastName: 'Surname', avatarUrl: 'vk.png' }, currentUserId: tg.id,
    });
    const token = await makeJwtFor(tg.id);
    const res = await app.inject({
      method: 'PATCH', url: '/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displaySource: 'vk' },
    });
    expect(res.statusCode).toBe(200);
    const u = await app.pg.query('select display_source, display_name, avatar_url from users where id = $1', [tg.id]);
    expect(u.rows[0]).toMatchObject({
      display_source: 'vk',
      display_name: 'Vk Surname',
      avatar_url: 'vk.png',
    });
  });

  it('PATCH /me rejects displaySource for unlinked provider', async () => {
    const tg = await findOrCreateTelegramUser(app.pg, { providerUid: 'tg3', displayName: 'TG' });
    const token = await makeJwtFor(tg.id);
    const res = await app.inject({
      method: 'PATCH', url: '/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displaySource: 'vk' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('display_source_unavailable');
  });

  it('PATCH /me grip still works (regression)', async () => {
    const tg = await findOrCreateTelegramUser(app.pg, { providerUid: 'tg4', displayName: 'TG' });
    const token = await makeJwtFor(tg.id);
    const res = await app.inject({
      method: 'PATCH', url: '/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { grip: 'left' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().grip).toBe('left');
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm --filter @hockey/server test -- test/routes/me.test.ts`
Expected: FAIL — `displaySource` не в респонсе/не принимается в PATCH.

- [ ] **Step 4: Update meRoutes**

Заменить содержимое `packages/server/src/routes/me.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { recomputeEffectiveProfile } from '../auth/profile.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const { rows } = await app.pg.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      grip: string;
      display_source: string;
      tg_first_name: string | null;
      tg_last_name: string | null;
      tg_avatar_url: string | null;
      tg_username: string | null;
      vk_first_name: string | null;
      vk_last_name: string | null;
      vk_avatar_url: string | null;
      vk_username: string | null;
      tg_id: string | null;
      vk_id: string | null;
    }>(
      `select u.id, u.display_name, u.avatar_url, u.grip, u.display_source,
              u.tg_first_name, u.tg_last_name, u.tg_avatar_url, u.tg_username,
              u.vk_first_name, u.vk_last_name, u.vk_avatar_url, u.vk_username,
              tg.provider_uid as tg_id,
              vk.provider_uid as vk_id
         from users u
         left join auth_providers tg on tg.user_id = u.id and tg.provider = 'telegram'
         left join auth_providers vk on vk.user_id = u.id and vk.provider = 'vk'
        where u.id = $1`,
      [req.user.id],
    );
    if (rows.length === 0) {
      throw new AppError('not_found', 'user not found', 404);
    }
    const row = rows[0]!;
    const linkedProviders: ('telegram' | 'vk')[] = [];
    if (row.tg_id !== null) linkedProviders.push('telegram');
    if (row.vk_id !== null) linkedProviders.push('vk');
    return {
      id: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      grip: row.grip as 'right' | 'left',
      displaySource: row.display_source as 'telegram' | 'vk',
      linkedProviders,
      tgFirstName: row.tg_first_name,
      tgLastName: row.tg_last_name,
      tgAvatarUrl: row.tg_avatar_url,
      tgUsername: row.tg_username,
      vkFirstName: row.vk_first_name,
      vkLastName: row.vk_last_name,
      vkAvatarUrl: row.vk_avatar_url,
      vkUsername: row.vk_username,
      ...(row.tg_id !== null ? { tgId: row.tg_id } : {}),
      ...(row.vk_id !== null ? { vkId: row.vk_id } : {}),
      ...(row.tg_username !== null ? { username: row.tg_username } : {}),
    };
  });

  const patchSchema = z
    .object({
      grip: z.enum(['right', 'left']).optional(),
      displaySource: z.enum(['telegram', 'vk']).optional(),
    })
    .refine(
      (v) => v.grip !== undefined || v.displaySource !== undefined,
      'at least one field required',
    );

  app.patch('/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = patchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid body', 400);
    }
    if (body.data.grip !== undefined) {
      await app.pg.query('update users set grip = $1 where id = $2', [body.data.grip, req.user.id]);
    }
    if (body.data.displaySource !== undefined) {
      const target = body.data.displaySource;
      const linked = await app.pg.query<{ provider: string }>(
        `select provider from auth_providers where user_id = $1 and provider = $2`,
        [req.user.id, target],
      );
      if (linked.rowCount === 0) {
        throw new AppError('display_source_unavailable', `${target} not linked`, 400);
      }
      await app.pg.query('update users set display_source = $1 where id = $2', [target, req.user.id]);
      await recomputeEffectiveProfile(app.pg, req.user.id);
    }
    const { rows } = await app.pg.query<{ grip: string; display_source: string; display_name: string; avatar_url: string | null }>(
      'select grip, display_source, display_name, avatar_url from users where id = $1',
      [req.user.id],
    );
    const row = rows[0]!;
    return {
      grip: row.grip as 'right' | 'left',
      displaySource: row.display_source as 'telegram' | 'vk',
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    };
  });
};
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @hockey/server test -- test/routes/me.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Полный прогон**

Run: `pnpm --filter @hockey/server test`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/me.ts packages/server/test/routes/me.test.ts
git commit -m "feat(server): /me exposes display_source and per-provider profile fields"
```

---

## Task 9: Web — vkAuth.ts (PKCE helpers)

**Files:**
- Create: `packages/web/src/auth/vkAuth.ts`
- Test: `packages/web/src/auth/vkAuth.test.ts`

- [ ] **Step 1: Failing test**

Содержимое `packages/web/src/auth/vkAuth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Reset module cache between tests for env var control
async function loadModule() {
  return await import('./vkAuth.js');
}

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PKCE helpers', () => {
  it('extractCodeFromUrl reads code from query string', async () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: new URL('http://x/cb?code=ABC&device_id=DD&state=S'),
      writable: true,
    });
    const m = await loadModule();
    expect(m.extractCodeFromUrl()).toBe('ABC');
    expect(m.extractDeviceIdFromUrl()).toBe('DD');
    expect(m.extractStateFromUrl()).toBe('S');
    Object.defineProperty(window, 'location', { value: original, writable: true });
  });

  it('extractErrorFromUrl prefers error_description', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://x/cb?error=access_denied&error_description=user+rejected'),
      writable: true,
    });
    const m = await loadModule();
    expect(m.extractErrorFromUrl()).toBe('user rejected');
  });

  it('cleanupOAuthState removes both keys', async () => {
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');
    const m = await loadModule();
    m.cleanupOAuthState();
    expect(sessionStorage.getItem('vk_code_verifier')).toBeNull();
    expect(sessionStorage.getItem('vk_oauth_state')).toBeNull();
  });

  it('startVkOAuth stores verifier+state and redirects to id.vk.com', async () => {
    vi.stubEnv('VITE_VK_APP_ID', '7777');
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:5173', href: '' } as Location,
      writable: true,
    });
    const m = await loadModule();
    await m.startVkOAuth();
    expect(sessionStorage.getItem('vk_code_verifier')).toMatch(/^[a-z0-9]+$/);
    expect(sessionStorage.getItem('vk_oauth_state')).toMatch(/^[a-z0-9]+$/);
    expect(window.location.href).toContain('https://id.vk.com/authorize');
    expect(window.location.href).toContain('client_id=7777');
    expect(window.location.href).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fvk%2Fcallback');
    expect(window.location.href).toContain('code_challenge_method=s256');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @hockey/web test -- vkAuth`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Implement vkAuth.ts**

Содержимое `packages/web/src/auth/vkAuth.ts`:

```ts
const REDIRECT_PATH = '/auth/vk/callback';

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  sessionStorage.setItem('vk_code_verifier', codeVerifier);
  return { codeVerifier, codeChallenge };
}

export function getRedirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

export async function startVkOAuth(): Promise<void> {
  const appId = import.meta.env.VITE_VK_APP_ID;
  if (!appId) {
    throw new Error('VITE_VK_APP_ID is not configured');
  }
  const { codeChallenge } = await generatePKCE();
  const state = generateRandomString(16);
  sessionStorage.setItem('vk_oauth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: String(appId),
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 's256',
    scope: '',
  });
  window.location.href = `https://id.vk.com/authorize?${params.toString()}`;
}

export function extractCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('code');
}

export function extractDeviceIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('device_id') ?? '';
}

export function extractStateFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('state');
}

export function extractErrorFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search);
  const error = p.get('error');
  if (!error) return null;
  return p.get('error_description') ?? error;
}

export function getCodeVerifier(): string {
  return sessionStorage.getItem('vk_code_verifier') ?? '';
}

export function getStoredState(): string {
  return sessionStorage.getItem('vk_oauth_state') ?? '';
}

export function cleanupOAuthState(): void {
  sessionStorage.removeItem('vk_code_verifier');
  sessionStorage.removeItem('vk_oauth_state');
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @hockey/web test -- vkAuth`
Expected: passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/auth/vkAuth.ts packages/web/src/auth/vkAuth.test.ts
git commit -m "feat(web): vkAuth — PKCE helpers + startVkOAuth"
```

---

## Task 10: Web — VkAuthCallbackScreen + route

**Files:**
- Create: `packages/web/src/screens/VkAuthCallbackScreen.tsx`
- Create: `packages/web/src/screens/VkAuthCallbackScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`

- [ ] **Step 1: Failing test**

Содержимое `packages/web/src/screens/VkAuthCallbackScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VkAuthCallbackScreen } from './VkAuthCallbackScreen.js';
import { useAuthStore } from '../auth/authStore.js';

const apiFetchMock = vi.fn();
vi.mock('../api/apiFetch.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, msg: string) { super(msg); }
  },
}));

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/vk/callback" element={<VkAuthCallbackScreen />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  sessionStorage.clear();
  useAuthStore.getState().clearSession();
});

describe('VkAuthCallbackScreen', () => {
  it('exchanges code and navigates home on success', async () => {
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');
    apiFetchMock.mockResolvedValue({
      accessToken: 'AT', refreshToken: 'RT',
      user: { id: 'u', displayName: 'X' },
    });
    renderAt('/auth/vk/callback?code=C&device_id=D&state=S');
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/vk', expect.objectContaining({ method: 'POST' }));
    expect(useAuthStore.getState().accessToken).toBe('AT');
  });

  it('shows error on state mismatch (no API call)', async () => {
    sessionStorage.setItem('vk_oauth_state', 'STORED');
    renderAt('/auth/vk/callback?code=C&device_id=D&state=DIFFERENT');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('shows error from VK', async () => {
    renderAt('/auth/vk/callback?error=access_denied&error_description=Denied');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Denied'));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('does not double-call API in StrictMode', async () => {
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');
    apiFetchMock.mockResolvedValue({
      accessToken: 'AT', refreshToken: 'RT', user: { id: 'u', displayName: 'X' },
    });
    const { StrictMode } = await import('react');
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/auth/vk/callback?code=C&device_id=D&state=S']}>
          <Routes>
            <Route path="/auth/vk/callback" element={<VkAuthCallbackScreen />} />
            <Route path="/" element={<div>HOME</div>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @hockey/web test -- VkAuthCallback`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Implement VkAuthCallbackScreen**

Содержимое `packages/web/src/screens/VkAuthCallbackScreen.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { useAuthStore, type AuthSession } from '../auth/authStore.js';
import {
  cleanupOAuthState,
  extractCodeFromUrl,
  extractDeviceIdFromUrl,
  extractErrorFromUrl,
  extractStateFromUrl,
  getCodeVerifier,
  getRedirectUri,
  getStoredState,
} from '../auth/vkAuth.js';

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function VkAuthCallbackScreen(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    (async () => {
      const oauthError = extractErrorFromUrl();
      if (oauthError) {
        cleanupOAuthState();
        setError(oauthError);
        return;
      }
      const code = extractCodeFromUrl();
      if (!code) {
        cleanupOAuthState();
        setError('Отсутствует код авторизации');
        return;
      }
      const stateInUrl = extractStateFromUrl();
      const stored = getStoredState();
      if (!stateInUrl || stateInUrl !== stored) {
        cleanupOAuthState();
        setError('Несовпадение state — попробуйте войти заново');
        return;
      }
      try {
        const session = await apiFetch<AuthSession>('/auth/vk', {
          method: 'POST',
          body: JSON.stringify({
            code,
            codeVerifier: getCodeVerifier(),
            deviceId: extractDeviceIdFromUrl(),
            redirectUri: getRedirectUri(),
            timezone: detectTimezone(),
          }),
        });
        cleanupOAuthState();
        setSession(session);
        navigate('/', { replace: true });
      } catch (err) {
        cleanupOAuthState();
        setError(err instanceof ApiError ? err.message : 'Ошибка авторизации');
      }
    })();
  }, [navigate, setSession]);

  if (error) {
    return (
      <main className="screen" style={{ padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Ошибка входа</h1>
        <div role="alert" style={{ color: 'var(--red-deep, #b91c1c)', marginBottom: 16 }}>
          {error}
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/login', { replace: true })}>
          Вернуться ко входу
        </button>
      </main>
    );
  }

  return (
    <main className="screen" style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>Авторизация через ВК…</div>
    </main>
  );
}
```

- [ ] **Step 4: Add route to App.tsx**

В `packages/web/src/app/App.tsx`:

1. Импорт:

```ts
import { VkAuthCallbackScreen } from '../screens/VkAuthCallbackScreen.js';
```

2. Внутри `<Routes>` **до** `PrivateRoute`-роутов добавить:

```tsx
<Route path="/auth/vk/callback" element={<VkAuthCallbackScreen />} />
```

(можно сразу после `<Route path="/login" ... />`).

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @hockey/web test -- VkAuthCallback`
Expected: 4 passed.

Run: `pnpm --filter @hockey/web test -- App`
Expected: existing app tests still pass (новый роут не ломает).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/screens/VkAuthCallbackScreen.tsx packages/web/src/screens/VkAuthCallbackScreen.test.tsx packages/web/src/app/App.tsx
git commit -m "feat(web): VkAuthCallbackScreen + /auth/vk/callback route"
```

---

## Task 11: VK button in LoginScreen

**Files:**
- Modify: `packages/web/src/screens/LoginScreen.tsx`
- Modify: `packages/web/src/screens/LoginScreen.test.tsx`

- [ ] **Step 1: Failing test**

В `packages/web/src/screens/LoginScreen.test.tsx` добавить тест:

```tsx
it('renders VK login button that calls startVkOAuth on click', async () => {
  const startVkOAuth = vi.fn();
  vi.doMock('../auth/vkAuth.js', () => ({ startVkOAuth }));
  vi.resetModules();
  const { LoginScreen } = await import('./LoginScreen.js');
  // существующая обёртка для рендера (BrowserRouter + QueryClient) — переиспользуй
  // ... rendering setup ...
  render(<LoginScreen />);
  const btn = screen.getByRole('button', { name: /ВКонтакте/i });
  fireEvent.click(btn);
  expect(startVkOAuth).toHaveBeenCalledOnce();
});
```

(Если в существующих тестах есть фикстура `renderLogin()` — используй её. Если нет — оберни рендер в `MemoryRouter` + `QueryClientProvider`.)

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @hockey/web test -- LoginScreen`
Expected: FAIL — кнопки нет.

- [ ] **Step 3: Add VK button to LoginScreen.tsx**

В `packages/web/src/screens/LoginScreen.tsx`:

1. В импорты добавить:

```ts
import { startVkOAuth } from '../auth/vkAuth.js';
```

2. В блоке кнопок (после `<TelegramLoginButton ... />` и перед dev-блоком) добавить:

```tsx
<button
  type="button"
  className="btn btn--ghost"
  onClick={() => {
    startVkOAuth().catch(() => {
      // редирект всё равно сработает; ошибка — только если VITE_VK_APP_ID не задан
    });
  }}
  style={{ justifyContent: 'center' }}
>
  Войти через ВКонтакте
</button>
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @hockey/web test -- LoginScreen`
Expected: passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/LoginScreen.tsx packages/web/src/screens/LoginScreen.test.tsx
git commit -m "feat(web): VK login button on LoginScreen"
```

---

## Task 12: authStore + /me types

**Files:**
- Modify: `packages/web/src/auth/authStore.ts`
- Modify: `packages/web/src/auth/authStore.test.ts` (если есть проверки `User` типа)

- [ ] **Step 1: Расширить AuthUser**

В `packages/web/src/auth/authStore.ts` заменить `AuthUser`:

```ts
export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  grip?: 'left' | 'right';
  displaySource?: 'telegram' | 'vk';
  linkedProviders?: ('telegram' | 'vk')[];
  tgFirstName?: string | null;
  tgLastName?: string | null;
  tgAvatarUrl?: string | null;
  tgUsername?: string | null;
  vkFirstName?: string | null;
  vkLastName?: string | null;
  vkAvatarUrl?: string | null;
  vkUsername?: string | null;
}
```

Все поля кроме `id`/`displayName` опциональны — на серверной стороне `/auth/telegram` и `/auth/vk` отдают только `{id, displayName}`, остальное приезжает позже из `/me`.

- [ ] **Step 2: Run типы и существующие тесты**

Run: `pnpm typecheck && pnpm --filter @hockey/web test -- authStore`
Expected: всё зелёное (поля опциональны, ничего не ломаем).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/auth/authStore.ts
git commit -m "feat(web): AuthUser type — per-provider profile + display_source"
```

---

## Task 13: ProfileScreen — display_source switch

**Files:**
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Test: `packages/web/src/screens/ProfileScreen.test.tsx` (создать или дополнить)

- [ ] **Step 1: Прочитать существующий ProfileScreen**

```bash
cat packages/web/src/screens/ProfileScreen.tsx
```

Запомни паттерн отрисовки grip-переключателя — повтори его для display_source.

- [ ] **Step 2: Failing test**

Содержимое `packages/web/src/screens/ProfileScreen.test.tsx` (или дополнение если файл уже есть):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfileScreen } from './ProfileScreen.js';
import { useAuthStore } from '../auth/authStore.js';

const apiFetchMock = vi.fn();
vi.mock('../api/apiFetch.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, msg: string) { super(msg); }
  },
}));

function renderProfile() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ProfileScreen /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  useAuthStore.getState().clearSession();
  useAuthStore.getState().setSession({
    accessToken: 'AT', refreshToken: 'RT',
    user: {
      id: 'u', displayName: 'TG User',
      displaySource: 'telegram',
      linkedProviders: ['telegram', 'vk'],
      tgFirstName: 'Иван', tgLastName: 'Иванов',
      vkFirstName: 'Vk', vkLastName: 'Surname',
    },
  });
});

describe('ProfileScreen display_source switch', () => {
  it('renders switch with both options when both providers linked', () => {
    apiFetchMock.mockResolvedValue({
      id: 'u', displayName: 'TG User', displaySource: 'telegram',
      linkedProviders: ['telegram', 'vk'],
      tgFirstName: 'Иван', tgLastName: 'Иванов',
      vkFirstName: 'Vk', vkLastName: 'Surname',
    });
    renderProfile();
    expect(screen.getByRole('radio', { name: /Из Telegram/i })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Из ВК/i })).toBeEnabled();
  });

  it('disables radio for unlinked provider', () => {
    useAuthStore.getState().updateUser({ linkedProviders: ['telegram'] });
    apiFetchMock.mockResolvedValue({
      id: 'u', displayName: 'TG User', displaySource: 'telegram',
      linkedProviders: ['telegram'],
    });
    renderProfile();
    expect(screen.getByRole('radio', { name: /Из ВК/i })).toBeDisabled();
  });

  it('PATCHes /me on switch click', async () => {
    apiFetchMock.mockImplementation(async (path: string, init: RequestInit) => {
      if (init?.method === 'PATCH') {
        return { displaySource: 'vk', displayName: 'Vk Surname', avatarUrl: null, grip: 'right' };
      }
      return {
        id: 'u', displayName: 'TG User', displaySource: 'telegram',
        linkedProviders: ['telegram', 'vk'],
      };
    });
    renderProfile();
    const vkRadio = await screen.findByRole('radio', { name: /Из ВК/i });
    fireEvent.click(vkRadio);
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/me', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displaySource: 'vk' }),
      })),
    );
  });
});
```

Подгони фикстуры под существующие — у `ProfileScreen` могут быть свои зависимости (например, useQuery для `/me`); этот тест предполагает что компонент тянет `/me` через `apiFetch`.

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm --filter @hockey/web test -- ProfileScreen`
Expected: FAIL — переключателя нет.

- [ ] **Step 4: Add display_source switch to ProfileScreen.tsx**

В `packages/web/src/screens/ProfileScreen.tsx` (структура зависит от существующего файла; ниже — фрагмент логики, который нужно встроить):

1. Если в компоненте уже есть `useQuery({ queryKey: ['me'], ... })` через `apiFetch('/me')` — расширить тип ответа полями `displaySource`, `linkedProviders`, `tg*`, `vk*` (см. authStore).
2. Добавить мутацию:

```tsx
const queryClient = useQueryClient();
const setUser = useAuthStore((s) => s.updateUser);

const sourceMutation = useMutation({
  mutationFn: (displaySource: 'telegram' | 'vk') =>
    apiFetch<{ displaySource: 'telegram' | 'vk'; displayName: string; avatarUrl: string | null }>(
      '/me',
      { method: 'PATCH', body: JSON.stringify({ displaySource }) },
    ),
  onSuccess: (res) => {
    setUser({ displaySource: res.displaySource, displayName: res.displayName, avatarUrl: res.avatarUrl });
    queryClient.invalidateQueries({ queryKey: ['me'] });
  },
});
```

3. Секция UI (вставить в подходящее место в return — рядом с grip-секцией):

```tsx
<section style={{ padding: '16px 0' }}>
  <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Имя и аватар</h2>
  <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {(['telegram', 'vk'] as const).map((src) => {
      const linked = me?.linkedProviders?.includes(src) ?? false;
      const label = src === 'telegram' ? 'Из Telegram' : 'Из ВК';
      const preview = src === 'telegram'
        ? [me?.tgFirstName, me?.tgLastName].filter(Boolean).join(' ') || '—'
        : [me?.vkFirstName, me?.vkLastName].filter(Boolean).join(' ') || '—';
      return (
        <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: linked ? 1 : 0.5 }}>
          <input
            type="radio"
            name="displaySource"
            value={src}
            checked={me?.displaySource === src}
            disabled={!linked || sourceMutation.isPending}
            onChange={() => sourceMutation.mutate(src)}
            aria-label={label}
          />
          <span>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{preview}</span>
        </label>
      );
    })}
  </div>
  {me?.linkedProviders?.length === 1 && (
    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
      Привяжите второй аккаунт, чтобы переключаться.
    </div>
  )}
</section>
```

(Если у тебя `me` называется иначе — `profile`/`data`, переименуй.)

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @hockey/web test -- ProfileScreen`
Expected: passed.

- [ ] **Step 6: Run all web tests**

Run: `pnpm --filter @hockey/web test`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx
git commit -m "feat(web): display_source switch in ProfileScreen"
```

---

## Task 14: Docker / CI / env wiring

**Files:**
- Modify: `packages/web/Dockerfile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docker-compose.yml` (проверить — VK_APP_ID уже там)

- [ ] **Step 1: Add VITE_VK_APP_ID build arg to web Dockerfile**

В `packages/web/Dockerfile` после существующих ARG/ENV `VITE_TELEGRAM_BOT_USERNAME`:

```dockerfile
ARG VITE_VK_APP_ID=""
ENV VITE_VK_APP_ID=$VITE_VK_APP_ID
```

(вставить перед `RUN pnpm --filter @hockey/web build`).

- [ ] **Step 2: Pass build-arg from deploy workflow**

В `.github/workflows/deploy.yml` в step «Build and push web image»:

```yaml
        env:
          BOT_USERNAME: ${{ vars.VITE_TELEGRAM_BOT_USERNAME }}
          VK_APP_ID: ${{ vars.VITE_VK_APP_ID }}
        with:
          context: .
          file: packages/web/Dockerfile
          push: true
          build-args: |
            VITE_TELEGRAM_BOT_USERNAME=${{ env.BOT_USERNAME }}
            VITE_VK_APP_ID=${{ env.VK_APP_ID }}
```

- [ ] **Step 3: Verify docker-compose**

`docker-compose.yml` уже имеет `VK_APP_ID: ${VK_APP_ID}` в `server.environment`. Ничего не меняем. Можно убрать `VK_APP_SECRET` и `VK_REDIRECT_URI`, если они не используются — но это вне scope, не трогать.

- [ ] **Step 4: Add VITE_VK_APP_ID to .env.example**

В `.env.example` добавить:

```
# VK ID OAuth app id (id.vk.com), client-side. Запекается в бандл при build.
VITE_VK_APP_ID=
```

- [ ] **Step 5: Local sanity check**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm test
```

Expected: всё зелёное. Если `pnpm test` падает на интеграционных без локальных Postgres/Redis — это ожидаемо в среде без БД, главное проверить unit-тесты (`vk.test.ts`, `vkAuth.test.ts`, `VkAuthCallbackScreen.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add packages/web/Dockerfile .github/workflows/deploy.yml .env.example
git commit -m "ci(web): wire VITE_VK_APP_ID through Dockerfile + deploy workflow"
```

---

## Task 15: Manual smoke + GitHub vars + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`
- Done out-of-band: VK Console + GitHub repo vars

- [ ] **Step 1: Запросить VK App ID у пользователя**

Сказать пользователю:
> «Дай VK App ID (число из VK Console после создания "Веб-приложения"). Я добавлю его в repo vars и пробросим в build.»

- [ ] **Step 2: Set GitHub repo vars**

```bash
gh variable set VITE_VK_APP_ID --body "<полученный app id>"
gh variable set VK_APP_ID --body "<полученный app id>"
```

(`VK_APP_ID` для server, `VITE_VK_APP_ID` для web build-arg.)

- [ ] **Step 3: Verify**

```bash
gh variable list | grep VK
```

Expected: оба установлены.

- [ ] **Step 4: Local manual smoke (если есть VK App ID)**

В `.env` локально:
```
VK_APP_ID=<app id>
VITE_VK_APP_ID=<app id>
```

Run:
```bash
pnpm --filter @hockey/game-core build
pnpm dev:server &
pnpm dev:web
```

Открыть `http://localhost:5173/login`, нажать «Войти через ВКонтакте», авторизоваться в VK, подтвердить:
- редирект приходит на `/auth/vk/callback?code=...&device_id=...`
- callback экран показывает «Авторизация…»
- через ~1с попадаем на `/`
- `localStorage.hockey.auth` содержит `accessToken`/`user`
- `GET /me` возвращает `displaySource: 'vk'` (новый юзер) или `'telegram'` (existing)
- В ProfileScreen виден переключатель
- При переключении — `display_name`/`avatar_url` меняются мгновенно

- [ ] **Step 5: Update CLAUDE.md**

В `CLAUDE.md` в секции `### Auth (Telegram)` переименовать в `### Auth (Telegram + VK)` и добавить абзац после Telegram-части:

```markdown
**VK ID OAuth.** `POST /auth/vk` принимает PKCE-payload (`code`, `codeVerifier`, `deviceId`, `redirectUri`),
обменивает через `id.vk.com/oauth2/auth` + `oauth2/user_info`, делает find-or-link-or-create по `vk_id`
(advisory-lock на `vk_link:<id>`). Если запрос идёт с валидным Bearer — VK линкуется к текущему юзеру;
если `vk_id` уже принадлежит другому — 409 `vk_already_linked`. Web: `auth/vkAuth.ts` (PKCE helpers
+ `startVkOAuth`), экран `/auth/vk/callback`, `calledRef` против двойного маунта в StrictMode.
`state` валидируется на клиенте (sessionStorage). `VK_APP_ID` опционален — без него `/auth/vk` отвечает 503.

**Profile source switch.** `users.display_source ∈ {'telegram', 'vk'}` определяет из каких полей
(`tg_first_name|last_name|avatar_url` или `vk_*`) собирается `users.display_name`/`avatar_url`.
Хелпер `auth/profile.ts:recomputeEffectiveProfile` вызывается при любом логине провайдера и при
`PATCH /me { displaySource }`. Custom-поля и кастомная аватарка — отдельная задача.
```

Удалить из секции `### Auth (Telegram)` упоминание «(VK OAuth отложен)» где оно встречается в файле.

- [ ] **Step 6: Run typecheck + lint last time**

Run: `pnpm typecheck && pnpm lint`
Expected: зелёное.

- [ ] **Step 7: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs(claude): VK OAuth + display_source switch documented"
git push
```

- [ ] **Step 8: After deploy — prod smoke**

После того как Actions deploy зелёный, проверить на `https://hockey.inbotwetrust.ru`:
- открыть `/login`, нажать «Войти через ВКонтакте»
- VK редиректит обратно
- юзер залогинен
- если ранее логинился через Telegram под этим же VK — `vk_already_linked`? нет (VK ещё не привязан); если линкуем при залогиненном TG-юзере, в БД появится auth_providers row с `provider='vk'`.

---

## Self-Review Checklist (mark while reviewing)

- [ ] Все 14 секций спеки покрыты задачами:
  - PKCE-флоу → Task 9
  - `POST /auth/vk` → Task 7
  - tg_*/vk_* поля + миграция → Task 1, 4, 5
  - display_source + recomputeEffectiveProfile → Task 3, 8, 13
  - UI: LoginScreen + Callback + Profile → Task 10, 11, 13
  - Tests: server + web → каждой задаче TDD-шаг
  - Deploy: Dockerfile + workflow → Task 14
  - Manual smoke + GH vars → Task 15
- [ ] Никаких "TODO/TBD" в плане.
- [ ] Типы согласованы: `VkLinkResult.kind` — 4 варианта, в тестах используются те же. `VkProfile` поля — те же в `vk.ts` и `users.ts`. `displaySource: 'telegram' | 'vk'` — везде.
- [ ] Команды ровно те, что есть в проекте: `pnpm --filter @hockey/server test`, `pnpm --filter @hockey/web test`, `pnpm --filter @hockey/game-core build` (строго перед server-тестами).
- [ ] Файлы существуют по точным путям, упомянутым в Files-блоках.
