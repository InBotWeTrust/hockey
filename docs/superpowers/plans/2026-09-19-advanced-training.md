# Advanced Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the amateur-only “Продвинутый уровень” training course with seven sequential techniques, one hidden bonus exercise, server-verified practice and assessment, and one-time 1-star/1-experience rewards.

**Architecture:** Integrate on top of `feature/initial-training-course` and expose its five-completion result as the single `beginnerTrainingCompleted` source. Define deterministic advanced scenarios and technique evaluation in `game-core`; let the server own shuffled sessions, shot order, situation outcomes, completion, and rewards. Reuse the initial-course training hub and play renderer, extending them with a third card and stage-specific overlays instead of creating a second training shell.

**Tech Stack:** TypeScript, Vitest, `@hockey/game-core`, Fastify, PostgreSQL raw migrations, React 18, Testing Library, PixiJS.

**Spec:** `docs/superpowers/specs/2026-09-19-marksmanship-bonus-games-and-advanced-training-design.md`

## Global Constraints

- This plan starts only after `feature/initial-training-course` is integrated into current `origin/dev`; its tables and code are dependencies, not code to duplicate.
- The training hub cards appear in this order: “Открытая тренировка”, “Начальный уровень”, “Продвинутый уровень”.
- The advanced card is always visible and opens only when both `hasFullAmateurAccess` and `beginnerTrainingCompleted` are true; show each condition separately.
- Exercises are free, unlimited, and never select or consume inventory.
- Seven main exercises unlock sequentially; the eighth is shown as locked “Бонусное упражнение” until the first seven are complete, then reveals “Сброс ритма”.
- The advanced catalog mirrors task cards: a bare “Прогресс обучения” label and progress bar followed by one “Упражнения (8)” section of eight equal compact cards. Current, future, and completed exercises differ only by `Не пройдено`, `Закрыто`, and `Пройдено` status/access states; there are no large cards or next/completed groups.
- The advanced hub card has its own square cover artwork. Every exercise thumbnail reuses that artwork with its number overlaid by the UI, matching the initial-course pattern.
- Selecting an available or completed exercise opens an initial-course-style confirmation modal with title, description, goal, and `Начать`; gameplay starts only from that button.
- Every main exercise is two demonstrations, five practice situations, then an assessment of ten situations requiring at least seven successes.
- Every accepted practice/assessment shot is checked by the server; a goal using the wrong technique is a failed situation.
- A series is one situation: exercise 7 requires complete two-goal and three-goal variants; exercise 8 requires the prescribed miss followed by the complete scoring series.
- Partial runs are disposable and never restored as durable progress; completed exercises and one-time rewards persist.
- First completion of each of eight exercises gives exactly 1 star and 1 experience; replay gives no reward.

## Review Focus

- A user satisfying only one of the two access conditions must see the card and both condition states but cannot start an exercise; Tasks 1 and 4 cover all four combinations.
- Direct URLs and stale clients must not bypass amateur access, beginner completion, or sequential unlocks; Task 4 tests every server guard.
- A normal goal that does not satisfy the requested technique must fail the situation and return specific feedback; Tasks 2 and 5 cover classification and response copy.
- Every server-verified shot produces a post-result scene notice using the initial-course visual pattern: correct technique, save, miss, early, late, wrong technique, and series progress/failure. Generic request-failure copy is reserved for transport/API errors.
- Retried or concurrent final requests must not add a second completion, star, or experience point; Tasks 3 and 5 pin atomicity.
- Leaving during demonstration, practice, or assessment must discard the run while retaining earlier completed exercises only; Tasks 3, 5, and 7 cover fresh restart behavior.

---

### Task 1: Publish the beginner-course completion adapter

**Files:**

- Modify: `packages/server/src/duel/training/initialCourse.ts`
- Modify: `packages/server/src/duel/training/initialCourseRoutes.ts`
- Modify: `packages/server/test/duel/initialCourseConfig.test.ts`
- Modify: `packages/server/test/duel/initialCourseRoutes.test.ts`
- Modify: `packages/web/src/api/initialTraining.ts`
- Modify: `packages/web/src/api/initialTraining.test.ts`

