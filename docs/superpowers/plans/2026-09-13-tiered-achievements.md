# Tiered Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace suitable one-time achievements with sequential tiered achievements while preserving one-time achievements, historical claims, exact reward accounting, and the existing claim-first economy flow.

**Architecture:** Add normalized achievement-stage definitions and per-user stage rows beside the legacy achievement tables, then expose one combined DTO through the existing achievement API. Event evaluators call a focused tier-progress service that enforces opened-at boundaries, idempotent event keys, and one-event/one-stage completion; claiming snapshots and credits the current stage atomically before opening the next stage. Player and admin UIs consume the combined DTO without duplicating cards.

**Tech Stack:** PostgreSQL 16 raw SQL migrations, Fastify 4, TypeScript NodeNext, Zod, React 18, TanStack Query, Vitest, Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-13-tiered-achievements-design.md`

## Global Constraints

- Work in a dedicated worktree based on the integrated branch that already contains migrations 132–134; the first migration in this plan is 135.
- GLM is forbidden for this project.
- One event can complete at most one stage of one achievement chain.
- A next stage is opened only by claiming the previous stage and cannot consume an older event.
- Rewards are credited only by the explicit claim endpoint, transactionally and idempotently.
- Tournament achievement evaluation must not enable ordinary duel stakes, rating, or template rewards.
- Training percentages use the `shots_limit` snapshot stored in the training session.
- Production reward reversals are not part of feature deployment and require a separate audited operation.
- Build `@hockey/game-core` before server tests.

---

### Task 1: Add the normalized stage schema and seed catalogue

**Files:**
- Create: `packages/server/db/migrations/135_tiered_achievements.sql`
- Create: `packages/server/src/achievements/stageCatalog.ts`
- Modify: `packages/server/src/achievements/catalog.ts`
- Modify: `packages/server/test/db/migrations.test.ts`
- Modify: `packages/server/test/achievements/catalog.test.ts`

**Interfaces:**
- Produces `AchievementStageDefinition` with `achievementId`, `stageNumber`, `requirement`, `target`, and four reward fields.
- Produces tables `achievement_stages`, `user_achievement_stages`, and `achievement_stage_events`.

- [ ] **Step 1: Write failing migration and catalogue tests**

Assert that migration 135 creates:

```sql
achievement_stages(
  achievement_id text references achievements(id),
  stage_number int,
  requirement text,
  target jsonb,
  reward_currency int,
  reward_stars int,
  reward_experience int,
  reward_tokens int,
  is_enabled boolean,
  primary key (achievement_id, stage_number)
)
```

```sql
user_achievement_stages(
  user_id uuid references users(id),
  achievement_id text,
  stage_number int,
  opened_at timestamptz,
  progress jsonb,
  completed_at timestamptz,
  claimed_at timestamptz,
  completion_context jsonb,
  reward_snapshot jsonb,
  primary key (user_id, achievement_id, stage_number)
)
```

and an event-deduplication table with unique `(user_id, achievement_id, event_key)`. Assert `ACHIEVEMENT_CATEGORIES` contains `career`, removed IDs are hidden, and every staged ID from the spec has contiguous stage numbers beginning at 1.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts test/achievements/catalog.test.ts
```

Expected: failures for missing migration, category, tables, and stage definitions.

- [ ] **Step 3: Implement migration and typed catalogue**

Create `stageCatalog.ts` exporting:

```ts
export interface AchievementStageDefinition {
  achievementId: string;
  stageNumber: number;
  requirement: string;
  target: Record<string, number | string | boolean>;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  rewardTokens: number;
}

export const ACHIEVEMENT_STAGE_DEFINITIONS: readonly AchievementStageDefinition[];
export const TIERED_ACHIEVEMENT_IDS: ReadonlySet<string>;
```

Encode every threshold and reward from the spec as explicit data. Add new IDs for `career-goals`, `career-experience`, `career-streak`, `express-sniper`, `mix-sniper`, and the three format-specific no-error chains. Keep one-time catalogue rows; set removed rows to `hidden` rather than deleting history.

