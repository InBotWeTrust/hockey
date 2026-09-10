# Automatic Weekly Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opt-in weekly challenges with an automatic Moscow-time weekly cycle whose next configuration is editable in admin and whose progress applies to every player.

**Architecture:** Keep one immutable database row per played week and add a small lifecycle service that derives Moscow week boundaries, reconciles the current/next instance idempotently, and copies the latest configuration forward. Remove participation as a prerequisite: user DTOs derive progress directly from gameplay events and reward claims remain the idempotency boundary.

**Tech Stack:** PostgreSQL 16 raw SQL migrations, Fastify 4, TypeScript NodeNext, React 18, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-automatic-weekly-challenges-design.md`

## Global Constraints

- Schedule is Monday `00:00 Europe/Moscow` through Sunday `12:00 Europe/Moscow`.
- Future challenge is player-visible only Sunday `12:00` through Monday `00:00` Moscow time.
- Turning the feature off never interrupts a challenge that already started.
- Active challenges are immutable; only the next weekly instance is editable.
- Every player participates automatically and progress does not depend on opening the screen.
- Reward is claimable immediately after all tasks complete and can be granted only once.
- Completed catalog contains only fully completed challenges; failure modal requires non-zero progress.
- Preserve historical challenges and reward claims; use a forward-only migration.
- GLM is prohibited for this repository.

---

### Task 1: Persist automatic lifecycle state and weekly uniqueness

**Files:**
- Create: `packages/server/db/migrations/114_automatic_weekly_challenges.sql`
- Test: `packages/server/test/weeklyChallenge/lifecycle.test.ts`

**Interfaces:**
- Produces: singleton table `weekly_challenge_settings(id boolean primary key default true, enabled boolean, updated_at timestamptz)`.
- Produces: `weekly_challenges.is_automatic boolean`, `weekly_challenges.visible_from timestamptz`, and unique automatic-week index on `start_at`.
- Preserves: all existing challenge, task, acknowledgement, participant, decline, and reward-claim rows.

- [ ] **Step 1: Write a failing migration test**

Add an integration assertion after migrations:

```ts
const settings = await pool.query(
  `select enabled from weekly_challenge_settings where id = true`,
);
expect(settings.rows).toEqual([{ enabled: true }]);

await pool.query(
  `insert into weekly_challenges
     (title, join_open_at, visible_from, start_at, end_at, is_automatic)
   values ('A', $1, $1, $2, $3, true)`,
  [visibleFrom, startAt, endAt],
);
await expect(
  pool.query(
    `insert into weekly_challenges
       (title, join_open_at, visible_from, start_at, end_at, is_automatic)
     values ('B', $1, $1, $2, $3, true)`,
    [visibleFrom, startAt, endAt],
  ),
).rejects.toMatchObject({ code: '23505' });
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/lifecycle.test.ts`

Expected: FAIL because migration 114 and `weekly_challenge_settings` do not exist.

- [ ] **Step 3: Add the forward-only migration**

Create the singleton settings row, additive lifecycle columns, backfill `visible_from = start_at` for historical rows, and a partial unique index:

```sql
create table weekly_challenge_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into weekly_challenge_settings (id, enabled)
values (true, true)
on conflict (id) do nothing;

alter table weekly_challenges
  add column visible_from timestamptz,
  add column is_automatic boolean not null default false;

update weekly_challenges set visible_from = start_at where visible_from is null;
alter table weekly_challenges alter column visible_from set not null;

create unique index weekly_challenges_automatic_start_idx
  on weekly_challenges (start_at)
  where is_automatic;
```

Keep legacy columns for safe rolling compatibility; remove their runtime meaning in later tasks.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/lifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/db/migrations/114_automatic_weekly_challenges.sql packages/server/test/weeklyChallenge/lifecycle.test.ts
git commit -m "feat: add automatic weekly challenge schema"
```

### Task 2: Implement Moscow schedule calculation and idempotent reconciliation

**Files:**
- Create: `packages/server/src/weeklyChallenge/schedule.ts`
- Create: `packages/server/src/weeklyChallenge/lifecycle.ts`
- Modify: `packages/server/test/weeklyChallenge/lifecycle.test.ts`

