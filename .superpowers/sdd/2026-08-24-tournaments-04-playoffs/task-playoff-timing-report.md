# Playoff timing task report

## Scope

Implemented deterministic calendar materialization for playoff and playoff-cut tie-break fixtures in `co_dex/tournaments`. No production, deployment, feature-flag, `main`, or push-scheduler files were changed.

## Changed files

- `packages/server/src/tournament/playoffs.ts`
  - Preserved the pre-existing uncommitted `buildPlayoffFixtureWindows` helper from this task.
- `packages/server/src/tournament/service.ts`
  - Added injected `now` to `startTournamentPlayoffs`.
  - Parses validated round timing rules, calculates the dependency-safe base time, persists round/fixture windows, and removes playoff `Date.now()` scheduling.
  - Materializes scheduled, sequential tie-break fixtures with the selected duel-template snapshot and regular-schedule fallbacks.
- `packages/server/test/tournament/playoffs.test.ts`
  - Preserved the pre-existing helper test.
- `packages/server/test/tournament/service.integration.test.ts`
  - Added integration coverage for playoff slots, tie-break slots, invalid timing values, and tie-break fallbacks.

## TDD evidence

The pre-existing helper test was explicitly preserved as required; its prior red-green run predates this continuation.

1. Deterministic playoff windows
   - Red: `vitest ... -t "materializes deterministic playoff windows"` reported the expected missing round timestamps (`startsAt`/`endsAt` were `null`).
   - Green: the same test passed after scheduling from injected time, dependencies, and parsed round rules.
2. Playable explicit tie-break windows
   - Red: `vitest ... -t "materializes sequential playable tie-break fixtures"` reported the expected missing tie-break round timestamps and template snapshot.
   - Green: the same test passed after sequential window and snapshot materialization.
3. Invalid rule values
   - Red: `vitest ... -t "falls back to safe playoff timing"` showed invalid `2031-02-31...` being normalized to March 2031 instead of ignored.
   - Green: the same test passed after strict ISO date-part validation and safe duration defaults.
4. Tie-break fallbacks
   - Red: `vitest ... -t "uses regular tournament template"` rejected because the regular duel template was not selected.
   - Green: the same test passed after restoring the regular template and regular schedule window/break fallbacks.

All integration commands used only local `hockey_test` and local Redis with the explicit `TEST_DATABASE_URL` and `TEST_REDIS_URL` environment variables.

## Final verification

| Command | Result |
| --- | --- |
| `TEST_DATABASE_URL=... TEST_REDIS_URL=... pnpm --filter @hockey/server exec vitest run test/tournament/playoffs.test.ts test/tournament/service.integration.test.ts` | PASS — 2 files, 15 tests |
| `pnpm --filter @hockey/server typecheck` | PASS |
| `pnpm --filter @hockey/server exec eslint src/tournament/playoffs.ts src/tournament/service.ts test/tournament/playoffs.test.ts test/tournament/service.integration.test.ts` | PASS |
| `pnpm exec prettier --write ...` | PASS; touched task files formatted |
| `git diff --check` | PASS |

## Self-review

- The existing transaction and tournament advisory lock still cover calendar materialization.
- Route callers remain two-argument callers; the injected `now` has a default.
- The first playoff slot is never earlier than the later of `now`, tournament start, or the latest regular/tie-break fixture end; configured first-game times can only move it later.
- Later championship rounds begin after the prior maximum series window plus that prior round's break. Third-place uses the corresponding championship round schedule.
- Tie-break fixtures have sequential non-overlapping windows and use explicit rules before regular-template/schedule defaults.
- `rg` found no `Date.now()` remaining in playoff scheduling code.

## Concerns

None found in scope. No schema migration is required because the affected timestamp and JSON snapshot columns already exist.
