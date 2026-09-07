# Remove Daily Aggregate Tournaments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `daily_aggregate` as a tournament format and physically delete all tournament-owned data created with that source.

**Architecture:** First add an idempotent forward migration that isolates target tournament IDs, clears restrictive self-references, and deletes each dependency safely. Then narrow server and web discriminated unions to `head_to_head | classic` and remove unreachable runtime/UI branches.

**Tech Stack:** PostgreSQL 16 migrations, TypeScript, Zod, Fastify 4, React 18, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-tournament-gameplay-locks-design.md`

## Global Constraints

- Delete only tournaments whose root row has `regular_source = 'daily_aggregate'`.
- Delete all tournament-owned applications, participants, revisions, schedule, games, results, standings, and dependent records.
- Do not delete ordinary daily-game pools, periods, shots, user balances, inventory, or supported tournament formats.
- No reward reversal is required because these tournaments issued no rewards.
- The migration must be idempotent and forward-only.
- Historical specifications remain unchanged; the 2026-09-07 specification supersedes them.

---

### Task 1: Idempotent destructive migration with dependency proof

**Files:**
- Create: `packages/server/db/migrations/108_remove_daily_aggregate_tournaments.sql`
- Create: `packages/server/test/migration108.test.ts`
- Modify: `packages/server/test/tournament/migration-contract.test.ts`

**Interfaces:**
- Produces: database constraint `tournament_regular_source_check` accepting only `head_to_head` and `classic`.
- Consumes: the complete FK graph rooted at `tournament.id`.

- [ ] **Step 1: Write a failing migration integration test**

Seed one `daily_aggregate`, one `classic`, and one `head_to_head` tournament with representative revisions, participants, applications, matchdays, daily results, standings, dispatch/outbox rows, and any later migration tables. Run migration 108 and assert every row owned by the target ID is gone while supported tournaments and ordinary `day_pool`/`shot_session` rows remain.

- [ ] **Step 2: Add an idempotency and schema test**

Run the migration twice and assert no error. Attempt to insert `regular_source = 'daily_aggregate'` and expect a check violation; insert both supported sources successfully.

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/migration108.test.ts test/tournament/migration-contract.test.ts`

Expected: FAIL because migration 108 does not exist.

- [ ] **Step 4: Implement the guarded deletion**

Use a temporary target table scoped to the transaction:

```sql
create temporary table removed_daily_aggregate_tournament_ids on commit drop as
select id from tournament where regular_source = 'daily_aggregate';

update tournament
set published_revision_id = null
where id in (select id from removed_daily_aggregate_tournament_ids);
```

Delete non-cascading/restricting dependants in verified leaf-to-root order, then delete target tournaments. Drop and recreate `tournament_regular_source_check` as `check (regular_source in ('head_to_head', 'classic'))`, validating it after deletion. Do not use broad predicates on participant user IDs or dates.

- [ ] **Step 5: Run migration tests and verify GREEN**

Run: `pnpm --filter @hockey/server exec vitest run test/migration108.test.ts test/tournament/migration-contract.test.ts`

Expected: PASS with exact surviving-row assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/server/db/migrations/108_remove_daily_aggregate_tournaments.sql packages/server/test/migration108.test.ts packages/server/test/tournament/migration-contract.test.ts
git commit -m "chore(tournament): remove daily aggregate data"
```

### Task 2: Remove the server format and runtime branches

**Files:**
- Modify: `packages/server/src/tournament/types.ts`
- Modify: `packages/server/src/tournament/config.ts`
- Delete: `packages/server/src/tournament/dailyAggregate.ts`
- Modify: `packages/server/src/tournament/automaticLifecycle.ts`
- Modify: `packages/server/src/tournament/automaticLifecycleAudit.ts`
- Modify: `packages/server/src/tournament/materialize.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/server/src/tournament/scoring.ts`
- Modify: `packages/server/src/tournament/standings.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/achievements/tournamentRules.ts`
- Modify: `packages/server/src/achievements/tournamentEvaluator.ts`
- Test: `packages/server/test/tournament/config.test.ts`
- Test: `packages/server/test/tournament/routes-validation.test.ts`
- Test: `packages/server/test/tournament/automaticLifecycle.test.ts`
- Test: `packages/server/test/tournament/scoring.test.ts`
- Test: `packages/server/test/tournament/standings.test.ts`
- Test: `packages/server/test/achievements/tournamentRules.test.ts`

**Interfaces:**
- Produces: `TournamentRegularSource = 'head_to_head' | 'classic'` and a two-branch `TournamentConfig` discriminated union.
- Removes: `DailyAggregateTournamentConfig` and all imports from `dailyAggregate.ts`.

- [ ] **Step 1: Change tests to require rejection**

Replace positive `daily_aggregate` configuration tests with a validation test expecting `tournamentConfigSchema.safeParse(...)` to fail on that source. Remove daily-aggregate-only scoring/lifecycle assertions; retain generic daily metric coverage through Classic where applicable.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/config.test.ts test/tournament/routes-validation.test.ts test/tournament/automaticLifecycle.test.ts test/tournament/scoring.test.ts test/tournament/standings.test.ts test/achievements/tournamentRules.test.ts`

Expected: FAIL because the server still accepts and dispatches `daily_aggregate`.

