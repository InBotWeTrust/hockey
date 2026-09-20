# Bonus Endurance And Catalog Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the dev-only seven-game «Выносливость» bonus track with server-authoritative rolling goal deadlines, then align daily-attempt progress and all bonus-card statuses with the training catalog design.

**Architecture:** Extend the existing bonus skill and qualification discriminated unions with `endurance` and `survive_goal_windows`. Keep shot resolution unchanged, persist the active goal-window timestamps on the attempt, and settle expiry through the existing transaction and first-clear economy path. Reuse the current bonus catalog and play screen, adding focused timer helpers and training-derived progress/status presentation instead of a parallel game mode.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL raw migrations, React 18, TanStack Query, Zustand, PixiJS, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-20-bonus-endurance-design.md`

## Global Constraints

- Work only on `feature/bonus-endurance`, currently based on verified `origin/dev` SHA `319a5b301e25a46aee083f38cd28072459d93752`; fetch `origin/dev` again before implementation and integrate it if it moved.
- Preserve the user's occupied main checkout and all unrelated work; use the attached isolated worktree.
- Dev only. The authorized outcome is a PR into `dev`, exact-SHA dev deployment, and browser QA; production is excluded.
- Endurance games use one period, no break, no shot quota, no inventory, the existing amateur arena/goalkeeper, 100 daily attempts, and first-clear reward `{ coins: 0, stars: 1, experience: 1 }`.
- Game durations/windows are exactly `180000/7000`, `190000/6500`, `200000/6000`, `210000/5500`, `220000/5000`, `230000/4000`, `240000/3000` milliseconds.
- First two endurance games keep beginner access; games 3–7 keep the shared full-amateur gate and predecessor completion rule.
- A shot started at or before the goal deadline may settle afterward; a shot started after it is not stored. A goal resets the window only from the next playable timestamp; a save or miss never resets it.
- Total deadline earlier than or equal to the goal-window deadline means completion; goal-window deadline earlier than total deadline means failure.
- General wall time never pauses for animations, backgrounding, reloads, or network loss.
- Shot physics do not change; do not bump `GAME_CORE_VERSION` unless implementation actually changes deterministic game-core behavior.
- User-facing copy is Russian; identifiers, comments, commits, and persisted codes are English.

## Review Focus

- Exact deadline equality: a shot at the window deadline is eligible, a shot 1 ms later is rejected, and an exact total/window tie completes; Tasks 1 and 3 pin all three boundaries.
- Lock ordering: background/catalog reconciliation must lock user and currency state before the attempt so expiry completion cannot deadlock or grant twice; Task 3 adds transaction and concurrency coverage.
- Forced animation timing: a confirmed goal must start the next window after authoritative flight plus the shared 1,000 ms result pause, while saves and misses keep the old deadline; Tasks 1, 3, and 5 cover the same formula.
- Stale and duplicate clients: reload, visibility return, offline recovery, and retrying a stored shot must converge on the same timestamps and terminal result; Tasks 3 and 5 cover each entry point.
- Existing tracks: speed, accuracy, and marksmanship retain qualification, two/two/one-hundred allowances, card actionability, and play HUD behavior; Tasks 2, 4, 5, and 6 include regression assertions.

---

### Task 1: Endurance qualification and pure deadline rules

**Files:**

- Create: `packages/server/src/bonusGames/endurance.ts`
- Create: `packages/server/test/bonusGames/endurance.test.ts`
- Modify: `packages/server/src/bonusGames/qualification.ts`
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/test/bonusGames/qualification.test.ts`
- Modify: `packages/server/test/bonusGames/types.test.ts`

**Interfaces:**

- Produces: `BonusSkillCode = 'speed' | 'accuracy' | 'marksmanship' | 'endurance'`.
- Produces: `EnduranceQualificationRules = { type: 'survive_goal_windows'; activeTimeMs: number; goalWindowMs: number }`.
- Produces: `evaluateEnduranceDeadlines(input): 'active' | 'completed' | 'failed'` and `nextEnduranceGoalWindow(input): { startsAt: Date; endsAt: Date }`.
- Produces: `BONUS_SHOT_RESULT_PAUSE_MS = 1_000` as the single server constant used by scene-clock validation and endurance readiness.

- [ ] **Step 1: Write failing qualification tests**

