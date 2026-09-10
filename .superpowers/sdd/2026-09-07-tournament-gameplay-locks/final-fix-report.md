# Final fix wave: tournament gameplay locks

Status: DONE, local verification passed.

Date: 2026-09-07. Worktree: `.worktrees/playoff-series-modal-layout`.
Baseline: `ef190debdbab401566258c3ddc0bdc304f5a922c`.
This report is included in the single final-fix commit; its commit hash is reported in the handoff.

## Scope and outcomes

All three Important findings and the fixed-hour configuration recommendation are addressed.

| Scenario                                                                               | Expected                                                                                              | Actual                                                                                                                                | Status |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| First Classic request arrives before T−60, acquires the gameplay advisory lock at T−60 | Reject, insert no Classic shot                                                                        | Controlled PostgreSQL lock waiter rejects with 409; zero Classic shots                                                                | PASS   |
| Classic shot is accepted after waiting                                                 | Context, reconciliation, eligibility, shot/event timestamps and returned state use the post-lock time | Returned `server_now`, persisted shot and mismatch-event `created_at` are exactly `2030-09-01T10:00:02.000Z`                          | PASS   |
| Daily/training shot waits for the gameplay lock                                        | Persist post-lock acceptance time; opposite mode remains locked for a full hour                       | Both real route tests assert exact persisted `created_at` and exact opposite-mode `gameplay_lock.ends_at = acceptedAt + 3,600,000 ms` | PASS   |
| Classic wins against an already open daily period                                      | Daily shot rejects; refreshed active-period UI blocks retries and explains the lock                   | Server race, state refetch, store recovery and rendered DailyScreen regression pass                                                   | PASS   |
| Accepted daily period enters scheduled prelock                                         | Continue its existing segment                                                                         | Server continuation test and enabled rendered shot button pass                                                                        | PASS   |
| Scheduled block has started, or scheduled prelock overlaps active Classic              | Block daily shots; expose the hard reason                                                             | Server guards and rendered disabled state pass; Classic wins reason selection                                                         | PASS   |
| Legacy admin cooldown is 0, 30, 90 or 1440 minutes                                     | Runtime remains one hour                                                                              | Settings reads/writes normalize to 60; admin field is readonly; push waits the full hour despite raw legacy value 30                  | PASS   |

## Implementation

### Post-lock authoritative time

`submitClassicGameShot` reads a fresh JavaScript `Date` immediately after `lockUserGameplay`. It uses that one timestamp for `requireContext`, reconciliation, first-shot eligibility, elapsed-time validation, inventory consumption, period closure/reconciliation and returned state. The shot INSERT now explicitly stores it in `created_at`, and the mismatch event receives the same timestamp. The existing input shape remains compatible; its request-arrival `now` no longer decides shot acceptance.

Daily and training already read their authoritative `Date` after the advisory lock. Their INSERTs now explicitly persist that value rather than PostgreSQL transaction-start `now()`.

The concurrency tests use real transactions and `pg_locks` to establish that a request is waiting. Only JavaScript Date is controlled, so PostgreSQL/network operations and lock waits remain real. Classic integration tests now control Date consistently because the production service no longer trusts a caller-supplied clock.

### Active daily period behavior

Single-user and batched tournament lock derivation now prioritize active Classic over scheduled prelock. This exposes the strongest applicable reason using the existing DTO fields, with no DTO shape change.

The daily shot guard permits an accepted segment through scheduled prelock but rejects active Classic and a scheduled block whose start has arrived. DailyPlayView applies the same distinction using authoritative `server_now` and `tournament_starts_at`. A hard lock suppresses gameplay, disables the primary action and shows its explanation. Scheduled prelock alone leaves the accepted period playable.

The existing request-reconciliation path already refreshes daily state immediately after a definitive 409. It is retained and covered by a new store test and a rendered regression: refreshed `period_active + active_classic` now disables retries. Existing periodic lock refresh continues to handle completion and scheduled-state changes. A stale client remains subject to the server guard.

### Fixed one-hour configuration

`getGameSettings().training.dailyCooldownMinutes` now comes directly from the shared 60-minute invariant. The legacy definition has min=max=default=60, so writes and reads normalize old values. Admin copy describes the last accepted shot and the rolling reset; fixed numeric settings are readonly and cannot be saved through the editor.

The scheduled-push query already uses the latest training shot. Its legacy test expected an unlock after 30 minutes, so the test now verifies no unlock at 30 minutes and an unlock at exactly 60 while leaving the stored legacy value at 30. No push production code changed.

## TDD: actual RED commands and output

Required build before server tests:

```text
pnpm --filter @hockey/game-core build
> tsc --build
exit 0
```

Server regressions were written before the production edits:

```text
pnpm --filter @hockey/server exec vitest run test/duel/daily.test.ts test/duel/training.test.ts test/tournament/classicGame.integration.test.ts test/migration107.test.ts -t 'post-lock|advisory wait|wins the lock race|scheduled tournament block starts|rolling hour authoritative'

rejects the first Classic shot when its advisory wait crosses T-60
  → expected null to match object { statusCode: 409 }
timestamps an accepted Classic shot and its mismatch event after the advisory wait
  → expected '2030-09-01T10:00:00.000Z' to be '2030-09-01T10:00:02.000Z'
rejects a real daily handler shot when the first Classic shot wins the lock race
  expected reason: active_classic; received: scheduled_tournament
rejects an accepted daily period shot once the scheduled tournament block starts
  → expected 200 to be 409
persists post-lock daily acceptance time and a full rolling hour after a transaction wait
  → expected '2026-09-07T13:26:04.280Z' to be '2026-09-07T13:26:06.254Z'
persists post-lock training acceptance time and a full rolling hour after a transaction wait
  → expected '2026-09-07T13:26:05.702Z' to be '2026-09-07T13:26:07.670Z'
legacy admin values 0, 30, 90, 1440
  → expected each received value to be 60

Test Files  4 failed (4)
Tests       10 failed | 69 skipped (79)
exit 1
```

