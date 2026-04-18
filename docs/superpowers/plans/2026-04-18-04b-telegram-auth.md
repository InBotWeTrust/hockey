# Plan 4B — Telegram Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JWT-аутентификация через Telegram Login Widget: `POST /auth/telegram` → проверка HMAC-хэша → lazy user provisioning → issue access+refresh токенов; `POST /auth/refresh` с ротацией, `POST /auth/logout`, `GET /me` как sanity-роут. VK OAuth отложен до Plan 4D.

**Architecture:**
- Чистые функции в `src/auth/*`: `telegram.ts` (HMAC-проверка), `jwt.ts` (issue/verify через `jose`), `session.ts` (Redis refresh storage с атомарным consume), `users.ts` (findOrCreate в одной pg-транзакции).
- Fastify-плагин `plugins/auth.ts` декорирует `app.authenticate` (preHandler), который читает `Authorization: Bearer ...`, верифицирует JWT, кладёт `request.user = { id }`. Ошибка → `AppError('unauthenticated', 401)` (Plan 4A уже ловит в errorsPlugin).
- Роуты в `routes/auth.ts` и `routes/me.ts`. buildApp регистрирует их после errorsPlugin/db/redis/health в том же порядке.
- **Токены в JSON body** (отклонение от §7.2 спека, где HttpOnly cookies). Причины: упрощение MVP, уход от CSRF double-submit в Plan 4B. Cookie-based доставка + CSRF перенесены в будущий Plan 4E (hardening). Клиент хранит access в памяти, refresh в localStorage.

**Tech Stack:** `jose` (JWT HS256), Node `crypto` builtin (HMAC-SHA256), zod, Fastify 4, pg, ioredis. Никаких прямых зависимостей от `jsonwebtoken`.

---

## File Structure

Создаются:
- `packages/server/src/auth/telegram.ts` — verify TG Login payload (HMAC)
- `packages/server/src/auth/jwt.ts` — issueAccessToken / issueRefreshToken / verifyAccessToken / verifyRefreshToken
- `packages/server/src/auth/session.ts` — saveRefresh / consumeRefresh (Redis)
- `packages/server/src/auth/users.ts` — findOrCreateTelegramUser (pg transaction)
- `packages/server/src/plugins/auth.ts` — `app.authenticate` preHandler
- `packages/server/src/routes/auth.ts` — POST /auth/telegram, /auth/refresh, /auth/logout
- `packages/server/src/routes/me.ts` — GET /me
- `packages/server/test/auth/telegram.test.ts` — unit
- `packages/server/test/auth/jwt.test.ts` — unit
- `packages/server/test/auth/session.test.ts` — integration (Redis)
- `packages/server/test/auth/users.test.ts` — integration (pg)
- `packages/server/test/plugins/auth.test.ts` — unit (inject с фейковыми токенами)
- `packages/server/test/routes/auth.test.ts` — integration end-to-end
- `packages/server/test/routes/me.test.ts` — integration

Модифицируются:
- `packages/server/src/config.ts` — добавить JWT_SECRET, REFRESH_SECRET, TELEGRAM_BOT_TOKEN (все required, min 16 chars для секретов)
- `packages/server/src/app.ts` — register authPlugin, authRoutes, meRoutes
- `packages/server/package.json` — dep `jose@^5`
- `packages/server/test/config.test.ts` — обновить под новые required поля
- `.env.example` — раскомментировать/дополнить секреты
- `README.md` — раздел "Auth flow (Telegram)"

---

### Task 1: Добавить `jose` и расширить config новыми секретами

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/test/config.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Обновить падающий тест config**

`packages/server/test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@localhost:5432/hockey',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'dev-jwt-secret-that-is-long-enough',
  REFRESH_SECRET: 'dev-refresh-secret-long-enough-too',
  TELEGRAM_BOT_TOKEN: '123456:placeholder-bot-token',
};

describe('loadConfig', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow();
  });

  it('requires JWT_SECRET (min 16 chars)', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow();
    const { JWT_SECRET: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow();
  });

  it('requires REFRESH_SECRET (min 16 chars) and TELEGRAM_BOT_TOKEN', () => {
    const { REFRESH_SECRET: _r, ...rest1 } = base;
    expect(() => loadConfig(rest1)).toThrow();
    const { TELEGRAM_BOT_TOKEN: _t, ...rest2 } = base;
    expect(() => loadConfig(rest2)).toThrow();
  });

  it('parses valid env', () => {
    const cfg = loadConfig(base);
    expect(cfg.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(cfg.JWT_SECRET).toBe(base.JWT_SECRET);
    expect(cfg.TELEGRAM_BOT_TOKEN).toBe(base.TELEGRAM_BOT_TOKEN);
    expect(cfg.PORT).toBe(3000);
  });
});
```