**Interfaces:**

- Consumes: `initial_training_completion` from the integrated beginner course.
- Produces: `isInitialTrainingCompleted(db, userId): Promise<boolean>` and HTTP field `beginner_training_completed`.

- [ ] **Step 1: Write failing completion-contract tests**

```ts
expect(await isInitialTrainingCompleted(pool, userId)).toBe(false);
await completeAllFive(userId);
expect(await isInitialTrainingCompleted(pool, userId)).toBe(true);
expect(catalog.json()).toMatchObject({ beginner_training_completed: true });
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/initialCourseConfig.test.ts test/duel/initialCourseRoutes.test.ts`

- [ ] **Step 3: Implement the one-source adapter**

```ts
export async function isInitialTrainingCompleted(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ completed: boolean }>(
    `select count(*) = $2::int as completed
       from initial_training_completion
      where user_id = $1`,
    [userId, INITIAL_TRAINING_EXERCISE_KEYS.length],
  );
  return rows[0]?.completed === true;
}
```

Return this value from `GET /duel/training/course`; do not add a second user flag or progress table.

- [ ] **Step 4: Type the browser field and run checks**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/initialCourseConfig.test.ts test/duel/initialCourseRoutes.test.ts && pnpm --filter @hockey/web test -- src/api/initialTraining.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/duel/training packages/server/test/duel packages/web/src/api/initialTraining*
git commit -m "feat(training): expose beginner course completion"
```

### Task 2: Deterministic advanced scenarios and technique evaluation

**Files:**

- Create: `packages/game-core/src/advancedTraining.ts`
- Create: `packages/game-core/test/advancedTraining.test.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/src/version.ts`
- Modify: `packages/game-core/test/version.test.ts`

**Interfaces:**

- Consumes: `classifyMarksmanshipShot` from the marksmanship plan and the existing perspective-court resolver.
- Produces: `ADVANCED_TRAINING_EXERCISE_KEYS`, `ADVANCED_TRAINING_SCENARIOS`, `evaluateAdvancedTrainingShot`, and serializable scenario/state types.

- [ ] **Step 1: Write failing tests for every technique**

```ts
expect(evaluateAdvancedTrainingShot(boardScenario, goalShot)).toMatchObject({
  situationComplete: true,
  success: true,
});
expect(evaluateAdvancedTrainingShot(counterScenario, ordinaryGoal)).toMatchObject({
  situationComplete: true,
  success: false,
  feedbackCode: 'goal_wrong_technique',
});
expect(evaluateAdvancedTrainingShot(secondTempo, firstGoal)).toMatchObject({
  situationComplete: false,
  seriesStep: 1,
});
expect(evaluateAdvancedTrainingShot(rhythmReset, goalInsteadOfMiss)).toMatchObject({
  situationComplete: true,
  success: false,
  feedbackCode: 'intentional_miss_required',
});
```

Also cover `Рано`, `Поздно`, `Вратарь перекрыл`, `Мимо створа`, central-window boundaries, overlap thirds, first leaving window, two- and three-goal series, and the miss-plus-series bonus sequence.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @hockey/game-core test -- test/advancedTraining.test.ts`

- [ ] **Step 3: Define explicit keys, scenario DTOs, and evaluation output**

```ts
export const ADVANCED_TRAINING_EXERCISE_KEYS = [
  'board-side',
  'open-net',
  'crossing',
  'goalie-leaving',
  'narrow-gap',
  'counter-direction',
  'second-tempo',
  'rhythm-reset',
] as const;

export interface AdvancedTrainingEvaluation {
  serverResult: ShotResult['type'];
  acceptedTechnique: boolean;
  situationComplete: boolean;
  success: boolean | null;
  seriesStep: number;
  feedbackCode: AdvancedTrainingFeedbackCode;
}
```

Each scenario fixes the attempt seed, phase offsets, required spatial window, overlap band, timing interval, and series length. Keep at least four verified scenarios per exercise so server selection is not one memorized delay.

