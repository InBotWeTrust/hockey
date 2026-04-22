# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ultimate Hockey — мобильная хоккейная PWA в духе OVI Universe + Prison: тайминг-механика «поймай окно между движущимся вратарём и движущимися воротами», лестница боссов-вратарей, минимальная экипировка (клюшки), соревновательный рейтинг. Вход через Telegram Login Widget (VK OAuth отложен). Монетизация — Фаза 2.

Прод: https://hockey.inbotwetrust.ru, GHCR-образы `ghcr.io/inbotwetrust/hockey-server|web`. Деплой — только через GitHub Actions (`.github/workflows/deploy.yml`): CI билдит образы, пушит в GHCR, SSH-сессия на VPS делает `docker compose pull && up -d`. На VPS ничего не собирается.

Дизайн-спек: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`. Имплементационные планы: `docs/superpowers/plans/`. Выполнены 1 (skeleton), 2 (game-core), 3 (playable prototype), 4A (server infra), 4B (Telegram auth), 5 (web login).

## Commands

Workspace — **pnpm** (`engines.pnpm >=9`, работает и на pnpm 10). Node 20+. Запуск из корня.

```bash
pnpm install                                   # установка всего monorepo
pnpm typecheck                                 # tsc --noEmit во всех пакетах
pnpm lint                                      # eslint по src всех пакетов
pnpm test                                      # vitest run во всех пакетах
pnpm build                                     # сборка всех пакетов
pnpm format                                    # prettier --write

pnpm dev:server                                # Fastify на :3000
pnpm dev:web                                   # Vite на :5173 (прокси /api → :3000)

pnpm --filter @hockey/game-core build          # ОБЯЗАТЕЛЬНО перед тестами server
pnpm --filter @hockey/server db:migrate        # накатить миграции из db/migrations/
pnpm --filter @hockey/server test              # vitest, интеграционные хотят TEST_* env
pnpm --filter @hockey/web test                 # vitest + jsdom

# Одиночный тест
pnpm --filter @hockey/game-core test -- test/goalie/simulate.test.ts
pnpm --filter @hockey/web test -- -t "renders the game title"
```

**Критично:** `@hockey/server` импортит `@hockey/game-core` через package.json `main: ./dist/index.js`. Без `dist/` — резолв падает. Всегда `pnpm --filter @hockey/game-core build` после правок в game-core перед тестами/dev-серверами server или web. В Docker это закрыто тем что `Dockerfile` каждого пакета билдит game-core первым стейджем.

## Local infra (macOS/Linux через brew)

Серверные интеграционные тесты и `pnpm dev:server` требуют Postgres 16 + Redis 7.

```bash
brew install postgresql@16 redis
brew services start postgresql@16 && brew services start redis
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql postgres -c "create role hockey with login password 'hockey_dev_password' createdb;"
psql postgres -c "create database hockey owner hockey;"
psql postgres -c "create database hockey_test owner hockey;"

cp .env.example .env                           # VITE_TELEGRAM_BOT_USERNAME + TELEGRAM_BOT_TOKEN обязательны
pnpm --filter @hockey/server db:migrate
```

`.env` подхватывается vitest через `packages/server/test/setup.ts`. Полный стек через Docker — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`.

## Architecture

### Монорепо: три пакета

pnpm workspaces, `packages/*`, TS project references (`composite: true`):

- **`@hockey/game-core`** — pure TS без браузерных/Node-зависимостей. Детерминированный движок: PRNG (`rng.ts` на seedrandom), координаты катка (`rink.ts`), `goalie/` (4 паттерна: linear/sine/dash/feint + `simulateGoalie`), `shot/` (`computeTrajectory` + `resolveShot`), `balance/` (10 боссов, 4 клюшки, формулы наград). Экспорт-фасад — `src/index.ts`. `GAME_CORE_VERSION` в `version.ts` — инт, бампится при любом изменении детерминированного поведения.

- **`@hockey/server`** — Fastify 4 + Node 20, ESM, TS `module: NodeNext`. `src/config.ts` — zod-валидация env. `src/app.ts` строит инстанс через плагины (`plugins/{db,redis,errors,auth}.ts`). `routes/`: `health.ts` (probe pg+redis), `me.ts` (требует auth), `auth.ts` (`POST /auth/telegram`, `POST /auth/refresh`, `POST /auth/logout`). Миграции — raw SQL в `db/migrations/NNN_*.sql`, runner в `src/db/migrations.ts`, CLI — `pnpm db:migrate`. Тесты через `app.inject()`, реальный listen только в `index.ts`.

