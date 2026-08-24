# Technical playoff series settlement report

## Scope

Implemented technical playoff series advancement in the `co_dex/tournaments` worktree. The change is limited to tournament server lifecycle/service code and PostgreSQL integration regressions. No deploy, feature-flag, main, or production changes were made.

## Behaviour delivered

- One-sided playoff no-shows conditionally settle the fixture as a forfeit and advance the higher/lower seed counter exactly once.
- `advanceTournamentPlayoffSeries` is the shared transaction-local operation for normal duel settlement and administrative technical settlement. It completes a clinched series, stores its winner, cancels unresolved unused fixtures, and resolves/schedules dependent final and bronze series fixtures.
- Playoff double no-show pauses the fixture, series, and tournament without a series win; repeat resolution does not create a second adjustment.
- Disqualification processes unresolved fixtures one at a time in ascending `fixture_number`. Each changed fixture is conditionally forfeited, its series is advanced, and the loop continues through newly materialized dependent fixtures. Completed/cancelled fixtures are excluded and clinched counters cannot be incremented again.
- Regular technical fixtures continue to receive their existing forfeit outcome and standings rebuild.
- Technical settlements enqueue the same `tournament.result_ready` event keys as normal fixture settlement. The queue unique key preserves exactly-once delivery on duplicate administrative resolution.

## TDD evidence

The following PostgreSQL integration RED failures were observed before their minimal implementation:

1. Two technical wins left a best-of-three playoff series at `0:0`, `scheduled`, with no winner.
2. DQ left `R1S1` scheduled and `BRONZE` pending instead of propagating through the newly resolved dependent series.
3. Repeating a playoff double no-show inserted two adjustments instead of one.
4. Two technical fixtures with subscriptions produced zero `tournament.result_ready` deliveries instead of four recipient-scoped event keys.

Each case was rerun green after implementation.

## Verification

- PASS — `pnpm --filter @hockey/game-core build`
- PASS — `TEST_DATABASE_URL=postgres://hockey:hockey_dev_password@localhost:5432/hockey_test TEST_REDIS_URL=redis://localhost:6379/15 pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts` — 13/13 tests.
- PASS — `pnpm --filter @hockey/server typecheck`
- PASS — `pnpm lint`
- PASS — `git diff --check`

The full server suite was intentionally not run in this task because the controller owns that wider verification pass.

## Self-review notes

- Fixture mutation predicates restrict technical and normal settlement to unresolved states before invoking the shared series operation.
- Series counters only update while the series is `scheduled` or `active`; a completed series cannot overshoot.
- DQ processing remains inside the existing tournament advisory lock; no-show remains inside the existing fixture advisory lock.
- No pre-existing `tournament.series_next_game` enqueue path exists in the current lifecycle. The implemented technical notification parity therefore covers the existing `tournament.result_ready` contract.

## Fix round 1

Review regressions were added with separate PostgreSQL RED/GREEN cycles:

1. A split best-of-three series left game 3 `conditional` after `1:1`. The shared `advanceTournamentPlayoffSeries` now promotes the next conditional fixture whose `gameNumber` matches total completed series wins plus one. This is used by both normal duel settlement and technical settlement.
2. A double no-show paused the tournament but another playoff fixture could still call the duel factory. `openTournamentFixtureSegment` now reads the tournament and series state in its locked fixture context and rejects when either is paused.
3. A late callback for an already-created duel changed a technically cancelled fixture and its segment. Series completion now terminalizes segments belonging to cancelled fixtures; `settleTournamentSegmentForDuel` checks segment and fixture terminal state before any write. The late callback is a no-op and cannot alter fixture scores, counters, or winner.

Additional verification:

- PASS — focused tournament integration: 16/16 tests, including all three review regressions.
- PASS — `pnpm --filter @hockey/server typecheck`.
- PASS — `pnpm lint`.
- PASS — `git diff --check`.

The full server suite remains intentionally delegated to the controller.

## Fix round 2

Two further PostgreSQL regressions were implemented with independent RED/GREEN cycles:

1. A controlled concurrent opening held its duel factory behind a barrier while another fixture received a double no-show. Before the fix, the pause committed before the opening was released. Tournament fixture paths now use the documented lock order: tournament advisory lock, fixture advisory/row lock, then affected series rows. This serializes opening, no-show, and rescheduling at tournament scope and prevents an opening from observing stale unpaused tournament state.
2. A technically cancelled fixture terminalized its segment but left an active linked `source='tournament'` duel. Series completion now cancels linked active tournament duels only, with no call into normal duel settlement. The regression verifies the linked duel is cancelled while rating rows and duel economy ledger records remain absent.

Additional verification:

- PASS — focused tournament integration: 17/17 tests, including controlled concurrent pause/open and active tournament-duel cancellation.
- PASS — `pnpm --filter @hockey/server typecheck`.
- PASS — `pnpm lint`.
- PASS — `git diff --check`.

The full server suite remains intentionally delegated to the controller.