```ts
const enduranceRules = {
  type: 'survive_goal_windows' as const,
  activeTimeMs: 180_000,
  goalWindowMs: 7_000,
};

expect(normalizeBonusQualificationRules(enduranceRules, legacy)).toEqual(enduranceRules);
expect(() =>
  validateBonusSkillRules('endurance', enduranceRules, [period(1, 180_000, null)], false),
).not.toThrow();
expect(() =>
  validateBonusSkillRules('endurance', enduranceRules, [period(1, 180_000, 1)], false),
).toThrow('endurance period cannot have a shots limit');
expect(() =>
  validateBonusSkillRules('endurance', enduranceRules, [period(1, 180_000, null)], true),
).toThrow('endurance inventory must be disabled');
```

- [ ] **Step 2: Write failing timestamp boundary tests**

```ts
it.each([
  ['active', '2026-09-20T10:00:02.000Z'],
  ['completed', '2026-09-20T10:03:00.000Z'],
])('returns %s at %s', (expected, now) => {
  expect(
    evaluateEnduranceDeadlines({
      periodEndsAt: new Date('2026-09-20T10:03:00.000Z'),
      goalWindowEndsAt: new Date('2026-09-20T10:03:00.000Z'),
      now: new Date(now),
    }),
  ).toBe(expected);
});

expect(
  evaluateEnduranceDeadlines({
    periodEndsAt: new Date('2026-09-20T10:03:00.000Z'),
    goalWindowEndsAt: new Date('2026-09-20T10:00:07.000Z'),
    now: new Date('2026-09-20T10:00:07.000Z'),
  }),
).toBe('failed');
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/endurance.test.ts test/bonusGames/qualification.test.ts test/bonusGames/types.test.ts
```

Expected: FAIL because the endurance union member and helper module do not exist.

- [ ] **Step 4: Implement strict schemas and skill validation**

```ts
const enduranceQualificationSchema = z
  .object({
    type: z.literal('survive_goal_windows'),
    activeTimeMs: z.number().int().min(1_000).max(86_400_000),
    goalWindowMs: z.number().int().min(1_000).max(60_000),
  })
  .strict();
```

For `endurance`, require one no-quota period, matching `activeTimeMs`, and disabled inventory. Keep goal and point evaluation unchanged; endurance terminal evaluation belongs to the deadline helper, not `evaluateBonusQualification`.

- [ ] **Step 5: Implement pure deadline and readiness helpers**

```ts
export function evaluateEnduranceDeadlines(input: {
  periodEndsAt: Date;
  goalWindowEndsAt: Date;
  now: Date;
}): 'active' | 'completed' | 'failed' {
  const terminalAt = Math.min(input.periodEndsAt.getTime(), input.goalWindowEndsAt.getTime());
  if (input.now.getTime() < terminalAt) return 'active';
  return input.periodEndsAt.getTime() <= input.goalWindowEndsAt.getTime()
    ? 'completed'
    : 'failed';
}

export function nextEnduranceGoalWindow(input: {
  shotStartedAt: Date;
  flightMs: number;
  goalWindowMs: number;
}): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(
    input.shotStartedAt.getTime() + input.flightMs + BONUS_SHOT_RESULT_PAUSE_MS,
  );
  return { startsAt, endsAt: new Date(startsAt.getTime() + input.goalWindowMs) };
}
```

- [ ] **Step 6: Run focused tests and commit**

Run the Step 3 command again. Expected: PASS.

```bash
git add packages/server/src/bonusGames/endurance.ts packages/server/src/bonusGames/qualification.ts packages/server/src/bonusGames/types.ts packages/server/test/bonusGames
git commit -m "feat(server): define endurance bonus rules"
```

### Task 2: Additive migration and seven dev games

**Files:**

- Create: `packages/server/db/migrations/148_bonus_endurance_games.sql`
- Create: `packages/server/test/db/migration148.test.ts`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Consumes: arena `00000000-0000-4000-8000-000000000700` from migration 146.
- Produces: attempt columns `goal_window_started_at timestamptz null` and `goal_window_ends_at timestamptz null`.
- Produces: active free games `endurance-1` through `endurance-7` with stable UUIDs `00000000-0000-4000-8000-000000000711` through `...717`.

- [ ] **Step 1: Write the migration contract test before the migration**

