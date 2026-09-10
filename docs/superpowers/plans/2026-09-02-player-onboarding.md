# Player Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить две обязательные серверно управляемые цепочки онбординга — новичка с учебным голом и любителя после выхода из игры — вместе с версионной публикацией, админским CRUD, пользовательскими сбросами и воронкой статистики.

**Architecture:** PostgreSQL хранит фиксированные цепочки, неизменяемые опубликованные версии, редактируемый черновик, шаги, прохождения и события; публичный Fastify-модуль принимает все решения о применимости и валидирует учебные броски через `@hockey/game-core`. React-компонент `OnboardingGate` стоит внутри authenticated shell, но повторно проверяет переход в любители только после явного выхода с игровой площадки. Админский интерфейс вынесен из крупного `AdminScreen.tsx` в отдельный модуль и использует существующее объектное хранилище.

**Tech Stack:** PostgreSQL 16 raw SQL migrations, Fastify 4, Zod, TypeScript NodeNext, React 18, TanStack Query, PixiJS 8, `@hockey/game-core`, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-player-onboarding-design.md`

## Global Constraints

- Коммуникация и UI-тексты — на русском; код, идентификаторы и коммиты — на английском.
- Онбординг нельзя закрыть или пропустить; незавершённая цепочка после перезапуска начинается с первого шага.
- Существующие на момент миграции пользователи получают оба completion-флага `true`; новые пользователи — `false`.
- Приоритет обязательных цепочек: `beginner`, затем `amateur`; любительская цепочка требует реального серверного любительского уровня.
- Любительский онбординг не прерывает активную игру: проверка выполняется после выхода с площадки или при следующем входе.
- В первой версии разрешён ровно один `tutorial_shot`, только в `beginner`; в `amateur` интерактивных шагов нет.
- Учебные броски не меняют игровые счётчики, награды, лимиты, валюту, достижения, рейтинг или инвентарь.
- Симуляция учебного броска использует только `@hockey/game-core`; никакого `Math.random()` в детерминированном результате.
- `GAME_CORE_VERSION` меняется только если меняется детерминированное поведение самого `game-core`; эта задача должна переиспользовать существующее поведение без такого изменения.
- Изображения информационных шагов обязательны и загружаются через существующие object storage + `media_objects`.
- Первая валидная публикация включает enforcement цепочки; до неё схема и UI могут быть развернуты без блокировки новых аккаунтов.
- Сначала отдельно согласовать одну сюжетную иллюстрацию и один игровой кадр; не производить пакет визуалов до их одобрения.
- Не добавлять рейтинг или токены в любительскую цепочку в рамках этой задачи.
- После изменений в `game-core` обязательно собрать пакет до server/web тестов; план не предусматривает изменения `game-core`.
- Не менять и не добавлять production-данные вручную; релиз выполняется только через GitHub Actions после отдельного решения.

---

## File Structure

### Server and database

- Create `packages/server/db/migrations/089_player_onboarding.sql` — completion-флаги, цепочки, версии, шаги, прохождения, события, media purpose и фиксированные выключенные цепочки.
- Modify `packages/server/test/db/migrations.test.ts` — номер миграции, constraints, defaults и backfill существующих пользователей.
- Create `packages/server/src/onboarding/types.ts` — общие server DTO/domain types и Zod-ограничения конфигурации.
- Create `packages/server/src/onboarding/service.ts` — применимость, загрузка снимка версии, старт/завершение прохождения и агрегация событий.
- Create `packages/server/src/onboarding/routes.ts` — публичные `/onboarding/*` endpoints и серверная проверка учебного броска.
- Create `packages/server/src/onboarding/adminRoutes.ts` — CRUD черновика, reorder, media upload, publish, preview, stats.
- Modify `packages/server/src/app.ts` — регистрация публичного и административного onboarding-модулей с object storage и seed secret.
- Modify `packages/server/src/config.ts` — переиспользовать `DAILY_SEED_SECRET`; новый секрет не вводить.
- Create `packages/server/src/admin/guards.ts` — общий `requireAdmin` и фабрика admin pre-handlers для двух admin route modules.
- Modify `packages/server/src/admin/routes.ts` — использовать общий guard, добавить completion-флаги в карточку игрока и patch/read-back; onboarding content routes остаются в отдельном файле.
- Create `packages/server/test/onboarding/routes.test.ts` — публичные контракты, приоритет, restart, tutorial, completion.
- Create `packages/server/test/onboarding/admin.test.ts` — draft CRUD, publish validation, upload, stats.
- Modify `packages/server/test/admin/routes.test.ts` — два checkbox-поля пользователя и аудит изменения.

### Web

- Create `packages/web/src/api/onboarding.ts` — публичные DTO и fetch-функции.
- Create `packages/web/src/onboarding/OnboardingGate.tsx` — серверный gate, retry state и контекст явной проверки после выхода из игры.
- Create `packages/web/src/onboarding/OnboardingFlow.tsx` — информационные шаги, прогресс, Back/Next, телеметрия и финальное завершение.
- Create `packages/web/src/onboarding/TutorialShotStep.tsx` — адаптер существующего `PlayView` для учебной сессии.
- Create `packages/web/src/onboarding/onboarding.css` — scoped layout информационной цепочки; переиспользует существующие design tokens.
- Create `packages/web/src/onboarding/OnboardingGate.test.tsx` — обязательность, restart/retry и приоритет.
- Create `packages/web/src/onboarding/OnboardingFlow.test.tsx` — навигация и финальное подтверждение.
- Create `packages/web/src/onboarding/TutorialShotStep.test.tsx` — повтор после промаха, разблокировка после подтверждённого гола, отсутствие наград.
- Modify `packages/web/src/app/App.tsx` — один `OnboardingGate` вокруг authenticated content, скрытие nav/realtime toasts во время gate.
- Modify `packages/web/src/app/App.test.tsx` — route bypass protection.
- Modify `packages/web/src/screens/DailyScreen.tsx` — вызвать `refreshAfterGameExit()` только в центральных переходах с play view на arena/hub.
- Modify `packages/web/src/screens/DailyScreen.test.tsx` — любительский gate запрашивается после выхода, но не во время игры.
- Create `packages/web/src/admin/onboardingApi.ts` — admin DTO/fetch-функции.
- Create `packages/web/src/admin/OnboardingAdmin.tsx` — цепочки, preview, publish и статистика.
- Create `packages/web/src/admin/OnboardingStepEditor.tsx` — изолированный редактор полей одного шага.
- Create `packages/web/src/admin/OnboardingAdmin.test.tsx` — UI-контракты админки.
- Modify `packages/web/src/admin/AdminScreen.tsx` — вкладка `Онбординг` и два checkbox в карточке игрока.
- Modify `packages/web/src/admin/AdminScreen.test.tsx` — вкладка и независимый read-back двух completion-флагов.
- Modify `packages/web/src/admin/api.ts` — поля `AdminUser`, `AdminUserPatch`; content API остаётся в `onboardingApi.ts`.
- Existing `packages/web/src/app/design-system.css` is reused unchanged; onboarding-specific layout remains in `onboarding.css`.

---

### Task 1: Add the onboarding schema and migration compatibility

**Files:**

- Create: `packages/server/db/migrations/089_player_onboarding.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Produces: tables `onboarding_chain`, `onboarding_version`, `onboarding_step`, `onboarding_run`, `onboarding_event`; user columns `beginner_onboarding_completed`, `amateur_onboarding_completed`.
- Produces: `media_objects.purpose = 'onboarding_image'` compatibility.

- [ ] **Step 1: Write failing migration assertions**

Extend the ordered migration list with `089_player_onboarding.sql`. Add a test that inserts a user before applying migration 089, applies it, then inserts a user after it and asserts:

```ts
expect(existing.rows[0]).toMatchObject({
  beginner_onboarding_completed: true,
  amateur_onboarding_completed: true,
});
expect(createdAfter.rows[0]).toMatchObject({
  beginner_onboarding_completed: false,
  amateur_onboarding_completed: false,
});
```

Assert partial unique indexes for one draft per chain, unique `(version_id, position)`, step-kind checks, event-kind checks, and the new media purpose.

- [ ] **Step 2: Run the migration test and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: FAIL because migration 089 and columns/tables do not exist.

- [ ] **Step 3: Create migration 089**

Use this schema shape:

```sql
alter table users
  add column beginner_onboarding_completed boolean not null default false,
  add column amateur_onboarding_completed boolean not null default false,
  add column beginner_onboarding_reset_at timestamptz,
  add column amateur_onboarding_reset_at timestamptz;

update users
   set beginner_onboarding_completed = true,
       amateur_onboarding_completed = true;

create table onboarding_chain (
  key text primary key check (key in ('beginner', 'amateur')),
  current_published_version_id uuid,
  enforcement_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table onboarding_version (
  id uuid primary key default gen_random_uuid(),
  chain_key text not null references onboarding_chain(key) on delete restrict,
  status text not null check (status in ('draft', 'published')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table onboarding_chain
  add constraint onboarding_chain_published_version_fkey
  foreign key (current_published_version_id) references onboarding_version(id) on delete restrict;

create unique index onboarding_version_one_draft_idx
  on onboarding_version (chain_key) where status = 'draft';

create table onboarding_step (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references onboarding_version(id) on delete cascade,
  position int not null check (position between 1 and 100),
  kind text not null check (kind in ('informational', 'tutorial_shot')),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 1000),
  cta_label text not null check (length(trim(cta_label)) between 1 and 40),
  media_object_id uuid references media_objects(id) on delete restrict,
  tutorial_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, position),
  check (
    (kind = 'informational' and media_object_id is not null and tutorial_config is null)
    or (kind = 'tutorial_shot' and media_object_id is null and jsonb_typeof(tutorial_config) = 'object')
  )
);
```

Add `onboarding_run(id, user_id, chain_key, version_id, client_session_id, source, tutorial_state, started_at, completed_at)` where `client_session_id` is UUID, source is `natural|admin_reset|preview` and `tutorial_state` is nullable JSONB constrained to an object, plus `onboarding_event(id, run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number, created_at)`. Event kinds are `step_viewed|tutorial_attempt|tutorial_goal|completed`; `result` is nullable or `goal|save|miss`. Add unique `(user_id, chain_key, version_id, client_session_id)`, version/time aggregation indexes, unique `(run_id, step_id)` for `step_viewed`, and one unique `tutorial_goal` and `completed` per run.

Extend `media_objects_purpose_check` with `onboarding_image`. Insert the two chain rows with `enforcement_enabled=false` and no published version.

- [ ] **Step 4: Run migration tests**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit schema**

```bash
git add packages/server/db/migrations/089_player_onboarding.sql packages/server/test/db/migrations.test.ts
git commit -m "feat(server): add player onboarding schema"
```

### Task 2: Define onboarding domain types and applicability

**Files:**

- Create: `packages/server/src/onboarding/types.ts`
- Create: `packages/server/src/onboarding/service.ts`
- Create: `packages/server/test/onboarding/service.test.ts`

**Interfaces:**

- Produces: `OnboardingChainKey`, `OnboardingStepDTO`, `OnboardingRequiredDTO`.
- Produces: `getRequiredOnboarding(db, userId)`, `loadPublishedVersion(db, chainKey)`, `startOnboardingRun(db, userId, chainKey)`.
- Consumes: existing `getGameSettings()` and `resolveCompetitionLevel()` rules through `buildProfileProgress`-equivalent inputs, not client level claims.

- [ ] **Step 1: Add failing service tests**

Cover this table:

```ts
it.each([
  [{ beginnerDone: false, amateurDone: false, level: 'beginner' }, 'beginner'],
  [{ beginnerDone: true, amateurDone: false, level: 'beginner' }, null],
  [{ beginnerDone: true, amateurDone: false, level: 'amateur' }, 'amateur'],
  [{ beginnerDone: false, amateurDone: false, level: 'amateur' }, 'beginner'],
  [{ beginnerDone: true, amateurDone: true, level: 'amateur' }, null],
])('selects the required chain', async (input, expected) => {
  expect(await requiredChainForFixture(input)).toBe(expected);
});
```

Also assert disabled/unpublished chains return no required chain, and published steps are returned ordered by `position` with media proxy URLs.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/service.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement domain types**

Define exact public shapes:

```ts
export type OnboardingChainKey = 'beginner' | 'amateur';

export type OnboardingStepDTO =
  | {
      id: string;
      position: number;
      kind: 'informational';
      title: string;
      description: string;
      ctaLabel: string;
      imageUrl: string;
    }
  | {
      id: string;
      position: number;
      kind: 'tutorial_shot';
      title: string;
      description: string;
      ctaLabel: string;
      tutorial: {
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
      };
    };

export interface OnboardingRequiredDTO {
  required: null | {
    chain: OnboardingChainKey;
    versionId: string;
    steps: OnboardingStepDTO[];
  };
}
```

Zod limits: all three frequencies `0.05..2`, title `1..120`, description `1..1000`, CTA `1..40`, positions `1..100`.

- [ ] **Step 4: Implement applicability and snapshot loading**

In one query load the two completion flags, level, lifetime goals and the current game setting. Resolve competition level on the server. Return `beginner` before `amateur`. Require `enforcement_enabled=true` and a current published version. Map images with `createMediaProxyUrl(mediaAccessSecret, mediaId)`.

`startOnboardingRun()` re-checks applicability inside a transaction, inserts a new natural/admin-reset run, and returns `{ runId, required }`. Use `source='admin_reset'` when the matching `*_onboarding_reset_at` column is non-null and later than the most recent natural completion; otherwise use `natural`.

- [ ] **Step 5: Run service tests**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit domain service**

```bash
git add packages/server/src/onboarding/types.ts packages/server/src/onboarding/service.ts packages/server/test/onboarding/service.test.ts
git commit -m "feat(server): resolve required onboarding chains"
```

### Task 3: Add public lifecycle and telemetry endpoints

**Files:**

- Create: `packages/server/src/onboarding/routes.ts`
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/test/onboarding/routes.test.ts`

**Interfaces:**

- Produces: `GET /onboarding/required`.
- Produces: `POST /onboarding/start` with `{ clientSessionId }`, returning `{ runId, required }`.
- Produces: `POST /onboarding/runs/:runId/steps/:stepId/view`.
- Produces: `POST /onboarding/runs/:runId/complete` returning `OnboardingRequiredDTO`.

- [ ] **Step 1: Write failing endpoint tests**

Test authenticated-only access, chain priority, ordered DTO, idempotent `/start` for the same `clientSessionId`, a new run for a new session ID, idempotent step-view recording, completion rejection before the tutorial goal or before every step was viewed, idempotent final completion, and restart from step one after a second client session.

Use concrete assertions:

```ts
expect(start.statusCode).toBe(200);
expect(start.json().required.steps[0].position).toBe(1);
expect(earlyComplete.statusCode).toBe(409);
expect(completed.json()).toEqual({ required: null });
expect(secondComplete.statusCode).toBe(200);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts -t "lifecycle"`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement lifecycle routes**

Validate UUID params. Every run mutation must verify `run.user_id === req.user.id`, `run.version_id` matches the started snapshot, and the step belongs to that version. Insert `step_viewed` with `ON CONFLICT DO NOTHING` so Back/Next does not inflate reach.

Completion transaction:

1. lock run and user rows;
2. return current state if run is already complete;
3. verify chain remains applicable to the user;
4. require one `step_viewed` event for every step in the version;
5. if version contains `tutorial_shot`, require authoritative `tutorial_goal` for this run;
6. set the corresponding user flag true;
7. set `completed_at` and insert one `completed` event;
8. return freshly computed required state.

- [ ] **Step 4: Register routes**

Register `onboardingRoutes` after auth and DB plugins in `app.ts`, passing `DAILY_SEED_SECRET` and `MEDIA_ACCESS_SECRET`. Do not add a new secret.

- [ ] **Step 5: Run endpoint tests**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts -t "lifecycle"`

Expected: PASS.

- [ ] **Step 6: Commit lifecycle routes**

```bash
git add packages/server/src/onboarding/routes.ts packages/server/src/app.ts packages/server/test/onboarding/routes.test.ts
git commit -m "feat(server): add onboarding lifecycle API"
```

### Task 4: Validate tutorial shots without changing game progress

**Files:**

- Modify: `packages/server/src/onboarding/routes.ts`
- Modify: `packages/server/src/onboarding/service.ts`
- Modify: `packages/server/test/onboarding/routes.test.ts`

**Interfaces:**

- Produces: `POST /onboarding/runs/:runId/tutorial/start`.
- Produces: `POST /onboarding/runs/:runId/tutorial/shot`.
- Consumes: `GAME_CORE_VERSION`, `getGoalie('rookie')`, `deriveShotSeed`, `getSessionPhaseOffsets`, `resolveShot`, `STICK_NEUTRAL`.

- [ ] **Step 1: Add failing tutorial contract tests**

Assert start returns a deterministic session snapshot:

```ts
expect(body).toMatchObject({
  shotIndex: 1,
  goalieId: 'rookie',
  gameCoreVersion: GAME_CORE_VERSION,
  speeds: { shooterFrequency: 0.12, goalieFrequency: 0.1, goalFrequency: 0.08 },
});
```

Submit one known miss and one known goal. Assert shot indexes are sequential, server result overrides a false claim, only the real server goal unlocks completion, and user/game tables remain unchanged (`lifetime_*`, wallet, achievements, `shot_session`, daily/training/bonus/duel tables).

- [ ] **Step 2: Run tutorial tests and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts -t "tutorial"`

Expected: FAIL with missing tutorial routes.

- [ ] **Step 3: Implement deterministic session state**

Store a tutorial session snapshot in the run, either with explicit columns or a constrained `tutorial_state jsonb` added to migration 089 before it ships:

```ts
interface TutorialRunState {
  seed: string;
  gameCoreVersion: number;
  nextShotIndex: number;
  stepId: string;
  speeds: {
    shooterFrequency: number;
    goalieFrequency: number;
    goalFrequency: number;
  };
}
```

Derive `seed` as an HMAC of `userId:runId:versionId` using `DAILY_SEED_SECRET`; never return the secret. Snapshot the published speed configuration at start so a later publish cannot change an active run.

- [ ] **Step 4: Implement the shot endpoint**

Accept:

```ts
const tutorialShotSchema = z.object({
  shotIndex: z.number().int().positive(),
  input: z.object({
    tapTime: z.number().finite().nonnegative(),
    shooterTapTime: z.number().finite().nonnegative(),
  }),
  claimedResult: z.enum(['goal', 'save', 'miss']),
});
```

Ignore client-supplied frequency overrides. Build `ShotInput` with the snapshotted three frequencies, derive the shot seed, call `resolveShot`, increment `nextShotIndex`, and record `tutorial_attempt` with authoritative result. On the first authoritative goal, insert `tutorial_goal`. Return `{ serverResult, nextShotIndex, goalConfirmed }`.

Use a transaction and row lock so double taps cannot reuse a shot index. On mismatch, return the server result rather than an internal error code; the client reconciles the visual result.

- [ ] **Step 5: Run all onboarding server tests**

Run: `pnpm --filter @hockey/game-core build`

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts test/onboarding/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit tutorial validation**

```bash
git add packages/server/src/onboarding/routes.ts packages/server/src/onboarding/service.ts packages/server/test/onboarding/routes.test.ts packages/server/db/migrations/089_player_onboarding.sql
git commit -m "feat(server): validate onboarding tutorial shots"
```

### Task 5: Add admin draft CRUD, image upload, preview, and atomic publish

**Files:**

- Create: `packages/server/src/onboarding/adminRoutes.ts`
- Create: `packages/server/src/admin/guards.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/test/onboarding/admin.test.ts`

**Interfaces:**

- Produces: `/admin/onboarding/chains/:chainKey` read/draft CRUD/reorder/publish endpoints.
- Produces: `POST /admin/onboarding/media` accepting WebP.
- Produces: preview DTO identical to public steps plus `preview: true`.
- Produces: preview tutorial start/shot endpoints backed by `source='preview'` runs.

- [ ] **Step 1: Write failing admin contract tests**

Cover admin authorization, lazy creation of a draft cloned from published content, informational/tutorial schemas, duplicate, delete, reorder, WebP upload, and immutable published rows. Add publish cases for empty chain, missing image, duplicate/gapped positions, zero/multiple beginner tutorials, any amateur tutorial, invalid speed, and missing media.

Assert failed publish leaves the old pointer unchanged; successful publish changes pointer and enables enforcement in one transaction.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts`

Expected: FAIL because admin onboarding routes do not exist.

- [ ] **Step 3: Implement admin schemas and draft operations**

Use discriminated input:

```ts
const stepInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('informational'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    ctaLabel: z.string().trim().min(1).max(40),
    mediaObjectId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('tutorial_shot'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    ctaLabel: z.string().trim().min(1).max(40),
    tutorial: z.object({
      shooterFrequency: z.number().min(0.05).max(2),
      goalieFrequency: z.number().min(0.05).max(2),
      goalFrequency: z.number().min(0.05).max(2),
    }),
  }),
]);
```

All mutations run against the current draft only and return a full authoritative draft DTO. Reorder accepts every current step ID exactly once and rewrites positions using a temporary offset to avoid unique conflicts.

- [ ] **Step 4: Implement onboarding image upload**

Follow the bonus-game media pattern, but use purpose `onboarding_image` and prefix `onboarding/`. Accept only `image/webp`, reject empty/oversized bodies, persist `media_objects`, and return proxy URL plus media ID. Do not delete old media on step replacement; references and cleanup need separate retention policy.

- [ ] **Step 5: Implement publish transaction**

Lock the chain and draft; validate every rule and referenced media purpose. Set draft status to `published`, set `published_at`, move `current_published_version_id`, set `enforcement_enabled=true`, and leave no draft. Historical published versions remain immutable. Return the read-back chain DTO.

- [ ] **Step 6: Register admin onboarding routes**

Extract the current `requireAdmin` behavior and pre-handler array construction into `packages/server/src/admin/guards.ts`. Import the factory from both `admin/routes.ts` and `onboarding/adminRoutes.ts`; preserve authentication, blocked-user and role behavior at the contract level. Register `onboardingAdminRoutes` from `app.ts` with object storage and media secret.

- [ ] **Step 7: Run admin onboarding tests**

Run: `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit content administration**

```bash
git add packages/server/src/onboarding/adminRoutes.ts packages/server/src/app.ts packages/server/test/onboarding/admin.test.ts packages/server/src/admin/guards.ts packages/server/src/admin/routes.ts
git commit -m "feat(server): manage versioned onboarding content"
```

### Task 6: Add player completion controls and onboarding statistics APIs

**Files:**

- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/src/onboarding/adminRoutes.ts`
- Modify: `packages/server/test/admin/routes.test.ts`
- Modify: `packages/server/test/onboarding/admin.test.ts`

**Interfaces:**

- Extends admin user DTO/patch with `beginnerOnboardingCompleted`, `amateurOnboardingCompleted`.
- Produces: `GET /admin/onboarding/stats?chain=&versionId=&from=&to=`.

- [ ] **Step 1: Add failing admin-user tests**

Assert both flags appear in list/detail and can be changed independently. Verify response read-back and event log payload:

```ts
expect(detail.user).toMatchObject({
  beginnerOnboardingCompleted: false,
  amateurOnboardingCompleted: true,
});
expect(event.payload).toMatchObject({
  field: 'beginnerOnboardingCompleted',
  previous: true,
  next: false,
  administratorId: adminId,
});
```

- [ ] **Step 2: Add failing statistics tests**

Create natural, repeated, completed, abandoned, preview-free, migrated and admin-reset fixtures. Assert unique starts/completions, conversion, average duration, per-step reached/drop-off, repeat starts, first-shot success, average/max attempts, and version/date filtering.

- [ ] **Step 3: Run and verify failures**

Run: `pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts test/onboarding/admin.test.ts`

Expected: FAIL on missing flags/stats.

- [ ] **Step 4: Extend admin user read and patch**

Add both columns to `AdminUserRow`, `fetchAdminUser`, list query mapping, `userPatchSchema`, and update assignments. Read previous values under transaction before update. On true-to-false, set the matching `*_onboarding_reset_at=now()`; on false-to-true, clear that reset timestamp. Append one audit event per changed flag; a true-to-false transition is a reset and a false-to-true transition is an administrative completion.

- [ ] **Step 5: Implement aggregate statistics**

Return:

```ts
interface AdminOnboardingStats {
  startedUsers: number;
  completedUsers: number;
  completionRate: number;
  averageCompletionSeconds: number | null;
  repeatStarts: number;
  tutorial: {
    averageAttemptsToGoal: number | null;
    firstAttemptGoalRate: number | null;
    maxAttempts: number | null;
  };
  steps: Array<{
    stepId: string;
    position: number;
    title: string;
    reachedUsers: number;
    dropOffUsers: number;
  }>;
}
```

Count only `source='natural'`. A drop-off is a user's last reached step in a run without `completed_at`; runs younger than 30 minutes are excluded from drop-off to avoid treating active users as abandoned. Document this exact 30-minute window in the API DTO/UI help text.

- [ ] **Step 6: Run admin tests**

Run: `pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts test/onboarding/admin.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit controls and statistics**

```bash
git add packages/server/src/admin/routes.ts packages/server/src/onboarding/adminRoutes.ts packages/server/test/admin/routes.test.ts packages/server/test/onboarding/admin.test.ts
git commit -m "feat(server): expose onboarding controls and metrics"
```

### Task 7: Build the authenticated web gate and informational flow

**Files:**

- Create: `packages/web/src/api/onboarding.ts`
- Create: `packages/web/src/onboarding/OnboardingGate.tsx`
- Create: `packages/web/src/onboarding/OnboardingFlow.tsx`
- Create: `packages/web/src/onboarding/onboarding.css`
- Create: `packages/web/src/onboarding/OnboardingGate.test.tsx`
- Create: `packages/web/src/onboarding/OnboardingFlow.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/App.test.tsx`

**Interfaces:**

- Produces: `OnboardingGate`, `useOnboardingGate(): { refreshAfterGameExit(): Promise<void> }`.
- Consumes: public API from Tasks 3–4.

- [ ] **Step 1: Write failing gate tests**

Cover loading, no-required pass-through, required flow, API failure retry, direct URL protection, hidden BottomNav/toasts during onboarding, and browser back remaining in the flow.

```tsx
expect(screen.queryByText('Профиль')).not.toBeInTheDocument();
expect(screen.getByText('Всё начинается здесь')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Повторить' }));
expect(fetchRequired).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Write failing flow tests**

Assert `1 из 3`, no Back on first step, Back on later steps, view event once per reached step, broken image fallback, and final button waiting for server completion before calling `onCompleted`.

- [ ] **Step 3: Run and verify failures**

Run: `pnpm --filter @hockey/web exec vitest run src/onboarding/OnboardingGate.test.tsx src/onboarding/OnboardingFlow.test.tsx src/app/App.test.tsx`

Expected: FAIL because modules are missing.

- [ ] **Step 4: Implement typed API**

Export `fetchRequiredOnboarding`, `startOnboarding`, `recordStepView`, and `completeOnboarding`. Mirror the discriminated server DTO exactly and keep query key `['onboarding', 'required']` in one exported helper.

- [ ] **Step 5: Implement `OnboardingFlow`**

Keep `stepIndex` in component state only. Render image with an `onError` placeholder, semantic progress text, standard text buttons without icons, and no close affordance. On mount/step change, record view best-effort; lifecycle/completion errors are blocking and visible. Ignore route navigation until server completion succeeds.

- [ ] **Step 6: Implement `OnboardingGate`**

On authenticated mount call required → start. Create one `crypto.randomUUID()` client session ID in a ref and pass it to `/start`, so React Strict Mode retries cannot create duplicate runs while a reload still creates a fresh run. Render children only when `required === null`. Provide `refreshAfterGameExit()` that invalidates/refetches required state and starts a newly required amateur run with a new client session ID. Do not periodically poll or refetch merely because `/me` changed; this prevents interruption during play.

Move `ChatRealtime`, `DuelInviteToast`, `BottomNav`, and routed content under the pass-through branch so they do not appear behind the mandatory flow. Keep login/demo/callback outside the authenticated gate.

- [ ] **Step 7: Add scoped styles**

Use current `--app-*`, `--ink`, `--muted`, `.btn`, `.btn--cta`, `.btn--ghost`, safe-area variables and reduced-motion media query. Do not introduce a close icon or custom modal primitive.

- [ ] **Step 8: Run gate/flow tests**

Run: `pnpm --filter @hockey/web exec vitest run src/onboarding/OnboardingGate.test.tsx src/onboarding/OnboardingFlow.test.tsx src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit informational flow**

```bash
git add packages/web/src/api/onboarding.ts packages/web/src/onboarding packages/web/src/app/App.tsx packages/web/src/app/App.test.tsx
git commit -m "feat(web): gate the app with required onboarding"
```

### Task 8: Reuse `PlayView` for the mandatory tutorial goal

**Files:**

- Create: `packages/web/src/onboarding/TutorialShotStep.tsx`
- Create: `packages/web/src/onboarding/TutorialShotStep.test.tsx`
- Modify: `packages/web/src/onboarding/OnboardingFlow.tsx`
- Modify: `packages/web/src/game/PlayView.tsx`
- Modify: `packages/web/src/game/PlayView.test.tsx`

**Interfaces:**

- Consumes: tutorial start/shot API and `PlayView<TutorialState>`.
- Produces: a confirmed-goal callback `onGoalConfirmed(): void`.

- [ ] **Step 1: Add a failing `PlayView` contract test**

Add an optional `resultCopy` prop so the tutorial can say `Ещё раз` without changing normal game copy:

```ts
resultCopy?: Partial<Record<'goal' | 'save' | 'miss' | 'post', string>>;
```

Assert existing callers retain current strings and tutorial override appears only when provided.

- [ ] **Step 2: Add failing tutorial component tests**

Mock `PlayView` as a shot callback surface. Assert start snapshot uses `rookie`, `/sprites/test-court-bg-outdoor-v8.png`, normal perspective geometry, configured speed overrides, unlimited shot count, no reward/stat API, and Next disabled until `goalConfirmed=true`. Verify miss/save immediately update state for another shot.

- [ ] **Step 3: Run and verify failures**

Run: `pnpm --filter @hockey/web exec vitest run src/game/PlayView.test.tsx src/onboarding/TutorialShotStep.test.tsx`

Expected: FAIL on missing prop/component.

- [ ] **Step 4: Add the minimal `PlayView` extension**

Thread `resultCopy` into the existing result modal text selection. Do not copy rendering, movement, hitbox or animation code. Preserve default behavior for every current call site.

- [ ] **Step 5: Implement `TutorialShotStep`**

Start the server tutorial session on mount. Build local state:

```ts
interface TutorialState {
  shots: number;
  goals: number;
  nextShotIndex: number;
  goalConfirmed: boolean;
}
```

Pass `speedOverrides={{ shooterFreq, goalieFreq, goalFreq, puckSpeed: PUCK_SPEED_PER_MS }}`, `goalieId="rookie"`, `longCourtBackground="/sprites/test-court-bg-outdoor-v8.png"`, existing perspective options, `shotsTotal={undefined}`, and `resultCopy={{ save: 'Ещё раз', miss: 'Ещё раз', goal: 'Первая шайба!' }}`. `submitShot` sends only timing + claimed result, reconciles with `serverResult`, and sets `goalConfirmed` only from server response.

Render the instruction above the rink and a CTA below it. After a confirmed goal, respect reduced motion and enable the configured `ctaLabel`.

- [ ] **Step 6: Integrate the discriminated step**

In `OnboardingFlow`, render `TutorialShotStep` only for `kind === 'tutorial_shot'`. Passing Back does not erase the already confirmed goal within the current run; reloading creates a new run and requires a new goal.

- [ ] **Step 7: Run tutorial and regression tests**

Run: `pnpm --filter @hockey/web exec vitest run src/game/PlayView.test.tsx src/onboarding/TutorialShotStep.test.tsx src/onboarding/OnboardingFlow.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit tutorial UI**

```bash
git add packages/web/src/game/PlayView.tsx packages/web/src/game/PlayView.test.tsx packages/web/src/onboarding/TutorialShotStep.tsx packages/web/src/onboarding/TutorialShotStep.test.tsx packages/web/src/onboarding/OnboardingFlow.tsx
git commit -m "feat(web): add the first-goal onboarding step"
```

### Task 9: Trigger amateur onboarding only after leaving gameplay

**Files:**

- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Modify: `packages/web/src/onboarding/OnboardingGate.test.tsx`

**Interfaces:**

- Consumes: `useOnboardingGate().refreshAfterGameExit()`.
- Produces: an explicit post-game refresh at every transition from play surface to arena/hub.

- [ ] **Step 1: Add failing transition tests**

For daily, training, amateur duel and bonus-return paths represented inside `DailyScreen`, assert crossing the goal threshold does not call refresh while `PlayView` is active. Assert Back/finished-exit calls it once after view state switches away from play.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx -t "onboarding after game exit"`

Expected: FAIL because exit refresh is not wired.

- [ ] **Step 3: Centralize exit notification without rewriting the screen**

Introduce a local helper inside `DailyScreen`:

```ts
const leavePlaySurface = useCallback(
  (destination: '/?view=arena' | '/sections') => {
    setDailyView('arena');
    navigate(destination, { replace: true });
    void refreshAfterGameExit();
  },
  [navigate, refreshAfterGameExit],
);
```

Replace duplicated successful exit branches with `leavePlaySurface('/?view=arena')` or `leavePlaySurface('/sections')`; do not call it for in-game state transitions. In standalone `BonusGamePlayScreen`, call `refreshAfterGameExit()` immediately after its existing successful navigation back action.

- [ ] **Step 4: Run transition and gate tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/onboarding/OnboardingGate.test.tsx`

Expected: PASS and no onboarding render before the explicit exit.

- [ ] **Step 5: Commit exit trigger**

```bash
git add packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/screens/BonusGamePlayScreen.tsx packages/web/src/screens/BonusGamePlayScreen.test.tsx packages/web/src/onboarding/OnboardingGate.test.tsx
git commit -m "feat(web): defer amateur onboarding until game exit"
```

### Task 10: Build the onboarding content admin UI

**Files:**

- Create: `packages/web/src/admin/onboardingApi.ts`
- Create: `packages/web/src/admin/OnboardingAdmin.tsx`
- Create: `packages/web/src/admin/OnboardingStepEditor.tsx`
- Create: `packages/web/src/admin/OnboardingAdmin.test.tsx`
- Modify: `packages/web/src/admin/AdminScreen.tsx`

**Interfaces:**

- Consumes: Task 5 admin endpoints.
- Produces: top-level `onboarding` admin tab with `content|preview|statistics` subsections.

- [ ] **Step 1: Write failing admin UI tests**

Test fixed Beginner/Amateur selector, draft-vs-published labels, create/edit/duplicate/delete, move up/down keyboard alternative, drag reorder callback, WebP validation/upload, tutorial speed fields, publish errors, authoritative read-back, and preview exclusion messaging.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx`

Expected: FAIL because tab/component are missing.

- [ ] **Step 3: Implement admin API module**

Keep all onboarding-specific types and functions in `onboardingApi.ts`. Export exact operations `fetchOnboardingChain`, `createOnboardingStep`, `patchOnboardingStep`, `duplicateOnboardingStep`, `deleteOnboardingStep`, `reorderOnboardingSteps`, `uploadOnboardingImage`, `publishOnboardingDraft`, and `fetchOnboardingStats`.

For upload, reject non-WebP and empty files before request. Every mutation consumes the server-returned full chain instead of applying an optimistic fake success.

- [ ] **Step 4: Implement content list and editor**

Implement the field form in `OnboardingStepEditor.tsx`; keep chain selection, list, publishing, preview and statistics in `OnboardingAdmin.tsx`. Use `GlassSelect`, standard text buttons without icons, and `.icon-btn` for standalone reorder/edit/delete actions. Tutorial type is unavailable for Amateur and unavailable after Beginner already has one.

- [ ] **Step 5: Implement preview**

Reuse `OnboardingFlow` with `mode="preview"`, a supplied draft snapshot, no public completion/view calls, and a visible `Предпросмотр` label. Start tutorial preview through `POST /admin/onboarding/chains/:chainKey/preview/tutorial/start`; it creates a run with `source='preview'`. Submit its shots through `POST /admin/onboarding/preview/runs/:runId/tutorial/shot`. These endpoints reuse the tutorial validator, never change user flags, and their runs are excluded from natural statistics.

- [ ] **Step 6: Wire top-level tab**

Add `'onboarding'` to `AdminTab`, add label `Онбординг`, and render `<OnboardingAdmin />`. Do not move existing tabs or fold it into Settings.

- [ ] **Step 7: Run admin content tests**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit admin editor**

```bash
git add packages/web/src/admin/onboardingApi.ts packages/web/src/admin/OnboardingAdmin.tsx packages/web/src/admin/OnboardingStepEditor.tsx packages/web/src/admin/OnboardingAdmin.test.tsx packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx
git commit -m "feat(web): add onboarding content administration"
```

### Task 11: Add statistics and per-player completion checkboxes to admin UI

**Files:**

- Modify: `packages/web/src/admin/onboardingApi.ts`
- Modify: `packages/web/src/admin/OnboardingAdmin.tsx`
- Modify: `packages/web/src/admin/OnboardingAdmin.test.tsx`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`

**Interfaces:**

- Consumes: Task 6 stats and user patch contracts.

- [ ] **Step 1: Add failing statistics UI tests**

Assert chain/version/date filters, summary cards, `—` for null tutorial data, per-step reached/drop-off table, repeat starts, and help text `Отвал учитывается через 30 минут после последнего действия`.

- [ ] **Step 2: Add failing player-checkbox tests**

Render a user with both flags true, enter edit mode, toggle only beginner, save, assert patch body preserves amateur, and assert UI updates from returned/read-back user rather than immediately on click.

- [ ] **Step 3: Run and verify failures**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx`

Expected: FAIL on missing stats and flags.

- [ ] **Step 4: Implement statistics panel**

Use existing admin glass cards and `GlassSelect`. Date filters send ISO date bounds. Show counts and percentages with existing number/percent helpers; render the step table in chain order. Do not merge versions in one chart.

- [ ] **Step 5: Implement independent completion controls**

Extend `AdminUser` and `AdminUserPatch`. Initialize local state from server detail, include both booleans in `buildUserPatch()`, and render two labeled native checkboxes in edit mode. On success set UI from returned user or invalidate and await detail read-back before leaving edit mode.

- [ ] **Step 6: Run admin UI tests**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit admin metrics and controls**

```bash
git add packages/web/src/admin/onboardingApi.ts packages/web/src/admin/OnboardingAdmin.tsx packages/web/src/admin/OnboardingAdmin.test.tsx packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx
git commit -m "feat(web): show onboarding metrics and player controls"
```

### Task 12: Prepare, approve, and publish the initial dev content

**Files:**

- Create after approval: `packages/web/public/onboarding/reference/beginner-story-example.webp`
- Create after approval: `packages/web/public/onboarding/reference/beginner-gameplay-example.webp`
- Create after both examples are approved: remaining source/reference WebP files under `packages/web/public/onboarding/reference/`
- Test: `packages/web/src/onboarding/onboardingAssets.test.ts`

**Interfaces:**

- Consumes: approved eight-step Beginner copy and seven-step Amateur copy from the spec.
- Produces: approved image set uploaded through the dev admin UI and two published dev chains.

- [ ] **Step 1: Create exactly one story-image example**

Use the existing image-generation workflow to create a square 1:1 WebP (minimum 800×800) for `Всё начинается здесь`: winter courtyard hockey, mobile-safe composition, room for UI copy outside the image, no embedded text, consistent with the game palette. Stop and obtain explicit user approval before producing other story images.

- [ ] **Step 2: Create exactly one gameplay-frame example**

Capture or compose a real in-game frame for `Поймай момент` using the normal courtyard geometry and current sprites, without fake controls or unavailable features. Stop and obtain explicit user approval before producing other gameplay frames.

- [ ] **Step 3: Add asset contract test**

For repository-held approved references, enumerate exactly the 14 approved filenames and assert each file decodes as WebP at exactly 1200×1200. Do not use a filesystem wildcard snapshot.

- [ ] **Step 4: Produce the remaining approved images**

Create one image per informational step, following the approved two visual references. Do not create an image for `tutorial_shot`.

- [ ] **Step 5: Upload and assemble both dev drafts**

Use the Onboarding admin tab in dev. Enter this initial copy exactly, then apply only changes explicitly approved during the copy review:

| Цепочка  | Заголовок                | Начальный текст                                                                                                      | CTA                |
| -------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Новичок  | Всё начинается здесь     | Ты решил всерьёз заняться хоккеем. Пока твоя арена — обычный двор. Именно здесь начинается путь в любительскую лигу. | Далее              |
| Новичок  | Поймай момент            | Игрок, вратарь и ворота двигаются. Следи за ними и бросай, когда путь к воротам открыт.                              | Попробовать        |
| Новичок  | Забей первую шайбу       | Поймай момент и забей свою первую шайбу. После промаха можно сразу бросить ещё раз.                                  | Далее              |
| Новичок  | Играй каждый день        | В дневной игре тебя ждут три периода. Выходи на лёд каждый день, забивай и двигайся вперёд.                          | Далее              |
| Новичок  | Тренируйся               | Раз в 24 часа тебе доступна тренировка на 50 бросков. Выбирай модель периода и отрабатывай точность.                 | Далее              |
| Новичок  | Дорога в любители        | Забивай голы в дневной игре и выполни указанную цель, чтобы открыть любительскую лигу.                               | Далее              |
| Новичок  | Что ждёт впереди         | В любителях откроются дуэли, турниры, бонусные игры и инвентарь. Сначала докажи себя во дворе.                       | Далее              |
| Новичок  | Начни свой путь          | Первая площадка ждёт. Поймай момент, забей и сделай первый шаг к любительской лиге.                                  | Выйти на лёд       |
| Любитель | Ты в любительской лиге   | Двор остался позади. Теперь тебе доступны новые соперники, соревнования и игровые возможности.                       | Узнать больше      |
| Любитель | Дуэли                    | Бросай вызов другим игрокам и проводи асинхронные матчи один на один.                                                | Далее              |
| Любитель | Турниры                  | Участвуй в индивидуальных турнирах, проходи этапы и борись за победу.                                                | Далее              |
| Любитель | Бонусные игры            | Открывай дополнительные игровые режимы, выполняй их условия и получай награды.                                       | Далее              |
| Любитель | Инвентарь                | Собирай экипировку и расходуемые предметы. Выбирай их перед любительскими матчами и используй с умом.                | Далее              |
| Любитель | Не забывай тренироваться | Тренировки по-прежнему доступны. Возвращайся к ним, чтобы отрабатывать момент броска.                                | Далее              |
| Любитель | Заяви о себе             | Новые режимы открыты. Выходи против других игроков и начинай свой путь в любительской лиге.                          | Перейти в любители |

Перед dev-публикацией проверить текст шага `Дорога в любители` против текущего `amateur.unlock_goals_required` и вписать актуальное число в админке; серверная логика не читает число из текста.

```json
{
  "shooterFrequency": 0.12,
  "goalieFrequency": 0.1,
  "goalFrequency": 0.08
}
```

These are initial slow settings inside the schema range; tune only after rendered tutorial QA.

- [ ] **Step 6: Preview both complete chains**

Expected: Beginner has 8 steps and exactly one interactive step at position 3; Amateur has 7 informational steps; all images load; Back/Next/progress work; preview writes no user completion or natural analytics.

- [ ] **Step 7: Publish to dev and read back**

Publish each chain through the admin UI, read back the published version IDs, and verify `enforcement_enabled=true`. Do not publish to production in this task.

- [ ] **Step 8: Commit approved reference assets**

```bash
git add packages/web/public/onboarding/reference packages/web/src/onboarding/onboardingAssets.test.ts
git commit -m "assets(web): add approved onboarding references"
```

### Task 13: Run full verification and rendered dev acceptance

**Files:**

- Modify only if a verified defect is found: files from Tasks 1–12 and their focused tests.

**Interfaces:**

- Verifies the complete feature; produces no new feature contract.

- [ ] **Step 1: Run formatting check on changed files**

Run: `pnpm exec prettier --check packages/server/src/onboarding packages/server/test/onboarding packages/web/src/onboarding packages/web/src/admin/OnboardingAdmin.tsx packages/web/src/admin/onboardingApi.ts docs/superpowers/specs/2026-09-02-player-onboarding-design.md docs/superpowers/plans/2026-09-02-player-onboarding.md`

Expected: PASS.

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck`

Run: `pnpm lint`

Expected: PASS for both.

- [ ] **Step 3: Build shared core and all packages**

Run: `pnpm --filter @hockey/game-core build`

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Run focused suites**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts test/onboarding test/admin/routes.test.ts`

Run: `pnpm --filter @hockey/web exec vitest run src/onboarding src/app/App.test.tsx src/screens/DailyScreen.test.tsx src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx src/game/PlayView.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS with Postgres 16 and Redis 7 test services available.

- [ ] **Step 6: Perform rendered dev QA as a new user**

Verify on the actual dev deployment SHA:

1. login as a new dev fixture created through the normal dev auth flow;
2. confirm every protected route is blocked by Beginner onboarding;
3. miss at least twice, score once, and confirm Next unlocks only after the server goal;
4. close mid-flow, reopen, and confirm position 1;
5. finish and confirm ordinary app access;
6. verify no lifetime stats, wallet, inventory, achievements or game sessions changed from tutorial attempts.

- [ ] **Step 7: Perform amateur-transition QA**

Use an explicitly approved dev fixture. Set goals immediately below the configured threshold, complete the qualifying game, confirm no interruption on ice, exit play, then confirm Amateur onboarding appears. Complete it and verify subsequent reload does not show it.

- [ ] **Step 8: Perform admin and analytics QA**

Reset each checkbox independently with server read-back. Create a draft edit and prove it is invisible to a player before publish. Preview without analytics, publish, then verify version-specific starts, completion, step drop-off after the 30-minute rule (using controlled test timestamps), repeats and tutorial attempts.

- [ ] **Step 9: Record exact evidence**

Record local command results, commit SHA, integrated dev SHA, deploy workflow URL, migration 089 presence, published version IDs, role/scenario and PASS/FAIL/BLOCKED for every manual scenario. Do not call the feature production-complete without a separate production release and acceptance.

- [ ] **Step 10: Commit verified acceptance fixes**

When verification changed files, stage only the exact onboarding files and commit:

```bash
git commit -m "fix: resolve onboarding acceptance defects"
```

When `git status --short` shows no onboarding changes, skip this commit; never create an empty commit.

---

## Execution Checkpoints

1. After Task 1: review migration safety and the existing-user backfill before any route work.
2. After Task 4: review tutorial anti-cheat/isolation and confirm `game-core` was reused without a version bump.
3. After Task 6: review all server contracts, publication atomicity and statistics definitions.
4. After Task 9: run focused web/server tests before starting admin UI.
5. During Task 12: two explicit visual approval gates before batch assets or dev publication.
6. After Task 13: dev acceptance only; production remains a separate release decision.