- [ ] **Step 4: Implement total technique predicates**

Use canonical shot/window classification for counter-direction and gap width. Define board-side from the requested outer sector, open-net as a non-board goal with no goalkeeper/goal-mouth overlap, crossing as the scenario’s central interval, and goalie-leaving as the first valid interval after velocity points away from the mouth. Series evaluation consumes prior accepted steps and returns a completed situation only after the full combination or the first invalid step.

- [ ] **Step 5: Export and version the behavior**

If Task 1 of the marksmanship plan already moved the version to 59, bump it to 60; otherwise rebase first and preserve a single monotonic increment per deterministic merge history.

- [ ] **Step 6: Run package tests and commit**

Run: `pnpm --filter @hockey/game-core test && pnpm --filter @hockey/game-core build`

```bash
git add packages/game-core/src packages/game-core/test
git commit -m "feat(game-core): evaluate advanced training techniques"
```

### Task 3: Advanced training persistence and configuration

**Files:**

- Create: `packages/server/db/migrations/147_advanced_training.sql`
- Create: `packages/server/test/db/migration147.test.ts`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Produces: disposable run/shot state, durable completions, and immutable reward snapshots.
- Consumes: users and the integrated initial-course tables.

- [ ] **Step 1: Write the failing migration test**

```ts
expect(await tableExists('advanced_training_run')).toBe(true);
expect(await tableExists('advanced_training_shot')).toBe(true);
expect(await tableExists('advanced_training_completion')).toBe(true);
expect(await uniqueConstraint('advanced_training_completion', ['user_id', 'exercise_key'])).toBe(
  true,
);
```

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migration147.test.ts`

- [ ] **Step 3: Create the forward-only schema**

```sql
create table advanced_training_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  exercise_key text not null,
  state text not null check (state in ('active','abandoned','completed','failed')),
  stage text not null check (stage in ('practice','assessment')),
  seed text not null,
  scenario_order jsonb not null,
  situation_index smallint not null default 0,
  successes smallint not null default 0,
  series_state jsonb not null default '{}'::jsonb,
  game_core_version int not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Add one-active-run-per-user, `advanced_training_shot` keyed by `(run_id, shot_index)` with `scenario_id`, input, result, evaluation, and version, plus `advanced_training_completion` keyed by `(user_id, exercise_key)` with `assessment_successes`, `reward_stars`, `reward_experience`, and `completed_at`.

- [ ] **Step 4: Seed a disabled-by-default config snapshot**

Insert `training.advanced_course.config` containing `enabled:false`, `practiceSituations:5`, `assessmentSituations:10`, `requiredSuccesses:7`, `rewardStars:1`, and `rewardExperience:1`. No admin UI is required in this release.

- [ ] **Step 5: Run migration tests and commit**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migration147.test.ts test/db/migrations.test.ts`

```bash
git add packages/server/db/migrations/147_advanced_training.sql packages/server/test/db
git commit -m "feat(server): add advanced training persistence"
```

### Task 4: Catalog, access conditions, and sequential visibility

**Files:**

- Create: `packages/server/src/duel/training/advancedCourse.ts`
- Create: `packages/server/test/duel/advancedCourse.test.ts`
- Modify: `packages/server/src/duel/training/initialCourseRoutes.ts`
- Modify: `packages/server/test/duel/initialCourseRoutes.test.ts`

**Interfaces:**

- Consumes: `resolveAmateurAccess` and `isInitialTrainingCompleted`.
- Produces: `buildAdvancedTrainingCatalog`, `resolveAdvancedTrainingAccess`, and an `advanced_training` block in `GET /duel/training/course`.

- [ ] **Step 1: Write failing access matrix tests**

```ts
it.each([
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [true, true, true],
])('requires amateur=%s and beginner=%s', async (amateur, beginner, unlocked) => {
  expect((await accessFixture(amateur, beginner)).unlocked).toBe(unlocked);
});
```

Assert completed exercises replay, only the next main exercise is available, and the bonus card keeps `title: 'Бонусное упражнение'` and no revealed description until seven main completions exist.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/advancedCourse.test.ts test/duel/initialCourseRoutes.test.ts`