Migration 135 inserts/updates achievement rows, stage rows, and creates the new category constraint. It migrates existing claimed/completed one-time rows into stage 1 for achievements that become tiered, preserving timestamps and snapshotting the stage-1 reward. It inserts an unopened/current stage row for each user only when needed; no reward is credited by the migration.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/db/migrations/135_tiered_achievements.sql packages/server/src/achievements/stageCatalog.ts packages/server/src/achievements/catalog.ts packages/server/test/db/migrations.test.ts packages/server/test/achievements/catalog.test.ts
git commit -m "feat: add tiered achievement catalogue"
```

---

### Task 2: Implement the stage progress service

**Files:**
- Create: `packages/server/src/achievements/stageProgress.ts`
- Create: `packages/server/test/achievements/stageProgress.test.ts`

**Interfaces:**
- Consumes stage definitions from Task 1.
- Produces:

```ts
export interface StageObservation {
  eventKey: string;
  occurredAt: Date;
  progress: Record<string, number | string | boolean>;
  context?: Record<string, unknown>;
}

export async function observeAchievementStage(
  db: Pool | PoolClient,
  userId: string,
  achievementId: string,
  observation: StageObservation,
): Promise<{ completed: boolean; stageNumber: number | null }>;

export async function openFirstAchievementStages(
  db: Pool | PoolClient,
  userId: string,
  openedAt: Date,
): Promise<void>;
```

- [ ] **Step 1: Write failing service tests**

Cover: duplicate `eventKey`; event before `opened_at`; result exceeding later thresholds; one event completing only the active stage; unsuitable result updating progress without completion; final stage; and a newly created user receiving stage 1 only.

Use concrete assertions such as:

```ts
expect(await observeAchievementStage(pool, userId, 'ice-hand', {
  eventKey: 'daily:session-1',
  occurredAt: afterOpen,
  progress: { accuracyPercent: 100 },
})).toEqual({ completed: true, stageNumber: 1 });