```ts
expect(await column('bonus_game_attempt', 'goal_window_started_at')).toMatchObject({
  data_type: 'timestamp with time zone',
  is_nullable: 'YES',
});
expect(await column('bonus_game_attempt', 'goal_window_ends_at')).toMatchObject({
  data_type: 'timestamp with time zone',
  is_nullable: 'YES',
});
expect(await countGames('endurance')).toBe(7);
expect(await game('endurance-7')).toMatchObject({
  skill_code: 'endurance',
  target_goals: 1,
  total_periods: 1,
  break_duration_ms: 0,
  reward_coins: 0,
  reward_stars: 1,
  reward_experience: 1,
});
```

Assert all seven `(activeTimeMs, goalWindowMs)` pairs, shared arena ID, `shotsLimit: null`, and `use_inventory=false`.

- [ ] **Step 2: Run the migration test and confirm RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/db/migration148.test.ts
```

Expected: FAIL because migration 148 and the endurance schema do not exist. If the integration environment is unavailable, stop and configure the dedicated test database; a skipped migration test is not RED.

- [ ] **Step 3: Add schema changes and constraints**

```sql
alter table bonus_game_attempt
  add column goal_window_started_at timestamptz,
  add column goal_window_ends_at timestamptz,
  add constraint bonus_game_attempt_goal_window_pair_check check (
    (goal_window_started_at is null and goal_window_ends_at is null)
    or (
      goal_window_started_at is not null
      and goal_window_ends_at is not null
      and goal_window_ends_at > goal_window_started_at
    )
  );
```

Recreate only the affected checks so `bonus_game.skill_code` and `bonus_game_daily_attempt_slot.skill_code` accept `endurance`, and `bonus_game_period_log.closed_reason` accepts `goal_window_timeout`. Preserve every existing value and the slot range `1..100`.

- [ ] **Step 4: Seed the seven definitions from a values table**

```sql
values
  ('00000000-0000-4000-8000-000000000711'::uuid, 1, 180000, 7000),
  ('00000000-0000-4000-8000-000000000712'::uuid, 2, 190000, 6500),
  ('00000000-0000-4000-8000-000000000713'::uuid, 3, 200000, 6000),
  ('00000000-0000-4000-8000-000000000714'::uuid, 4, 210000, 5500),
  ('00000000-0000-4000-8000-000000000715'::uuid, 5, 220000, 5000),
  ('00000000-0000-4000-8000-000000000716'::uuid, 6, 230000, 4000),
  ('00000000-0000-4000-8000-000000000717'::uuid, 7, 240000, 3000)
```

Use slugs/titles `endurance-N` / `Выносливость N`, `access_type='free'`, `target_goals=1`, one period, amateur speeds `{goal:0.5, goalie:0.6, shooter:0.75, puck:1.25}`, arena `...700`, and the existing amateur goalkeeper URLs.

- [ ] **Step 5: Prove forward compatibility and migration replay behavior**

Extend `migrations.test.ts` to assert track counts and representative speed/accuracy/marksmanship rows remain unchanged after applying all migrations. Follow the repository's existing migration harness behavior; do not make the production migration destructive merely to simulate a second application.

- [ ] **Step 6: Run migration tests and commit**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/db/migration148.test.ts test/db/migrations.test.ts
```

Expected: PASS with both tests executed, not skipped.

```bash
git add packages/server/db/migrations/148_bonus_endurance_games.sql packages/server/test/db/migration148.test.ts packages/server/test/db/migrations.test.ts
git commit -m "feat(server): seed endurance bonus games"
```

### Task 3: Authoritative attempt lifecycle, expiry, and rewards

**Files:**

- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/reconcile.ts`
- Modify: `packages/server/src/bonusGames/economy.ts`
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/test/bonusGames/attempts.test.ts`
- Modify: `packages/server/test/bonusGames/shots.test.ts`
- Modify: `packages/server/test/bonusGames/serviceDto.test.ts`
- Create: `packages/server/test/bonusGames/economy.test.ts`

**Interfaces:**

- Consumes: Task 1's `evaluateEnduranceDeadlines`, `nextEnduranceGoalWindow`, and constant.
- Produces: active attempt fields `goalWindowStartedAt: string | null` and `goalWindowEndsAt: string | null`.
- Produces: economy-safe reconciliation wrappers for current and owned attempts; every wrapper locks balances before locking the attempt.

- [ ] **Step 1: Write failing start and DTO tests**

```ts
expect(started).toMatchObject({
  state: 'period_active',
  periodStartedAt: '2026-09-20T10:00:00.000Z',
  goalWindowStartedAt: '2026-09-20T10:00:00.000Z',
  goalWindowEndsAt: '2026-09-20T10:00:07.000Z',
});

expect(nonEndurance.goalWindowStartedAt).toBeNull();
expect(nonEndurance.goalWindowEndsAt).toBeNull();
```

