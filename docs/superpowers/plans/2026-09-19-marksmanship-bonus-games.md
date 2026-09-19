# Marksmanship Bonus Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the seven dev-only “Меткость” bonus games with deterministic goal-window scoring, a 100-attempt test allowance, authoritative server settlement, and player-facing score UI.

**Architecture:** Put all shot classification and scoring in a pure `game-core` module used by both the browser and server. Extend the existing bonus-game snapshot and attempt lifecycle additively, store every accepted score atomically with the shot, and preserve current speed/accuracy behavior. Seed the seven games through one forward-only migration and verify the published targets against the canonical simulator.

**Tech Stack:** TypeScript, Vitest, `@hockey/game-core`, Fastify, PostgreSQL raw migrations, React 18, Zustand, PixiJS.

**Spec:** `docs/superpowers/specs/2026-09-19-marksmanship-bonus-games-and-advanced-training-design.md`

## Global Constraints

- Start the implementation branch from current `origin/dev` after `feature/initial-training-course` is integrated; do not modify the occupied main checkout.
- Dev only; do not deploy to production or reduce the marksmanship allowance from 100 to 2.
- Fixed speeds are shooter `0.75`, goal `0.5`, goalie `0.6`, puck `1.25`; inventory is disabled and never consumed.
- Scoring thresholds are `>=250:100`, `160–249:115`, `100–159:130`, `70–99:140`, `50–69:155`, `<50:170`; strict counter-direction adds 15, capped at 185.
- The scan step is `10 ms`; the goalkeeper proximity threshold is `24` game units; misses and saves award zero.
- Durations are `30/60/90/120/150/180/210` seconds and targets are `1100/2450/4000/5750/7750/9950/12450` unless the canonical simulator disproves them before seed data is committed.
- First clear gives exactly 1 star, 1 experience, and 0 coins; no arena unlock and no record tracking.
- A shot accepted before `00:00` must settle after the deadline; a shot started after the deadline must be rejected.
- Any deterministic behavior change increments `GAME_CORE_VERSION` and updates its test.

## Review Focus

- A wide goal window crossing a score threshold at exactly `49/50`, `69/70`, `99/100`, `159/160`, or `249/250 ms` must land in exactly one bracket; Task 1 pins every boundary.
- A goalkeeper moving in the matching direction or more than 24 units from the goal mouth must not receive the counter-direction bonus; Task 1 covers both inputs.
- A final shot whose authoritative start is at or before the period deadline must settle exactly once even if its HTTP request arrives after expiry; Task 4 covers deadline and duplicate cases.
- Retrying the same `shotIndex` after a timeout must return the stored points without changing totals or issuing a reward twice; Task 4 covers idempotence and concurrency.
- Existing speed and accuracy games must retain their 2-attempt limit, DTO shape, qualification, and UI; Tasks 2, 3, 5, and 7 include regression tests.

---

### Task 1: Canonical goal-window classifier and score function

**Files:**

- Create: `packages/game-core/src/marksmanship.ts`
- Create: `packages/game-core/test/marksmanship.test.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/src/version.ts`
- Modify: `packages/game-core/test/version.test.ts`

**Interfaces:**

- Consumes: `resolvePerspectiveCourtShot(input, goalie, seed, shotIndex, STICK_NEUTRAL, phaseOffsets)` and the existing deterministic simulators.
- Produces: `classifyMarksmanshipShot(input: MarksmanshipShotInput): MarksmanshipShotClassification`, `scoreMarksmanshipWindow(windowDurationMs, rules)`, `DEFAULT_MARKSMANSHIP_SCORING_RULES`.

- [ ] **Step 1: Write the failing boundary and classification tests**