**Interfaces:**
- Produces: `getWeeklyChallengeWindow(now: Date): { currentStart: Date; currentEnd: Date; nextStart: Date; nextEnd: Date; nextVisibleFrom: Date }`.
- Produces: `reconcileWeeklyChallengeLifecycle(client: PoolClient, now?: Date): Promise<void>`.
- Consumes: singleton feature setting and latest automatic/manual challenge configuration.

- [ ] **Step 1: Add failing pure boundary tests**

```ts
expect(getWeeklyChallengeWindow(new Date('2026-09-13T08:59:59Z'))).toMatchObject({
  currentStart: new Date('2026-09-06T21:00:00Z'),
  currentEnd: new Date('2026-09-13T09:00:00Z'),
  nextStart: new Date('2026-09-13T21:00:00Z'),
});
expect(getWeeklyChallengeWindow(new Date('2026-09-13T09:00:00Z'))).toMatchObject({
  nextVisibleFrom: new Date('2026-09-13T09:00:00Z'),
  nextStart: new Date('2026-09-13T21:00:00Z'),
});
```

Also cover Monday `00:00:00 MSK` and Sunday `23:59:59 MSK`.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/lifecycle.test.ts`

Expected: FAIL because schedule exports do not exist.

- [ ] **Step 3: Implement schedule helpers without local-device timezone dependence**

Use explicit `+03:00` Moscow conversion (Moscow has no DST) and return new `Date` values. Treat intervals as `[start, end)`.

```ts
export interface WeeklyChallengeWindow {
  currentStart: Date;
  currentEnd: Date;
  nextStart: Date;
  nextEnd: Date;
  nextVisibleFrom: Date;
}

export function getWeeklyChallengeWindow(now: Date): WeeklyChallengeWindow;
```

- [ ] **Step 4: Add failing reconciliation tests**

Test that reconciliation:

1. copies title, description, tasks, targets, ordering, and rewards;
2. creates only one next row across two calls;
3. creates only the nearest relevant row after a multi-week gap;
4. creates no next row while disabled;
5. does not invalidate an already-started row when disabled;
6. schedules the next Monday rather than starting midweek after re-enable.

- [ ] **Step 5: Implement transactional reconciliation**

Lock the singleton settings row, find the applicable source configuration, insert the automatic challenge with `on conflict (start_at) where is_automatic do nothing`, then copy tasks only when the challenge insert succeeded:

```ts
export async function reconcileWeeklyChallengeLifecycle(
  client: PoolClient,
  now = new Date(),
): Promise<void>;
```

Set legacy compatibility columns on new rows to `join_open_at = visible_from`, `join_enabled = false`, and `is_active = false`; status selection must no longer depend on those flags.

- [ ] **Step 6: Run focused lifecycle tests**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/lifecycle.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/weeklyChallenge/schedule.ts packages/server/src/weeklyChallenge/lifecycle.ts packages/server/test/weeklyChallenge/lifecycle.test.ts
git commit -m "feat: automate weekly challenge lifecycle"
```

### Task 3: Remove opt-in semantics from player service and reward claims

**Files:**
- Modify: `packages/server/src/weeklyChallenge/types.ts`
- Modify: `packages/server/src/weeklyChallenge/progress.ts`
- Modify: `packages/server/src/weeklyChallenge/service.ts`
- Modify: `packages/server/src/weeklyChallenge/routes.ts`
- Modify: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`
- Modify: `packages/server/test/weeklyChallenge/progress.test.ts`
- Modify: `packages/server/test/weeklyChallenge/catalog.test.ts`

**Interfaces:**
- Produces: status union `'future' | 'running' | 'finished'`.
- Produces DTO fields `hasProgress`, `rewardClaimedAt`, `canClaimReward`; removes join/decline/participant fields.
- Consumes: `reconcileWeeklyChallengeLifecycle` before current/catalog reads.
- Preserves: `POST /weekly-challenge/:id/claim-reward` and failure acknowledgement routes.

- [ ] **Step 1: Rewrite tests to describe automatic participation**

Replace join-flow expectations with:

```ts
const current = await app.inject({
  method: 'GET', url: '/weekly-challenge/current', headers: authHeader(),
});
expect(current.json().challenge).toMatchObject({
  status: 'running',
  hasProgress: true,
  allTasksCompleted: true,
  canClaimReward: true,
  rewardClaimedAt: null,
});
```

Insert the qualifying goal before opening the challenge endpoint. Add an assertion that join and decline routes return `404`.

- [ ] **Step 2: Add exact end-boundary progress test**

Insert one event at `start_at`, one immediately before `end_at`, and one exactly at `end_at`; expect only the first two to count. Change SQL comparisons from `<= end_at` to `< end_at` everywhere in weekly progress and admin aggregation.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/weeklyChallenge.test.ts test/weeklyChallenge/progress.test.ts test/weeklyChallenge/catalog.test.ts`