- [ ] **Step 2: Write failing shot-window tests**

Cover a goal at the exact deadline, a goal 1 ms late, a request arriving after expiry for an eligible shot, a save and miss that retain the old timestamps, and a goal that sets the next timestamps to `shotStartedAt + flightMs + 1_000` and then `+ goalWindowMs`.

```ts
expect(goal.attempt.goalWindowStartedAt).toBe(expectedReadyAt.toISOString());
expect(goal.attempt.goalWindowEndsAt).toBe(
  new Date(expectedReadyAt.getTime() + 7_000).toISOString(),
);
expect(save.attempt.goalWindowEndsAt).toBe(previousDeadline.toISOString());
```

- [ ] **Step 3: Write failing reconciliation and concurrency tests**

```ts
expect(await reconcileAt(totalDeadline)).toMatchObject({
  status: 'completed',
  state: 'closed',
  rewardGranted: true,
});
expect(await completionCount(attemptId)).toBe(1);
expect(await rewardEventCount(attemptId)).toBe(1);
```

Add goal-window-first failure with period log reason `goal_window_timeout`, an exact tie that completes, two concurrent reconcile requests, duplicate final shot retry, and a background reconcile followed by a start request. Assert one completion/reward and stable balances.

- [ ] **Step 4: Run focused suites and confirm RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts test/bonusGames/shots.test.ts test/bonusGames/serviceDto.test.ts test/bonusGames/economy.test.ts
```

Expected: FAIL on absent timestamp fields and endurance settlement.

- [ ] **Step 5: Initialize and serialize goal-window state**

In `startBonusPeriod`, parse the snapshotted qualification. For endurance, update all three timestamps in the same row lock:

```sql
set state = 'period_active',
    current_period = current_period + 1,
    period_started_at = $1,
    goal_window_started_at = $1,
    goal_window_ends_at = $2,
    break_started_at = null,
    updated_at = $1
```

For other skills, leave both goal-window columns null. Add row/DTO fields and clear them on completion, failure, and abandonment.

- [ ] **Step 6: Settle endurance expiry through the economy-safe path**

Before any attempt row lock, call `lockBonusEconomyBalances(client, userId, now)`. Then reconcile:

```ts
const outcome = evaluateEnduranceDeadlines({ periodEndsAt, goalWindowEndsAt, now });
if (outcome === 'completed') {
  await closeBonusPeriod(client, attempt, periodEndsAt, 'target_reached');
  await grantFirstClearReward(client, {
    userId: attempt.user_id,
    gameId: attempt.bonus_game_id,
    attemptId: attempt.id,
    reward: attempt.reward_snapshot,
    now: periodEndsAt,
  });
  return closeAttempt(attempt.id, 'completed', periodEndsAt);
}
if (outcome === 'failed') {
  await closeBonusPeriod(client, attempt, goalWindowEndsAt, 'goal_window_timeout');
  return closeAttempt(attempt.id, 'failed', goalWindowEndsAt);
}
```

Replace the route-local attempt-first reconciliation with exported service wrappers that enforce the lock order. Audit every `reconcileBonusAttempt` call site; `startOrResumeBonusAttempt`, `startBonusPeriod`, `submitBonusShot`, `abandonBonusAttempt`, catalog refresh, and owned-attempt refresh must all acquire user/currency locks first.

- [ ] **Step 7: Accept eligible late-arriving shots and reset only on goals**

Fetch a stored shot before terminal reconciliation for endurance, as marksmanship already does. Compute `authoritativeShotStartedAt` before deciding expiry. Reject and reconcile when it is later than the goal or total deadline. After a stored goal, update both window timestamps from `nextEnduranceGoalWindow`; after save/miss, keep them unchanged and reconcile against the old deadline.

- [ ] **Step 8: Run focused suites and commit**

Run the Step 4 command again. Expected: PASS.

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames
git commit -m "feat(server): settle endurance attempts authoritatively"
```

### Task 4: Routes, allowances, catalog, and admin server contract

**Files:**

- Modify: `packages/server/src/bonusGames/routes.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/catalog.ts`
- Modify: `packages/server/src/bonusGames/admin.ts`
- Modify: `packages/server/test/bonusGames/routes.test.ts`
- Modify: `packages/server/test/bonusGames/catalog.test.ts`
- Modify: `packages/server/test/bonusGames/admin.test.ts`

