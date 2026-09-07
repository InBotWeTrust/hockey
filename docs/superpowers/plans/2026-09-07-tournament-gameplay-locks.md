# Tournament Gameplay Locks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a server-authoritative one-hour recovery and tournament reservation policy across training, the normal daily game, ordinary duels, Classic regular-season games, and scheduled playoff blocks.

**Architecture:** Introduce a focused `gameplayLocks` service that derives action-specific locks from accepted shots and tournament state. Every gameplay mutation calls the service inside its existing transaction; read DTOs expose the same structured lock for UI rendering. Bonus games remain outside the service.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL 16, React 18, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-tournament-gameplay-locks-design.md`

## Global Constraints

- Recovery and scheduled pre-game windows are exactly 60 minutes.
- A Classic tournament lock starts only with its first server-accepted shot and lasts until the whole game completes.
- A scheduled tournament lock starts 60 minutes before `first_game_starts_at` and lasts until the block completes.
- Locks use absolute server timestamps and survive local midnight.
- Bonus games neither create nor obey these locks.
- Ordinary duel preference is never overwritten by a temporary lock.
- Shot simulation, movement, scores, inventory, and settlement must not change.
- Build `@hockey/game-core` before server test runs.

---

### Task 1: Central action-specific gameplay lock service

**Files:**
- Create: `packages/server/src/duel/gameplayLocks.ts`
- Test: `packages/server/test/duel/gameplayLocks.test.ts`
- Modify: `packages/server/src/duel/trainingCooldown.ts`
- Modify: `packages/server/src/duel/gameSettings.ts`
- Create: `packages/server/db/migrations/107_gameplay_cooldown_one_hour.sql`
- Test: `packages/server/test/migration107.test.ts`

**Interfaces:**
- Produces: `GameplayAction`, `GameplayLockReason`, `GameplayLockState`, `lockUserGameplay(client, userId)`, `getGameplayLockState(client, input)`, and `assertGameplayActionAllowed(client, input)`.
- `GameplayAction` values: `start_training`, `start_daily_period`, `start_ordinary_duel`, `ordinary_duel_shot`, `start_classic`, `continue_classic`.
- `GameplayLockState` contains `blocked`, `reason`, `endsAt`, and optional `tournamentStartsAt`; `endsAt` is null for completion-bound active tournament locks.
- Consumes: `shot_session.created_at`, `amateur_duel_match.source`, `tournament_classic_session`, and scheduled playoff attempt/game-day state.

- [ ] **Step 1: Write failing unit tests for action-specific recovery**

Create table-driven tests proving that the latest accepted `training`, `daily`, or non-tournament `amateur_duel` shot blocks `start_classic` for 60 minutes; a tournament duel shot is excluded; the source training/daily mode may continue; the opposite training/daily mode is blocked; and ordinary duel actions are not blocked by recovery alone.

```ts
expect(await getGameplayLockState(client, {
  userId,
  action: 'start_classic',
  now: at('2026-09-08T00:20:00+03:00'),
})).toMatchObject({ blocked: true, reason: 'recent_gameplay' });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts`

Expected: FAIL because `gameplayLocks.ts` does not exist.

- [ ] **Step 3: Implement the recovery query and action model**

Query the latest accepted shot with an ordinary-duel source guard:

```sql
select max(ss.created_at) as last_activity_at
from shot_session ss
left join amateur_duel_match m on m.id = ss.amateur_duel_match_id
where ss.user_id = $1
  and (
    ss.mode in ('training', 'daily')
    or (ss.mode = 'amateur_duel' and m.source <> 'tournament')
  )