- [ ] **Step 3: Implement the access and catalog DTO**

```ts
interface AdvancedTrainingAccess {
  amateurCompleted: boolean;
  beginnerTrainingCompleted: boolean;
  unlocked: boolean;
}

interface AdvancedTrainingCatalog {
  enabled: boolean;
  access: AdvancedTrainingAccess;
  completedCount: number;
  totalCount: 8;
  exercises: AdvancedTrainingCatalogExercise[];
}
```

Return both conditions even when the course is disabled, so the always-visible card has authoritative lock copy.

- [ ] **Step 4: Add the nested response to the existing catalog endpoint**

`GET /duel/training/course` returns `advanced_training` alongside the beginner catalog. This avoids a second page-load race and guarantees both cards use one server snapshot.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/duel/advancedCourse.test.ts test/duel/initialCourseRoutes.test.ts
git add packages/server/src/duel/training packages/server/test/duel
git commit -m "feat(server): publish advanced training catalog"
```

### Task 5: Server-owned runs, practice, assessment, and rewards

**Files:**

- Create: `packages/server/src/duel/training/advancedCourseRoutes.ts`
- Create: `packages/server/test/duel/advancedCourseRoutes.test.ts`
- Modify: `packages/server/src/duel/seed.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**

- Produces: `POST /duel/training/advanced/:exerciseKey/start`, `/shot`, `/practice/restart`, and `/assessment/start`.
- Consumes: Task 2 evaluation and Task 4 access/catalog functions.

- [ ] **Step 1: Write failing route tests for guards and lifecycle**

Cover unauthenticated, non-amateur, incomplete beginner course, locked sequence, hidden bonus, wrong run owner, wrong shot index, old game-core version, wrong technique goal, practice five situations, assessment `6/10` fail and `7/10` pass, replay without reward, duplicate final shot, and concurrent final requests.