```ts
it.each([
  [49, 170],
  [50, 155],
  [69, 155],
  [70, 140],
  [99, 140],
  [100, 130],
  [159, 130],
  [160, 115],
  [249, 115],
  [250, 100],
])('scores a %d ms goal window as %d', (windowDurationMs, expected) => {
  expect(scoreMarksmanshipWindow(windowDurationMs, DEFAULT_MARKSMANSHIP_SCORING_RULES)).toBe(
    expected,
  );
});

it('adds counter-direction only for a nearby goalkeeper moving across the puck side', () => {
  expect(nearbyOpposite.counterDirection).toBe(true);
  expect(nearbyOpposite.awardedPoints).toBe(nearbyOpposite.basePoints + 15);
  expect(farOpposite.counterDirection).toBe(false);
  expect(sameDirection.counterDirection).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @hockey/game-core test -- test/marksmanship.test.ts`

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement the pure types, scan, and strict counter-direction rule**

```ts
export interface MarksmanshipScoringRules {
  scanStepMs: 10;
  counterDirectionBonus: 15;
  counterDirectionGoalDistance: 24;
  brackets: readonly { minWindowMs: number; points: number; code: MarksmanshipDifficultyCode }[];
}

export interface MarksmanshipShotInput {
  shotInput: ShotInput;
  goalie: GoalieConfig;
  seed: string;
  shotIndex: number;
  phaseOffsets: SessionPhaseOffsets;
  earliestTapTime: number;
  scoring: MarksmanshipScoringRules;
}

export interface MarksmanshipShotClassification {
  result: ShotResult;
  windowDurationMs: number | null;
  basePoints: number;
  counterDirection: boolean;
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
}
```

For each neighboring probe, shift both `tapTime` and `shooterTapTime` by the same delta, stop on the first non-goal, and clamp the lower scan to `earliestTapTime`. Determine goalkeeper direction from deterministic positions at `tGoalieCross ± 5 ms`; require non-zero direction, require the goalkeeper hitbox to overlap the goal opening or be no more than 24 units from its nearest edge, and require the puck X to lie on the side opposite that direction.

- [ ] **Step 4: Add deterministic, board-side, save, miss, and input-immutability coverage**

```ts
expect(classifyMarksmanshipShot(fixture)).toEqual(classifyMarksmanshipShot(fixture));
expect(classifyMarksmanshipShot(boardFixture).awardedPoints).toBe(100);
expect(classifyMarksmanshipShot(saveFixture)).toMatchObject({
  awardedPoints: 0,
  difficultyCode: null,
});
expect(classifyMarksmanshipShot(missFixture)).toMatchObject({
  awardedPoints: 0,
  difficultyCode: null,
});
expect(fixture.shotInput).toEqual(originalInput);
```

- [ ] **Step 5: Export the module and bump the deterministic version**

Change `GAME_CORE_VERSION` from `58` to `59` and update `version.test.ts` to expect `59`.

- [ ] **Step 6: Run the package checks and commit**

Run: `pnpm --filter @hockey/game-core test && pnpm --filter @hockey/game-core build`

Expected: PASS.

```bash
git add packages/game-core/src packages/game-core/test
git commit -m "feat(game-core): classify marksmanship shots"
```

### Task 2: Database contract and seven seeded games

**Files:**

- Create: `packages/server/db/migrations/146_marksmanship_bonus_games.sql`
- Create: `packages/server/test/db/migration146.test.ts`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Consumes: existing `bonus_game`, `bonus_game_attempt`, `bonus_game_daily_attempt_slot`, `shot_session`, and arena tables.
- Produces: `marksmanship` skill rows, points columns, scoring snapshots, and seven stable game IDs.

- [ ] **Step 1: Write the migration contract test first**

```ts
expect(await column('bonus_game_attempt', 'total_points')).toMatchObject({ is_nullable: 'NO' });
expect(await column('shot_session', 'awarded_points')).toMatchObject({ is_nullable: 'NO' });
expect(await countGames('marksmanship')).toBe(7);
expect(await game('marksmanship-7')).toMatchObject({
  target_goals: 12450,
  reward_stars: 1,
  reward_experience: 1,
});
expect(await arenaFor('marksmanship-1')).toMatchObject({
  artwork_url: '/sprites/amateur-daily-court.webp',
  is_selectable: false,
});
```

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migration146.test.ts`

Expected: FAIL because migration 146 is absent.

- [ ] **Step 3: Add the additive schema changes**

The migration must:

```sql
alter table bonus_game_attempt add column total_points int not null default 0 check (total_points >= 0);
alter table bonus_game_period_log add column total_points int not null default 0 check (total_points >= 0);
alter table shot_session
  add column awarded_points int not null default 0 check (awarded_points between 0 and 185),
  add column score_details jsonb;
