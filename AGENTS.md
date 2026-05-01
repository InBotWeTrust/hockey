# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

Ultimate Hockey — мобильная хоккейная PWA в духе OVI Universe + Prison: тайминг-механика «поймай окно между движущимся вратарём и движущимися воротами», три уровня игры (начальный, любители, профессионалы), расходуемый инвентарь, дуэли/турниры и соревновательные рейтинги. Вход через Telegram Login Widget (VK OAuth отложен). Монетизация — через внутреннюю валюту + ЮKassa.

Прод: https://hockey.inbotwetrust.ru, GHCR-образы `ghcr.io/inbotwetrust/hockey-server|web`. Деплой — только через GitHub Actions (`.github/workflows/deploy.yml`): CI билдит образы, пушит в GHCR, SSH-сессия на VPS делает `docker compose pull && up -d --force-recreate`. На VPS ничего не собирается.

Дизайн-спек: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`. Имплементационные планы: `docs/superpowers/plans/`. Spec на текущий рабочий подпроект 0+1 (базовая модель `shot_session` + дневная игра): `~/.claude/plans/1-1-async-dawn.md`. Roadmap (см. plan-файл): уровни игры → тренировка → инвентарь/внутренняя валюта → любительские дуэли/турниры → рейтинги → про-раздел → офлайн-режим (resilience + read-only PWA-кеш для профиля/чата/daily-state, без офлайн-геймплея). Сюжет/прохождение вратарей, HP-модель и колесо удачи удалены из плана.

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

### Модель поединка: дневная игра + будущие режимы (один `shot_session`)

**Дневная игра** — основной геймплей: 3 периода × 30 бросков, 20 мин на период, 15 мин перерыв. Жёсткий серверный таймер. В 00:00 локального времени юзера (`users.timezone`, set-once при первом логине) день обрывается, новый стартует чистым. Серверная логика — **lazy state-machine** в `src/duel/daily/reconcile.ts`: `idle → period_active → (quota|timeout) → break_active → idle → ... → closed`. На каждый запрос reconcile пересчитывает состояние из timestamp'ов, никаких cron'ов.

**БД**: `users.timezone`, `users.lifetime_shots_total/goals_total` (денормализация для рейтинга, инкрементируется при INSERT в `period_log`); `day_pool` (один открытый на юзера через partial unique index); `period_log` (архив завершённых периодов с `closed_reason ∈ quota|timeout|day_end`); `shot_session` (один ряд на бросок; текущая схема ещё содержит legacy `mode='story'`, но сюжет/прохождение вратарей удалены из roadmap — новые режимы должны переиспользовать/мигрировать эту абстракцию под training/amateur/pro).

**Анти-чит**: клиент симулирует и рендерит мгновенно (через `@hockey/game-core` + `daily_seed` от сервера + `deriveShotSeed(seed, period, shotIndex)`), параллельно шлёт `POST /duel/daily/shot` с `claimed_result`. Сервер симулирует тем же seed, при расхождении пишет `event_log {type: 'shot_mismatch'}` (без блокировки в MVP). `claimed_shot_index ≠ server count + 1` → 409. `users.timezone` иммутабельна.

**Новые режимы** — начальный уровень получает тренировку 50 бросков раз в 24 часа с выбором модели периода 1/2/3. Любители открываются после 1000 голов в дневной игре начального уровня и добавляют асинхронные дуэли 1 на 1, индивидуальные турниры и расходуемый инвентарь. Профессионалы пока закрытый раздел-заглушка.

### Чат

Внутренний мессенджер: DM, системные каналы (`pnpm chat:seed "<name>"` + `SYSTEM_USER_ID` env), задел под чаты команд/турниров (`chats.entity_type/entity_id`). Базовый спек: `docs/superpowers/specs/2026-04-26-internal-chat-design.md`.

**Схема.** Таблицы: `chats` (`type ∈ direct|group|system`, `description`), `chat_members` (PK `(chat_id, user_id)`, `last_read_at`, `pinned_at`), `messages` (soft-delete: `is_deleted=true, content=''`; `tsvector` russian для поиска), `message_reactions` (UNIQUE `(message_id, user_id)` — одна реакция на юзера, миграция 005 ужесточает). RLS нет — проверки в `chat/guards.ts` (`assertCanAccessChat`/`assertOwnsMessage`).

**REST (`chat/routes.ts`).** `GET /chat/list`, `POST /chat/dm`, `GET /chat/users` (pg_trgm), `GET/POST/DELETE /chat/:id/messages` (cursor: `before` / `after` / `around=<uuid>&radius=25` — mutually exclusive, zod 400, 404 на удалённый анкор), `POST /chat/:id/read`, `GET /chat/search` (tsvector), `GET /chat/unread` (Redis-кеш 10s), `POST/DELETE /chat/:id/pin` (max 3 на юзера, system auto-pin при создании юзера), `POST/DELETE /chat/messages/:id/reactions` (zod-enum 24-эмодзи whitelist; web `EMOJI_WHITELIST` снапшотится против серверного), `GET /chat/:id/info` (имя+описание+участники, cap 100), `GET /users/:id` (публичный профиль). Rate-limit 5 msg/sec.

**Сервис (`chat/service.ts`).** `getMyChats` — один запрос с LATERAL JOIN'ами (last message, unread count, member count, pinned), без N+1. `dmCounterpart` отдельным batch-запросом по DM-парам, отдаёт `{userId, displayName, avatarUrl, lastSeenAt}`. `findOrCreateDM` — advisory lock на пару user'ов. `addReaction` — DELETE prev → INSERT ON CONFLICT.

**Realtime.** `@fastify/websocket` на `GET /chat/ws?token=<accessJWT>` + `plugins/realtime.ts` (один общий ioredis sub-клиент + локальный роутер handler-ов). Сокет subscribe-ит на `chat:user:<userId>` и каждый активный `chat:system:<chatId>`. Publish из `chat/events.ts`: DM/group fan-out по `chat_members`, system — один broadcast (best-effort, swallow). Кадры `{v:1,event:ChatEvent}`, heartbeat ping/pong 30s/10s, close 4401 на ауте/4408 на heartbeat lost. **`connection:ready`** отправляется ровно после всех SUBSCRIBE — клиент не публикует, пока не получил его (закрывает race с пропавшими WS-кадрами).

**Web.** `chatKeys.{list,messages,info,users,unread,profile}` — single source of truth. `useChatSocket` держит один WS на сессию: exponential-backoff reconnect 1s → 30s, на 4401 — refresh access JWT через in-flight promise и повторное подключение, на 4408 — реконнект. `applyEvent` точечно патчит cache (`message:new` дедуп по id, `message:deleted` → `is_deleted=true, content=''`, `reaction:*` через `applyReactionEventToMessage` с дедуп по `event.userId === meId`). `MessageActionsMenu` (portal, clamp 12px) на long-press 500ms — reply/delete + 6 favorite emoji + ⊕ → `ReactionPicker` 3×8. Список чатов: глобальный поиск с дебаунсом 300ms через `SearchResultsDropdown`; тап результата → `/chat/:id?goto=<msgId>`, ChatRoomScreen грузит around-страницу + `chat-bubble--flash`. DM-шапка показывает avatar + display name + `formatLastSeen` (см. ниже). Кликабельная аватарка/имя автора в group/system bubble открывает `UserProfileSheet` с кнопкой «Написать в личку» (`POST /chat/dm`).

**WS race-conditions, на которых горели** (берегите фиксы, легко регрессировать):
1. **Race subscribe vs publish** — клиент шлёт `connection:ready`, на 'open' ничего не отправляет (#48).
2. **WS-message пропадает при холодной загрузке** — если первый `fetchMessages` ещё в полёте, `applyMessageNew` пишет shell `{pages:[[msg]]}`, который TanStack потом перезатирает; вместо этого триггерим `invalidateQueries` (`useChatSocket.applyMessageNew`, #55).
3. **Двойная отправка по тапу** — `disabled` пропом обновляется через React, между двумя тапами успевает только один render → sync-ref guard в composer (#47).

### Auth (Telegram)

`POST /auth/telegram` принимает payload виджета, валидирует HMAC через `TELEGRAM_BOT_TOKEN`, возвращает `{accessToken, refreshToken, user}`. Access JWT (15 мин) подписан `JWT_SECRET`. Refresh JWT (30 дней) подписан `REFRESH_SECRET`, ротация — `POST /auth/refresh` (атомарный `GETDEL` в Redis по jti: старый токен становится невалидным). `POST /auth/logout` отзывает refresh. Access JWT blocklist пока нет — access живёт до exp.

Web: `auth/authStore.ts` (Zustand persist), `api/apiFetch.ts` (fetch wrapper с Bearer, 401 → single refresh-retry через in-flight promise), `auth/TelegramLoginButton.tsx` (динамически монтирует `<script>` виджета с колбэком через `useId()`). Dev-кнопка в `LoginScreen` зовёт `POST /auth/dev` и получает настоящие JWT — не подставляй фейковые токены в `authStore`, иначе middleware сервера их отвергнет. `VITE_TELEGRAM_BOT_USERNAME` — build-time переменная Vite, для прода запекается в бандл через Docker build-arg (GitHub Actions var `VITE_TELEGRAM_BOT_USERNAME`). BotFather `/setdomain` для прод-виджета — ручной шаг вне автоматизации.

### Presence (last_seen)

`users.last_seen_at` обновляется через `plugins/lastSeen.ts`: на каждом authenticated HTTP-запросе через `onResponse`-хук + nudge при WS-connect (idle WS-сессия не должна терять presence). Throttle через Redis (`SET last_seen:<userId> 1 EX 60 NX`) — максимум 1 UPDATE в минуту на юзера. DTO: `dmCounterpart.lastSeenAt` и `UserPublicProfileDTO.lastSeenAt`. Web: `chat/lastSeen.ts` — `formatLastSeen(iso, now)` Telegram-style (`в сети` < 2 мин → `был N минут назад` < 60 мин → сегодня/вчера/день недели/абсолютная дата); null/невалидный ISO → `LAST_SEEN_FALLBACK = 'был(а) давно'` (всегда возвращает строку — no conditional rendering на call-сайтах).

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