- [ ] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts`
Expected: FAIL — новые поля не прогоняются через схему.

- [ ] **Step 3: Расширить схему config**

`packages/server/src/config.ts`:
```ts
import { z } from 'zod';

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
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Добавить `jose` в deps**

`packages/server/package.json` — в dependencies:
```json
"jose": "^5.2.0"
```

Run: `pnpm install`

- [ ] **Step 6: Обновить .env.example**

Заменить секцию секретов в `.env.example`:
```
# Секреты (обязательно заменить на проде)
JWT_SECRET=dev-jwt-secret-at-least-16-chars
REFRESH_SECRET=dev-refresh-secret-at-least-16-chars
TELEGRAM_BOT_TOKEN=123456:REPLACE_WITH_REAL_BOT_TOKEN
```

- [ ] **Step 7: Коммит**

```bash
git add packages/server/package.json packages/server/src/config.ts packages/server/test/config.test.ts .env.example pnpm-lock.yaml
git commit -m "chore(server): add jose, require auth secrets in config"
```

---

### Task 2: Telegram Login hash verification

**Files:**
- Create: `packages/server/src/auth/telegram.ts`
- Create: `packages/server/test/auth/telegram.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/auth/telegram.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramLoginPayload } from '../../src/auth/telegram.js';

const BOT_TOKEN = '123456:AAEhBOKEN';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

function freshPayload(overrides: Partial<Record<string, string>> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const base: Record<string, string> = {
    id: '100500',
    first_name: 'Egor',
    last_name: 'Gumenyuk',
    username: 'egor',
    photo_url: 'https://t.me/i/userpic/320/egor.jpg',
    auth_date: String(nowSec - 30),
    ...overrides,
  };
  base.hash = signPayload(base, BOT_TOKEN);
  return base;
}

describe('verifyTelegramLoginPayload', () => {
  it('accepts a valid payload and returns typed user data', () => {
    const payload = freshPayload();
    const result = verifyTelegramLoginPayload(payload, BOT_TOKEN);
    expect(result.id).toBe(100500);
    expect(result.firstName).toBe('Egor');
    expect(result.username).toBe('egor');
    expect(result.authDate).toBeInstanceOf(Date);
  });

  it('rejects tampered payload', () => {
    const payload = freshPayload();
    payload.first_name = 'Mallory';
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow(/hash/i);
  });

  it('rejects payload older than 24h', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = freshPayload({ auth_date: String(nowSec - 60 * 60 * 25) });
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow(/expired|stale|auth_date/i);
  });

  it('rejects payload with missing hash', () => {
    const payload = freshPayload();
    delete payload.hash;
    expect(() => verifyTelegramLoginPayload(payload, BOT_TOKEN)).toThrow();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/auth/telegram.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать**

`packages/server/src/auth/telegram.ts`:
```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramLoginUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: Date;
}

const MAX_AGE_SEC = 24 * 60 * 60;

export function verifyTelegramLoginPayload(
  raw: Record<string, unknown>,
  botToken: string,
): TelegramLoginUser {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') data[k] = v;
    else if (typeof v === 'number') data[k] = String(v);
  }

  const providedHash = data.hash;
  if (!providedHash) throw new Error('telegram: missing hash');

  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');

  if (expectedHash.length !== providedHash.length) {
    throw new Error('telegram: invalid hash');
  }
  const ok = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(providedHash));
  if (!ok) throw new Error('telegram: invalid hash');

  const authDateSec = Number(data.auth_date);
  if (!Number.isFinite(authDateSec)) throw new Error('telegram: invalid auth_date');
  const ageSec = Math.floor(Date.now() / 1000) - authDateSec;
  if (ageSec > MAX_AGE_SEC) throw new Error('telegram: auth_date expired');

  const idNum = Number(data.id);
  if (!Number.isFinite(idNum)) throw new Error('telegram: invalid id');

  return {
    id: idNum,
    firstName: data.first_name ?? '',
    ...(data.last_name !== undefined ? { lastName: data.last_name } : {}),
    ...(data.username !== undefined ? { username: data.username } : {}),
    ...(data.photo_url !== undefined ? { photoUrl: data.photo_url } : {}),
    authDate: new Date(authDateSec * 1000),
  };
}
```

Note: `exactOptionalPropertyTypes` требует не класть ключи с `undefined` значением. Отсюда условный spread.

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/auth/telegram.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/auth/telegram.ts packages/server/test/auth/telegram.test.ts
git commit -m "feat(server): telegram login hash verification"
```

