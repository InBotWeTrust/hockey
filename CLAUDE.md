# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ultimate Hockey — мобильная хоккейная PWA в духе OVI Universe + Prison: тайминг-механика «поймай окно между движущимся вратарём и движущимися воротами», лестница боссов-вратарей, минимальная экипировка (клюшки), соревновательный рейтинг. Вход через Telegram Login Widget (VK OAuth отложен). Монетизация — Фаза 2.

Прод: https://hockey.inbotwetrust.ru, GHCR-образы `ghcr.io/inbotwetrust/hockey-server|web`. Деплой — только через GitHub Actions (`.github/workflows/deploy.yml`): CI билдит образы, пушит в GHCR, SSH-сессия на VPS делает `docker compose pull && up -d --force-recreate`. На VPS ничего не собирается.

Дизайн-спек: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`. Имплементационные планы: `docs/superpowers/plans/`. Spec на текущий рабочий подпроект 0+1 (базовая модель `shot_session` + дневная игра): `~/.claude/plans/1-1-async-dawn.md`. Выполнены 1–5 + подпроект 0+1: дневная игра 3×30 за 20 мин с серверными роутами `/duel/daily/*`. Roadmap (см. plan-файл): админка → сюжет → инвентарь → рейтинг → колесо → рефералка → чат → турниры. HP-модель удалена.

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

- **`@hockey/server`** — Fastify 4 + Node 20, ESM, TS `module: NodeNext`. `src/config.ts` — zod-валидация env (включая `DAILY_SEED_SECRET` для дневных сессий). `src/app.ts` строит инстанс через плагины (`plugins/{db,redis,errors,auth}.ts`). `routes/`: `health.ts`, `me.ts` (`GET /me` + `PATCH /me`), `auth.ts` (`/auth/telegram|refresh|logout|dev` — последний при `NODE_ENV !== 'production'`). `src/duel/daily/`: `reconcile.ts` (lazy state-machine), `routes.ts` (`/duel/daily/state`, `/period/start`, `/shot`). `src/duel/seed.ts` — серверный `deriveDailySeed`; `deriveShotSeed` живёт в `@hockey/game-core` (общий клиент-сервер). Миграции — raw SQL в `db/migrations/NNN_*.sql`, runner в `src/db/migrations.ts`, CLI — `pnpm db:migrate`. Тесты через `app.inject()`. **Postgres `DATE`-колонки** парсятся как string через override в `src/db/pool.ts` (default `Date` ломал сравнения с `to_char()`-результатом).

- **`@hockey/web`** — React 18 + Vite 5 + TS, PixiJS 8, Zustand (`auth/authStore.ts` с persist, `stores/dailyStore.ts` для дневной игры — без persist, синхронизуется с сервером), TanStack Query. `api/duel.ts` — типы и обёртки `fetchDailyState/startDailyPeriod/submitDailyShot`. `game/PixiStage.tsx` скейлит RINK (**572×700**) под viewport. `game/renderer/{Goal,Goalie,Player,Puck,Hitboxes}.ts` — Pixi-обёртки. UI через `app/design-system.css`. `screens/`: `LoginScreen`, `DailyScreen` (новый — view-switcher по daily state: idle/period_active/break_active/closed), `ProfileScreen`. Vite dev прокси `/api → :3000`. Тесты — Testing Library + vitest + jsdom.

### Ключевой инвариант: гибридная симуляция

`game-core` шерится между клиентом и сервером. Клиент симулирует бросок локально для мгновенной отрисовки, сервер параллельно симулирует на том же seed и валидирует. Отсюда **жёсткие правила** для всего что попадает в `game-core`:

1. Никакого `Math.random()` — только `createRng(seed)`.
2. Никакого `Date.now()` — время всегда параметр.
3. Никаких таймеров (`setTimeout`, `requestAnimationFrame`) — это рендер в `web`.
4. Только чистые функции `(state, input) → newState`.
5. `GAME_CORE_VERSION` фиксируется на старте серверной сессии поединка. При расхождении версий — доигрываем на старой либо отбрасываем, никогда не валидируем по новой. Любое изменение детерминированного результата — бамп версии + обновление `test/version.test.ts`.

При расхождении client/server результата — сервер 409, клиент откат визуала. Один мисматч — не чит, N+ от одного игрока → флаг в `event_log`. Логика goal/save/miss живёт **только** в `game-core`.

### Модель поединка: дневная игра + сюжет (один `shot_session`, два режима)

**Дневная игра** — основной геймплей: 3 периода × 30 бросков, 20 мин на период, 15 мин перерыв. Жёсткий серверный таймер. В 00:00 локального времени юзера (`users.timezone`, set-once при первом логине) день обрывается, новый стартует чистым. Серверная логика — **lazy state-machine** в `src/duel/daily/reconcile.ts`: `idle → period_active → (quota|timeout) → break_active → idle → ... → closed`. На каждый запрос reconcile пересчитывает состояние из timestamp'ов, никаких cron'ов.

**БД**: `users.timezone`, `users.lifetime_shots_total/goals_total` (денормализация для рейтинга, инкрементируется при INSERT в `period_log`); `day_pool` (один открытый на юзера через partial unique index); `period_log` (архив завершённых периодов с `closed_reason ∈ quota|timeout|day_end`); `shot_session` (один ряд на бросок, `mode ∈ daily|story` — общая абстракция для обоих режимов, схема story будет в подпроекте 3).

**Анти-чит**: клиент симулирует и рендерит мгновенно (через `@hockey/game-core` + `daily_seed` от сервера + `deriveShotSeed(seed, period, shotIndex)`), параллельно шлёт `POST /duel/daily/shot` с `claimed_result`. Сервер симулирует тем же seed, при расхождении пишет `event_log {type: 'shot_mismatch'}` (без блокировки в MVP). `claimed_shot_index ≠ server count + 1` → 409. `users.timezone` иммутабельна.

**Сюжет** — отдельная вкладка (5 вратарей × ~3 задания, 3 попытки/день, не пересекается с дневной квотой). Серверные роуты — отдельный подпроект.

### Чат (PR 1+2 — БД + REST готовы; PR 3 — realtime; PR 4 — web MVP)

Внутренний мессенджер: DM, системные каналы (`pnpm chat:seed "<name>"` + `SYSTEM_USER_ID` env), задел под чаты команд/турниров (`chats.entity_type/entity_id`). Таблицы: `chats`, `chat_members`, `messages`, `message_reactions` (миграция `004_chat.sql`). RLS нет — проверки в `chat/guards.ts` (`assertCanAccessChat`, `assertOwnsMessage`). Сервис `chat/service.ts`: `getMyChats` (LATERAL JOIN, без N+1), `findOrCreateDM` (advisory lock на пару), `getMessages` (before-cursor + батч-реакции), `sendMessage`/`deleteMessage` (soft, `content=''`)/`markChatAsRead` (lazy upsert), `searchUsers` (pg_trgm), `searchMessages` (tsvector russian), `getUnreadCounts`. REST под `/chat/*`: list, dm, users, messages (GET/POST/DELETE), read, search, unread. Rate-limit 5 msg/sec, unread-кеш Redis 10s. Realtime (WebSocket + Redis pub/sub) — PR 3. Web MVP (PR 4) — `/chat`, `/chat/new`, `/chat/:chatId` под `<PrivateRoute>`; TanStack Query (`chatKeys.{list,messages,users,unread}`), бейдж в BottomNav из `chatStore.totalUnread` через `GET /chat/unread`; без realtime — PR 5 добавит `ChatSocket`. Спек: `docs/superpowers/specs/2026-04-26-internal-chat-design.md`.

### Auth (Telegram)

`POST /auth/telegram` принимает payload виджета, валидирует HMAC через `TELEGRAM_BOT_TOKEN`, возвращает `{accessToken, refreshToken, user}`. Access JWT (15 мин) подписан `JWT_SECRET`. Refresh JWT (30 дней) подписан `REFRESH_SECRET`, ротация — `POST /auth/refresh` (атомарный `GETDEL` в Redis по jti: старый токен становится невалидным). `POST /auth/logout` отзывает refresh. Access JWT blocklist пока нет — access живёт до exp.

Web: `auth/authStore.ts` (Zustand persist), `api/apiFetch.ts` (fetch wrapper с Bearer, 401 → single refresh-retry через in-flight promise), `auth/TelegramLoginButton.tsx` (динамически монтирует `<script>` виджета с колбэком через `useId()`). Dev-кнопка в `LoginScreen` зовёт `POST /auth/dev` и получает настоящие JWT — не подставляй фейковые токены в `authStore`, иначе middleware сервера их отвергнет. `VITE_TELEGRAM_BOT_USERNAME` — build-time переменная Vite, для прода запекается в бандл через Docker build-arg (GitHub Actions var `VITE_TELEGRAM_BOT_USERNAME`). BotFather `/setdomain` для прод-виджета — ручной шаг вне автоматизации.

### Grip и спрайты

`user.grip` (`'left' | 'right'`) живёт в `authStore.user` и в БД (колонка `users.grip`). `ProfileScreen` меняет через `PATCH /me` + оптимистичный `updateUser`. `DailyScreen` читает grip один раз при mount и передаёт в `new Player(grip)` и `new Puck(grip)`. Спрайты `lefthand/righthand.webp` top-down, 1024×1024, якорь `(0.5, 0.5)`; положение шайбы относительно тела задаёт `BLADE_OFFSET[grip]` в `packages/web/src/game/renderer/Puck.ts`. Shooter body двигается в одинаковом диапазоне (`SHOOTER_MIN_X/MAX_X`) независимо от хвата.

**Pixi 8 quirk:** `Sprite.from(url)` для webp может вернуть спрайт с пустой текстурой, которая никогда не привязывается — всегда загружай через `Assets.load<Texture>(url).then(tex => sprite.texture = tex)` (пример: `Player.ts`). Симптом — `console.log(sprite.texture.valid) === false` и пустой bounding box на сцене.

### TypeScript strictness

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Последний тонкий — нельзя `foo: T | undefined` в типах, только `foo?: T`. Это ловит Fastify logger options: вместо условного `transport: devOnly ? {...} : undefined` строй весь объект условно (см. `packages/server/src/app.ts`).

Fastify generic `FastifyInstance` резолвится к union http/http2/https и не совпадает с возвратом `Fastify({...})`. Не аннотируй возвращаемый тип у `buildApp()` — пусть TS выводит.

### CI/CD

`.github/workflows/ci.yml` — два джоба:
1. `build-and-test` — pnpm install → typecheck → lint → `game-core build` → остальные сборки → test (с postgres+redis services).
2. `docker-build` — билдит оба Dockerfile через buildx с GHA cache, не пушит.

`.github/workflows/deploy.yml` (только на push в `main`):
1. Билд образов с тегами `sha-<short>` и `latest`, пуш в GHCR. Web билд получает `VITE_TELEGRAM_BOT_USERNAME` через `build-args` из repo variable.
2. SSH на VPS → `scp docker-compose.yml Caddyfile` → внутри heredoc'а: `docker login` (с retry), `docker compose pull` (с retry), `docker compose run --rm -T server ... migrate-cli.js < /dev/null`, `docker compose up -d --force-recreate --remove-orphans server web caddy < /dev/null`, `image prune`. **`-T < /dev/null` обязательны на обеих compose-командах** — без них `docker compose run` наследует stdin родителя (= сам heredoc), глотает остаток скрипта, и `up --force-recreate` молча не выполняется. Прод тогда зависает на старом IMAGE_TAG, а Actions репортит success (smoke-тест бьёт уже живой старый сервер). Корректное поведение PR #22; не убирай редиректы.
3. Smoke test `GET /api/health` с 5 retries. Если валится — вся ветка деплоя красная.

Concurrency: `group: deploy-prod, cancel-in-progress: false` — новый пуш ждёт текущий деплой.

## Language

Коммуникация с пользователем — на русском. Код, коммит-сообщения, комментарии, идентификаторы — на английском. UI-тексты — на русском.

## Doc links

- Спек MVP: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`
- Планы: `docs/superpowers/plans/`
- README — краткая инструкция по запуску и API auth