Expected: FAIL on participant-gated DTOs and inclusive end boundary.

- [ ] **Step 4: Simplify player DTO and mapping**

Use:

```ts
export interface WeeklyChallengeDTO {
  id: string;
  title: string;
  description: string;
  status: 'future' | 'running' | 'finished';
  startAt: string;
  endAt: string;
  reward: { coins: number; stars: number; experience: number };
  rewardClaimedAt: string | null;
  tasks: WeeklyChallengeTaskDTO[];
  hasProgress: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}
```

Always call `fetchWeeklyChallengeProgress` for the user and derive `hasProgress` from any positive task progress. Read claims directly from `weekly_challenge_reward_claims`.

- [ ] **Step 5: Remove join and decline services/routes**

Delete `joinWeeklyChallenge`, `declineWeeklyChallenge`, both POST routes, participant prerequisite in reward claim, and join/decline event writes. Keep historical tables untouched.

- [ ] **Step 6: Make reward claim transactionally idempotent**

Lock the challenge, recompute progress, reject incomplete tasks, and rely on the unique `(challenge_id, user_id)` claim plus the existing grant transaction. On an existing claim return conflict without balance mutation.

- [ ] **Step 7: Implement catalog classification**

```ts
export function classifyWeeklyChallengeForCatalog(
  challenge: WeeklyChallengeDTO,
): WeeklyChallengeCatalogSection | null {
  if (challenge.status === 'future') return 'future';
  if (challenge.status === 'running') return 'active';
  return challenge.allTasksCompleted ? 'completed' : null;
}
```

Queries expose next week only when `visible_from <= now < start_at` and the global switch is enabled. An already-started challenge remains active after the switch is turned off.

- [ ] **Step 8: Run focused server tests**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/weeklyChallenge.test.ts test/weeklyChallenge/progress.test.ts test/weeklyChallenge/catalog.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge
git commit -m "feat: make weekly challenge participation automatic"
```

### Task 4: Restrict failure result to users with partial progress

**Files:**
- Modify: `packages/server/src/weeklyChallenge/service.ts`
- Modify: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`

**Interfaces:**
- Consumes: `WeeklyChallengeDTO.hasProgress`.
- Produces: pending failure only when `status === 'finished' && hasProgress && !allTasksCompleted`.

- [ ] **Step 1: Add failing failure-modal service tests**

Create three finished challenges and assert:

```ts
expect(await pendingFailureFor(noProgressUser)).toEqual({ challenge: null });
expect((await pendingFailureFor(partialUser)).challenge?.id).toBe(partialChallengeId);
expect(await pendingFailureFor(completedUser)).toEqual({ challenge: null });
```

Also acknowledge the partial result and verify it does not return again.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/weeklyChallenge.test.ts -t "failure"`

Expected: FAIL because the query currently requires a participant row.

- [ ] **Step 3: Query finished candidates without participant joins**

Fetch recent ended challenges not acknowledged by this user, map each candidate, and return the first matching:

```ts
if (challenge.hasProgress && !challenge.allTasksCompleted) return { challenge };
```

Acknowledgement validates the same predicate and remains unique per challenge/user.

- [ ] **Step 4: Re-run focused test**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/weeklyChallenge.test.ts -t "failure"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/weeklyChallenge/service.ts packages/server/test/weeklyChallenge/weeklyChallenge.test.ts
git commit -m "fix: show challenge result only after partial progress"
```

### Task 5: Replace admin lifecycle controls with next-week editing

