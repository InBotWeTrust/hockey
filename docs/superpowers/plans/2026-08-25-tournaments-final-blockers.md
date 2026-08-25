# Tournament Final Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four Important blockers found by the scoped review of commit `4afdd3e` so the tournament branch can be considered for dev integration.

**Architecture:** Keep the feature isolated behind `tournaments.enabled`. Replace connection-parking dispatch locking with non-blocking lock acquisition, separate tournament visibility from playability for duel read paths, gate tournament reminder production inside the scheduler service itself, and preserve the exact original instant when an ambiguous wall-clock value is saved unchanged.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL 16 advisory locks, Redis 7, React 18, Vitest.

**Spec:** `docs/superpowers/plans/2026-08-24-tournaments-05-live-comms-release.md` plus the approved tournament plan in the task conversation.

## Global Constraints

- Base branch is `origin/dev`; work only in `co_dex/tournaments` and its existing isolated worktree.
- Do not touch `main`, production, remote branches, deployment, or runtime feature flags.
- GLM and all external model calls are disabled.
- Preserve ordinary amateur duel behavior and the published tournament snapshots.
- Keep `tournaments.enabled=false` after every integration or synthetic test run.
- Every fix follows RED → GREEN with an observable regression test.
- Run `pnpm --filter @hockey/game-core build` before server verification.
- Database changes must be additive, forward-only, idempotent migrations.

---

### Task 1: Pool-safe manual dispatch ownership

**Files:**
- Modify: `packages/server/src/tournament/communications.ts`
- Test: `packages/server/test/tournament/service.integration.test.ts`

**Interfaces:**
- Consumes: `dispatchTournamentCommunication(pool, publisher, input)` and existing `tournament_dispatch` snapshots/idempotency key.
- Produces: the same public return DTO; concurrent identical requests never duplicate delivery and never park all pool clients behind a blocking session lock.

- [ ] **Step 1: Write the failing pool-exhaustion regression**

Create a pool with `max: 2`, arrange three concurrent calls with the same idempotency key, and bound completion with a test timeout. Assert all calls resolve to the same dispatch id, one message/delivery exists, and the dispatch is `sent`. This test catches replacing non-blocking acquisition with `pg_advisory_lock` while nested work still uses `pool`.

- [ ] **Step 2: Run RED**

Run:

```bash
TEST_DATABASE_URL=postgresql://hockey:hockey_dev_password@127.0.0.1:5432/hockey_test \
TEST_REDIS_URL=redis://127.0.0.1:6379/1 \
pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "does not exhaust the pool"
```

Expected: timeout or failure because blocking `pg_advisory_lock` reserves both pool clients.

- [ ] **Step 3: Implement non-parking lock acquisition**

Add an internal helper with this contract:

```ts
async function acquireDispatchLock(pool: Pool, lockKey: string): Promise<PoolClient>
```

It repeatedly obtains a client, calls `pg_try_advisory_lock(hashtext($1))`, immediately releases unsuccessful clients, and waits with a small bounded backoff before retrying. The acquired client remains responsible for `pg_advisory_unlock` in the existing `finally`. Preserve snapshot reuse and exactly-once delivery checks.

- [ ] **Step 4: Run GREEN and the existing dispatch tests**

Run the new test plus `publishes an idempotent tournament news post` and `serializes concurrent manual dispatch retries`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/tournament/communications.ts packages/server/test/tournament/service.integration.test.ts
git commit -m "fix(tournaments): avoid dispatch pool deadlock"
```

---

### Task 2: Separate tournament duel visibility from playability

**Files:**
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Test: `packages/server/test/duel/amateur.test.ts`

**Interfaces:**
- Consumes: `fetchMatchForUpdate`, tournament feature flag, fixture/segment hierarchy.
- Produces: `fetchVisibleMatchForUpdate()` for read/readback paths and `fetchPlayableMatchForUpdate()` only for mutations that start or advance gameplay.

- [ ] **Step 1: Write failing mixed-list and settled-readback regressions**

Create one ordinary duel and one settled tournament-backed duel for the same user while the feature is enabled. Assert `GET /duel/amateur/matches` returns both instead of 409, detail returns the settled DTO, and repeating the settlement/readback operation is idempotent. Also assert disabled tournaments remain hidden/404.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL=postgresql://hockey:hockey_dev_password@127.0.0.1:5432/hockey_test \
TEST_REDIS_URL=redis://127.0.0.1:6379/1 \
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "settled tournament duel"
```

Expected: 409 from the active segment/fixture predicate.

- [ ] **Step 3: Implement explicit access levels**

Extract the feature-flag check into a shared tournament visibility guard. Read paths call raw `fetchMatchForUpdate` plus visibility only. Gameplay mutations call visibility plus the existing active segment/fixture/series predicate. In `/duel/amateur/matches`, settled rows must never pass through the playability guard; active tournament rows still must. Do not weaken ordinary duel checks.