- [ ] **Step 3: Narrow types and Zod schemas**

Delete `DailyAggregateTournamentConfig` and `dailyAggregateSchema`; export:

```ts
export type TournamentRegularSource = 'head_to_head' | 'classic';
export type TournamentConfig = HeadToHeadTournamentConfig | ClassicTournamentConfig;
```

Remove all switch branches, queries, scheduled reconciliation, auditing, achievement evaluation, and exports used only for `daily_aggregate`. Exhaustive switches must compile without default casts.

- [ ] **Step 4: Delete the orphaned implementation module**

Delete `dailyAggregate.ts` only after `rg -n "dailyAggregate|daily_aggregate" packages/server/src` shows that remaining occurrences are migration compatibility or explicit rejection code. Remove obsolete integration tests such as daily-maintenance cases that cannot apply to supported formats.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm --filter @hockey/server typecheck`

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/config.test.ts test/tournament/routes-validation.test.ts test/tournament/automaticLifecycle.test.ts test/tournament/scoring.test.ts test/tournament/standings.test.ts test/achievements/tournamentRules.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/tournament packages/server/src/achievements packages/server/test/tournament packages/server/test/achievements
git commit -m "refactor(tournament): drop daily aggregate runtime"
```

### Task 3: Remove admin and player-web support

**Files:**
- Modify: `packages/web/src/tournament/adminApi.ts`
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Modify: `packages/web/src/tournament/TournamentCatalog.tsx`
- Modify: `packages/web/src/tournament/TournamentScheduleCalendar.tsx`
- Modify: `packages/web/src/tournament/TournamentStandingsTable.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.tsx`
- Modify: `packages/web/src/tournament/labels.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Test: corresponding `*.test.ts` and `*.test.tsx` files beside each module.

**Interfaces:**
- Produces: web `regularSource: 'head_to_head' | 'classic'` contracts.
- Removes: admin option label `Результаты ежедневных игр` and daily-aggregate-only rendering.

- [ ] **Step 1: Write failing admin tests**

Assert the regular-source selector contains only head-to-head and Classic options and that no request payload can serialize `daily_aggregate`.

- [ ] **Step 2: Change catalogue, calendar, table, operation, and label tests**

Remove obsolete fixtures and add supported-format assertions covering every branch that previously shared behavior with `daily_aggregate`.

- [ ] **Step 3: Run focused web tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentAdmin.test.tsx src/tournament/TournamentCatalog.test.tsx src/tournament/TournamentScheduleCalendar.test.tsx src/tournament/TournamentStandingsTable.test.tsx src/tournament/TournamentOperations.test.tsx src/tournament/labels.test.ts src/tournament/adminApi.test.ts`

Expected: FAIL while the option and union remain.

- [ ] **Step 4: Remove web branches and narrow types**

Remove the option from `TournamentAdmin`, delete source-specific copy/render branches, and narrow API/admin discriminated unions. Do not replace the removed source with silent Classic coercion; stale payloads must fail server validation.

- [ ] **Step 5: Run focused tests and web typecheck**

Run: `pnpm --filter @hockey/web typecheck`

Run: `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentAdmin.test.tsx src/tournament/TournamentCatalog.test.tsx src/tournament/TournamentScheduleCalendar.test.tsx src/tournament/TournamentStandingsTable.test.tsx src/tournament/TournamentOperations.test.tsx src/tournament/labels.test.ts src/tournament/adminApi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/tournament packages/web/src/api/tournament.ts
git commit -m "refactor(web): remove daily aggregate tournaments"
```

### Task 4: Repository-wide removal verification

**Files:**
- Modify if required by failures: files already listed in Tasks 1-3 only.

**Interfaces:**
- Consumes: completed removal work.
- Produces: migration-safe, compile-safe removal ready for integration review.

- [ ] **Step 1: Audit remaining references**

Run: `rg -n "daily_aggregate|DailyAggregate|dailyAggregate" packages/server/src packages/server/test packages/web/src`

Expected: only explicit migration/rejection compatibility assertions remain. Investigate every result; do not leave unreachable production branches.

- [ ] **Step 2: Run migration chain and affected integration tests**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/migration108.test.ts test/tournament/migration-contract.test.ts test/tournament/service.integration.test.ts test/tournament/automaticLifecycle.integration.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full static and build verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 4: Run full tournament suites**

Run: `pnpm --filter @hockey/server test -- test/tournament`

Run: `pnpm --filter @hockey/web test -- src/tournament`

Expected: PASS.

- [ ] **Step 5: Review the destructive migration diff**

Verify the migration's target set is keyed only by tournament IDs selected with `regular_source = 'daily_aggregate'`. Confirm it contains no user-wide, date-wide, `TRUNCATE`, or unscoped delete and leaves ordinary daily game tables untouched.

- [ ] **Step 6: Commit any verification-only corrections**

```bash
git add packages/server/db/migrations/108_remove_daily_aggregate_tournaments.sql packages/server/src/tournament packages/server/src/achievements packages/server/test packages/web/src/tournament packages/web/src/api/tournament.ts
git commit -m "test: verify daily aggregate removal"
```

Skip this step when verification required no correction and the worktree is already clean apart from known user-owned files.