**Interfaces:**

- Produces: allowances `{ speed: 2, accuracy: 2, marksmanship: 100, endurance: 100 }`.
- Produces: HTTP attempt fields `goal_window_started_at` and `goal_window_ends_at`.
- Produces: admin create/patch support for `endurance` and `survive_goal_windows`.

- [ ] **Step 1: Add failing route and catalog tests**

```ts
expect(catalog.attempt_allowances).toMatchObject({
  speed: { daily_limit: 2 },
  accuracy: { daily_limit: 2 },
  marksmanship: { daily_limit: 100 },
  endurance: { daily_limit: 100, used: 0, remaining: 100 },
});
expect(attempt).toMatchObject({
  skill_code: 'endurance',
  goal_window_started_at: '2026-09-20T10:00:00.000Z',
  goal_window_ends_at: '2026-09-20T10:00:07.000Z',
});
```

Also assert an active endurance attempt remains resumable after catalog refresh and games 3–7 retain the shared amateur access behavior.

- [ ] **Step 2: Add failing admin validation tests**

Accept a complete endurance definition, and reject two periods, a shot limit, inventory, non-zero break, duration mismatch, and `goalWindowMs` outside `1_000..60_000`.

```ts
await expect(createGame(validEndurance)).resolves.toMatchObject({ skillCode: 'endurance' });
await expect(createGame({ ...validEndurance, useInventory: true })).rejects.toMatchObject({
  code: 'invalid_bonus_game_definition',
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/routes.test.ts test/bonusGames/catalog.test.ts test/bonusGames/admin.test.ts
```

- [ ] **Step 4: Enumerate endurance in allowance and route mapping**

```ts
export function bonusDailyAttemptLimit(skillCode: BonusSkillCode): number {
  return skillCode === 'marksmanship' || skillCode === 'endurance' ? 100 : 2;
}
```

Add `endurance` to the SQL values list, typed result loop, response object, and all route schemas. Serialize the two goal-window timestamps through `toAttemptHttpDto` without inventing client-side values.

- [ ] **Step 5: Extend admin validation and snapshot mapping**

Add `endurance` to the skill schema. Parse `survive_goal_windows` through the shared qualification parser and call `validateBonusSkillRules` with `breakDurationMs` checked separately at activation. Preserve `targetGoals: 1` as compatibility data and keep it hidden from endurance semantics.

- [ ] **Step 6: Run server package verification and commit**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/qualification.test.ts test/bonusGames/types.test.ts test/bonusGames/attempts.test.ts test/bonusGames/shots.test.ts test/bonusGames/serviceDto.test.ts test/bonusGames/economy.test.ts test/bonusGames/routes.test.ts test/bonusGames/catalog.test.ts test/bonusGames/admin.test.ts
```

Expected: PASS.

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames
git commit -m "feat(server): expose endurance bonus catalog"
```

### Task 5: Web contracts, authoritative clocks, and endurance play HUD

**Files:**

- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/stores/bonusGameStore.ts`
- Modify: `packages/web/src/stores/bonusGameStore.test.ts`
- Modify: `packages/web/src/game/bonusGameTiming.ts`
- Modify: `packages/web/src/game/bonusGameTiming.test.ts`
- Modify: `packages/web/src/game/bonusGameQualification.ts`
- Modify: `packages/web/src/game/bonusGameQualification.test.ts`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: HTTP `goal_window_started_at`, `goal_window_ends_at`, `server_now`, and `survive_goal_windows`.
- Produces: `deriveEnduranceClock(attempt, receivedAtPerformanceMs, currentPerformanceMs)` returning total and goal-window remaining milliseconds plus a pre-window flag.
- Produces: the endurance HUD and terminal presentation without changing other skill HUDs.

- [ ] **Step 1: Add failing API and timing tests**

```ts
expect(normalized.rules.qualification_rules).toEqual({
  type: 'survive_goal_windows',
  activeTimeMs: 180_000,
  goalWindowMs: 7_000,
});
expect(
  deriveEnduranceClock(attempt, 1_000, 3_500),
).toEqual({ totalRemainingMs: 177_500, goalRemainingMs: 4_500, goalWindowPending: false });
```

Add a future `goal_window_started_at` case that displays the full window during the forced goal animation, malformed-date clamping, and exact zero.

- [ ] **Step 2: Add failing play-screen tests**

Assert `ДО ГОЛА`, `7,0`, `ОСТАЛОСЬ 03:00`, warning class during the final two seconds, reduced-motion compatibility, failure copy «Не успел забить», success metrics, and a refresh request at either deadline.

```ts
expect(screen.getByText('ДО ГОЛА')).toBeInTheDocument();
expect(screen.getByRole('timer', { name: 'До обязательного гола' })).toHaveTextContent('7,0');
expect(screen.getByText('ОСТАЛОСЬ 03:00')).toBeInTheDocument();
```

- [ ] **Step 3: Run focused web tests and confirm RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/game/bonusGameTiming.test.ts src/game/bonusGameQualification.test.ts src/stores/bonusGameStore.test.ts src/screens/BonusGamePlayScreen.test.tsx
```

