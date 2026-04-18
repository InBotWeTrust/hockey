# Plan 4A — Server Infrastructure Implementation Plan

> **Implementation note (2026-04-18):** Docker на локалке оказался недоступен —
> план свернул с `testcontainers` на живой Postgres/Redis через brew. Тестовый
> хелпер `test/helpers/testDb.ts` сбрасывает схему `DROP SCHEMA public CASCADE`
> и флашит логическую Redis DB 15 (`TEST_REDIS_URL=redis://localhost:6379/15`).
> CI поднимает те же две БД как GitHub Actions `services`. Нижеследующие Task 4
> и фрагменты Task 5/7/8/10, где упоминается `testcontainers`, реализованы в
> этом адаптированном виде. История коммитов ветки отражает финальный shape.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять Postgres и Redis в `@hockey/server`: docker-compose для dev, миграции со схемой спека §6.4, Fastify-плагины `db`/`redis`/`errors`, health-probe с реальными коннектами, тесты на реальной БД.

**Architecture:** SQL-миграции как plain-файлы в `packages/server/db/migrations/NNN_*.sql`; самодельный idempotent runner в одной транзакции с таблицей `_migrations`. Плагины Fastify декорируют инстанс (`app.pg: pg.Pool`, `app.redis: ioredis.Redis`), закрываются через `onClose` хуки. Тесты ходят в локальный Postgres/Redis (brew на dev, service-containers в CI); health-probe гоняет `SELECT 1` + `PING`.

**Tech Stack:** `pg` (node-postgres Pool) + `@types/pg`, `ioredis`, Fastify 4, vitest. Никаких ORM, никакого prisma.

---

## File Structure

Создаются:
- `docker-compose.dev.yml` — Postgres 16 + Redis 7 на стандартных портах
- `.env.example` — пример DATABASE_URL/REDIS_URL/LOG_LEVEL
- `packages/server/db/migrations/001_init.sql` — схема §6.4 + комментарий к Фазе 2
- `packages/server/src/db/pool.ts` — фабрика `createPool(url): Pool`
- `packages/server/src/db/migrations.ts` — pure `applyMigrations(pool, dir)` и чтение `.sql`
- `packages/server/src/db/migrate-cli.ts` — CLI-обёртка для `pnpm db:migrate`
- `packages/server/src/plugins/db.ts` — fastify-плагин, декорирует `app.pg`
- `packages/server/src/plugins/redis.ts` — fastify-плагин, декорирует `app.redis`
- `packages/server/src/plugins/errors.ts` — `setErrorHandler`, унифицированный JSON-формат
- `packages/server/test/helpers/testDb.ts` — testcontainers-хелперы (start/stop Postgres+Redis)
- `packages/server/test/db/migrations.test.ts`
- `packages/server/test/plugins/db.test.ts`
- `packages/server/test/plugins/redis.test.ts`
- `packages/server/test/plugins/errors.test.ts`

Изменяются:
- `packages/server/package.json` — deps `pg`, `ioredis`; devDeps `@types/pg`, `testcontainers`, `@testcontainers/postgresql`, `@testcontainers/redis`; scripts `db:migrate`
- `packages/server/src/config.ts` — добавить `DATABASE_URL`, `REDIS_URL` (обязательны в `production`, опциональны в `test`)
- `packages/server/src/app.ts` — регистрация `errors`, `db`, `redis` плагинов; опции `{ db?: false, redis?: false }` чтобы unit-тесты могли отключать
- `packages/server/src/routes/health.ts` — проба `SELECT 1` и `redis.ping()`; 503 при ошибке
- `packages/server/test/health.test.ts` — актуализировать под новую форму ответа
- `packages/server/vitest.config.ts` — `testTimeout: 60000` (testcontainers pull image)
- `.github/workflows/ci.yml` — проверить, что `docker` доступен на runner (он есть по умолчанию); добавить cache для ioredis/pg нет смысла
- `README.md` — раздел «Локальный Postgres/Redis»

---

## Задачи