---

### Task 3: JWT issuer / verifier (access + refresh)

**Files:**
- Create: `packages/server/src/auth/jwt.ts`
- Create: `packages/server/test/auth/jwt.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/auth/jwt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  createJwt,
  verifyAccessToken,
  verifyRefreshToken,
  type JwtService,
} from '../../src/auth/jwt.js';

const jwt: JwtService = createJwt({
  accessSecret: 'access-secret-1234567890abcdef',
  refreshSecret: 'refresh-secret-1234567890abcdef',
});

describe('JwtService', () => {
  it('issues + verifies access token with 15m exp', async () => {
    const token = await jwt.issueAccessToken({ sub: 'user-1' });
    const payload = await verifyAccessToken(token, 'access-secret-1234567890abcdef');
    expect(payload.sub).toBe('user-1');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 15 * 60 + 5);
  });

  it('issues refresh token with jti and 30d exp', async () => {
    const { token, jti } = await jwt.issueRefreshToken({ sub: 'user-1' });
    expect(jti).toMatch(/^[0-9a-f-]{36}$/i);
    const payload = await verifyRefreshToken(token, 'refresh-secret-1234567890abcdef');
    expect(payload.sub).toBe('user-1');
    expect(payload.jti).toBe(jti);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60);
  });

  it('verifyAccessToken rejects a refresh token (wrong secret)', async () => {
    const { token } = await jwt.issueRefreshToken({ sub: 'user-1' });
    await expect(
      verifyAccessToken(token, 'access-secret-1234567890abcdef'),
    ).rejects.toThrow();
  });

  it('rejects tampered token', async () => {
    const token = await jwt.issueAccessToken({ sub: 'user-1' });
    const tampered = token.slice(0, -4) + 'xxxx';
    await expect(
      verifyAccessToken(tampered, 'access-secret-1234567890abcdef'),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/auth/jwt.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать**

`packages/server/src/auth/jwt.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  exp: number;
  iat: number;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export interface JwtServiceOptions {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSec?: number;   // default 900 (15m)
  refreshTtlSec?: number;  // default 2592000 (30d)
}

export interface JwtService {
  issueAccessToken(input: { sub: string }): Promise<string>;
  issueRefreshToken(input: { sub: string }): Promise<{ token: string; jti: string; expSec: number }>;
  accessSecret: string;
  refreshSecret: string;
  refreshTtlSec: number;
}

const encoder = new TextEncoder();

export function createJwt(options: JwtServiceOptions): JwtService {
  const accessTtlSec = options.accessTtlSec ?? 15 * 60;
  const refreshTtlSec = options.refreshTtlSec ?? 30 * 24 * 60 * 60;
  const accessKey = encoder.encode(options.accessSecret);
  const refreshKey = encoder.encode(options.refreshSecret);

  return {
    accessSecret: options.accessSecret,
    refreshSecret: options.refreshSecret,
    refreshTtlSec,
    async issueAccessToken({ sub }) {
      return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(`${accessTtlSec}s`)
        .sign(accessKey);
    },
    async issueRefreshToken({ sub }) {
      const jti = randomUUID();
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(`${refreshTtlSec}s`)
        .sign(refreshKey);
      return { token, jti, expSec: refreshTtlSec };
    },
  };
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    throw new Error('jwt: invalid payload');
  }
  return { sub: payload.sub, exp: payload.exp, iat: payload.iat };
}

