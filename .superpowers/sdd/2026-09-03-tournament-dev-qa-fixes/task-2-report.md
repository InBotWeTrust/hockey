# Task 2 — transactional series lifecycle

## Implemented

- Replaced runtime next-game choice creation with one transactional next-attempt materialization after every non-terminal series result.
- The next attempt starts after `inter_game_break_duration`, uses a manual readiness check, and keeps the completion window frozen from the settled attempt snapshot.
- Exposed `nextGame { fixtureId, breakEndsAt, available }` instead of `nextGameChoice`; removed the choice endpoint and all runtime reads/writes of `tournament_next_game_choice`.
- Playoff replays now use the same configured inter-game break and manual readiness while remaining `is_result_bearing = false`.
- Added the pure delayed-round rule: a configured next-round start already in the past moves to 30 minutes after the final prior series settles.

## Verification

- PASS: `pnpm --filter @hockey/server exec tsc --noEmit`
- PASS: `pnpm --filter @hockey/server exec vitest run test/tournament/playoffs.test.ts` (10 tests)
- PASS: `pnpm --filter @hockey/server exec vitest run test/tournament/fixtureAttempts.integration.test.ts` (31 tests)
- PASS: `pnpm --filter @hockey/game-core build`
- PASS: `git diff --check`
- PASS: no `it.skip`, `next-game-choice`, `nextGameChoice`, or runtime `tournament_next_game_choice` references remain in the Task 2 source/tests.

## Commit

- `db974840c1b3c0d1fc356aa9ff8c7045037bfbb6` — `fix(tournaments): materialize playoff games sequentially`

## Scope

- No dev or production deployment was performed.

## Review fixes

- `d3025af1903b553d0a176cc9806dcc32d6bfb12d` assigns each new result-bearing series game to its configured game day, advances to the next day at capacity, and refuses to create an unassigned game when no day remains.
- The same commit delays a past next-round start to the final prior-series settlement plus 30 minutes, shifts unstarted game-day/fixture/attempt timestamps, and updates `local_date` in the tournament timezone.
- The web tournament attempt contract now consumes `nextGame { fixtureId, breakEndsAt, available }`; it no longer calls the removed next-game-choice endpoint.
- PASS: server fixture-attempt integration 34/34; playoff unit 10/10; web attempt/catalog tests 47/47; server and web TypeScript; diff check.