### Task 1: Добавить зависимости и расширить config

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/config.ts`
- Create: `packages/server/test/config.test.ts`

- [ ] **Step 1: Написать падающий тест конфига**

`packages/server/test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires DATABASE_URL and REDIS_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow();
  });

  it('parses valid env', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/hockey',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(cfg.DATABASE_URL).toBe('postgres://u:p@localhost:5432/hockey');
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
    expect(cfg.PORT).toBe(3000);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts`
Expected: FAIL (URL-поля отсутствуют).

- [ ] **Step 3: Расширить config**

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
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}
```

- [ ] **Step 4: Добавить зависимости**

Edit `packages/server/package.json`:
```json
{
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "db:migrate": "tsx src/db/migrate-cli.ts"
  },
  "dependencies": {
    "@hockey/game-core": "workspace:*",
    "fastify": "^4.26.0",
    "fastify-plugin": "^4.5.1",
    "ioredis": "^5.4.1",
    "pg": "^8.11.5",
    "pino": "^8.19.0",
    "pino-pretty": "^11.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.9.0",
    "@testcontainers/redis": "^10.9.0",
    "@types/node": "^20.12.0",
    "@types/pg": "^8.11.5",
    "testcontainers": "^10.9.0",
    "tsx": "^4.7.1",
    "typescript": "^5.4.3",
    "vitest": "^1.4.0"
  }
}
```

Run: `pnpm install`
Expected: без ошибок, lockfile обновлён.

- [ ] **Step 5: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/config.test.ts`
Expected: PASS.

Также: существующий `test/health.test.ts` сейчас зовёт `buildApp()` без env — он упадёт, т.к. `DATABASE_URL` обязателен. Чинится в Task 9 (актуализация `/health`). Пока помечаем как known-fail.

- [ ] **Step 6: Коммит**

```bash
git add packages/server/package.json packages/server/src/config.ts packages/server/test/config.test.ts pnpm-lock.yaml
git commit -m "chore(server): add pg, ioredis, testcontainers; require DATABASE_URL/REDIS_URL"
```

---

### Task 2: docker-compose.dev.yml + .env.example

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.example`

- [ ] **Step 1: Создать `docker-compose.dev.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: hockey-postgres
    environment:
      POSTGRES_USER: hockey
      POSTGRES_PASSWORD: hockey
      POSTGRES_DB: hockey
    ports:
      - '5432:5432'
    volumes:
      - hockey-pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U hockey -d hockey']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: hockey-redis
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  hockey-pg:
```

- [ ] **Step 2: Создать `.env.example`**

```
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgres://hockey:hockey@localhost:5432/hockey
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3: Локальная проверка (smoke)**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```
Expected: оба сервиса `healthy` в течение ~15 секунд.

Остановить:
```bash
docker compose -f docker-compose.dev.yml down
```

- [ ] **Step 4: Коммит**

```bash
git add docker-compose.dev.yml .env.example
git commit -m "chore: add docker-compose dev stack (postgres 16 + redis 7)"
```

---

### Task 3: Миграция 001_init.sql

**Files:**
- Create: `packages/server/db/migrations/001_init.sql`

- [ ] **Step 1: Положить полную схему из спека §6.4**

`packages/server/db/migrations/001_init.sql`:
```sql
-- Users
create table users (
  id uuid primary key,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  level int not null default 1,
  xp int not null default 0
);

-- OAuth providers (TG + VK, both possible for one user)
create table auth_providers (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'vk')),
  provider_uid text not null,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

-- Wallet / energy
create table user_wallet (
  user_id uuid primary key references users(id) on delete cascade,
  shots_current int not null default 25,
  shots_max int not null default 25,
  shots_bonus int not null default 0,
  shots_updated_at timestamptz not null default now(),
  pucks bigint not null default 0,
  gold_pucks bigint not null default 0,
  medkit_until timestamptz,
  wheel_spins int not null default 2,
  training_energy int not null default 0
);

-- Persistent progress per boss
create table goalie_progress (
  user_id uuid references users(id) on delete cascade,
  goalie_id text not null,
  hp_left int not null,
  total_shots int not null default 0,
  total_goals int not null default 0,
  best_streak int not null default 0,
  current_streak int not null default 0,
  first_cleared_at timestamptz,
  primary key (user_id, goalie_id)
);

-- Duel sessions (source of truth for active duel)
create table duel_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  goalie_id text not null,
  seed text not null,
  shot_index int not null default 0,
  game_core_version int not null,
  status text not null check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  last_shot_at timestamptz,
  closed_at timestamptz
);
create index duel_sessions_user_active_idx
  on duel_sessions (user_id, status)
  where status = 'active';

-- Sticks
create table user_sticks (
  user_id uuid references users(id) on delete cascade,
  stick_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, stick_id)
);

create table user_equipment (
  user_id uuid primary key references users(id) on delete cascade,
  equipped_stick text not null default 'training'
);

-- Friends
create table user_friends (
  user_id uuid references users(id) on delete cascade,
  friend_user_id uuid references users(id) on delete cascade,
  source text not null check (source in ('invite', 'mutual')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id)
);

create table invite_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- Event log (audit / analytics / anti-cheat)
create table event_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index event_log_user_created_idx on event_log (user_id, created_at desc);
create index event_log_type_created_idx on event_log (type, created_at desc);
```

- [ ] **Step 2: Lint через psql (smoke)**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d postgres
docker exec -i hockey-postgres psql -U hockey -d hockey < packages/server/db/migrations/001_init.sql
docker exec hockey-postgres psql -U hockey -d hockey -c '\dt'
docker compose -f docker-compose.dev.yml down
```
Expected: список из 10 таблиц (`auth_providers`, `duel_sessions`, `event_log`, `goalie_progress`, `invite_codes`, `user_equipment`, `user_friends`, `user_sticks`, `user_wallet`, `users`).

- [ ] **Step 3: Коммит**

```bash
git add packages/server/db/migrations/001_init.sql
git commit -m "feat(server): initial DB schema (users, sessions, wallet, event log)"
```

---

### Task 4: testcontainers helper

**Files:**
- Create: `packages/server/test/helpers/testDb.ts`
- Modify: `packages/server/vitest.config.ts`

- [ ] **Step 1: Увеличить test timeout в vitest**

`packages/server/vitest.config.ts` (если файла нет — создать):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

- [ ] **Step 2: Написать хелпер `testDb.ts`**

`packages/server/test/helpers/testDb.ts`:
```ts
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestInfra {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  databaseUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
}

export async function startTestInfra(): Promise<TestInfra> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('hockey')
      .withUsername('hockey')
      .withPassword('hockey')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  return {
    postgres,
    redis,
    databaseUrl,
    redisUrl,
    async stop() {
      await Promise.all([postgres.stop(), redis.stop()]);
    },
  };
}
```

- [ ] **Step 3: Sanity-тест, что testcontainers поднимается**

`packages/server/test/helpers/testDb.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { startTestInfra, type TestInfra } from './testDb.js';

