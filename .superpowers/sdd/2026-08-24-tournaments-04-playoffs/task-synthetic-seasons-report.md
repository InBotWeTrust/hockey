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

## Review round 1 addendum

This addendum supersedes the earlier statements that playoff placements matched regular ranks, that players 911/912 shared the head-to-head lead, and that the sequential integration total was 49 tests. Fix-round work started from local base HEAD `468edb750e523ae8af3350b53ea7aeb79941a98b`; the runtime SHA diagnostic remains local-only and does not claim a deployed SHA.

### Implemented review fixes

- Daily playoff start now requires one finalized `tournament_daily_result` for every eligible participant and every configured day. Incomplete coverage returns `409 conflict` under the tournament lock and leaves the tournament `regular`.
- Daily cutoff equality is detected from persisted competitive `tie_key` values at ranks `playoffSize` and `playoffSize + 1`. The service creates the existing real tie-break round/fixture lifecycle instead of falling back to participant UUID order.
- After every expected tie-break fixture settles with a winner, daily tied ranks are reordered from tie-break wins, goal difference, and goals scored. Only `rank` and `recalculated_at` change; original daily `points`, `metrics`, and `tie_key` remain intact. A competitively unresolved tie does not fall back to UUID order.
- Both complete synthetic seasons now contain explicit semifinal upsets. Head-to-head finishes `[913, 914, 912, 911]`; daily aggregate finishes `[913, 914, 911, 912]`, both different from their regular order.
- The synthetic head-to-head regular order is competitively deterministic at `9, 6, 3, 0` points for players `911, 912, 913, 914`; no expected rank depends on generated participant UUIDs.
- Reward acceptance now compares eight literal `user_id + stage + place + coins + stars + experience` rows per season and four literal final account rows. Expected values are not calculated from standings, playoff series, or reward configuration returned by the system under test.

### RED/GREEN evidence

1. Incomplete daily coverage:
   - RED: synthetic daily start after day 1 resolved to `{status: 'playoff'}` instead of rejecting.
   - GREEN: the synthetic file passed `2/2`; playoff start rejected with `409` after day 1 and succeeded only after day 3 finalized at the last participant-local midnight.
2. Daily cutoff tie materialization:
   - RED: the focused service test received `{status: 'playoff'}` for equal persisted `[0.5]` cutoff keys.
   - GREEN: the focused test passed `1/1` with one scheduled 30-minute tie-break fixture, a configured duel template, and no playoff round.
3. Daily tie-break retry:
   - RED: after technical settlement through `resolveTournamentNoShow()`, retry still returned `tiebreak_required`.
   - GREEN: the focused test passed `1/1`; the original rank-3 winner became rank 2, entered `R1S1`, and all daily metric fields retained their literal values.
4. Independent playoff rewards:
   - RED: both synthetic seasons failed because the old assertion assigned playoff rewards by regular rank; the upset winners' actual balances differed.
   - GREEN: the synthetic file passed `2/2` with literal reward-event and final-account expectations.
5. Deterministic synthetic regular order:
   - RED: the first final-gate run passed `50/51`; players 913/914 had identical competitive rows and swapped by generated participant UUID.
   - GREEN: the regular fixture outcomes now produce literal `9, 6, 3, 0` points, the synthetic file passed `2/2`, and the sequential tournament integration run passed `51/51`.

### Final verification

| Command | Result |
| --- | --- |
| `pnpm --filter @hockey/game-core build` | PASS |
| `pnpm --filter @hockey/server typecheck` | PASS |
| Scoped ESLint for the three changed TypeScript files | PASS |
| `pnpm lint` | PASS |
| Synthetic PostgreSQL file only | PASS — 1 file, 2 tests |
| All tournament PostgreSQL integration files with `--no-file-parallelism` | PASS — 4 files, 51 tests |
| `git diff --check` | PASS |

The sequential integration run still emits the pre-existing `MaxListenersExceededWarning` from repeated in-process WebSocket server construction. No assertion failed, and listener ownership is outside this fix round. Multi-player tie-break results that remain competitively equal intentionally stay unresolved rather than using UUID order; a future product rule may define an additional tie-break round for that edge case.

## Review round 2 addendum

This addendum replaces the round-1 statement that a competitively equal multi-player cutoff should remain unresolved indefinitely. Fix-round work started from local base HEAD `c99a561fe131a0b192325cf6356f19a99d4aafc4`; no deployed/runtime SHA is claimed.

### Implemented review fix

- Daily cutoff processing now reads only the latest numbered tie-break round and uses its persisted `participantIds` subset. Legacy round 1 rows without that snapshot fall back to the original boundary participants.
- A terminal round is accepted only when it contains every expected unordered participant pair exactly once and each terminal winner belongs to that fixture. Pending fixtures keep the current round in the idempotent waiting state.
- The settled mini-table orders participants by wins, goal difference, and goals scored. Prior rank is only a stable order inside competitively equal groups; it never selects a participant across the playoff cutoff.
- If a competitive group still crosses the number of available playoff slots, the service materializes round `N+1` for only that unresolved subset. Tournament locking plus numbered-round lookup prevents retry duplicates, while another terminal cycle can create round `N+2`.
- Every new round persists its participant subset and creates each unordered pair once with sequential tie-break fixture numbers and the configured playable windows/duel template.
- Final rank updates continue to change only `rank` and `recalculated_at`; daily `points`, `metrics`, and `tie_key` remain unchanged.

### TDD evidence

The new integration regression models four daily participants with a three-player `0.5` tie for one remaining playoff slot.

1. RED:
   - After the first terminal cycle `A > B`, `B > C`, `C > A`, retry still exposed only round 1 instead of materializing round 2.
   - The original round snapshot also had no persisted `participantIds` subset.
2. GREEN:
   - The focused cyclic regression passed `1/1`.
   - Round 1 and round 2 each contained exactly the three expected unordered fixtures; a retry before round-2 settlement left exactly two rounds and six fixtures.
   - A second cycle created round 3. Its competitive settlement promoted the original rank-4 participant into the second playoff seed without UUID comparison.
   - The complete service integration file passed `35/35`, including the existing two-player daily tie-break coverage.

### Final verification

| Command | Result |
| --- | --- |
| `pnpm --filter @hockey/server typecheck` | PASS |
| Scoped ESLint for `service.ts` and `service.integration.test.ts` | PASS |
| `pnpm lint` | PASS |
| All four tournament PostgreSQL integration files with `--no-file-parallelism` | PASS — 4 files, 52 tests |
| `git diff --check` | PASS |

The sequential gate includes `daily-maintenance.integration.test.ts`, `realtime-progress.integration.test.ts`, `service.integration.test.ts`, and `synthetic-seasons.integration.test.ts`. Both synthetic seasons passed unchanged.

### Concerns

- The cyclic regression asserts generated pair completeness and checks every resolved winner against its real fixture through `resolveTournamentNoShow()`. The defensive rejection branches for deliberately corrupted pair/winner rows are not exercised by separate database-corruption tests.
- The pre-existing `MaxListenersExceededWarning` still appears during sequential in-process WebSocket test construction; all 52 assertions pass.
- Verification is local PostgreSQL/Redis evidence only. No dev/prod deploy, feature-flag change, `main` update, or production action was performed.
