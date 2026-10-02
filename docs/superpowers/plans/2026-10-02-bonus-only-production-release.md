# Bonus-only Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release only bonus games, keeping production challenges closed.

**Architecture:** Build a selective patch on current origin/main, not a dev merge.
Copy bonus-owned modules and approved runtime assets; extract only necessary hunks
from shared files. Enforce the production closure in both client and server.

**Tech Stack:** pnpm, TypeScript, React/Pixi, Fastify, PostgreSQL, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-10-02-bonus-only-production-release.md

## Global Constraints

- Only bonus games; no exercises, training, onboarding or unrelated dev features.
- Sole additional user-approved patch: PR #212, source `66b48ad255c51897c26e288d4f91200290819f14`, five opponent gameplay-lock files.
- Production challenge-tab toast: `Раздел в разработке`.
- Challenges cannot start through direct links or API on production.
- Production daily limit: 2. Local/dev daily limit: 100.
- Preserve IDs, purchases, completions, rewards and immutable attempt snapshots.
- No dev-to-prod database copy, synthetic completion grants or automatic resets.
- Fresh production backup and normal Actions release are required.

## Review Focus

- A persisted `challenge` selection must not expose the closed track after reload.
- A direct challenge URL or repeated API action must not bypass the production gate.
- An active old bonus attempt must retain its original rules and resolve correctly.
- Shared renderer/core changes must not alter existing duel/training behavior.
- Configured quotas and actual period-start reservation must match in both environments.

## Task 1: Extract the permitted patch and dependencies

**Files:** bonus-owned files under `packages/{web,server}/src`, bonus runtime WebP
assets under `packages/web/public/bonus-games`, and required marksmanship core modules.
Shared files: `packages/game-core/src/index.ts`, `version.ts`, shot resolvers;
`packages/web/src/game/PlayView.tsx`, `loop.ts`, `design-system.css`;
`packages/server/src/app.ts`, `config.ts`.

**Interfaces:** Preserve current production non-bonus exports/behavior. Add only
exports and optional rendering contracts needed by the bonus modules.

- [x] Refresh refs, confirm clean checkout and create `fix/bonus-games-prod` from origin/main.
- [x] Inventory every dependency of the extracted bonus modules; record an explicit allowlist.
- [x] Add scope tests that reject training/onboarding/unapproved duel feature files and migrations.
- [ ] Establish pre-change production-baseline tests for shared gameplay contracts.
- [x] Extract only permitted code and runtime assets. Do not transfer generator sources,
  intermediate PNGs, onboarding hooks or unrelated shared-file hunks.
- [x] Resolve core-version compatibility using regression fixtures for old attempts;
  do not silently apply the global dev version bump to unrelated modes.
- [ ] Build core, run typecheck and targeted consumer tests; review the extraction diff.

## Task 2: Production closure and quotas

**Files:** `packages/web/src/screens/BonusGamesScreen.tsx` and its tests;
`packages/server/src/bonusGames/routes.ts`, `service.ts` and route tests;
environment configuration and focused policy tests.

**Interfaces:** One explicit environment policy controls challenge availability.
Client click leaves the selected playable tab unchanged and emits the exact toast.
Server rejects challenge launch mutations before creating attempts or spending slots.

- [x] RED: production challenge click emits the toast; persisted selection falls back.
- [x] RED: direct challenge route/API cannot launch; no balances or slots change.
- [x] RED: dev challenge launch succeeds; third dev attempt succeeds with limit 100.
- [x] RED: production third attempt is rejected with configured limit 2 and no false shot spinner.
- [x] Implement the minimal policy and client/server guards; verify GREEN.

## Task 3: Catalog migrations and isolated acceptance

**Files:** bonus migrations 154/155/161/162/163/168/169/170/171/172/173,
only where required by the extracted catalog/scoring contract; migration tests.

**Interfaces:** Migrations update future catalog rules, never existing attempt snapshots.
Migration numbers 164–167 (training) and unrelated duel/rating/economy migrations are excluded.

- [ ] Review each candidate migration against main schema and the four approved tracks.
- [x] Apply the selected migrations to an isolated main-schema test database.
- [x] Check stable IDs, old snapshots, completions, rewards, archived levels and idempotent reruns.
- [ ] Verify all 40 playable city cards and their runtime asset paths/dimensions.
- [ ] Render actual local game flows: each mode, preview/start/repeat, goalie scale and goal-line alignment.
- [ ] Run affected server/web/core suites, typecheck, lint and build. Record FAIL/SKIP separately.
- [ ] Independent read-only review of the immutable bonus-only commit and exclusion allowlist.

