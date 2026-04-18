# Ultimate Hockey

Мобильная хоккейная PWA-игра: тайминг-механика «поймай окно между вратарём и воротами», лестница боссов-вратарей, минимальная экипировка, соревновательный рейтинг.

## Структура

- `packages/game-core` — чистая TS-библиотека с детерминированным движком игры
- `packages/server` — Fastify бэкенд (Node.js 20)
- `packages/web` — React + Vite + PixiJS PWA клиент
- `docs/superpowers/specs` — дизайн-документы
- `docs/superpowers/plans` — имплементационные планы

## Быстрый старт

**Требования:** Node.js 20+, pnpm 9+. Docker опционален (нужен только для прод-сборки образов).

```bash
pnpm install
pnpm --filter @hockey/game-core build
pnpm typecheck
pnpm test              # unit-тесты; интеграционные скипаются без TEST_* env
pnpm dev:server        # http://localhost:3000/health
pnpm dev:web           # http://localhost:5173
```

## Local DB stack (macOS / Linux через brew)

Серверные интеграционные тесты и `pnpm dev:server` хотят живой Postgres 16 и Redis 7.

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# Один раз: создать роль и две БД
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql postgres -c "create role hockey with login password 'hockey_dev_password' createdb;"
psql postgres -c "create database hockey owner hockey;"
psql postgres -c "create database hockey_test owner hockey;"

cp .env.example .env
pnpm --filter @hockey/server db:migrate
pnpm dev:server
```

`.env` уже содержит `TEST_DATABASE_URL` и `TEST_REDIS_URL`, которые подхватывает
vitest через `packages/server/test/setup.ts`. Сбросить тестовую БД и Redis
помогут хелперы из `packages/server/test/helpers/testDb.ts`.

## Полный стек через Docker (опционально)

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
curl http://localhost:3000/health
```

## Команды

| Команда | Описание |
|---|---|
| `pnpm build` | Сборка всех пакетов |
| `pnpm test` | Прогон тестов во всех пакетах |
| `pnpm typecheck` | TypeScript проверка типов |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier auto-fix |
| `pnpm dev:server` | Dev-сервер `server` (watch) |
| `pnpm dev:web` | Dev-сервер `web` (vite) |

## Деплой

Main ветка деплоится автоматически в GitHub Actions (`.github/workflows/deploy.yml` — будет добавлен в Task 11 после подготовки VPS).

## Документация

- [MVP Design Spec](docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md) — полный дизайн-документ
- [Plan 1: Skeleton](docs/superpowers/plans/2026-04-12-01-skeleton.md) — скелет инфраструктуры