expect(await currentStage(pool, userId, 'ice-hand')).toMatchObject({
  stageNumber: 1,
  completedAt: expect.any(Date),
  claimedAt: null,
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/stageProgress.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement transactional observation**

Lock the active user-stage row. Reject observations older than `opened_at`. Insert the event key with `ON CONFLICT DO NOTHING`; a duplicate returns without changing progress. Evaluate only the locked current stage using a pure predicate keyed by the typed target payload. Store progress and completion context; never create the next stage here.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: all stage-progress tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/achievements/stageProgress.ts packages/server/test/achievements/stageProgress.test.ts
git commit -m "feat: evaluate sequential achievement stages"
```

---

### Task 3: Claim stage rewards atomically

**Files:**
- Create: `packages/server/src/achievements/claimStage.ts`
- Modify: `packages/server/src/achievements/routes.ts`
- Modify: `packages/server/test/achievements/claim.test.ts`

**Interfaces:**
- Produces `claimCurrentAchievementStage(client, userId, achievementId, now)` returning the credited reward, updated balances, and newly opened stage.

- [ ] **Step 1: Add failing claim tests**

Cover: stage claim credits its reward snapshot; ledger metadata includes `achievement_id` and `stage_number`; repeated claim returns 409; claim opens exactly the next stage with `opened_at = claim time`; final claim opens nothing; and experience credited by the claim does not auto-complete the next experience stage.

- [ ] **Step 2: Run test and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/claim.test.ts
```

- [ ] **Step 3: Extract shared balance crediting and implement staged claim**

Move the existing users/account/ledger update sequence into a private helper that preserves lock order: user, currency account, token account. For staged IDs, lock the completed current row, copy the stage reward into `reward_snapshot`, credit once, set `claimed_at`, then insert the next stage with `opened_at = now`. Retain the existing one-time branch unchanged.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: one-time and staged claim tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/achievements/claimStage.ts packages/server/src/achievements/routes.ts packages/server/test/achievements/claim.test.ts
git commit -m "feat: claim tiered achievement rewards"
```

---

### Task 4: Expose combined achievement DTOs and career progress

**Files:**
- Modify: `packages/server/src/achievements/service.ts`
- Modify: `packages/server/src/profile/summary.ts`
- Modify: `packages/server/src/profile/statRating.ts`
- Modify: `packages/server/test/achievements/completionCandidates.test.ts`
- Create: `packages/server/test/achievements/careerStages.test.ts`

**Interfaces:**
- Extends `ProfileAchievementDTO` with optional `stage`:

```ts
stage?: {
  current: number;
  total: number;
  requirement: string;
  progressValue: number;
  targetValue: number;
  history: Array<{ stageNumber: number; claimedAt: string; requirement: string }>;
};
```

- Produces `observeCareerGoal`, `observeCareerExperience`, and `observeCareerStreak` wrappers.

- [ ] **Step 1: Write failing DTO and career tests**

Assert one card per chain, correct current/total/progress/target/history, career category, and no empty duplicated legacy card. Test career goal modes exactly: `daily`, `amateur_duel`, and tournament-classic sessions count; training, bonus, test, and incomplete sessions do not. Test streak uses the existing profile/rating activity-day SQL and user timezone.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/completionCandidates.test.ts test/achievements/careerStages.test.ts
```

- [ ] **Step 3: Implement DTO joins and career observers**

Join the current user-stage row and aggregate claimed history. Reuse one exported activity-day query builder for profile summary, ranking, and career stages so the definition cannot drift. Trigger cumulative checks only from a newly accepted goal, experience-credit, or eligible shot event.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/achievements/service.ts packages/server/src/profile/summary.ts packages/server/src/profile/statRating.ts packages/server/test/achievements/completionCandidates.test.ts packages/server/test/achievements/careerStages.test.ts
git commit -m "feat: expose career achievement stages"
```

---

### Task 5: Convert daily and training evaluators

**Files:**
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/achievements/progress.ts`
- Modify: `packages/server/test/achievements/engine-daily.test.ts`
- Modify: `packages/server/test/achievements/engine-training.test.ts`
- Modify: `packages/server/test/achievements/engine-progress.test.ts`

**Interfaces:**
- Consumes `observeAchievementStage` from Task 2.
- Keeps `completeAchievements` only for one-time IDs.

- [ ] **Step 1: Add failing table-driven daily tests**

For every daily chain from the spec, assert the exact thresholds, stage rewards from the catalogue, a new session requirement, and one-event/one-stage behavior. Include 90%, 96%, and 100% ice-hand cases; all third-period thresholds; final streak lengths; and independent 7/30-game windows opened after claim.

- [ ] **Step 2: Add failing table-driven training tests**

Assert percentage targets use `event.shotsLimit`, not 100; unfinished sessions never complete percentage or finishing goals; opening and finishing streaks use exact lengths; stable-student requires each completed training to be at least 80%; and a failed day resets only the active attempt.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/engine-daily.test.ts test/achievements/engine-training.test.ts test/achievements/engine-progress.test.ts
```

- [ ] **Step 4: Implement the evaluator conversion**

Replace tiered IDs in the completion sets with stage observations whose event keys use immutable session/period IDs. Preserve one-time `first-daily-game`, `ideal-day`, and `first-training`. Remove evaluation calls for `steady-tempo` and `almost-perfect-training`.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 3 command.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements/engine.ts packages/server/src/achievements/progress.ts packages/server/test/achievements/engine-daily.test.ts packages/server/test/achievements/engine-training.test.ts packages/server/test/achievements/engine-progress.test.ts
git commit -m "feat: add daily and training achievement stages"
```

---

### Task 6: Convert duel and tournament-duel evaluators

**Files:**
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/achievements/tournamentEvaluator.ts`
- Modify: `packages/server/src/achievements/tournamentRules.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/src/tournament/fixtureAttempts.ts`
- Modify: `packages/server/test/achievements/engine-duel.test.ts`
- Modify: `packages/server/test/achievements/tournamentEvaluator.test.ts`
- Create: `packages/server/test/achievements/duelStages.test.ts`

**Interfaces:**
- Produces a shared immutable `CompletedDuelAchievementEvent` containing format, host/guest identity, experience snapshots, period scores/results, inventory usage, completion reason, and tournament context.

- [ ] **Step 1: Write failing format and scope tests**

Cover every duel chain and one-time achievement in the spec. Explicitly test Express 60–80 goals, Mix 85–110 total goals, Classic speed, three isolated no-error chains, host/guest/general streak resets, training-before-battle, underdog snapshot differences, and exact score margins.

- [ ] **Step 2: Write tournament parity regressions**

Prove regular-season and playoff duels evaluate ordinary eligible achievements while keeping stakes, ordinary rating, and template rewards disabled. Repeat delivery of the same settled match must not duplicate stage progress.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/engine-duel.test.ts test/achievements/duelStages.test.ts test/achievements/tournamentEvaluator.test.ts
```

- [ ] **Step 4: Implement shared duel-event evaluation**

Normalize ordinary and tournament results into `CompletedDuelAchievementEvent`. Call the same achievement evaluator after authoritative settlement. Remove `handled-pressure`, `economical-master`, and `master-arsenal` evaluation. Do not add recurring five-star duel rewards.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 3 command.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements/engine.ts packages/server/src/achievements/tournamentEvaluator.ts packages/server/src/achievements/tournamentRules.ts packages/server/src/duel/amateur/routes.ts packages/server/src/tournament/fixtureAttempts.ts packages/server/test/achievements/engine-duel.test.ts packages/server/test/achievements/duelStages.test.ts packages/server/test/achievements/tournamentEvaluator.test.ts
git commit -m "feat: evaluate duel achievement stages"
```

---

### Task 7: Preserve one-time tournament, shop, and future achievements

**Files:**
- Modify: `packages/server/src/achievements/tournamentEvaluator.ts`
- Modify: `packages/server/src/achievements/service.ts`
- Modify: `packages/server/test/achievements/tournamentRules.test.ts`
- Modify: `packages/server/test/payments/webhook.test.ts`

**Interfaces:**
- Keeps the existing `completeAchievementCandidates` interface for one-time achievements.

- [ ] **Step 1: Add one-time regression tests**

Assert all tournament IDs in the spec remain one-time, exact rewards match the catalogue, regular medalist excludes first place, monthly top IDs remain untouched, Wallet completes only from a verified successful payment, and Pro Ticket stays future/unclaimable with zero rewards.

- [ ] **Step 2: Run tests and verify RED where catalogue changed**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/tournamentRules.test.ts test/payments/webhook.test.ts
```

- [ ] **Step 3: Align evaluators and catalogue without adding stages**

Keep one-time completion paths and remove any accidental coupling to tier tables. Do not modify tournament-configured prizes or monthly-rating settlement.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/achievements/tournamentEvaluator.ts packages/server/src/achievements/service.ts packages/server/test/achievements/tournamentRules.test.ts packages/server/test/payments/webhook.test.ts
git commit -m "test: preserve one-time achievement rules"
```

---

### Task 8: Add staged achievement administration

**Files:**
- Create: `packages/server/src/achievements/adminStages.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/test/admin/routes.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Adds `GET /admin/achievements/:id/stages`, `POST /admin/achievements/:id/stages`, and `PATCH /admin/achievements/:id/stages/:stageNumber`.
- Stage updates accept requirement, typed target, four nonnegative rewards, enabled state, and ordering; claimed reward snapshots remain immutable.

- [ ] **Step 1: Write failing API validation and immutability tests**

Test contiguous positive stage numbers, category/target validation, rejection of edits that would mutate a claimed snapshot, disabling a future stage, admin audit events, and player counts by current stage.

- [ ] **Step 2: Run server tests and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts
```

- [ ] **Step 3: Implement focused admin service and routes**

Keep SQL and validation out of the already-large route module by delegating to `adminStages.ts`. Return stage statistics in one grouped query without per-stage N+1 queries.

- [ ] **Step 4: Write failing admin UI tests**

Test switching one-time/tiered type, expanding stages, editing future rewards/targets, validation messages, disabled stages, and current-player counts on 323px width without horizontal overflow.

- [ ] **Step 5: Implement the admin stage editor**

Reuse existing admin fields and buttons. On mobile, stack stage fields vertically; on desktop use a compact grid. Do not allow destructive deletion of claimed stages.

- [ ] **Step 6: Run focused server and web tests**

```bash
pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts
pnpm --filter @hockey/web exec vitest run src/admin/AdminScreen.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/achievements/adminStages.ts packages/server/src/admin/routes.ts packages/server/test/admin/routes.test.ts packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat: manage achievement stages in admin"
```

---

### Task 9: Render one player card per achievement chain

**Files:**
- Modify: `packages/web/src/api/achievements.ts`
- Modify: `packages/web/src/screens/AchievementsScreen.tsx`
- Modify: `packages/web/src/screens/AchievementsScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes the optional `stage` DTO from Task 4.

- [ ] **Step 1: Write failing player UI tests**

Test Career filter, one card for a chain, `Этап N из M`, current progress/target, current reward, claim transition to the next stage, claimed history in the details modal, final-complete state, and no claim button for future/disabled stages.

- [ ] **Step 2: Run test and verify RED**

```bash
pnpm --filter @hockey/web exec vitest run src/screens/AchievementsScreen.test.tsx
```

- [ ] **Step 3: Extend API types and UI**

Add `career` to filters. Render stage metadata inside the existing card and standard modal rather than creating a new visual system. Keep reward icons/colors and the standard `modal-card`, `modal-header`, `modal-actions`, and icon-button invariants.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command.

- [ ] **Step 5: Perform rendered mobile checks**

Verify at 323, 360, and 430px widths: no horizontal overflow, long requirements wrap, the claim CTA remains reachable, and switching stages does not jump the page unexpectedly.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/achievements.ts packages/web/src/screens/AchievementsScreen.tsx packages/web/src/screens/AchievementsScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat: show tiered achievement progress"
```

---

### Task 10: Add a dry-run-only production reconciliation command

**Files:**
- Create: `packages/server/src/ops/removedAchievementReconciliation.ts`
- Create: `packages/server/src/ops/removedAchievementReconciliationCli.ts`
- Create: `packages/server/test/ops/removedAchievementReconciliation.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**
- Produces a default read-only command:

```bash
pnpm --filter @hockey/server achievements:removed:reconcile -- --dry-run --achievement-id steady-tempo
```

- Accepts only `steady-tempo` or `economical-master`; mutation mode additionally requires exact audited user IDs and a one-time confirmation token derived from the dry-run artifact.

- [ ] **Step 1: Write failing reconciliation tests**

Test exact selection by ledger metadata, exclusion of neighboring rewards, totals by user/currency, insufficient-balance blocking, all-or-nothing transaction rollback, audit event creation, and dry-run performing no writes.

- [ ] **Step 2: Run test and verify RED**

```bash
pnpm --filter @hockey/server exec vitest run test/ops/removedAchievementReconciliation.test.ts
```

- [ ] **Step 3: Implement dry-run and guarded apply paths**

Dry-run emits JSON containing user IDs, achievement states, ledger IDs, original deltas, and current balances. Apply validates the artifact hash, exact user set, fresh balances, and backup marker; it aborts rather than clamping a balance to zero. It removes the user-visible reward ledger row/state and appends a non-user-visible audit event.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command.

- [ ] **Step 5: Commit the tool without executing it on production**

```bash
git add packages/server/src/ops/removedAchievementReconciliation.ts packages/server/src/ops/removedAchievementReconciliationCli.ts packages/server/test/ops/removedAchievementReconciliation.test.ts packages/server/package.json
git commit -m "feat: add removed achievement reconciliation audit"
```

---

### Task 11: Full verification and release readiness

**Files:**
- Modify only files required to correct failures found by this task.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run formatting checks and inspect the complete diff**

```bash
git diff --check
pnpm exec prettier --check "packages/**/*.{ts,tsx}" "docs/superpowers/{specs,plans}/*.md"
```

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 3: Build shared core and packages**

```bash
pnpm --filter @hockey/game-core build
pnpm build
```

- [ ] **Step 4: Run focused achievement suites**

```bash
pnpm --filter @hockey/server exec vitest run test/achievements test/ops/removedAchievementReconciliation.test.ts test/db/migrations.test.ts test/admin/routes.test.ts
pnpm --filter @hockey/web exec vitest run src/screens/AchievementsScreen.test.tsx src/admin/AdminScreen.test.tsx
```

- [ ] **Step 5: Run the complete test suite**

```bash
pnpm test
```

- [ ] **Step 6: Review migration and deployment boundaries**

Confirm migration 135 is forward-only, no production command runs from migration or deployment, removed achievements are hidden before any optional reconciliation, and no manual database state is required for dev/prod schema correctness.

- [ ] **Step 7: Commit verification fixes**

If Step 1–6 required code corrections, stage each verified file by its explicit
path after reviewing `git status --short` and `git diff`, then commit them with
`git commit -m "fix: harden tiered achievement rollout"`. If verification made
no changes, do not create an empty commit.

Do not deploy or run production reconciliation as part of this task. Dev deployment requires an explicit release action; production mutation requires the separate exact-target audit and approval described in the spec.