export async function verifyRefreshToken(token: string, secret: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('jwt: invalid refresh payload');
  }
  return { sub: payload.sub, exp: payload.exp, iat: payload.iat, jti: payload.jti };
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/auth/jwt.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/auth/jwt.ts packages/server/test/auth/jwt.test.ts
git commit -m "feat(server): jwt service (access + refresh via jose)"
```

---

### Task 4: Refresh session storage in Redis

**Files:**
- Create: `packages/server/src/auth/session.ts`
- Create: `packages/server/test/auth/session.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/auth/session.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Redis } from 'ioredis';
import { saveRefresh, consumeRefresh, revokeRefresh } from '../../src/auth/session.js';
import { createTestRedis, hasIntegrationEnv, resetRedis } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('refresh session storage', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = createTestRedis();
    await resetRedis(redis);
  });

  afterAll(async () => {
    redis.disconnect();
  });

  it('saves refresh and consumes it exactly once', async () => {
    await saveRefresh(redis, { jti: 'j-1', userId: 'u-1', ttlSec: 60 });
    const first = await consumeRefresh(redis, 'j-1');
    expect(first).toEqual({ userId: 'u-1' });
    const second = await consumeRefresh(redis, 'j-1');
    expect(second).toBeNull();
  });

  it('respects TTL', async () => {
    await saveRefresh(redis, { jti: 'j-ttl', userId: 'u-1', ttlSec: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    const result = await consumeRefresh(redis, 'j-ttl');
    expect(result).toBeNull();
  });

  it('revokeRefresh removes a pending token', async () => {
    await saveRefresh(redis, { jti: 'j-rev', userId: 'u-1', ttlSec: 60 });
    await revokeRefresh(redis, 'j-rev');
    expect(await consumeRefresh(redis, 'j-rev')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/auth/session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

`packages/server/src/auth/session.ts`:
```ts
import type { Redis } from 'ioredis';

const key = (jti: string) => `refresh:${jti}`;

export interface SaveRefreshInput {
  jti: string;
  userId: string;
  ttlSec: number;
}

export async function saveRefresh(redis: Redis, input: SaveRefreshInput): Promise<void> {
  await redis.set(key(input.jti), input.userId, 'EX', input.ttlSec);
}

export async function consumeRefresh(
  redis: Redis,
  jti: string,
): Promise<{ userId: string } | null> {
  // atomic GETDEL — ioredis ≥ 5 supports it; single round-trip
  const userId = await redis.getdel(key(jti));
  return userId ? { userId } : null;
}

export async function revokeRefresh(redis: Redis, jti: string): Promise<void> {
  await redis.del(key(jti));
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/auth/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/auth/session.ts packages/server/test/auth/session.test.ts
git commit -m "feat(server): refresh token storage in redis (atomic consume)"
```

---

### Task 5: User provisioning (findOrCreateTelegramUser)

**Files:**
- Create: `packages/server/src/auth/users.ts`
- Create: `packages/server/test/auth/users.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/auth/users.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('findOrCreateTelegramUser', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade',
    );
  });

  it('creates user + wallet + equipment + starter stick + auth_providers row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    const wallet = await pool.query('select * from user_wallet where user_id=$1', [user.id]);
    expect(wallet.rowCount).toBe(1);
    expect(wallet.rows[0].shots_current).toBe(25);
    expect(wallet.rows[0].shots_max).toBe(25);
    const eq = await pool.query('select * from user_equipment where user_id=$1', [user.id]);
    expect(eq.rows[0].equipped_stick).toBe('training');
    const sticks = await pool.query('select stick_id from user_sticks where user_id=$1', [user.id]);
    expect(sticks.rows.map((r) => r.stick_id)).toEqual(['training']);
    const prov = await pool.query(
      "select provider, provider_uid from auth_providers where user_id=$1",
      [user.id],
    );
    expect(prov.rows[0]).toEqual({ provider: 'telegram', provider_uid: '100500' });
  });

  it('is idempotent: second call with same provider_uid returns existing user', async () => {
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
    });
    const second = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor (renamed)',
    });
    expect(second.id).toBe(first.id);
    const count = await pool.query('select count(*)::int as n from users');
    expect(count.rows[0].n).toBe(1);
  });

  it('optional avatarUrl persists on users row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '200',
      displayName: 'Test',
      avatarUrl: 'https://t.me/i/pic.jpg',
    });
    const row = await pool.query('select avatar_url from users where id=$1', [user.id]);
    expect(row.rows[0].avatar_url).toBe('https://t.me/i/pic.jpg');
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

`packages/server/src/auth/users.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface FindOrCreateInput {
  providerUid: string;
  displayName: string;
  avatarUrl?: string;
}

export interface AppUser {
  id: string;
  displayName: string;
}

export async function findOrCreateTelegramUser(
  pool: Pool,
  input: FindOrCreateInput,
): Promise<AppUser> {
  const existing = await pool.query<{ id: string; display_name: string }>(
    `select u.id, u.display_name
       from users u
       join auth_providers ap on ap.user_id = u.id
      where ap.provider = 'telegram' and ap.provider_uid = $1`,
    [input.providerUid],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0]!;
    return { id: row.id, displayName: row.display_name };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const userId = randomUUID();
    const providerId = randomUUID();
    await client.query(
      'insert into users (id, display_name, avatar_url) values ($1, $2, $3)',
      [userId, input.displayName, input.avatarUrl ?? null],
    );
    await client.query(
      'insert into auth_providers (id, user_id, provider, provider_uid) values ($1, $2, $3, $4)',
      [providerId, userId, 'telegram', input.providerUid],
    );
    await client.query('insert into user_wallet (user_id) values ($1)', [userId]);
    await client.query('insert into user_equipment (user_id) values ($1)', [userId]);
    await client.query(
      "insert into user_sticks (user_id, stick_id) values ($1, 'training')",
      [userId],
    );
    await client.query('commit');
    return { id: userId, displayName: input.displayName };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/auth/users.test.ts`
Expected: PASS (3 кейса).

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/auth/users.ts packages/server/test/auth/users.test.ts
git commit -m "feat(server): lazy provisioning of telegram users + wallet/equipment"
```

---

### Task 6: Auth plugin (`app.authenticate` preHandler)

**Files:**
- Create: `packages/server/src/plugins/auth.ts`
- Create: `packages/server/test/plugins/auth.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/plugins/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from '../../src/plugins/auth.js';
import { errorsPlugin } from '../../src/plugins/errors.js';
import { createJwt } from '../../src/auth/jwt.js';

const ACCESS = 'access-secret-1234567890abcdef';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorsPlugin);
  await app.register(authPlugin, { accessSecret: ACCESS });
  app.get(
    '/protected',
    { preHandler: [app.authenticate] },
    async (req) => ({ userId: req.user.id }),
  );
  return app;
}

describe('authPlugin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects request without bearer as 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('rejects malformed bearer as 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer garbage.jwt.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid access token and sets request.user', async () => {
    const jwt = createJwt({ accessSecret: ACCESS, refreshSecret: ACCESS });
    const token = await jwt.issueAccessToken({ sub: 'user-xyz' });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-xyz' });
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/plugins/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

`packages/server/src/plugins/auth.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../auth/jwt.js';
import { AppError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  accessSecret: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorateRequest('user', null);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('unauthenticated', 'missing bearer token', 401);
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await verifyAccessToken(token, opts.accessSecret);
      req.user = { id: payload.sub };
    } catch {
      throw new AppError('unauthenticated', 'invalid token', 401);
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth', dependencies: ['errors'] });
```

Note: `decorateRequest('user', null)` создаёт поле на прототипе — при первом `req.user = {...}` значение шэдится per-request. Без этого Fastify в strict-режиме предупреждает.

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/plugins/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/plugins/auth.ts packages/server/test/plugins/auth.test.ts
git commit -m "feat(server): auth plugin (authenticate preHandler)"
```

---

### Task 7: Route POST /auth/telegram (primary login flow)

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/test/routes/auth.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Интегрировать плагины в `buildApp`**

`packages/server/src/app.ts`:
```ts
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { errorsPlugin } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';

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
  await app.register(authPlugin, { accessSecret: config.JWT_SECRET });
  await app.register(healthRoutes);
  await app.register(authRoutes, {
    telegramBotToken: config.TELEGRAM_BOT_TOKEN,
    accessSecret: config.JWT_SECRET,
    refreshSecret: config.REFRESH_SECRET,
  });

  return app;
}
```

- [ ] **Step 2: Падающий тест роута**

`packages/server/test/routes/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, createTestRedis, hasIntegrationEnv, resetDatabase, resetRedis, getTestUrls } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const BOT_TOKEN = '111:test-bot-token';
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

function freshTgPayload(overrides: Partial<Record<string, string>> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const base: Record<string, string> = {
    id: '100500',
    first_name: 'Egor',
    auth_date: String(nowSec),
    ...overrides,
  };
  base.hash = signPayload(base, BOT_TOKEN);
  return base;
}

describe.skipIf(!hasIntegrationEnv)('POST /auth/telegram', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues tokens on valid payload and creates user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: freshTgPayload(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; displayName: string };
    };
    expect(body.user.displayName).toBe('Egor');
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken.split('.')).toHaveLength(3);
  });

  it('returns 401 on invalid hash', async () => {
    const payload = freshTgPayload();
    payload.first_name = 'Mallory';
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('returns 400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: FAIL.

- [ ] **Step 4: Реализовать роут**

`packages/server/src/routes/auth.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyTelegramLoginPayload } from '../auth/telegram.js';
import { createJwt } from '../auth/jwt.js';
import { findOrCreateTelegramUser } from '../auth/users.js';
import { saveRefresh } from '../auth/session.js';
import { AppError } from '../plugins/errors.js';

export interface AuthRoutesOptions {
  telegramBotToken: string;
  accessSecret: string;
  refreshSecret: string;
}

const tgBodySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.union([z.string(), z.number()]),
    hash: z.string(),
  })
  .passthrough();

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const jwt = createJwt({
    accessSecret: opts.accessSecret,
    refreshSecret: opts.refreshSecret,
  });

  app.post('/auth/telegram', async (req, reply) => {
    const parsed = tgBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid telegram payload', 400);
    }
    let tgUser;
    try {
      tgUser = verifyTelegramLoginPayload(parsed.data as Record<string, unknown>, opts.telegramBotToken);
    } catch (err) {
      req.log.warn({ err }, 'telegram auth failed');
      throw new AppError('unauthenticated', 'telegram hash invalid', 401);
    }

    const displayName = [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') || tgUser.username || 'player';
    const user = await findOrCreateTelegramUser(app.pg, {
      providerUid: String(tgUser.id),
      displayName,
      ...(tgUser.photoUrl !== undefined ? { avatarUrl: tgUser.photoUrl } : {}),
    });

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: user.id }),
      jwt.issueRefreshToken({ sub: user.id }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: user.id,
      ttlSec: refresh.expSec,
    });

    reply.send({
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, displayName: user.displayName },
    });
  });
};
```

- [ ] **Step 5: Тесты зелёные**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: PASS (3 кейса).

- [ ] **Step 6: Коммит**

```bash
git add packages/server/src/app.ts packages/server/src/routes/auth.ts packages/server/test/routes/auth.test.ts
git commit -m "feat(server): POST /auth/telegram login flow"
```

---

### Task 8: Route POST /auth/refresh (rotation)

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/test/routes/auth.test.ts`