**Files:**
- Modify: `packages/server/src/weeklyChallenge/admin.ts`
- Modify: `packages/server/test/weeklyChallenge/admin.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/WeeklyChallengesAdmin.tsx`
- Modify: `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Produces: `GET /admin/weekly-challenges` response `{ enabled, current, next, history }`.
- Produces: `PATCH /admin/weekly-challenges/settings` body `{ enabled: boolean }`.
- Produces: `PATCH /admin/weekly-challenges/next` body with content/rewards/tasks only.
- Removes: create/activate/deactivate/join-enabled admin actions.

- [ ] **Step 1: Write failing admin API tests**

Assert the response grouping and server-owned dates:

```ts
expect(response.json()).toMatchObject({
  enabled: true,
  current: null,
  next: { title: 'Следующая неделя' },
  history: [],
});
```

Assert that patching `next` changes tasks and rewards, patching an already-started ID returns `409`, disabling preserves current, and re-enabling midweek schedules only next Monday.

- [ ] **Step 2: Run admin server tests and verify failure**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/admin.test.ts`

Expected: FAIL because the grouped contract and settings route do not exist.

- [ ] **Step 3: Implement admin contracts**

Define the editable payload without dates:

```ts
const nextChallengeInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  rewardCoins: z.number().int().min(0).max(10_000_000),
  rewardStars: z.number().int().min(0).max(10_000_000),
  rewardExperience: z.number().int().min(0).max(10_000_000),
  tasks: z.array(taskSchema).min(1).max(12),
});
```

Run lifecycle reconciliation inside the admin transaction before reading or editing. Server selects the next editable row; the client never supplies its dates or arbitrary ID.

- [ ] **Step 4: Update admin statistics semantics**

Remove decline counts. Build the engaged-user set from distinct users with positive progress in any configured task source during the challenge interval, then calculate completed, claimed, task completion, and player rows using the same `[start_at, end_at)` boundary.

- [ ] **Step 5: Run admin server tests**

Run: `pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/admin.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing admin component tests**

Mock `{ enabled, current, next, history }` and assert:

```ts
expect(screen.getByRole('checkbox', { name: 'Недельные челленджи включены' })).toBeChecked();
expect(screen.getByText('Действующая неделя')).toBeInTheDocument();
expect(screen.getByText('Челлендж на следующую неделю')).toBeInTheDocument();
expect(screen.queryByText('Активировать')).not.toBeInTheDocument();
expect(screen.queryByLabelText('Дата начала')).not.toBeInTheDocument();
```

Test save payload excludes dates and mobile task fields render as a single-column card under the existing admin breakpoint.

- [ ] **Step 7: Implement admin API types and screen**

Replace old functions with:

```ts
export function fetchAdminWeeklyChallenges(): Promise<AdminWeeklyChallengeDashboard>;
export function updateAdminWeeklyChallengeSettings(enabled: boolean): Promise<AdminWeeklyChallengeDashboard>;
export function updateNextAdminWeeklyChallenge(input: AdminWeeklyChallengeInput): Promise<AdminWeeklyChallengeDashboard>;
```

Render the global switch, read-only current card, next editor, and read-only history. Keep existing modal invariants and responsive task-card stacking.

- [ ] **Step 8: Run admin component tests**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/WeeklyChallengesAdmin.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/weeklyChallenge/admin.ts packages/server/test/weeklyChallenge/admin.test.ts packages/web/src/admin packages/web/src/app/design-system.css
git commit -m "feat: simplify weekly challenge administration"
```

### Task 6: Simplify the player screen and attention counters

**Files:**
- Modify: `packages/web/src/api/weeklyChallenge.ts`
- Modify: `packages/web/src/screens/WeeklyChallengeScreen.tsx`
- Modify: `packages/web/src/screens/WeeklyChallengeScreen.test.tsx`
- Modify: `packages/web/src/components/BottomNav.tsx`
- Modify: `packages/web/src/components/BottomNav.test.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.test.tsx`
- Modify: `packages/web/src/screens/AchievementsScreen.tsx`
- Modify: `packages/web/src/screens/AchievementsScreen.test.tsx`

**Interfaces:**
- Consumes: automatic `WeeklyChallenge` DTO from Task 3.
- Produces: `weeklyChallengeNeedsAction(challenge) === challenge?.canClaimReward === true`.
- Preserves: reward toast, three filters, section title/count, and failure modal.

- [ ] **Step 1: Rewrite player-screen fixtures and failing assertions**

Remove participant/join fields from fixtures. Assert active challenge displays immediately with progress, future timer says «Старт через», and neither join nor decline button exists:

```ts
expect(screen.queryByRole('button', { name: 'Участвовать' })).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Отказаться' })).not.toBeInTheDocument();
expect(screen.getByText('Действующие (1)')).toBeInTheDocument();
```