## Task 4: Authorized production release

**Files:** existing `.github/workflows/deploy.yml`; do not import the dev workflow.

**Interfaces:** Deploy the reviewed main-based SHA using existing workflow semantics.

- [ ] Refresh main and inspect intervening changes; revalidate the exact release diff.
- [ ] Confirm a fresh recoverable production backup without exposing credentials.
- [ ] Open/attach a PR targeting main containing only the approved patch.
- [ ] Merge after gates, then wait for matching production Actions SHA.
- [ ] Verify migration handling, image tags, service recreation, smoke and runtime version.
- [ ] Check production: four playable sections, challenge toast, direct-link/API closure,
  two-attempt limit, preserved real progress. Do not create or bypass authentication.
- [ ] Carry compatible fixes back to dev separately without bringing main-only closure to dev.
- [ ] Report deployment evidence separately from browser acceptance and remaining gaps.

## Progress

Selective extraction is implemented locally on `fix/bonus-games-prod`; production
has not been changed. The user requested a hold before release on 2026-10-02,
pending an additional selected change from another session. The user has now
selected `66b48ad2` (PR #212), opponent gameplay-lock copy, as the sole additional
change. Its targeted backport and final verification are in progress; nothing
has been deployed.

## Prompt for the next challenge-development session

Доработай только бонусную вкладку «Испытания» в Ultimate Hockey. Сначала прочитай
AGENTS.md, текущую реализацию бонусов и исходные планы. Не переноси новые упражнения,
онбординг, обучение или несвязанные изменения дуэлей/турниров. Начни от свежего dev
в отдельной task-ветке; существующие чужие изменения не трогай.

На production «Испытания» должны оставаться закрытыми: вкладка видна, клик показывает
«Раздел в разработке», прямой URL/API не позволяет играть. На dev вкладка открыта и
лимит — 100 попыток на каждый раздел, на production — 2. Без отдельной команды не
деплой и не меняй реальные данные, учётные записи или авторизацию.

Работай с десятью существующими локациями: Пляж, Горнолыжный курорт,
Киберпанк-двор, Заброшенный аквапарк, Пиратская бухта, Северный полюс,
Пустыня, Вулканический лёд, Замок, Космос. Используй уже утверждённые площадки,
две позы вратаря и отдельные превью; не генерируй новые изображения без запроса.
Порядок прохождения последовательный, награды соответствуют остальным бонусам.

Сначала воспроизведи актуальные проблемы в изолированной локальной среде. Проверь
цепочку превью → Начать → period/start → броски → пауза результата → продолжение,
включая старую/возобновлённую попытку, границы усталости, передышки и спотыкания,
повторный клик, задержку/перестановку ответа сервера, перезагрузку и переход периода.
Не должно быть ложной плашки «Проверяем результат» при отказе старта или скачков
игрока/вратаря/ворот назад после броска.

Механики сверяй с уже работающими дуэлями и турнирными играми, но не меняй их
поведение ради Испытаний. Сервер рассчитывает результат по неизменяемому snapshot;
клиент рендерит ту же траекторию. Разделяй исходное время броска, время сцены и
интегрированное время движения с усталостью; клиентские произвольные скорости
не должны влиять на серверный результат. Локальные и сохранённые паузы нельзя
учитывать дважды; на каждом кадре не пересчитывай историю от начала периода.

В каждой локации хотя бы одна сущность отличается от стандартной скорости уже
со старта. Составь таблицу фактических процентов для игрока, шайбы, ворот и вратаря,
порогов усталости/передышек, времени, лимита бросков и норматива. Пляж и Пустыня
сразу замедляют игрока и шайбу, Пустыня жёстче; текущие пороги сначала прочитай
из каталога, не заменяй произвольно. Тексты описаний должны совпадать с механиками.

Под меню одновременно не более одной плашки: передышка/спотыкание/усталость
сменяют описание постоянного эффекта. Плашка может занимать всю ширину меню;
шрифт уменьшается только при реальном переполнении текста. Проверь обычный,
узкий мобильный экран и изменение ширины.

Каждый подтверждённый баг: воспроизведение → тест с наблюдаемым RED → минимальный
фикс → GREEN → затронутые регрессии. Сохраняй ID игр, покупки, прохождения, награды
и snapshots старых попыток; не пересчитывай результаты и не выдавай прохождения.
Миграции сначала проверяй на изолированной БД поверх прежней схемы. В итоговом
отчёте раздели локальные тесты, браузерную приёмку, CI и фактический деплой.