- [ ] **Step 1: Добавить падающий тест ротации**

В `test/routes/auth.test.ts` добавить describe-блок:
```ts
describe.skipIf(!hasIntegrationEnv)('POST /auth/refresh', () => {
  // подразумевается shared app из предыдущего describe; для чистоты — создать новый setup

  async function login() {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: freshTgPayload(),
    });
    return res.json() as { accessToken: string; refreshToken: string };
  }

  it('rotates refresh and issues a new pair', async () => {
    const first = await login();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; refreshToken: string };
    expect(body.refreshToken).not.toBe(first.refreshToken);

    // old refresh must be rejected (consumed)
    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('rejects tampered refresh as 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'not.a.valid.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: FAIL — роут `/auth/refresh` не существует.

- [ ] **Step 3: Добавить роут**

В `packages/server/src/routes/auth.ts` внутри плагина, после `POST /auth/telegram`:
```ts
  app.post('/auth/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'refreshToken required', 400);
    }

    let payload;
    try {
      const { verifyRefreshToken } = await import('../auth/jwt.js');
      payload = await verifyRefreshToken(body.data.refreshToken, opts.refreshSecret);
    } catch {
      throw new AppError('unauthenticated', 'invalid refresh token', 401);
    }

    const { consumeRefresh } = await import('../auth/session.js');
    const consumed = await consumeRefresh(app.redis, payload.jti);
    if (!consumed || consumed.userId !== payload.sub) {
      throw new AppError('unauthenticated', 'refresh token not recognized', 401);
    }

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: payload.sub }),
      jwt.issueRefreshToken({ sub: payload.sub }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: payload.sub,
      ttlSec: refresh.expSec,
    });

    reply.send({ accessToken, refreshToken: refresh.token });
  });