- [ ] **Step 4: Extend DTO unions and qualification copy**

```ts
export type BonusSkillCode = 'speed' | 'accuracy' | 'marksmanship' | 'endurance';

export type EnduranceQualificationRules = {
  type: 'survive_goal_windows';
  activeTimeMs: number;
  goalWindowMs: number;
};
```

Format catalog copy as `Продержаться 03:00 · гол не реже чем раз в 7,0 сек`. Keep legacy fallback normalization limited to responses that genuinely omit modern rules.

- [ ] **Step 5: Implement the authoritative clock helper and reconciliation triggers**

Derive the server offset from `server_now` and `receivedAtPerformanceMs`; use `performance.now()` thereafter. Clamp each timer independently. While local authoritative now is earlier than `goal_window_started_at`, return the full snapshotted window.

Call the existing store refresh/reconcile path when either timer reaches zero. Add `online` and `visibilitychange` listeners for an active endurance attempt; clean them up on attempt change/unmount and do not add polling.

- [ ] **Step 6: Render the endurance HUD and result copy**

Render the primary timer with one decimal using Russian comma formatting and tabular numerals. Apply a restrained warning modifier during the final two seconds; its CSS animation must be disabled by the existing reduced-motion media query. Preserve `PlayView` shot and deferred-response behavior.

- [ ] **Step 7: Run focused tests and commit**

Run the Step 3 command again. Expected: PASS.

```bash
git add packages/web/src/api/bonusGames.ts packages/web/src/stores/bonusGameStore.ts packages/web/src/stores/bonusGameStore.test.ts packages/web/src/game/bonusGameTiming.ts packages/web/src/game/bonusGameTiming.test.ts packages/web/src/game/bonusGameQualification.ts packages/web/src/game/bonusGameQualification.test.ts packages/web/src/screens/BonusGamePlayScreen.tsx packages/web/src/screens/BonusGamePlayScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(web): add endurance bonus play"
```

### Task 6: Attempt progress and card-state redesign

**Files:**

- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: selected skill allowance `{ remaining, daily_limit, resets_at }`.
- Produces: semantic daily-attempt progressbar and `bonusGameVisualStatus(game)` returning `completed | available | locked`.
- Reuses: training progress fill and training completion-badge visual language; no new asset.

- [ ] **Step 1: Add failing progress-bar tests**

```ts
const progress = await screen.findByRole('progressbar', {
  name: 'Осталось попыток: Скорость',
});
expect(progress).toHaveAttribute('aria-valuemin', '0');
expect(progress).toHaveAttribute('aria-valuenow', '1');
expect(progress).toHaveAttribute('aria-valuemax', '2');
expect(within(progress).queryByText('1 из 2 попыток')).toBeNull();
expect(screen.getByText('1 из 2 попыток')).toBeInTheDocument();
```

Cover 2/2 at 100%, 1/2 at 50%, 0/2 at 0%, 100/100, skill switching, active-attempt continuation not consuming another slot, and reset refetch. Assert the countdown is not inside an `aria-live` region that announces every tick.

- [ ] **Step 2: Add failing card status and badge tests**

```ts
expect(within(completedCard).getByText('Пройдена')).toHaveClass(
  'bonus-game-card__status--completed',
);
expect(within(availableCard).getByText('Не пройдена')).toHaveClass(
  'bonus-game-card__status--available',
);
expect(within(lockedCard).getByText('Закрыта')).toHaveClass(
  'bonus-game-card__status--locked',
);
expect(within(completedArtwork).getByLabelText('Игра пройдена')).toHaveClass(
  'bonus-game-card__completion-badge',
);
```