```

Recreate only the affected checks so `bonus_game.skill_code` and `bonus_game_daily_attempt_slot.skill_code` accept `marksmanship`, and widen the slot check to `1..100`. Keep all existing rows valid.

- [ ] **Step 4: Seed the shared arena and seven active free definitions**

Use fixed UUIDs `00000000-0000-4000-8000-000000000701` through `...707`, one period per game, `use_inventory=false`, `break_duration_ms=0`, rewards `{coins:0, stars:1, experience:1}`, and qualification JSON shaped as:

```json
{
  "type": "points_in_time",
  "targetPoints": 1100,
  "activeTimeMs": 30000,
  "scoring": {
    "scanStepMs": 10,
    "counterDirectionBonus": 15,
    "counterDirectionGoalDistance": 24,
    "brackets": [
      { "minWindowMs": 250, "points": 100, "code": "open" },
      { "minWindowMs": 160, "points": 115, "code": "timed" },
      { "minWindowMs": 100, "points": 130, "code": "precise" },
      { "minWindowMs": 70, "points": 140, "code": "narrow" },
      { "minWindowMs": 50, "points": 155, "code": "very_narrow" },
      { "minWindowMs": 0, "points": 170, "code": "instant" }
    ]
  }
}
```

- [ ] **Step 5: Prove migration idempotence and legacy compatibility**

Extend `migrations.test.ts` to apply all migrations twice and assert speed/accuracy counts and representative definitions are unchanged.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migration146.test.ts test/db/migrations.test.ts`

```bash
git add packages/server/db/migrations/146_marksmanship_bonus_games.sql packages/server/test/db
git commit -m "feat(server): add marksmanship bonus schema and catalog"
```

### Task 3: Qualification, snapshots, admin validation, and per-skill allowances

**Files:**