```

Return an action-aware result so a mode never blocks its own continuation. Add constants `GAMEPLAY_RECOVERY_MINUTES = 60` and `GAMEPLAY_RECOVERY_MS = 3_600_000`. Implement `lockUserGameplay` with `pg_advisory_xact_lock(hashtext('gameplay:' || userId))`; every incompatible start or accepted-shot transaction will acquire it before checking state. Keep `trainingCooldown.ts` as a compatibility facade delegating to the new service until all call sites move.

- [ ] **Step 4: Change the configured default and migration value to 60**

Migration `107_gameplay_cooldown_one_hour.sql` must update only `training.daily_cooldown_minutes` to `60` and be idempotent. Change fallback constants from `30` to `60`. Test both fresh insertion/default behavior and upgrading an existing `30` value.

- [ ] **Step 5: Run focused server and migration tests**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/migration107.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/duel/gameplayLocks.ts packages/server/src/duel/trainingCooldown.ts packages/server/src/duel/gameSettings.ts packages/server/db/migrations/107_gameplay_cooldown_one_hour.sql packages/server/test/duel/gameplayLocks.test.ts packages/server/test/migration107.test.ts
git commit -m "feat(duel): centralize one-hour gameplay recovery"
```

### Task 2: Scheduled tournament locks and safe-start calculation

**Files:**
- Modify: `packages/server/src/duel/gameplayLocks.ts`
- Test: `packages/server/test/duel/gameplayLocks.test.ts`
- Modify: `packages/server/src/duel/training/routes.ts`
- Test: `packages/server/test/duel/training.test.ts`
- Modify: `packages/server/src/duel/daily/routes.ts`
- Test: `packages/server/test/duel/daily.test.ts`

**Interfaces:**
- Produces: `getNearestScheduledTournamentBlock(client, userId, now)` and `assertSafeSegmentStart(client, { userId, now, maxSegmentDurationMs })` inside `gameplayLocks.ts`.
- Consumes: daily `periodDurationMs`, training session semantics, playoff `first_game_starts_at`, attempt/series completion state.

- [ ] **Step 1: Add failing tests for the one-hour scheduled lock**

Cover T-61 allowed, T-60 blocked, midnight crossing, early completion unlocking, unfinished overtime remaining locked, and two overlapping tournament reasons. Use participant fixtures rather than mocking SQL.

- [ ] **Step 2: Add failing safe-start tests**

Given a 20-minute daily period and a playoff block at 18:00, assert that a period start at 16:39 succeeds and 16:40 is rejected because it can reach the 17:00 lock boundary.

```ts
await expect(assertSafeSegmentStart(client, {
  userId,
  now: at('2026-09-08T16:40:00+03:00'),
  maxSegmentDurationMs: 20 * 60_000,
})).rejects.toMatchObject({ statusCode: 409 });
```

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/duel/training.test.ts test/duel/daily.test.ts`

Expected: FAIL on the 60-minute boundary and safe-start assertions.

- [ ] **Step 4: Implement scheduled block derivation**

Move the current training-only tournament query out of `training/routes.ts`. Derive a lock from approved participant membership plus either a scheduled regular `head_to_head` fixture or a non-cancelled playoff game day/attempt. Treat settled fixtures and completed series/game days as unlocked even when a stale scheduled end lies in the future. Return `reason: 'scheduled_tournament'`, `tournamentStartsAt`, and `endsAt: null` once the block is active.

- [ ] **Step 5: Guard training and daily mutations**

Replace `getTournamentDayTrainingLock` and duplicated 30-minute checks. Guard training start/shot and daily period start/shot, acquiring `lockUserGameplay` in accepted-shot transactions. On daily period start, pass its maximum period duration; training may start before T-60 because it has no protected timed segment, but training shots stop being accepted when the scheduled lock begins. On shot, reject only tournament locks, not the source mode's rolling recovery.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/duel/training.test.ts test/duel/daily.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/duel/gameplayLocks.ts packages/server/src/duel/training/routes.ts packages/server/src/duel/daily/routes.ts packages/server/test/duel/gameplayLocks.test.ts packages/server/test/duel/training.test.ts packages/server/test/duel/daily.test.ts
git commit -m "feat(tournament): reserve scheduled gameplay windows"
```

### Task 3: Atomic Classic start and completion-bound lock

**Files:**
- Modify: `packages/server/src/tournament/classicGame.ts`
- Test: `packages/server/test/tournament/classicGame.integration.test.ts`
- Test: `packages/server/test/tournament/classicGame.test.ts`
- Modify: `packages/server/src/duel/gameplayLocks.ts`
- Test: `packages/server/test/duel/gameplayLocks.test.ts`