- **`@hockey/web`** — React 18 + Vite 5 + TS, PixiJS 8 для игровой сцены, Zustand для стейта (`stores/trainingStore.ts`, `auth/authStore.ts` с persist → `localStorage['hockey.auth']`), TanStack Query для мутаций. `game/PixiStage.tsx` скейлит RINK (390×700) под viewport. `app/App.tsx` — роутер с `PrivateRoute` guard, `AppHeader` с logout. `screens/`: `LoginScreen`, `GoalieListScreen`, `DuelScreen`. Vite dev прокси `/api → :3000` (срезает `/api`). Тесты — Testing Library + vitest + jsdom; `test-setup.ts` содержит `MemoryStorage` shim (Node 25 ломает jsdom localStorage).

### Ключевой инвариант: гибридная симуляция

`game-core` шерится между клиентом и сервером. Клиент симулирует бросок локально для мгновенной отрисовки, сервер параллельно симулирует на том же seed и валидирует. Отсюда **жёсткие правила** для всего что попадает в `game-core`:

1. Никакого `Math.random()` — только `createRng(seed)`.
2. Никакого `Date.now()` — время всегда параметр.
3. Никаких таймеров (`setTimeout`, `requestAnimationFrame`) — это рендер в `web`.
4. Только чистые функции `(state, input) → newState`.
5. `GAME_CORE_VERSION` фиксируется на старте серверной сессии поединка. При расхождении версий — доигрываем на старой либо отбрасываем, никогда не валидируем по новой. Любое изменение детерминированного результата — бамп версии + обновление `test/version.test.ts`.

При расхождении client/server результата — сервер 409, клиент откат визуала. Один мисматч — не чит, N+ от одного игрока → флаг в `event_log`. Логика goal/save/miss живёт **только** в `game-core`.

### Модель поединка (ещё не имплементирована на сервере)

Не «серия из 5 бросков», а **открытый поединок с персистентным HP вратаря**. Зашёл → бросаешь → можешь выйти, HP сохраняется. Энергия списывается за бросок, не за серию. Стрик голов = множитель награды, выход сбрасывает стрик но не HP. Постгрес — истина, Redis — кэш TTL 2ч. Сервер держит `shot_index` и валидирует совпадение с клиентским каждым запросом (защита от гонок). Сервер-роутов `/duel/*` пока нет — это следующий план.

### Auth (Telegram)

`POST /auth/telegram` принимает payload виджета, валидирует HMAC через `TELEGRAM_BOT_TOKEN`, возвращает `{accessToken, refreshToken, user}`. Access JWT (15 мин) подписан `JWT_SECRET`. Refresh JWT (30 дней) подписан `REFRESH_SECRET`, ротация — `POST /auth/refresh` (атомарный `GETDEL` в Redis по jti: старый токен становится невалидным). `POST /auth/logout` отзывает refresh. Access JWT blocklist пока нет — access живёт до exp.

Web: `auth/authStore.ts` (Zustand persist), `api/apiFetch.ts` (fetch wrapper с Bearer, 401 → single refresh-retry через in-flight promise), `auth/TelegramLoginButton.tsx` (динамически монтирует `<script>` виджета с колбэком через `useId()`). `VITE_TELEGRAM_BOT_USERNAME` — build-time переменная Vite, для прода запекается в бандл через Docker build-arg (GitHub Actions var `VITE_TELEGRAM_BOT_USERNAME`). BotFather `/setdomain` для прод-виджета — ручной шаг вне автоматизации.

### TypeScript strictness

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Последний тонкий — нельзя `foo: T | undefined` в типах, только `foo?: T`. Это ловит Fastify logger options: вместо условного `transport: devOnly ? {...} : undefined` строй весь объект условно (см. `packages/server/src/app.ts`).

Fastify generic `FastifyInstance` резолвится к union http/http2/https и не совпадает с возвратом `Fastify({...})`. Не аннотируй возвращаемый тип у `buildApp()` — пусть TS выводит.

### CI/CD

`.github/workflows/ci.yml` — два джоба:
1. `build-and-test` — pnpm install → typecheck → lint → `game-core build` → остальные сборки → test (с postgres+redis services).
2. `docker-build` — билдит оба Dockerfile через buildx с GHA cache, не пушит.

`.github/workflows/deploy.yml` (только на push в `main`):
1. Билд образов с тегами `sha-<short>` и `latest`, пуш в GHCR. Web билд получает `VITE_TELEGRAM_BOT_USERNAME` через `build-args` из repo variable.
2. SSH на VPS → `scp docker-compose.yml Caddyfile` → `docker compose pull && up -d --remove-orphans && image prune`.
3. Smoke test `GET /api/health` с 5 retries. Если валится — вся ветка деплоя красная.

Concurrency: `group: deploy-prod, cancel-in-progress: false` — новый пуш ждёт текущий деплой.

## Language

Коммуникация с пользователем — на русском. Код, коммит-сообщения, комментарии, идентификаторы — на английском. UI-тексты — на русском.

## Doc links

- Спек MVP: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`
- Планы: `docs/superpowers/plans/`
- README — краткая инструкция по запуску и API auth