Cover featured and compact cards, active attempts, purchase-required cards, exhausted available games remaining yellow, no badge on unfinished/locked cards, and unchanged chevron rules.

- [ ] **Step 3: Run the screen suite and confirm RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/BonusGamesScreen.test.tsx
```

- [ ] **Step 4: Replace the allowance row with the progress section**

```tsx
<section className="bonus-games-attempt-progress" aria-label={`Попытки: ${skillLabels[selectedSkill]}`}>
  <div
    className="bonus-games-attempt-progress__bar"
    role="progressbar"
    aria-label={`Осталось попыток: ${skillLabels[selectedSkill]}`}
    aria-valuemin={0}
    aria-valuenow={selectedAllowance.remaining}
    aria-valuemax={selectedAllowance.daily_limit}
  >
    <span style={{ width: `${attemptProgressPercent}%` }} />
  </div>
  <div className="bonus-games-attempt-progress__meta">
    <strong>{selectedAllowance.remaining} из {selectedAllowance.daily_limit} попыток</strong>
    <span>До обновления {allowanceCountdown}</span>
  </div>
</section>
```

Use the training bar's height, border, radius, cyan gradient, and transition. Keep meta text below the bar and reserve stable height while allowances load.

- [ ] **Step 5: Add one explicit visual-state mapper**

```ts
function bonusGameVisualStatus(game: BonusGameCard): 'completed' | 'available' | 'locked' {
  if (game.state === 'completed') return 'completed';
  if (game.active_attempt !== null || game.state === 'in_progress' || game.state === 'available') {
    return 'available';
  }
  return 'locked';
}
```

Render status copy/tone from this function. Do not include `canStartNewAttempt` in the mapper, so daily exhaustion does not turn a yellow progression status gray.

- [ ] **Step 6: Move the completion badge into the artwork frame**

Place `bonus-game-card__completion-badge` as the final child of `bonus-game-card__artwork-frame`, positioned at bottom-right and partially overlapping the image border. Reuse the training badge colors, border, check size, and shadow for both featured and compact variants. Remove the old completion/lock corner pills; locked state is conveyed by the gray status and current artwork filter.

- [ ] **Step 7: Run focused tests and commit**

Run the Step 3 command again. Expected: PASS.

```bash
git add packages/web/src/screens/BonusGamesScreen.tsx packages/web/src/screens/BonusGamesScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(web): align bonus progress and card states"
```

### Task 7: Endurance editor in bonus-game administration

**Files:**

- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/BonusGamesAdmin.tsx`
- Modify: `packages/web/src/admin/BonusGamesAdmin.test.tsx`

**Interfaces:**

- Consumes: server admin contract from Task 4.
- Produces: form state for `endurance` and editable `activeTimeMs` / `goalWindowMs` fields.

- [ ] **Step 1: Add failing admin form tests**

```ts
fireEvent.click(screen.getByRole('tab', { name: 'Выносливость' }));
expect(screen.getByLabelText('Общая длительность, мс')).toHaveValue(180_000);
expect(screen.getByLabelText('Окно до гола, мс')).toHaveValue(7_000);
expect(screen.queryByLabelText('Нужно голов')).not.toBeInTheDocument();
expect(screen.queryByLabelText('Бросков в квалификации')).not.toBeInTheDocument();
```

Assert the outgoing create/patch body has `skillCode: 'endurance'`, `targetGoals: 1`, one period, zero break, null shot limit, disabled inventory, and exact qualification values.

- [ ] **Step 2: Run the admin test and confirm RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/admin/BonusGamesAdmin.test.tsx
```

- [ ] **Step 3: Extend admin API and form defaults**

Add `endurance` to `AdminBonusSkillCode` and add the qualification union member. Default a new endurance draft to:

```ts
{
  skillCode: 'endurance',
  targetGoals: 1,
  qualificationRules: {
    type: 'survive_goal_windows',
    activeTimeMs: 180_000,
    goalWindowMs: 7_000,
  },
  totalPeriods: 1,
  breakDurationMs: 0,
  useInventory: false,
  periods: [{ ...defaultPeriod, durationMs: 180_000, shotsLimit: null }],
}
```

- [ ] **Step 4: Render only applicable controls and synchronize duration**

Render both endurance numeric fields. When `activeTimeMs` changes, update the only period's `durationMs` in the same state transition. Hide goal, point, streak, shot-quota, break, and inventory inputs for endurance, while the submit serializer forces their compatibility values.

- [ ] **Step 5: Run admin and shared type checks, then commit**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/admin/BonusGamesAdmin.test.tsx src/screens/BonusGamesScreen.test.tsx
pnpm --filter @hockey/web typecheck
```

