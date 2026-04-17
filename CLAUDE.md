# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ultimate Hockey — мобильная хоккейная PWA в духе OVI Universe + Prison: тайминг-механика «поймай окно между движущимся вратарём и движущимися воротами», лестница боссов-вратарей, минимальная экипировка (клюшки), соревновательный рейтинг. Вход через Telegram Login Widget + VK OAuth. Монетизация отложена до Фазы 2.

Подробный дизайн: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`.
Дорожная карта реализации: `docs/superpowers/plans/`. Текущее состояние репо — Plan 1 (скелет) выполнен локально; Task 11 (деплой на VPS) ждёт готовности инфраструктуры.

## Commands

Workspace использует **pnpm** (объявлено `engines.pnpm >=9`, фактически работает и с pnpm 10). Node.js 20+. Все команды запускаются из корня.

```bash
pnpm install                                   # установка всего monorepo
pnpm typecheck                                 # tsc --noEmit во всех пакетах
pnpm lint                                      # eslint по src всех пакетов
pnpm test                                      # vitest run во всех пакетах
pnpm build                                     # сборка всех пакетов
pnpm format                                    # prettier --write

# Dev-серверы
pnpm dev:server                                # Fastify на :3000
pnpm dev:web                                   # Vite на :5173 (прокси /api → :3000)

# Точечные команды
pnpm --filter @hockey/game-core build          # обязательно ПЕРЕД тестами server
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
pnpm --filter @hockey/game-core test -- test/version.test.ts  # один файл
pnpm --filter @hockey/web test -- -t "renders the game title" # один тест по имени
```

**Важно:** `@hockey/server` импортит из `@hockey/game-core` через package.json `main: ./dist/index.js`. Если `dist` отсутствует — тесты и dev server упадут на разрешении модуля. Всегда делай `pnpm --filter @hockey/game-core build` после изменений в `game-core` перед запуском зависимых пакетов. То же касается Docker: `packages/server/Dockerfile` билдит `game-core` первым стейджем.

## Architecture

### Монорепо и три пакета

pnpm workspaces, `packages/*`:

- **`@hockey/game-core`** — pure TypeScript библиотека без зависимостей от браузера или Node. Содержит детерминированный движок игры: PRNG, движение вратаря, разрешение броска, каталог боссов, формулы наград. Сейчас только `version.ts` (`GAME_CORE_VERSION = 1`). По спеку разрастётся до `goalie/`, `shot/`, `balance/`, `rng.ts`, `rink.ts`. TS project references (`composite: true`), билдится в `dist/`.

- **`@hockey/server`** — Fastify 4 + Node 20, ESM (`"type": "module"`), TS `module: NodeNext`. Импортит `@hockey/game-core`. Конфиг через zod (`src/config.ts`). `src/app.ts` строит Fastify-инстанс (логирование разное для `NODE_ENV=development` / production); `src/index.ts` — entry point, запускает `app.listen`. Тесты — через `app.inject` от Fastify, без реального listen. Сейчас один роут `/health`.

- **`@hockey/web`** — React 18 + Vite 5 + TypeScript, запускается в PWA-режиме (будет добавлен `vite-plugin-pwa`). По спеку — PixiJS для игрового экрана, обычный React для профиля/меню/рейтинга, Zustand для состояния, TanStack Query для API. Сейчас — одна страница-заглушка `App.tsx`. Vite dev-сервер проксирует `/api → http://localhost:3000` (срезает префикс `/api`). Тесты — Testing Library + vitest + jsdom.

### Ключевое архитектурное решение: гибридная симуляция

Это главный инварианд проекта и влияет на все последующие планы.

Игровая логика в `game-core` **детерминирована** и **шерится между клиентом и сервером**: клиент симулирует бросок локально для мгновенной отрисовки, сервер параллельно симулирует тот же бросок на том же seed и валидирует результат. Из этого вытекают жёсткие правила для всего что попадает в `game-core`:

1. Никакого `Math.random()` — только сидированный PRNG (`seedrandom`, будет добавлен).
2. Никакого `Date.now()` — время всегда передаётся параметром.
3. Никаких таймеров (`setTimeout`, `requestAnimationFrame`) — это задача рендера в `web`, не логики.
4. Только чистые функции `(state, input) → newState`.
5. `GAME_CORE_VERSION` фиксируется в момент старта серверной сессии поединка; при несовпадении версии сессия либо доигрывается по старой версии, либо отбрасывается — никогда не валидируется по новой.

Если клиентский и серверный результат броска расходятся — сервер отвечает 409, клиент откатывает визуал. Одно расхождение не считается читом (может быть float, версия, баг), но при N+ расхождений от одного игрока — флаг `shot_mismatch` в `event_log`. Никогда не перемещай логику «goal / save / miss» из `game-core` в клиент или сервер — она должна быть в одном месте.

### Модель поединка

Не «серия из 5 бросков» — это **открытый поединок с персистентным HP вратаря**. Зашёл → бросаешь → можешь выйти в любой момент, прогресс HP сохраняется. Попытка (энергия) списывается **за каждый бросок**, не за серию. Стрики голов дают множитель наград, выход из поединка сбрасывает стрик, но HP остаётся.

Сессия живёт в Postgres (истина) + Redis (кэш, TTL 2ч). Сервер держит `shot_index` и валидирует совпадение с клиентским в каждом запросе — защита от гонок.

### TypeScript и строгость

Базовый `tsconfig.base.json` включает `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Последний тонкий — нельзя `foo: T | undefined` в типах, только `foo?: T`. Встречался на Fastify logger options: вместо условного `transport: devOnly ? {...} : undefined` нужно строить весь объект условно. Проверено в текущем `packages/server/src/app.ts`.

Fastify generic для `FastifyInstance` резолвится к union http/http2/https и не совпадает с тем, что возвращает `Fastify({...})`. Не аннотируй возвращаемый тип у `buildApp()` явно — пусть TS выводит.

### CI

`.github/workflows/ci.yml` — два джоба:
1. `build-and-test` — pnpm install → typecheck → lint → build каждого пакета → test. Билд `game-core` идёт отдельным шагом **перед** билдом `server`, по тем же причинам что и локально.
2. `docker-build` — билдит `packages/server/Dockerfile` и `packages/web/Dockerfile` через buildx с GHA cache. Не пушит образы, только проверяет сборку.

`deploy.yml` не добавлен — будет в Task 11, когда готова инфраструктура VPS.

## Language

Коммуникация с пользователем — на русском. Код, коммит-сообщения, commentsи идентификаторы — на английском. Пользовательский текст в UI — на русском.

## Doc links

- Спек MVP: `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`
- План 1 (скелет): `docs/superpowers/plans/2026-04-12-01-skeleton.md`
- README — инструкции по запуску для разработчика