The additional simultaneous-lock projection regression also failed before its fix:

```text
pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts -t 'activates the Classic lock'
expected reason: active_classic; received: scheduled_tournament
Test Files  1 failed (1)
Tests       1 failed | 27 skipped (28)
exit 1
```

Rendered UI regressions, before the DailyPlayView fix:

```text
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/stores/gameSessionStores.test.ts -t 'active daily period lock|stale daily shot 409|stale shot conflict'
Unable to find role="button" and name "ЛЁД ГОТОВИТСЯ"
Rendered button remained enabled: БРОСОК
Test Files  1 failed | 1 passed (2)
Tests       4 failed | 2 passed | 172 skipped (178)
exit 1
```

The two already passing cases were scheduled-prelock continuation and store-level 409 refetch. Four rendered failures covered active Classic, Classic with a simultaneous scheduled timestamp, an active scheduled block and stale-409 recovery.

Admin readonly regression, before the editor fix:

```text
pnpm --filter @hockey/web exec vitest run src/admin/AdminScreen.test.tsx
Expected the element to have attribute: readonly
Received: null
Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
exit 1
```

Additional affected-consumer check after pinning runtime settings found the obsolete 30-minute expectation:

```text
pnpm --filter @hockey/server exec vitest run test/push/scheduled.test.ts -t 'sends daily unlock after'
expected "spy" to be called 1 times, but got 0 times
Test Files  1 failed (1)
Tests       1 failed | 14 skipped (15)
exit 1
```

The first sandboxed push-test attempt could not access local PostgreSQL (`EPERM`); the above is the actual behavioral failure from the approved local-service rerun. The expectation was then aligned with the explicitly requested hour. No remote services or notifications were used; push delivery is mocked in this test.

## GREEN and final verification

Targeted regression cycle:

```text
pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/duel/daily.test.ts test/duel/training.test.ts test/tournament/classicGame.integration.test.ts test/migration107.test.ts -t 'post-lock|advisory wait|wins the lock race|scheduled tournament block starts|rolling hour authoritative|activates the Classic lock'
Test Files  5 passed (5)
Tests       11 passed | 96 skipped (107)
Duration    8.32s
exit 0

DEBUG_PRINT_LIMIT=2000 pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/stores/gameSessionStores.test.ts -t 'active daily period lock|stale daily shot 409|stale shot conflict'
Test Files  2 passed (2)
Tests       6 passed | 172 skipped (178)
Duration    2.71s
exit 0
```

Full requested server suites, with real local PostgreSQL/Redis and no skipped tests:

```text
pnpm --filter @hockey/server exec vitest run test/duel/gameplayLocks.test.ts test/duel/daily.test.ts test/duel/training.test.ts test/tournament/classicGame.test.ts test/tournament/classicGame.integration.test.ts test/migration107.test.ts
✓ test/tournament/classicGame.integration.test.ts (23 tests)
✓ test/duel/daily.test.ts (26 tests)
✓ test/duel/training.test.ts (23 tests)
✓ test/duel/gameplayLocks.test.ts (28 tests)
✓ test/migration107.test.ts (7 tests)
✓ test/tournament/classicGame.test.ts (2 tests)
Test Files  6 passed (6)
Tests       109 passed (109)
Duration    40.11s
exit 0
```

Full affected client suites after formatting:

```text
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/stores/gameSessionStores.test.ts src/admin/AdminScreen.test.tsx
✓ src/stores/gameSessionStores.test.ts (26 tests)
✓ src/admin/AdminScreen.test.tsx (10 tests)
✓ src/screens/DailyScreen.test.tsx (152 tests)
Test Files  3 passed (3)
Tests       188 passed (188)
Duration    6.52s
exit 0
```

Full scheduled-push suite after adjusting the obsolete expectation:

```text
pnpm --filter @hockey/server exec vitest run test/push/scheduled.test.ts
✓ test/push/scheduled.test.ts (15 tests)
Test Files  1 passed (1)
Tests       15 passed (15)
Duration    12.47s
exit 0
```

Final coverage totals: 124 server tests and 188 web tests passed, 312 total; no skips in the full runs.

Additional checks:

- `pnpm typecheck` — all three workspace packages passed, including a fresh rerun after the admin editor change.
- `pnpm lint` — workspace source ESLint passed.
- `pnpm exec eslint` on all six changed server test files — passed.
- `pnpm exec prettier --check` on all changed source/test files — `All matched files use Prettier code style!`.
- `git diff --check` — passed.

## Review and limitations

- The shared gameplay-lock DTO shape is unchanged. Classic reason precedence prevents scheduled prelock from masking a simultaneous hard lock.
- The accepted daily period remains intact during prelock; active tournament play is enforced by both server and client. The client uses the server snapshot for the scheduled phase; existing refresh/reconciliation handles stale snapshots.
- Deterministic shot calculations, speeds, reward formulas, inventory rules and tournament settlement logic were not changed. Existing Classic inventory and settlement regressions passed.
- No new DB migration is necessary: existing `created_at` columns are populated explicitly, and the legacy cooldown setting is normalized at runtime.
- No GLM, subagents, push, deploy, external messaging or remote database changes were performed.
- The pre-existing untracked `output/` directory was preserved and excluded from the commit.
- These are local integration and rendered-component checks, not dev or production runtime acceptance. No remaining concern was found within the requested final-fix scope.