```

(Перенести `import { verifyRefreshToken }` и `import { consumeRefresh }` в top-level impоrts, dynamic `import()` здесь — антипаттерн, был для наглядности diff. Итоговый код берёт всё в статических import.)

Финальный top-level imports в `auth.ts`:
```ts
import { verifyTelegramLoginPayload } from '../auth/telegram.js';
import { createJwt, verifyRefreshToken } from '../auth/jwt.js';
import { findOrCreateTelegramUser } from '../auth/users.js';
import { saveRefresh, consumeRefresh } from '../auth/session.js';
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: PASS (5 кейсов всего).

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/routes/auth.ts packages/server/test/routes/auth.test.ts
git commit -m "feat(server): POST /auth/refresh with rotation + reuse detection"
```

---

### Task 9: Route POST /auth/logout

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/test/routes/auth.test.ts`

- [ ] **Step 1: Добавить падающий тест**

В `test/routes/auth.test.ts`:
```ts
describe.skipIf(!hasIntegrationEnv)('POST /auth/logout', () => {
  it('revokes the provided refresh token', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: freshTgPayload(),
    });
    const tokens = login.json() as { refreshToken: string };

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('returns 204 even for unknown refresh (no user enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 'garbage.jwt.here' },
    });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Добавить роут**

В `packages/server/src/routes/auth.ts`:
```ts
  app.post('/auth/logout', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
    if (body.success && body.data.refreshToken) {
      try {
        const payload = await verifyRefreshToken(body.data.refreshToken, opts.refreshSecret);
        await revokeRefresh(app.redis, payload.jti);
      } catch {
        // Сознательно глотаем: чужой/битый токен — не повод давать информацию
      }
    }
    reply.status(204).send();
  });