- Modify: `packages/server/src/bonusGames/qualification.ts`
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/routes.ts`
- Modify: `packages/server/src/bonusGames/admin.ts`
- Modify: `packages/server/test/bonusGames/qualification.test.ts`
- Modify: `packages/server/test/bonusGames/types.test.ts`
- Modify: `packages/server/test/bonusGames/admin.test.ts`
- Modify: `packages/server/test/bonusGames/routes.test.ts`

**Interfaces:**

- Produces: `BonusSkillCode = 'speed' | 'accuracy' | 'marksmanship'` and `points_in_time` qualification snapshots.
- Produces: allowances `{speed:2, accuracy:2, marksmanship:100}` without changing existing categories.

- [ ] **Step 1: Add failing schema and allowance tests**

```ts
expect(normalizeBonusQualificationRules(pointsRules, legacy)).toEqual(pointsRules);
expect(
  evaluateBonusQualification(pointsRules, {
    totalPoints: 1100,
    activeElapsedMs: 30_000,
    goals: 0,
    shotsTaken: 0,
    bestGoalStreak: 0,
  }).passed,
).toBe(true);
expect(catalog.attempt_allowances).toMatchObject({
  speed: { daily_limit: 2 },
  accuracy: { daily_limit: 2 },
  marksmanship: { daily_limit: 100 },
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/qualification.test.ts test/bonusGames/types.test.ts test/bonusGames/routes.test.ts`

- [ ] **Step 3: Extend the discriminated union and evaluation state**

```ts
type BonusQualificationRules =
  | GoalsFromShotsRules
  | GoalsInTimeRules
  | {
      type: 'points_in_time';
      targetPoints: number;
      activeTimeMs: number;
      scoring: MarksmanshipScoringRules;
    };

interface BonusQualificationState {
  goals: number;
  shotsTaken: number;
  bestGoalStreak: number;
  activeElapsedMs: number;
  totalPoints: number;
}
```

Validate that marksmanship has exactly one no-quota period, its duration equals `activeTimeMs`, inventory is disabled, and its scoring object parses through a shared `game-core` parser.

- [ ] **Step 4: Replace the global limit constant with a total function**

```ts
export function bonusDailyAttemptLimit(skill: BonusSkillCode): number {
  return skill === 'marksmanship' ? 100 : 2;
}
```

Use it in slot reservation and allowance calculation; enumerate all three skills in SQL/DTO mapping.

- [ ] **Step 5: Extend admin create/patch validation without exposing unsafe defaults**

Accept `marksmanship` and `points_in_time`, but reject activation unless the full scoring snapshot, one period, fixed no-inventory rule, and matching duration are present.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/bonusGames/qualification.test.ts test/bonusGames/types.test.ts test/bonusGames/admin.test.ts test/bonusGames/routes.test.ts`

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames
git commit -m "feat(server): support marksmanship bonus rules"
```

### Task 4: Authoritative point settlement, final-shot deadline, and idempotency

**Files:**

- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/reconcile.ts`
- Modify: `packages/server/src/bonusGames/types.ts`
- Modify: `packages/server/src/bonusGames/routes.ts`
- Modify: `packages/server/test/bonusGames/shots.test.ts`
- Modify: `packages/server/test/bonusGames/attempts.test.ts`
- Modify: `packages/server/test/bonusGames/serviceDto.test.ts`

**Interfaces:**

- Consumes: `classifyMarksmanshipShot` and the snapshotted scoring rules.
- Produces: shot response fields `awarded_points`, `total_points`, `difficulty_code`, `counter_direction`.

- [ ] **Step 1: Write failing integration tests for scoring and exact-once retries**

```ts
expect(first.json()).toMatchObject({
  awarded_points: 155,
  total_points: 155,
  difficulty_code: 'very_narrow',
  counter_direction: false,
});
expect(retry.json()).toEqual(first.json());
expect(await storedTotal(attemptId)).toBe(155);
expect(await storedShotCount(attemptId, 1)).toBe(1);
```

Add separate cases for save/miss zero, `+15`, a request arriving after the wall deadline whose authoritative tap began before it, a tap after the deadline, and two concurrent retries of the target-reaching shot.

- [ ] **Step 2: Run the shot suite and confirm RED**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/shots.test.ts test/bonusGames/attempts.test.ts`

- [ ] **Step 3: Persist complete accepted-shot results**

Extend `BonusShotRow` and the insert to save `awarded_points` and:

```ts
const scoreDetails = {
  version: 1,
  windowDurationMs: classification.windowDurationMs,
  difficultyCode: classification.difficultyCode,
  counterDirection: classification.counterDirection,
};
```

Duplicate lookup must return these stored fields plus the current authoritative attempt total.

- [ ] **Step 4: Handle the deadline before generic reconciliation**

For an active marksmanship period, compute authoritative wall-clock start as `period_started_at + tapTime + acceptedShotCount * 1000ms`. Accept only when that timestamp is `<= period_started_at + durationMs`; then settle the flight even if `now` is later. Do not call the generic timeout reconciliation until duplicate lookup and this eligibility check have run. Existing speed/accuracy reconciliation order remains unchanged.

- [ ] **Step 5: Increment score and complete atomically**

```sql
update bonus_game_attempt
   set shots_taken = shots_taken + 1,
       goals = goals + $2,
       total_points = total_points + $3,
       updated_at = $4
 where id = $1
 returning *;
```

Evaluate `points_in_time` from `total_points`; on target reach, close and grant the existing first-clear reward in the same transaction.

- [ ] **Step 6: Update DTOs and period aggregation**

Return `totalPoints` in attempt DTOs and aggregate `sum(awarded_points)` into `bonus_game_period_log.total_points`.

- [ ] **Step 7: Run server checks and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/bonusGames`

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames
git commit -m "feat(server): settle marksmanship points authoritatively"
```

### Task 5: Recalculate and lock the seven target values

**Files:**

- Create: `packages/game-core/test/marksmanshipTargets.test.ts`
- Modify: `packages/server/db/migrations/146_marksmanship_bonus_games.sql` only if canonical outputs differ.

**Interfaces:**

- Consumes: canonical classifier, fixed speeds, 30 deterministic phase seeds, 1416 ms minimum shot cycle.
- Produces: auditable conservative maxima and final seeded target values.

- [ ] **Step 1: Implement the deterministic phase sweep as a test**

For each duration and 30 fixed seeds, search legal tap times in 10 ms increments, apply the 416 ms flight plus 1000 ms result pause after each accepted shot, and maximize total points with dynamic programming over `(sceneTime, shooterTime, shotIndex)`. Record minimum, median, and maximum optimum for each duration.

- [ ] **Step 2: Assert the published targets against conservative maxima**

```ts
expect(targets).toEqual([1100, 2450, 4000, 5750, 7750, 9950, 12450]);
expect(targets.every((target, index) => target <= conservativeMax[index]!)).toBe(true);
```

If this fails, replace the migration’s seven target values with rounded values at `50/55/60/65/70/75/80%` of the canonical conservative maximum and update the spec in the same docs branch before implementation continues.

- [ ] **Step 3: Run determinism twice and commit**

Run twice: `pnpm --filter @hockey/game-core test -- test/marksmanshipTargets.test.ts`

Expected: identical PASS output.

```bash
git add packages/game-core/test/marksmanshipTargets.test.ts packages/server/db/migrations/146_marksmanship_bonus_games.sql
git commit -m "test(game-core): verify marksmanship targets"
```

### Task 6: Web contracts and optimistic reconciliation

**Files:**

- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/stores/bonusGameStore.ts`
- Modify: `packages/web/src/stores/bonusGameStore.test.ts`
- Modify: `packages/web/src/game/bonusGameQualification.ts`
- Modify: `packages/web/src/game/bonusGameQualification.test.ts`

**Interfaces:**

- Consumes: the server response from Task 4 and `classifyMarksmanshipShot` for immediate preview.
- Produces: typed point totals and a pending shot carrying the predicted modal data until authoritative replacement.

- [ ] **Step 1: Add failing API/store tests**

Assert that `optimisticAddShot` does not invent points, that `submitShot(..., {deferApply:true})` retains server `awarded_points`, and that reconciliation replaces a wrong client prediction with the server total.

- [ ] **Step 2: Extend the web unions and DTOs**

```ts
export type BonusSkillCode = 'speed' | 'accuracy' | 'marksmanship';
export type BonusQualificationRules = ExistingRules | PointsInTimeRules;

export interface BonusShotResponse {
  server_result: ShotResultType;
  awarded_points: number;
  total_points: number;
  difficulty_code: MarksmanshipDifficultyCode | null;
  counter_direction: boolean;
  attempt: BonusGameAttempt;
  reward_granted: boolean;
  balances: BonusReward;
}
```

- [ ] **Step 3: Preserve prediction and server correction in the store**

Add `predictedMarksmanship` to the pending visual result, but use only the response’s `attempt.total_points` when applying state. Keep current timeout reconciliation semantics.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/web test -- src/stores/bonusGameStore.test.ts src/game/bonusGameQualification.test.ts`

```bash
git add packages/web/src/api/bonusGames.ts packages/web/src/stores packages/web/src/game/bonusGameQualification*
git commit -m "feat(web): reconcile marksmanship scores"
```

### Task 7: Catalog tab, score HUD, goal modal, and failure result

**Files:**

- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: typed catalog, attempt, and shot response from Task 6.
- Produces: the third “Меткость” tab and marksmanship-specific score/result presentation.

- [ ] **Step 1: Write failing rendered tests**

Cover the third tab, `2 450 / 4 000`, `ГОЛ / +155 / Узкое окно`, `Точный момент · противоход`, no `0 очков` on save/miss, immediate success on target reach, and failed result copy including points missing.

- [ ] **Step 2: Add catalog labels and point-based card copy**

```ts
const skillLabels: Record<BonusSkillCode, string> = {
  speed: 'Скорость',
  accuracy: 'Точность',
  marksmanship: 'Меткость',
};
```

For `points_in_time`, render duration and target points; do not show shots/goals as the primary metric.

- [ ] **Step 3: Render the marksmanship HUD and modal**

Use the client classification immediately when the puck result is known, then replace it with the server response before the next playable frame. Map difficulty codes to Russian copy in one total function; use existing modal duration and standard modal classes.

- [ ] **Step 4: Render failure and preserve current modes**

For marksmanship failures show score, target, `target-total` shortfall, `Повторить`, and `К бонусным играм`. Do not add records or best-time UI. Keep speed/accuracy snapshots unchanged.

- [ ] **Step 5: Run web checks and commit**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/web test -- src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx`

```bash
git add packages/web/src/screens/BonusGamesScreen* packages/web/src/screens/BonusGamePlayScreen* packages/web/src/app/design-system.css
git commit -m "feat(web): add marksmanship bonus game UI"
```

### Task 8: Full verification and dev release gate

**Files:**

- Modify: `docs/superpowers/plans/2026-09-19-marksmanship-bonus-games.md` only to check completed steps and record exact evidence.

**Interfaces:**

- Consumes: all previous tasks.
- Produces: reviewed branch ready for a PR to `dev`; production remains out of scope.

- [x] **Step 1: Run all proportional local checks**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/game-core test
pnpm --filter @hockey/server exec vitest run test/bonusGames test/db/migration146.test.ts
pnpm --filter @hockey/web test -- src/stores/bonusGameStore.test.ts src/game/bonusGameQualification.test.ts src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx
pnpm typecheck
pnpm lint
git diff --check
```

- [x] **Step 2: Review the branch diff against the spec**

Confirm no changes to speed/accuracy seeded rules, no inventory consumption, no arena unlock, no records, marksmanship allowance exactly 100, and no production workflow edits.

- [ ] **Step 3: Perform local rendered acceptance**

At a small mobile viewport, exercise success, failure, save/miss, counter-direction, exact target completion, final pre-zero shot, reload, and duplicate request. Capture screenshots of the catalog tab, score HUD, goal modal, and failure screen.

- [x] **Step 4: Commit verification notes**

```bash
git add docs/superpowers/plans/2026-09-19-marksmanship-bonus-games.md
git commit -m "docs: record marksmanship verification"
```

- [ ] **Step 5: Open a PR targeting `dev` only after user approval**

Do not merge or deploy from this step without the user’s explicit dev-release authorization. Report local checks, CI, integrated SHA, dev runtime, and browser acceptance separately.

#### Verification evidence — 2026-09-20

- `pnpm --filter @hockey/game-core test`: PASS, 16 files and 103 tests; the 30-seed target sweep passed with the seven stored targets unchanged.
- `pnpm --filter @hockey/game-core build`: PASS.
- Default-timeout scoped server run: BLOCKED by three migration-heavy `beforeAll` hook timeouts; 167 assertions passed and no assertion failed. `pg_stat_activity` showed no blocking session.
- The same scoped server suites with `--hookTimeout 30000`: PASS, 10 files and 206 tests in 50.42 seconds. `attempts.test.ts` also passed 20/20 separately with that hook timeout. No production timeout was changed for a local migration-speed issue.
- `pnpm --filter @hockey/web test`: PASS. The runner passed the 148-file/1390-test main block, the three isolated suites (`36`, `14`, and `67` tests), and every enumerated `DailyScreen` scenario.
- `pnpm typecheck`: PASS for game-core, mobile, server, and web.
- `pnpm lint`: PASS.
- `git diff --check 821f81e2..HEAD`: PASS.
- Diff review: speed/accuracy seed rules are unchanged; marksmanship has `use_inventory=false`, no arena unlock or record/best-time UI, allowance `100`, and no workflow changes.
- Local rendered acceptance: BLOCKED before gameplay. The current branch opened at `http://127.0.0.1:5173/login`; continuing required the `Войти как Dev` action, which would alter authentication/session state without explicit authorization. No login, credential, account, dev deployment, or production action was performed. The catalog/HUD/modal/failure behaviors remain covered by rendered component tests, but those tests are not reported as real-browser acceptance.
- CI: not run. Integrated SHA/dev runtime/production: absent; nothing was pushed, merged, or deployed.
