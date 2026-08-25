# Synthetic tournament seasons acceptance report

## Status

Implemented deterministic PostgreSQL acceptance seasons for both tournament formats on `co_dex/tournaments`. The public `tournaments.enabled` setting remains `false`. No GLM, deploy, `main`, production, or feature-flag action was performed.

The integration test resolves its local Git HEAD at runtime and prints it as a diagnostic. The last pre-commit GREEN run reported base HEAD `d916e4a08c1ceed6e8b2ae56ac795f14bd7df751`; it does not assert or invent a deployed runtime SHA. Exact deployed SHA remains a later dev-deployment gate.

## Changed files

- `packages/server/test/tournament/synthetic-seasons.integration.test.ts`
  - Runs a complete four-player head-to-head season through draft, publish, approval registration, entry fees, generated regular schedule, all regular settlements, standings, fixed semifinals/final/bronze, stage rewards, completion, and push queueing.
  - Opens one regular fixture with `openTournamentFixtureSegment()` and `createTournamentDuelMatch()`, readies both users through the real amateur duel HTTP lifecycle, and settles it through the real amateur duel settlement callback into the tournament fixture.
  - Runs a three-day four-player daily aggregate season across UTC, America/Los_Angeles, Europe/Moscow, and Asia/Tokyo using real `day_pool` and `period_log` source rows.
  - Proves finalization waits through the last participant-local midnight, incomplete daily play becomes zero, `accuracy_average` with best two days ranks correctly, and repeated due-day maintenance is idempotent.
  - Asserts preserved daily standings seed playoffs unchanged, final placements, no unresolved fixtures/series, exactly-once entry/reward/push rows, final balances/stars/experience, no ordinary amateur rating/stake/template reward effects, and feature flag `false` at both ends.
- `packages/server/src/tournament/service.ts`
  - Starts head-to-head playoffs from a fresh head-to-head rebuild.
  - Starts daily aggregate playoffs from the already finalized daily standings without replacing them with head-to-head zeros.
- `packages/server/src/duel/amateur/routes.ts`
  - Avoids ordinary entry-fee and stake ledger writes when their tournament settlement-policy amounts are zero.

## TDD evidence

### RED 1: ordinary duel economy leaked into a tournament duel

Command:

```bash
TEST_DATABASE_URL=postgres://hockey:hockey_dev_password@localhost:5432/hockey_test \
TEST_REDIS_URL=redis://localhost:6379/15 \
pnpm --filter @hockey/server exec vitest run test/tournament/synthetic-seasons.integration.test.ts
```

Observed failure before the fix:

```text
expected stake_or_template_ledgers '0', received '4'
```

The four rows were zero-delta `duel_entry_fee` and `duel_stake_hold` ledger entries from readying two tournament participants.

### RED 2: daily standings were rebuilt as head-to-head at playoff start

The same run finalized daily standings as players `[912, 911, 913, 914]`, then the final placement assertion received an order beginning with player `913`. `startTournamentPlayoffs()` had unconditionally called `rebuildHeadToHeadStandings()` despite `regular_source='daily_aggregate'`.

### GREEN

After the two minimal production fixes, the same synthetic file passed both complete seasons:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
```

## Acceptance evidence

### Head-to-head season

- Four approval-mode applications became four approved participants with paid 5-coin entry fees.
- The real generated round robin produced six regular fixtures; all six reached terminal settlement.
- The A/B fixture used an actual tournament-sourced amateur duel. Its reward-bearing ordinary template was snapshotted to `ranked=false`, zero stake, zero duel entry fee, and zero template coin/star reward.
- A and B both finished on six points and two wins; the configured goal-difference tie-break ranked A first (`+2`) and B second (`0`).
- Two semifinals, the final, and the bronze series completed. Final playoff placements matched regular seeds 1-4 by construction.
- Terminal tournament result pushes: 20 unique rows for ten settled fixtures; lifecycle and next-game pushes were also unique.

### Daily aggregate season

- Four players in four time zones produced 12 real daily result rows over three tournament days.
- Scheduler at `2032-06-02T06:59:59Z`: zero days finalized; at the last local midnight `2032-06-02T07:00:00Z`: day 1 finalized for all four.
- Repeated scheduler calls after each finalized day returned zero work.
- Player 912's incomplete day 2 persisted as `completed=false`, zero goals, shots, accuracy, place, and place points.
- Best-two `accuracy_average` standings were exactly `0.60`, `0.55`, `0.45`, `0.40`, with counted days `[3,1]`, `[2,3]`, `[2,1]`, `[1,3]`.
- The standings JSON before and after playoff materialization is byte-for-byte equal.
- Both semifinals, final, bronze, rewards, pushes, and tournament completion reached the same terminal invariants as head-to-head.

### Shared terminal invariants per season

- `tournaments.enabled = false`.
- Tournament `status='completed'` with non-null `completed_at`.
- Zero unresolved fixtures and zero unresolved playoff series.
- Exactly four applied entry-fee events, four regular reward events, and four playoff reward events, all with distinct idempotency keys.
- Exactly four unique approval, schedule, playoff-started, completed, and series-next-game push deliveries per event audience as applicable; every fixture-result delivery is unique by user/event key.
- Repeated reward grants produced `granted: 0`; repeated notification enqueueing and technical settlement produced no duplicate rows.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @hockey/game-core build` | PASS |
| Synthetic PostgreSQL file only | PASS — 1 file, 2 tests |
| Synthetic + service + daily-maintenance + realtime-progress PostgreSQL integration files, sequential | PASS — 4 files, 49 tests |
| `pnpm --filter @hockey/server typecheck` | PASS |
| Scoped ESLint for test and changed server files | PASS |
| `pnpm lint` | PASS |
| `git diff --check` | PASS |

The controller owns the full repository suite, so no full-suite run was started from this task.

## Concerns

- Focused integration runs emit the pre-existing Node `MaxListenersExceededWarning` from repeated in-process Fastify/WebSocket app construction. All assertions pass; this task did not change listener ownership.
- This is local PostgreSQL acceptance only. No deployed/runtime SHA is claimed, and dev rendered/runtime acceptance remains a later release gate.