**Interfaces:**
- Consumes: `assertGameplayActionAllowed(... action: 'start_classic')` and active-Classic lock derivation.
- Produces: first-shot activation based on an accepted `tournament_classic` shot, not period start.

- [ ] **Step 1: Write failing Classic lifecycle tests**

Assert that opening/starting period zero does not lock other modes; the first shot fails during recent activity; successful first shot activates the lock; breaks and elapsed time beyond one hour stay locked; closing/expiring the complete Classic game unlocks immediately.

- [ ] **Step 2: Write the concurrency regression**

Use two database clients and the same user advisory lock. Arrange a daily shot and first Classic shot to race; assert exactly one incompatible action succeeds and no state contains both accepted starts.

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/classicGame.test.ts test/tournament/classicGame.integration.test.ts test/duel/gameplayLocks.test.ts`

Expected: FAIL because cooldown is currently checked at period start and only training shots are considered.

- [ ] **Step 4: Move the start gate to the first shot transaction**

Call `lockUserGameplay` before checking the first shot. Daily, training, and ordinary-duel accepted-shot transactions use the same lock, so the concurrency test has a real serialization boundary. If the session has no accepted tournament shot, call `assertGameplayActionAllowed` with `start_classic`; after insertion the session becomes an active Classic lock source. Remove the first-period training-only assertion from `startClassicGamePeriod`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/classicGame.test.ts test/tournament/classicGame.integration.test.ts test/duel/gameplayLocks.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/tournament/classicGame.ts packages/server/src/duel/gameplayLocks.ts packages/server/test/tournament/classicGame.test.ts packages/server/test/tournament/classicGame.integration.test.ts packages/server/test/duel/gameplayLocks.test.ts
git commit -m "feat(tournament): lock gameplay on first classic shot"
```

### Task 4: Ordinary duel invitation, matchmaking, period, and shot guards

**Files:**
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Test: `packages/server/test/duel/amateur.test.ts`
- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Test: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

**Interfaces:**
- Consumes: tournament-only lock checks and `assertSafeSegmentStart`.
- Produces: `duel_lock: GameplayLockDTO | null` on amateur overview/match DTOs and a derived `matchmaking_enabled` value that preserves the stored preference.

- [ ] **Step 1: Write failing server route tests**

Cover challenge creation, invitation acceptance, matchmaking join, ordinary period start, and ordinary shot submission under a tournament lock. Confirm decline/cancel/history/chat remain allowed and `source = 'tournament'` duel mutations remain allowed.

- [ ] **Step 2: Add safe-start coverage for duel formats**

For each duel rules snapshot, calculate the maximum active segment from its period duration plus readiness needed before the next safe boundary. Assert rejection when the segment can cross the scheduled T-60 boundary.

- [ ] **Step 3: Run server test and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts`

Expected: FAIL because ordinary duel routes do not call gameplay locks.

- [ ] **Step 4: Add server guards without changing stored preference**

Call the lock service in challenge/accept/matchmaking/period/shot transactions. Filter locked opponents from matchmaking and opponent-search responses. Do not update preference columns or queued ticket history; expire/cancel an active queued ticket when its owner becomes locked.

- [ ] **Step 5: Write failing web tests for disabled entry points**

Mock `duel_lock` and assert disabled challenge/search/accept controls show a neutral reason and do not call mutation APIs. Confirm tournament-duel controls and chat remain usable.

- [ ] **Step 6: Implement DTO and UI handling**

Add a shared web `GameplayLockDTO` type, render the server explanation/countdown, and refresh amateur/daily/training queries when `ends_at` passes. Treat 409 as stale state: refetch instead of leaving optimistic controls active.

- [ ] **Step 7: Run focused server and web tests**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts`

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/chat/test/ChatRoomScreen.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts packages/web/src/api/amateurDuel.ts packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/chat/screens/ChatRoomScreen.tsx packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "feat(duel): block ordinary matchmaking around tournaments"
```

### Task 5: Unified lock DTOs and client refresh behavior

**Files:**
- Modify: `packages/server/src/duel/training/routes.ts`
- Modify: `packages/server/src/duel/daily/routes.ts`
- Modify: `packages/server/src/tournament/classicGame.ts`
- Modify: `packages/web/src/api/training.ts`
- Modify: `packages/web/src/api/duel.ts`
- Modify: `packages/web/src/api/tournamentClassic.ts`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`
- Test: `packages/web/src/screens/DailyOverviewScreen.test.tsx`

