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