```

Не забыть экспортировать `revokeRefresh` в `auth/session.ts` (уже в Task 4) и импортировать:
```ts
import { saveRefresh, consumeRefresh, revokeRefresh } from '../auth/session.js';
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/routes/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/routes/auth.ts packages/server/test/routes/auth.test.ts
git commit -m "feat(server): POST /auth/logout (revoke refresh)"
```

---

### Task 10: GET /me (protected sanity route)

**Files:**
- Create: `packages/server/src/routes/me.ts`
- Create: `packages/server/test/routes/me.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/routes/me.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, createTestRedis, hasIntegrationEnv, resetDatabase, resetRedis, getTestUrls } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const BOT_TOKEN = '111:test-bot-token';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data).filter((k) => k !== 'hash').sort().map((k) => `${k}=${data[k]}`).join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe.skipIf(!hasIntegrationEnv)('GET /me', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv ? getTestUrls() : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET: 'access-secret-at-least-16-chars',
        REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without bearer', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns current user after login', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: Record<string, string> = {
      id: '42',
      first_name: 'Alice',
      auth_date: String(nowSec),
    };
    payload.hash = signPayload(payload, BOT_TOKEN);
    const login = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    const { accessToken } = login.json() as { accessToken: string };

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; displayName: string };
    expect(body.displayName).toBe('Alice');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
```

- [ ] **Step 2: Падает — модуль `routes/me.ts` отсутствует**

Run: `pnpm --filter @hockey/server test -- test/routes/me.test.ts`
Expected: FAIL.

- [ ] **Step 3: Написать роут**

`packages/server/src/routes/me.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../plugins/errors.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const { rows } = await app.pg.query<{ id: string; display_name: string }>(
      'select id, display_name from users where id = $1',
      [req.user.id],
    );
    if (rows.length === 0) {
      throw new AppError('not_found', 'user not found', 404);
    }
    const row = rows[0]!;
    return { id: row.id, displayName: row.display_name };
  });
};
```

- [ ] **Step 4: Зарегистрировать в buildApp**

В `packages/server/src/app.ts` после `authRoutes`:
```ts
import { meRoutes } from './routes/me.js';
// ...
  await app.register(meRoutes);
```

- [ ] **Step 5: Тесты зелёные**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test`
Expected: PASS всего набора.