Expected: PASS.

```bash
git add packages/web/src/admin/api.ts packages/web/src/admin/BonusGamesAdmin.tsx packages/web/src/admin/BonusGamesAdmin.test.tsx
git commit -m "feat(web): manage endurance bonus games"
```

### Task 8: Integrated verification, review, dev release, and acceptance

**Files:**

- Verify: all files changed in Tasks 1–7
- Update only if contractually required: `docs/superpowers/specs/2026-09-20-bonus-endurance-design.md`

**Interfaces:**

- Consumes: the complete feature branch.
- Produces: reviewed PR to `dev`, exact-SHA dev deployment evidence, and rendered acceptance evidence. No production mutation.

- [ ] **Step 1: Rebuild game-core for consumers and run focused suites**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/bonusGames test/db/migration148.test.ts test/db/migrations.test.ts
pnpm --filter @hockey/web exec vitest run src/game/bonusGameTiming.test.ts src/game/bonusGameQualification.test.ts src/stores/bonusGameStore.test.ts src/screens/BonusGamePlayScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/admin/BonusGamesAdmin.test.tsx
```

Expected: PASS. Confirm integration tests executed rather than skipped; otherwise report the environment gap and do not call migration verification complete.

- [ ] **Step 2: Run repository checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all exit 0. Run `pnpm test` if the focused/server integration changes reveal shared regressions or before release policy requires the full suite.

- [ ] **Step 3: Review the branch diff and immutable migration**

Run:

```bash
git status --short
git diff --check origin/dev...HEAD
git diff --stat origin/dev...HEAD
git diff origin/dev...HEAD -- packages/server/db/migrations/148_bonus_endurance_games.sql
```

Confirm no unrelated files, no secrets, additive migration behavior, exact seven-value balance table, immutable snapshots, and no `GAME_CORE_VERSION` change without deterministic code changes.

- [ ] **Step 4: Request independent code review and resolve findings**

Use `superpowers:requesting-code-review` against `origin/dev...HEAD`. Reproduce every actionable finding, add a regression test before a bug fix, rerun the affected focused suite, and commit only confirmed corrections.

- [ ] **Step 5: Refresh the base and open the PR**

Fetch current `origin/dev`. If it moved, merge it into `feature/bonus-endurance`, resolve only feature-owned conflicts, and rerun Steps 1–3. Push the branch and open a PR targeting `dev` with the spec, RED/GREEN evidence, migration execution status, and explicit statement that production is excluded.

- [ ] **Step 6: Verify CI and integrate into dev**

Wait for all required PR checks. Merge only a green reviewed head SHA into `dev`. Record PR URL, feature head SHA, integrated dev SHA, CI run URLs, and conclusions separately.

- [ ] **Step 7: Verify exact-SHA dev deployment**

Follow the repository's current GitHub Actions dev release workflow. Confirm the deployed server and web correspond to the integrated SHA and pass health/smoke checks. A successful workflow is deployment evidence, not user-flow acceptance.

- [ ] **Step 8: Run rendered browser acceptance**

At supported small-phone widths, verify:

1. Four chips render without clipping and each changes the progress block.
2. Speed/accuracy show `2 из 2`, marksmanship/endurance show `100 из 100`, and the countdown refetches after zero.
3. Featured and compact cards show green «Пройдена», yellow «Не пройдена», or gray «Закрыта» correctly; the completed check overlaps the artwork bottom-right; exhausted available cards remain yellow; chevrons remain action-based.
4. Endurance game 1 can be completed in a real three-minute session.
5. A separate attempt fails with «Не успел забить» when the short window expires.
6. Reload/background recovery returns the same server-authoritative timer and terminal result.
7. Admin can edit duration/window, while an already active attempt retains its old snapshot.

Capture screenshots and the tested account/game identifiers without exposing credentials or PII. If runtime SHA changes, repeat every affected acceptance scenario.

- [ ] **Step 9: Final handoff**

Report separately: code changes, local RED/GREEN evidence, migration execution, repository checks, review findings, CI, integrated SHA, dev deployment, browser acceptance, and remaining gaps. Do not claim production release or production acceptance.