- [ ] **Step 4: Run GREEN and all amateur duel tests**

Run the new regressions, then the complete `test/duel/amateur.test.ts` file.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
git commit -m "fix(tournaments): preserve settled duel readback"
```

---

### Task 3: Gate scheduled tournament reminders at the producer

**Files:**
- Modify: `packages/server/src/push/scheduled.ts`
- Modify only if needed: `packages/server/src/plugins/pushScheduler.ts`
- Test: `packages/server/test/push/scheduled.test.ts`

**Interfaces:**
- Consumes: `game_settings['tournaments.enabled']` and `runScheduledPushes(pool, input)`.
- Produces: daily/training scheduled events regardless of tournament flag, but zero `tournament.*` scheduled events when the flag is false.

- [ ] **Step 1: Write the failing disabled-flag regression**

Seed one due daily notification and due tournament live/open/deadline notifications, set `tournaments.enabled=false`, run `runScheduledPushes`, and assert the daily event is delivered while no tournament delivery-log rows or returned events exist.

- [ ] **Step 2: Run RED**

```bash
TEST_DATABASE_URL=postgresql://hockey:hockey_dev_password@127.0.0.1:5432/hockey_test \
TEST_REDIS_URL=redis://127.0.0.1:6379/1 \
pnpm --filter @hockey/server exec vitest run test/push/scheduled.test.ts -t "skips tournament reminders when disabled"
```

Expected: tournament events are still enqueued.

- [ ] **Step 3: Implement producer-level gating**

Read the feature flag once inside `runScheduledPushes`. Wrap all tournament live-soon, fixture-opened, and fixture-deadline query/enqueue branches in `if (tournamentsEnabled)`. Do not gate daily/training scheduling and do not rely only on the plugin caller, because the worker CLI also calls this service.

- [ ] **Step 4: Run GREEN and the complete scheduled-push file**

Run all `test/push/scheduled.test.ts` tests and confirm existing enabled-tournament reminder cases remain green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/push/scheduled.ts packages/server/src/plugins/pushScheduler.ts packages/server/test/push/scheduled.test.ts
git commit -m "fix(tournaments): gate scheduled reminders"
```

---

### Task 4: Preserve ambiguous DST instants on no-op edits

**Files:**
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Test: `packages/web/src/tournament/TournamentAdmin.test.tsx`

**Interfaces:**
- Consumes: tournament ISO timestamps, configured IANA timezone, `localDateTimeValue`, `dateOrNull`.
- Produces: exact ISO preservation when an existing local value and timezone are unchanged; deterministic earlier occurrence for a newly entered ambiguous time; nonexistent spring-forward values remain rejected.

- [ ] **Step 1: Write the failing fall-back round-trip regression**

Render an existing `America/New_York` tournament whose `startsAt` is the later `2026-11-01T06:30:00.000Z` occurrence of local `01:30`. Change an unrelated field and save. Assert the PATCH payload still contains `2026-11-01T06:30:00.000Z`, not `05:30Z`. Add a second assertion that actually changing the wall time does not reuse the original instant.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @hockey/web exec vitest run src/tournament/TournamentAdmin.test.tsx -t "preserves the later DST occurrence"
```

Expected: payload contains the earlier occurrence.

- [ ] **Step 3: Implement origin-aware serialization**

Store the original ISO values and original timezone in non-API draft metadata when loading an existing tournament. Change the serializer contract to:

```ts
function dateOrNull(
  value: string,
  timezone: string,
  original?: { iso: string | null; timezone: string },
): string | null
```

If `original.iso` formats to the same wall-clock value and `original.timezone === timezone`, return the original ISO exactly. Otherwise call `wallClockToIso`, which keeps the existing spring-gap validation and deterministic earlier-overlap policy.

- [ ] **Step 4: Run GREEN and TournamentAdmin tests**

Run the new DST cases and the complete `TournamentAdmin.test.tsx` file.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/tournament/TournamentAdmin.tsx packages/web/src/tournament/TournamentAdmin.test.tsx
git commit -m "fix(tournaments): preserve DST timestamp roundtrip"
```

---

### Task 5: Corrective release verification

**Files:**
- Modify: none unless a regression is found.

- [ ] Run `pnpm --filter @hockey/game-core build`.
- [ ] Run full server tests with local TEST PostgreSQL/Redis and confirm 74/74 files and 611/611 or the new higher total.
- [ ] Run complete web tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and root `pnpm test`.
- [ ] Run both synthetic tournament seasons.
- [ ] Run `git diff --check` and confirm a clean worktree.
- [ ] Restore `hockey_test` with the repository migration CLI and read back `tournaments.enabled=false`.
- [ ] Perform a new whole-corrective-range review. Any Critical/Important finding blocks dev integration.
- [ ] Preserve the branch/worktree; do not push, merge, deploy, or enable the feature without explicit authorization.