let infra: TestInfra;

describe('testcontainers bootstrap', () => {
  it('starts postgres and redis', async () => {
    infra = await startTestInfra();
    expect(infra.databaseUrl).toMatch(/^postgres:\/\//);
    expect(infra.redisUrl).toMatch(/^redis:\/\//);
  });

  afterAll(async () => {
    if (infra) await infra.stop();
  });
});
```

Run: `pnpm --filter @hockey/server test -- test/helpers/testDb.test.ts`
Expected: PASS (первый раз медленно — качает образы).

- [ ] **Step 4: Коммит**

```bash
git add packages/server/test/helpers/testDb.ts packages/server/test/helpers/testDb.test.ts packages/server/vitest.config.ts
git commit -m "test(server): testcontainers harness for postgres + redis"
```

---

### Task 5: pool + migrations runner

**Files:**
- Create: `packages/server/src/db/pool.ts`
- Create: `packages/server/src/db/migrations.ts`
- Create: `packages/server/test/db/migrations.test.ts`

- [ ] **Step 1: Падающий тест раннера миграций**

`packages/server/test/db/migrations.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { startTestInfra, type TestInfra } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

let infra: TestInfra;
let pool: Pool;

describe('applyMigrations', () => {
  beforeAll(async () => {
    infra = await startTestInfra();
    pool = new Pool({ connectionString: infra.databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
    await infra.stop();
  });

  it('applies pending migrations and is idempotent', async () => {
    const first = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(first.applied).toContain('001_init.sql');

    const second = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);

    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain('users');
    expect(names).toContain('duel_sessions');
    expect(names).toContain('event_log');
    expect(names).toContain('_migrations');
  });

  it('runs each migration in its own transaction', async () => {
    // _migrations записывается в той же транзакции, что и DDL
    const { rows } = await pool.query<{ name: string }>(
      'select name from _migrations order by name',
    );
    expect(rows.map((r) => r.name)).toEqual(['001_init.sql']);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/db/migrations.test.ts`
Expected: FAIL — `applyMigrations` и `pool.ts` не существуют.

- [ ] **Step 3: Реализовать `pool.ts`**

`packages/server/src/db/pool.ts`:
```ts
import { Pool, type PoolConfig } from 'pg';

export function createPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString, ...overrides });
}
```

- [ ] **Step 4: Реализовать `migrations.ts`**

`packages/server/src/db/migrations.ts`:
```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export interface MigrationResult {
  applied: string[];
}

const LEDGER_DDL = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

export async function applyMigrations(pool: Pool, dir: string): Promise<MigrationResult> {
  await pool.query(LEDGER_DDL);
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  const { rows } = await pool.query<{ name: string }>('select name from _migrations');
  const alreadyApplied = new Set(rows.map((r) => r.name));

  const applied: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  return { applied };
}
```

- [ ] **Step 5: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/db/migrations.test.ts`
Expected: PASS (оба кейса).

- [ ] **Step 6: Коммит**

```bash
git add packages/server/src/db/pool.ts packages/server/src/db/migrations.ts packages/server/test/db/migrations.test.ts
git commit -m "feat(server): sql migrations runner with transactional ledger"
```

---

### Task 6: CLI `db:migrate`

**Files:**
- Create: `packages/server/src/db/migrate-cli.ts`

- [ ] **Step 1: Написать CLI**

`packages/server/src/db/migrate-cli.ts`:
```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { applyMigrations } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const result = await applyMigrations(pool, MIGRATIONS_DIR);
    if (result.applied.length === 0) {
      console.log('[migrate] up to date');
    } else {
      console.log(`[migrate] applied: ${result.applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke против локального docker**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d postgres
DATABASE_URL=postgres://hockey:hockey@localhost:5432/hockey \
  REDIS_URL=redis://localhost:6379 \
  pnpm --filter @hockey/server db:migrate
```
Expected: `[migrate] applied: 001_init.sql`. Второй запуск: `[migrate] up to date`.

Остановить:
```bash
docker compose -f docker-compose.dev.yml down
```

- [ ] **Step 3: Коммит**

```bash
git add packages/server/src/db/migrate-cli.ts
git commit -m "feat(server): db:migrate cli command"
```

---

### Task 7: Fastify-плагин `db`

**Files:**
- Create: `packages/server/src/plugins/db.ts`
- Create: `packages/server/test/plugins/db.test.ts`

- [ ] **Step 1: Падающий тест плагина**

`packages/server/test/plugins/db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { dbPlugin } from '../../src/plugins/db.js';
import { startTestInfra, type TestInfra } from '../helpers/testDb.js';

let infra: TestInfra;
let app: FastifyInstance;

describe('dbPlugin', () => {
  beforeAll(async () => {
    infra = await startTestInfra();
    app = Fastify();
    await app.register(dbPlugin, { connectionString: infra.databaseUrl });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });

  it('decorates app with a working pg pool', async () => {
    const { rows } = await app.pg.query<{ one: number }>('select 1 as one');
    expect(rows[0]?.one).toBe(1);
  });

  it('closes pool on app shutdown', async () => {
    const app2 = Fastify();
    await app2.register(dbPlugin, { connectionString: infra.databaseUrl });
    await app2.ready();
    const closed = app2.pg;
    await app2.close();
    await expect(closed.query('select 1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/plugins/db.test.ts`
Expected: FAIL — `dbPlugin` не существует.

- [ ] **Step 3: Написать плагин**

`packages/server/src/plugins/db.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { createPool } from '../db/pool.js';

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
  }
}

export interface DbPluginOptions {
  connectionString: string;
}

const plugin: FastifyPluginAsync<DbPluginOptions> = async (app, opts) => {
  const pool = createPool(opts.connectionString);
  app.decorate('pg', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
};

export const dbPlugin = fp(plugin, { name: 'db' });
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/plugins/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/plugins/db.ts packages/server/test/plugins/db.test.ts
git commit -m "feat(server): fastify db plugin (pg pool decorator)"
```

---

### Task 8: Fastify-плагин `redis`

**Files:**
- Create: `packages/server/src/plugins/redis.ts`
- Create: `packages/server/test/plugins/redis.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/plugins/redis.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { redisPlugin } from '../../src/plugins/redis.js';
import { startTestInfra, type TestInfra } from '../helpers/testDb.js';

let infra: TestInfra;
let app: FastifyInstance;

describe('redisPlugin', () => {
  beforeAll(async () => {
    infra = await startTestInfra();
    app = Fastify();
    await app.register(redisPlugin, { url: infra.redisUrl });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });

  it('decorates app with a working redis client', async () => {
    expect(await app.redis.ping()).toBe('PONG');
    await app.redis.set('k', 'v');
    expect(await app.redis.get('k')).toBe('v');
  });

  it('disconnects on app shutdown', async () => {
    const app2 = Fastify();
    await app2.register(redisPlugin, { url: infra.redisUrl });
    await app2.ready();
    const r = app2.redis;
    await app2.close();
    expect(r.status).toMatch(/end|close|disconnecting/);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/plugins/redis.test.ts`
Expected: FAIL — `redisPlugin` не существует.

- [ ] **Step 3: Написать плагин**

`packages/server/src/plugins/redis.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import IORedis, { type Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export interface RedisPluginOptions {
  url: string;
}

const plugin: FastifyPluginAsync<RedisPluginOptions> = async (app, opts) => {
  const client = new IORedis(opts.url, { lazyConnect: false, maxRetriesPerRequest: 1 });
  app.decorate('redis', client);
  app.addHook('onClose', async () => {
    await client.quit();
  });
};

export const redisPlugin = fp(plugin, { name: 'redis' });
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/plugins/redis.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/plugins/redis.ts packages/server/test/plugins/redis.test.ts
git commit -m "feat(server): fastify redis plugin (ioredis decorator)"
```

---

### Task 9: Плагин `errors` — единый JSON-формат

**Files:**
- Create: `packages/server/src/plugins/errors.ts`
- Create: `packages/server/test/plugins/errors.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/server/test/plugins/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { errorsPlugin, AppError } from '../../src/plugins/errors.js';

describe('errorsPlugin', () => {
  it('returns uniform 4xx JSON for AppError', async () => {
    const app = Fastify();
    await app.register(errorsPlugin);
    app.get('/boom', async () => {
      throw new AppError('not_found', 'user not found', 404);
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'user not found' } });
  });

  it('masks unknown 5xx and logs original', async () => {
    const app = Fastify({ logger: false });
    await app.register(errorsPlugin);
    app.get('/boom', async () => {
      throw new Error('leaked secret value');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('leaked');
  });

  it('passes fastify validation errors through as 400', async () => {
    const app = Fastify();
    await app.register(errorsPlugin);
    app.post<{ Body: { name: string } }>(
      '/p',
      { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
      async (req) => ({ name: req.body.name }),
    );
    const res = await app.inject({ method: 'POST', url: '/p', payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('bad_request');
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @hockey/server test -- test/plugins/errors.test.ts`
Expected: FAIL — `errorsPlugin`, `AppError` не существуют.

- [ ] **Step 3: Написать плагин**

`packages/server/src/plugins/errors.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err.validation) {
      reply.status(400).send({ error: { code: 'bad_request', message: err.message } });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    reply.status(500).send({ error: { code: 'internal_error', message: 'internal error' } });
  });
};

export const errorsPlugin = fp(plugin, { name: 'errors' });
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/server test -- test/plugins/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/plugins/errors.ts packages/server/test/plugins/errors.test.ts
git commit -m "feat(server): unified error handler plugin"
```

---

### Task 10: `/health` с реальными пробами + интеграция в `buildApp`

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/health.ts`
- Modify: `packages/server/test/health.test.ts`

- [ ] **Step 1: Обновить `app.ts` — регистрация плагинов с опциями**

`packages/server/src/app.ts`:
```ts
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { errorsPlugin } from './plugins/errors.js';

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
  await app.register(healthRoutes);

  return app;
}
```

- [ ] **Step 2: Переписать `/health`**

`packages/server/src/routes/health.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify';
import { GAME_CORE_VERSION } from '@hockey/game-core';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    const checks = { db: false, redis: false };
    try {
      await app.pg.query('select 1');
      checks.db = true;
    } catch (err) {
      app.log.warn({ err }, 'health: db probe failed');
    }
    try {
      const pong = await app.redis.ping();
      checks.redis = pong === 'PONG';
    } catch (err) {
      app.log.warn({ err }, 'health: redis probe failed');
    }
    const ok = checks.db && checks.redis;
    reply.status(ok ? 200 : 503).send({
      ok,
      gameCoreVersion: GAME_CORE_VERSION,
      checks,
    });
  });
};
```

- [ ] **Step 3: Обновить тест `/health`**

`packages/server/test/health.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { startTestInfra, type TestInfra } from './helpers/testDb.js';
import { applyMigrations } from '../src/db/migrations.js';
import { createPool } from '../src/db/pool.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let infra: TestInfra;

describe('GET /health', () => {
  beforeAll(async () => {
    infra = await startTestInfra();
    const pool = createPool(infra.databaseUrl);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
  });

  afterAll(async () => {
    await infra.stop();
  });

  it('returns 200 when db and redis are up', async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: infra.databaseUrl,
        REDIS_URL: infra.redisUrl,
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        ok: boolean;
        gameCoreVersion: number;
        checks: { db: boolean; redis: boolean };
      };
      expect(body.ok).toBe(true);
      expect(body.checks).toEqual({ db: true, redis: true });
      expect(typeof body.gameCoreVersion).toBe('number');
    } finally {
      await app.close();
    }
  });

  it('returns 503 when redis is unreachable', async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: infra.databaseUrl,
        REDIS_URL: 'redis://127.0.0.1:1', // bogus port
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      const body = res.json() as { checks: { redis: boolean } };
      expect(body.checks.redis).toBe(false);
    } finally {
      await app.close();
    }
  });
});
```

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server test`
Expected: PASS на `health.test.ts` и всех предыдущих.

- [ ] **Step 5: Коммит**

```bash
git add packages/server/src/app.ts packages/server/src/routes/health.ts packages/server/test/health.test.ts
git commit -m "feat(server): /health probes pg+redis; integrate plugins in buildApp"
```

---

### Task 11: README + CI sanity

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Дописать в `README.md` раздел `### Local DB stack`**

После существующего раздела команд добавить:

```markdown
### Local DB stack

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @hockey/server db:migrate
pnpm dev:server
```

Остановить: `docker compose -f docker-compose.dev.yml down`. Удалить данные: `docker compose -f docker-compose.dev.yml down -v`.
```

- [ ] **Step 2: Убедиться, что CI прогоняет тесты с Docker**

GitHub Actions `ubuntu-latest` имеет Docker по умолчанию — testcontainers просто работает. Ничего не меняем, но добавим короткий комментарий в `.github/workflows/ci.yml` перед шагом `pnpm test`:

Найти в `.github/workflows/ci.yml` строку `- run: pnpm test` (джоб `build-and-test`). Добавить перед ней:
```yaml
      # testcontainers поднимает Postgres/Redis через хостовый docker
      - run: docker info
```

- [ ] **Step 3: Финальный прогон**

```bash
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @hockey/server build
```
Expected: всё зелёное.

- [ ] **Step 4: Коммит**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "docs: document local db stack; ci: sanity docker info step"
```

---

### Task 12: Push + PR

- [ ] **Step 1: Push ветки**

```bash
git push -u origin plan-4a-server-infra
```

- [ ] **Step 2: Открыть PR**

Title: `Plan 4A: server infrastructure (pg + redis + migrations + health)`

Body:
```markdown
## Summary
- Docker-compose dev-стек: Postgres 16 + Redis 7
- SQL-миграции как plain files + самодельный идемпотентный runner в транзакции
- Fastify-плагины `db` (pg.Pool), `redis` (ioredis), `errors` (единый JSON error handler)
- `/health` теперь выполняет `SELECT 1` и `PING`, отвечает 200/503
- testcontainers-харнесс для интеграционных тестов

## Scope fence
- Нет routes, нет auth, нет JWT, нет сессий поединков. Всё это — Plan 4B и 4C.

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test` — testcontainers запускает Postgres/Redis локально
- [x] `pnpm --filter @hockey/server build`
- [ ] Ручной smoke: `docker compose -f docker-compose.dev.yml up -d && pnpm --filter @hockey/server db:migrate && curl -s :3000/health | jq`
```

---

## Self-Review

**1. Spec coverage (§6.4, §6.5, §7.4):**
- §6.4 все 10 таблиц — Task 3 ✅
- §6.5 Redis — Task 8 поднимает клиент; конкретные ключи (`leaderboard:`, `session:`, `rl:shot:`, `user:*:wallet`, `refresh:`) используются в Plan 4B/4C.
- §7.4 Наблюдаемость: `/health` возвращает статус зависимостей ✅; метрики Prometheus и pino-HTTP логи — вне scope (Plan 4C).

**2. Placeholder scan:** чисто — все шаги с кодом содержат полный код.

**3. Type consistency:** `applyMigrations(pool, dir)` одинаково в Task 5, 6, 10; `AppError(code, message, status)` совпадает; декораторы `app.pg`/`app.redis` объявлены через `declare module 'fastify'` в Task 7/8, используются в Task 10.

**4. Риски:**
- Первый прогон тестов качает Postgres+Redis образы из Docker Hub → медленно (до минуты). В CI используется GHA cache для pnpm; образы в кэше не лежат. Учтено `testTimeout: 60000`.
- `ioredis` с `lazyConnect: false` пытается соединиться на старте → в Task 10 тест «503 when redis unreachable» сработает: `ping()` фейлится с ошибкой, плагин не падает, хендлер возвращает 503.