- [ ] **Step 6: Коммит**

```bash
git add packages/server/src/routes/me.ts packages/server/src/app.ts packages/server/test/routes/me.test.ts
git commit -m "feat(server): GET /me protected by authenticate preHandler"
```

---

### Task 11: README + PR

**Files:**
- Modify: `README.md`
- (optional) Modify: `.env.example` если секреты ещё не обновлены

- [ ] **Step 1: Документировать auth flow в README**

Добавить раздел после "Local DB stack":

````markdown
## Auth (Telegram)

Логин:
```bash
curl -X POST http://localhost:3000/auth/telegram \
  -H 'Content-Type: application/json' \
  -d '{ "id": 100500, "first_name": "Egor", "auth_date": 1713440000, "hash": "..." }'
```

Ответ:
```json
{ "accessToken": "...", "refreshToken": "...", "user": { "id": "uuid", "displayName": "Egor" } }
```

Использование access-токена:
```bash
curl http://localhost:3000/me -H "Authorization: Bearer $ACCESS"
```

Ротация:
```bash
curl -X POST http://localhost:3000/auth/refresh -H 'Content-Type: application/json' -d '{ "refreshToken": "..." }'
```

Logout отзывает refresh, access-токен остаётся валидным до `exp` (15 минут). Для полного отзыва JWT — см. Plan 4E (пока не написан).
````

- [ ] **Step 2: Финальный прогон**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @hockey/server build
```
Expected: всё зелёное.

- [ ] **Step 3: Коммит**

```bash
git add README.md
git commit -m "docs: document telegram auth flow"
```

- [ ] **Step 4: Push и PR**

```bash
git push -u origin plan-4b-telegram-auth
gh pr create --title "Plan 4B: Telegram auth (JWT access + refresh rotation)" --body "..."
```

Body PR:
```markdown
## Summary
- `POST /auth/telegram` — принимает Telegram Login Widget payload, проверяет HMAC-хэш, лениво создаёт пользователя (users + auth_providers + user_wallet + user_equipment + starter stick), выдаёт access+refresh JWT
- `POST /auth/refresh` — ротирует refresh, inflight re-use токена → 401 (атомарный GETDEL в Redis)
- `POST /auth/logout` — revoke refresh, всегда 204 (не утекает enumeration)
- `GET /me` — protected роут, возвращает `{ id, displayName }` текущего юзера
- `app.authenticate` Fastify-preHandler, 401 через единый `AppError` из errorsPlugin

## Scope fence
- VK OAuth отложен до Plan 4D
- HttpOnly cookie-based auth + CSRF double-submit — Plan 4E (hardening)
- Rate-limit на /auth/* не добавлен (сделаем при общем rate-limit в Plan 4C)

## Test plan
- [x] pnpm typecheck / lint / test — все тесты зелёные (~25 серверных)
- [x] Юнит: telegram.ts (HMAC валид/tamper/expired), jwt.ts (issue/verify access и refresh)
- [x] Интеграция: session.ts (getdel atomicity, TTL), users.ts (идемпотентность provisioning), /auth/* (full flow), /me (auth middleware)
```

---

## Self-review checklist

- [x] **Спек coverage:** Telegram §7.2.1 — покрыт Task 2+7. JWT §7.2 — покрыт Task 3. Refresh rotation + revoke §6.5 — Task 4+8+9. authRequired §7.2 — Task 6. User schema §6.4 — Task 5.
- [x] **Нет placeholder-ов:** каждый Task содержит полный код и тесты.
- [x] **Type consistency:** `AppUser.displayName` фигурирует в 5, 7, 10; `refresh.jti` в 3, 4, 7, 8, 9; `app.authenticate` в 6, 10.
- [x] **Deviations задокументированы:** JSON body вместо HttpOnly cookies, VK и CSRF вне скоупа.
- [x] **Коммиты атомарны:** каждый Task = один commit, TDD-порядок (fail → impl → pass).

## Execution Handoff

План в `docs/superpowers/plans/2026-04-18-04b-telegram-auth.md`.

Варианты исполнения:
1. **Subagent-Driven Development** (рекомендуется) — fresh subagent на таск + две стадии ревью.
2. **Inline execution** — пошагово в этой сессии, как делали Plan 4A.

Напиши, какой вариант — начнём Task 1.