**Interfaces:**
- Produces: common JSON shape `{ blocked, reason, ends_at, tournament_starts_at }` exposed as `gameplay_lock`.
- Consumes: `GameplayLockState` from Task 1.

- [ ] **Step 1: Add failing DTO and rendering tests**

Test recent-gameplay countdown, scheduled start copy, active Classic copy, active playoff copy, midnight countdown, completion refresh, and no lock. Assert legacy `tournament_day_locked` is no longer the UI authority.

- [ ] **Step 2: Run web tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/screens/DailyOverviewScreen.test.tsx`

Expected: FAIL because the APIs expose separate legacy flags.

- [ ] **Step 3: Add shared DTO mapping to server reads**

Map the central state on training, daily, Classic, and amateur reads. Keep legacy fields for one compatibility release only if existing consumers require them, but derive them from `gameplay_lock` and mark them for later removal.

- [ ] **Step 4: Render one authoritative state and refresh it**

Use `gameplay_lock.reason` for copy and `ends_at` for countdown. For completion-bound locks, poll the relevant state every 30 seconds and immediately on returning to the hub. Invalidate related queries after successful tournament completion.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/screens/DailyOverviewScreen.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/duel/training/routes.ts packages/server/src/duel/daily/routes.ts packages/server/src/tournament/classicGame.ts packages/web/src/api/training.ts packages/web/src/api/duel.ts packages/web/src/api/tournamentClassic.ts packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/screens/DailyOverviewScreen.test.tsx
git commit -m "feat(web): show unified gameplay locks"
```

### Task 6: Full regression and invariant verification

**Files:**
- Modify if required by failures: files already listed in Tasks 1-5 only.

**Interfaces:**
- Consumes: all gameplay-lock work.
- Produces: verified implementation ready for integration review.

- [ ] **Step 1: Run formatting checks without rewriting unrelated files**

Run: `pnpm exec prettier --check packages/server/src/duel/gameplayLocks.ts packages/server/src/duel/trainingCooldown.ts packages/server/src/duel/training/routes.ts packages/server/src/duel/daily/routes.ts packages/server/src/duel/amateur/routes.ts packages/server/src/tournament/classicGame.ts packages/web/src/api/training.ts packages/web/src/api/duel.ts packages/web/src/api/amateurDuel.ts packages/web/src/api/tournamentClassic.ts packages/web/src/screens/DailyScreen.tsx packages/web/src/chat/screens/ChatRoomScreen.tsx`

Expected: PASS.

- [ ] **Step 2: Run package verification**

Run: `pnpm --filter @hockey/game-core build && pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run all affected tests**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/duel/training.test.ts test/duel/daily.test.ts test/duel/amateur.test.ts test/tournament/classicGame.test.ts test/tournament/classicGame.integration.test.ts test/migration107.test.ts`

Run: `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/screens/DailyOverviewScreen.test.tsx src/chat/test/ChatRoomScreen.test.tsx`

Expected: PASS.

- [ ] **Step 4: Prove gameplay calculations did not change**

Run existing shot-result, inventory-consumption, duel settlement, and Classic settlement suites. Compare `git diff` and confirm no `@hockey/game-core` deterministic file or version changed.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git add packages/server/src/duel/gameplayLocks.ts packages/server/src/duel/trainingCooldown.ts packages/server/src/duel/training/routes.ts packages/server/src/duel/daily/routes.ts packages/server/src/duel/amateur/routes.ts packages/server/src/tournament/classicGame.ts packages/server/test/duel packages/server/test/tournament/classicGame.test.ts packages/server/test/tournament/classicGame.integration.test.ts packages/web/src/api packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/screens/DailyOverviewScreen.test.tsx packages/web/src/chat/screens/ChatRoomScreen.tsx packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "test: complete gameplay lock regressions"
```

Skip this step when verification required no correction and the worktree is already clean apart from known user-owned files.