- [ ] **Step 2: Add failing counter tests**

For BottomNav, SectionsScreen, and AchievementsScreen assert future/running challenge without reward produces no attention; `canClaimReward: true` produces exactly one action count.

- [ ] **Step 3: Run focused web tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/WeeklyChallengeScreen.test.tsx src/components/BottomNav.test.tsx src/screens/SectionsScreen.test.tsx src/screens/AchievementsScreen.test.tsx`

Expected: FAIL because UI and counters still use `canJoin`.

- [ ] **Step 4: Update web DTO and attention helper**

```ts
export function weeklyChallengeNeedsAction(
  challenge: Pick<WeeklyChallenge, 'canClaimReward'> | null | undefined,
): boolean {
  return challenge?.canClaimReward === true;
}
```

Remove join/decline API functions and mutations.

- [ ] **Step 5: Simplify challenge cards**

Remove participation actions and entry timers. Keep task progress, reward display, immediate claim CTA, future start timer, active end timer, and completed styling.

- [ ] **Step 6: Update all counters**

Count only current or pending rewards that are actually claimable. Deduplicate by challenge ID so the same claimable challenge cannot contribute twice through current and pending collections.

- [ ] **Step 7: Run focused web tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/WeeklyChallengeScreen.test.tsx src/components/BottomNav.test.tsx src/screens/SectionsScreen.test.tsx src/screens/AchievementsScreen.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/api/weeklyChallenge.ts packages/web/src/screens/WeeklyChallengeScreen.tsx packages/web/src/screens/WeeklyChallengeScreen.test.tsx packages/web/src/components/BottomNav.tsx packages/web/src/components/BottomNav.test.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx packages/web/src/screens/AchievementsScreen.tsx packages/web/src/screens/AchievementsScreen.test.tsx
git commit -m "feat: update automatic challenge player flow"
```

### Task 7: Full verification and rendered QA

**Files:**
- Modify only if verification exposes defects in files already listed above.

**Interfaces:**
- Verifies the complete feature against the design spec.

- [ ] **Step 1: Run formatting checks on changed files**

Run: `pnpm exec prettier --check packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge packages/web/src/api/weeklyChallenge.ts packages/web/src/admin/WeeklyChallengesAdmin.tsx packages/web/src/screens/WeeklyChallengeScreen.tsx packages/web/src/components/BottomNav.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/AchievementsScreen.tsx`

Expected: PASS.

- [ ] **Step 2: Build game-core before server verification**

Run: `pnpm --filter @hockey/game-core build`

Expected: PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 4: Run all server and web tests**

Run: `pnpm --filter @hockey/server test && pnpm --filter @hockey/web test`

Expected: PASS with integration tests enabled when `TEST_DATABASE_URL` and `TEST_REDIS_URL` are available; otherwise report skipped integration suites explicitly and run them in the configured dev CI environment.

- [ ] **Step 5: Run production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 6: Perform local browser QA**

Verify at mobile and desktop widths:

1. active challenge appears without participation actions;
2. completed tasks unlock claim immediately;
3. filters and section counts remain aligned;
4. admin switch copy explains that current week continues;
5. current admin card is read-only;
6. next-week editor has fixed dates and responsive task rows;
7. disabling hides future/current only according to the agreed lifecycle.

Record screenshots or concrete observed text/state for each scenario.

- [ ] **Step 7: Review the final diff for scope and migration safety**

Run: `git diff --check HEAD~6..HEAD && git status --short`

Expected: no whitespace errors; only intended tracked files changed; pre-existing untracked assets remain untouched.

- [ ] **Step 8: Commit verification fixes if any**

```bash
git add packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge packages/web/src/api/weeklyChallenge.ts packages/web/src/admin/WeeklyChallengesAdmin.tsx packages/web/src/admin/WeeklyChallengesAdmin.test.tsx packages/web/src/screens/WeeklyChallengeScreen.tsx packages/web/src/screens/WeeklyChallengeScreen.test.tsx packages/web/src/components/BottomNav.tsx packages/web/src/components/BottomNav.test.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx packages/web/src/screens/AchievementsScreen.tsx packages/web/src/screens/AchievementsScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "fix: harden automatic weekly challenges"
```

Do not create an empty commit when no verification fix is needed.