- [ ] **Step 2: Run the route suite and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/advancedCourseRoutes.test.ts`

- [ ] **Step 3: Add deterministic seed derivation and route registration**

```ts
export function deriveAdvancedTrainingSeed(
  runId: string,
  userId: string,
  exerciseKey: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${runId}:${userId}:advanced_training:${exerciseKey}:${secret}`)
    .digest('hex');
}
```

Register routes with the existing training seed secret and gameplay-lock middleware.

- [ ] **Step 4: Start runs with server-shuffled scenario orders**

Use the run seed and `createRng` to select distinct prepared scenarios and shuffle them. Return two demonstration scripts plus the first practice scenario. Starting a new run marks an existing active advanced run abandoned; it does not delete durable completion.

- [ ] **Step 5: Verify each accepted shot and situation transition**

Lock the run, assert ownership/version/index, reproduce the shot with authoritative scenario speeds/phases, call `evaluateAdvancedTrainingShot`, insert the shot before advancing state, and count a success only when `situationComplete && success`. Return feedback plus the next scenario; never accept a client-supplied aggregate.

- [ ] **Step 6: Complete and reward in one transaction**

```sql
insert into advanced_training_completion
  (user_id, exercise_key, completed_at, assessment_successes, reward_stars, reward_experience)
values ($1, $2, $3, $4, 1, 1)
on conflict (user_id, exercise_key) do nothing
returning exercise_key;
```

Only when this insert returns a row, lock/update the user’s stars and experience and call `observeCareerExperience` with event key `advanced-training:<exerciseKey>:reward`. Then close the run in the same transaction.

- [ ] **Step 7: Run tests and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/duel/advancedCourseRoutes.test.ts test/duel/advancedCourse.test.ts`

```bash
git add packages/server/src/app.ts packages/server/src/duel packages/server/test/duel
git commit -m "feat(server): verify advanced training sessions"
```

### Task 6: Browser API and reusable training play state

**Files:**

- Modify: `packages/web/src/api/initialTraining.ts`
- Modify: `packages/web/src/api/initialTraining.test.ts`
- Create: `packages/web/src/api/advancedTraining.ts`
- Create: `packages/web/src/api/advancedTraining.test.ts`
- Create: `packages/web/src/components/AdvancedTrainingPlay.tsx`
- Create: `packages/web/src/components/AdvancedTrainingPlay.test.tsx`

**Interfaces:**

- Consumes: Task 5 route DTOs.
- Produces: typed start/shot/stage actions and a play component that reuses `PlayView`.

- [ ] **Step 1: Write failing API and component tests**

Assert exact endpoints/payloads, two autoplay demonstrations, five practice situations with hint/feedback, assessment without hints, wrong-technique goal copy, series progress, `7/10` pass, and exit discarding the active UI state.

- [ ] **Step 2: Define browser DTOs and API calls**

```ts
export type AdvancedTrainingStage = 'demonstration' | 'practice' | 'assessment';
export interface AdvancedTrainingShotResponse {
  server_result: ShotResultType;
  feedback_code: AdvancedTrainingFeedbackCode;
  situation_complete: boolean;
  situation_success: boolean | null;
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  state: AdvancedTrainingRunState;
}
```

- [ ] **Step 3: Implement demonstrations and practice guidance**

Drive two read-only scripted shots from the server’s demonstration definitions. Pause before each important moment, draw the trajectory overlay, and show explanation copy. Practice uses the server-selected scenario, a soft pre-window glow, and mapped feedback: `Рано`, `Поздно`, `Вратарь перекрыл`, `Мимо створа`, or the exercise-specific wrong-technique message.

Feed every accepted practice and assessment response into `PlayView.statusNotice`, reusing the initial-course notice styling. Delay the notice until the result overlay clears (`500 ms`) and keep it visible for `3.5 s`. Use success tone only for a correctly completed technique or an accepted intermediate series step; saves, misses, timing errors, wrong-technique goals, and broken series use error tone. API failures remain separate generic error notices.

- [ ] **Step 4: Implement assessment and series behavior**

Remove all pre-shot hints in assessment. Keep one HUD situation count per full combination, while the series indicator shows internal step progress. Only the server’s `situation_complete` advances the `x / 10` count.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/web test -- src/api/initialTraining.test.ts src/api/advancedTraining.test.ts src/components/AdvancedTrainingPlay.test.tsx`

```bash
git add packages/web/src/api packages/web/src/components/AdvancedTrainingPlay*
git commit -m "feat(web): add advanced training play flow"
```

### Task 7: Three-card hub and advanced exercise catalog

**Files:**

- Modify: `packages/web/src/components/InitialTrainingCourse.tsx`
- Modify: `packages/web/src/components/InitialTrainingCourse.test.tsx`
- Create: `packages/web/src/components/AdvancedTrainingCourse.tsx`
- Create: `packages/web/src/components/AdvancedTrainingCourse.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: `advanced_training` nested catalog and `AdvancedTrainingPlay`.
- Produces: ordered three-card training page, advanced catalog routing, and responsive states.

- [ ] **Step 1: Write failing hub and route tests**

Assert card order, card always visible, separate checked/unchecked access conditions for four combinations, direct locked URL fallback to catalog, a bare `Прогресс обучения` bar with `completed / 8`, one `Упражнения (8)` section, eight equal compact cards in sequence, `Не пройдено` on the current available exercise, `Закрыто` on future exercises, `Пройдено` on replayable completions, progress/status-only changes after completion, concealed eighth-card copy, and reveal after seven completions.

Also assert the dedicated advanced cover on the hub, the same cover plus numeric overlay on all eight exercise thumbnails, and the pre-play modal containing the selected exercise title, description, goal, and `Начать` button. Clicking the card must not mount gameplay until `Начать` is pressed.

- [ ] **Step 2: Refactor the existing hub into the agreed three cards**

Render in this order:

```tsx
<TrainingModeCard title="Открытая тренировка" />
<TrainingModeCard title="Начальный уровень" />
<TrainingModeCard title="Продвинутый уровень" lockConditions={advancedConditions} />
```

Keep the cards visibly labeled, use `.section-label.section-label--page` above catalog groups, and keep any modal close control in the title header row.

- [ ] **Step 3: Add advanced catalog and routing**

Use `section=advanced`, `exercise=<key>`, and `play=1`. Locked or unknown deep links resolve to the advanced catalog. The bonus card uses only “Бонусное упражнение” while concealed, then switches to “Сброс ритма” with its actual description.

Follow the existing task-card hierarchy. Put `.section-label.section-label--page` with text `Прогресс обучения` directly above the existing task/initial-training progress-bar primitive, without an extra panel or card wrapper. Then render `.section-label.section-label--page` with `Упражнения (8)` and eight equal compact cards: numbered square artwork, title, `1` star and `1` experience, technique/goal copy, and the right-aligned status pill. Do not render a large primary card or separate next/completed sections.

Use `/sprites/advanced-training-course-cover.webp` for the hub card and as the shared exercise thumbnail image, with the number rendered as a CSS/HTML overlay. Before entering `AdvancedTrainingPlay`, show the same modal structure used by the initial course: title, short description, explicit goal, and `Начать`.

- [ ] **Step 4: Add responsive CSS without changing open training gameplay**

Reuse the existing task/course card and progress primitives and add only advanced modifiers for the three status/access states, concealed bonus copy, demonstration overlay, hint glow, and series progress. Verify equal card dimensions, status alignment, and computed alignment of `.section-label--page` against card left edges.

- [ ] **Step 5: Run rendered tests and commit**

Run: `pnpm --filter @hockey/web test -- src/components/InitialTrainingCourse.test.tsx src/components/AdvancedTrainingCourse.test.tsx src/components/AdvancedTrainingPlay.test.tsx src/screens/DailyScreen.test.tsx`

```bash
git add packages/web/src/components packages/web/src/screens/DailyScreen* packages/web/src/app/design-system.css
git commit -m "feat(web): add advanced training catalog"
```

### Task 8: Full verification and dev release gate

**Files:**

- Modify: `docs/superpowers/plans/2026-09-19-advanced-training.md` only to record exact evidence.

**Interfaces:**

- Consumes: all previous tasks and the integrated beginner-course implementation.
- Produces: a branch ready for a PR to `dev`; production remains out of scope.

- [ ] **Step 1: Run all proportional local checks**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/game-core test
pnpm --filter @hockey/server exec vitest run test/duel/initialCourseConfig.test.ts test/duel/initialCourseRoutes.test.ts test/duel/advancedCourse.test.ts test/duel/advancedCourseRoutes.test.ts test/db/migration147.test.ts
pnpm --filter @hockey/web test -- src/api/initialTraining.test.ts src/api/advancedTraining.test.ts src/components/InitialTrainingCourse.test.tsx src/components/AdvancedTrainingCourse.test.tsx src/components/AdvancedTrainingPlay.test.tsx src/screens/DailyScreen.test.tsx
pnpm typecheck
pnpm lint
git diff --check
```

- [ ] **Step 2: Review the diff against persistence and access boundaries**

Confirm no duplicate beginner progress, no inventory calls, no daily limits, no partial durable progress, exactly eight one-time reward keys, and every start/complete endpoint rechecks both access conditions and sequence.

- [ ] **Step 3: Perform local rendered acceptance**

At a small mobile viewport, capture the hub in locked/partial/open states, the bare progress bar, all eight equal exercise cards, all three card statuses, progress/status transitions after completion without layout promotion, one demonstration, one practice error for each feedback class, a `6/10` failure, a `7/10` success, the second-tempo series, the concealed/revealed bonus card, reload during a run, repeat after completion, and the all-complete catalog.

- [ ] **Step 4: Commit verification notes**

```bash
git add docs/superpowers/plans/2026-09-19-advanced-training.md
git commit -m "docs: record advanced training verification"
```

- [ ] **Step 5: Open a PR targeting `dev` only after user approval**

Do not merge or deploy without explicit dev-release authorization. Report local checks, CI, integrated SHA, dev runtime, and browser acceptance separately.
