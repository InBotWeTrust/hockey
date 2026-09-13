# Residual economy review fixes

## Status and scope

All five Important findings confirmed in `residual-validation-report.md` are implemented and locally verified. No known unresolved Important finding remains from that five-item list. Independent controller re-review and release acceptance remain separate; this report does not claim a green complete server suite or deployed/rendered acceptance.

- Worktree: `/Users/egorgumenyuk/Projects/Ultimate Hockey/.worktrees/economy-rewards`.
- Branch: `co_dex/economy-rewards`.
- Starting commit: `510e84e3e2fc5e992e63e1b26a9b9895a590a82a`.
- Code/test commit: `5434258261323ef18659b2cb26cf7e0bb60f8409` — `fix(economy): resolve residual lifecycle and history review gaps`.
- Code/test diff: 13 files, 997 insertions / 71 deletions; this report forms a separate documentation commit. The existing ignored local progress ledger was also updated without adding the entire ledger to version control.
- No GLM, child agents/reviewers, push, merge, workflow dispatch, SSH, remote database query, dev deployment, production action, migration change, or historical remediation.

The test-driven-development and verification-before-completion skills guided the work. Relevant regressions were observed RED before the corresponding fix and GREEN afterwards. Fixture/setup mistakes are identified below and are not counted as product-defect reproductions.

## 1. Materialize expired timers before selecting the rating month

Root cause: month attribution examined persisted terminal participant state before the lazy timer transitions that establish the effective completion timestamp. A later request could also choose the match deadline instead of an earlier elapsed period timeout.

Changes in `duel/amateur/routes.ts`:

- Extracted `reconcileParticipantTimers`, called before month choice both by ordinary reconciliation and by monthly closure.
- An elapsed period timeout at/before the match deadline takes precedence over a later window end or request time.
- Refresh the participant after closing a period, then materialize an already-elapsed break and continuation grace in the same call. Store the effective continuation deadline in `completed_at` for a forfeit.
- Keep state transition materialization separate from result/rating insertion, preserving the existing lifecycle gate and closed-season protection.

Boundary policy remains Moscow-calendar, exclusive at the next month's midnight: effective completion before the boundary belongs to the old month; completion exactly at the boundary belongs to the next month. A match which remains unfinished across the boundary carries forward. Old frozen snapshots are not backfilled.

RED: six final-period cases failed, including both/one timeout-expired final participant and close-first/settle-first ordering. Before-boundary fixtures missed the 30th result; exact-boundary cases used the later `window_end` timestamp. Two added nonfinal timeout → break → continuation-forfeit cases also missed prior-month eligibility before their fix.

GREEN: all eight timer regressions pass. They assert effective period/participant timestamps, old-month eligibility, rating season, and retry stability. The complete amateur suite passes **141/141**, including existing June-origin/July-completion/September-request and carry-forward controls.

## 2. Lock every tournament participant before payout-side writes

Root cause: the old prelock set contained only paid placements, while subsequent podium/achievement foreign keys could acquire user locks for unpaid participants after a higher UUID had already been locked.

Changes:

- New `lockTournamentParticipants` locks the complete participant user set UUID-ascending under the tournament gate.
- Standalone `grantTournamentStageRewardsWithClient` obtains the gate and full user set before its tournament row or payout writes.
- `startTournamentPlayoffs` obtains the same full set immediately after its existing gate, before regular-finalization writes.
- Removed the paid-placements-only lock set. Existing duel settlement callers already prelock the tournament's full participants before their economy writes; the audited standalone entry points are now covered too.

The transactional order is tournament gate → complete ordered users → subsequent row/account/payout/congratulation/achievement writes. No unrelated users are added to the set. The wider participant lock footprint is intentional and remains a throughput consideration, not a reason to restore the incomplete set.

RED: two actual PostgreSQL barrier tests detected an account-write lock held too early: regular-to-playoff finalization with only a high-UUID winner paid and an unpaid low-UUID podium user; direct playoff payout with an unpaid low-UUID semifinalist.

GREEN: while the writer waits for the low UUID, the blocker can acquire the high UUID using `FOR UPDATE NOWAIT`, and no account write lock is held. After release, payout remains once-only and podium/achievement outcomes are present. The focused barrier/payout selection passes **4/4** and the earlier complete tournament suite passes **110/110**. In the full-server run, two unrelated setup hooks timed out; both pass unchanged in the isolated rerun described below.

## 3. Revoke queued autosaves and revalidate asynchronous finish

Root cause: readiness guarded enqueue/render only. A pending snapshot and an awaiting `finishWizard` could outlive the render that authorized them.

Changes:

- Queue `pause()` discards unsent pending snapshots and rejects existing `flush()` waiters; it never reports a paused flush as successful. An already-sent request can complete and advances the revision normally.
- `resume(snapshot, key)` rebases pending work onto the newest valid visible draft. A live `canDispatch` callback guards the actual dispatch boundary.
- `TournamentAdmin` pauses synchronously on recommendation requests/participant-limit changes and on failed readiness. Recovery resumes the latest serialized draft, preserving unrelated edits.
- Production `flushSnapshot` verifies live readiness/generation before and after its awaited flush. `finishWizard` additionally verifies the current serialized draft, preset generation and queue generation before publication, including after awaited initial create.
- Finishing disables the body fieldset, navigation, back, close and recommendation controls. Fieldset border/margin/padding/min-width are reset to retain the existing layout.

RED: with A in flight and B already pending, both loading and error component scenarios sent two updates instead of one. The new queue pause and generation-aware flush methods initially failed because the APIs did not exist. One early wizard-navigation selector error was fixture setup, not defect evidence.

GREEN: A may finish, but B is not dispatched during loading/error; the recovered latest body uses the next revision and retains the unrelated `minLevel` edit. A paused flush rejects. Generation changes during flush prevent finish authorization both while readiness remains false and when it becomes true again with a newer draft. Component tests assert finishing controls are disabled. An artificial nested-event component finish experiment was removed because it attempted to interact with intentionally disabled controls; asynchronous generation protection is tested through the actual production queue method, not claimed as a rendered-browser race reproduction. The full web run passes **1220/1220**, including TournamentAdmin **66/66** and queue **8/8**.

## 4. Preserve historical oversized reward reads without weakening new writes

Root cause: new configuration limits and stored historical deserialization shared one schema. Migration 121 preserved old JSON, but strict reads rejected it; lazy legacy venue materialization could also trigger an UPDATE rejected by its `NOT VALID` constraints.

Changes:

- New configuration retains `REWARD_AMOUNT_LIMIT = 2147483647`. Stored reward reads accept the formerly supported nonnegative safe-integer range through `Number.MAX_SAFE_INTEGER`, preserving exact amounts.
- `duelRewardStorageCompatible` checks strict matrix amounts and aggregate matrix/legacy/stake/fee compatibility. `makeRulesSnapshot` explicitly applies it to every new snapshot, so widening the stored parser does not widen new writes.
- Existing unsafe active matches stay inspectable through read reconciliation. Settlement returns intentional HTTP **409 `reward_configuration_capacity`** with a Russian support message before writes; it does not silently clamp amounts or edit snapshots.
- An unsafe historical ranked contributor also deliberately prevents monthly closure with this 409 until separately authorized remediation. This is an explicit unresolved operational data condition, not an unreadable history or silently amended month.
- Unsafe legacy rows receive a neutral venue DTO in memory without the unrelated UPDATE that migration 121 would reject.

RED: after constructing valid pre-121 data, all three historical API scenarios returned catalog 400 instead of 200; a stored-value unit test rejected 2147483648. Earlier fixture corrections for role, active-template uniqueness and dates were setup work, not the product RED.

GREEN: the new real Fastify/PostgreSQL suite builds pre-121 schema, creates a valid match via the route, retains an oversized inactive template and complete participant/snapshot data, and applies unchanged migration 121. Three variants pass: settled/materialized venue, settled/legacy venue and active. Catalog, list/history/detail return exact old amounts; the active settlement's repeated 409 leaves match/participants/balances/ledger untouched. New unsafe POST/PATCH return 400; an explicit safe template correction to 777 succeeds without changing immutable matches or financial history. Historical API **3/3**, reward-rule unit **6/6**, and migration121 preservation **1/1** pass in the full-server run.

No migration was added or edited. Migrations 117–121, old balance/ledger rows and immutable snapshots remain unchanged by production code. Monthly-closure refusal on an unsafe historical contributor is code-path policy, not claimed as a separately added historical-monthly API fixture.

## 5. Settle old unranked duels independently of closed rating seasons

Root cause: the ordinary-source rating policy was mistaken for actual ranked eligibility; the closed-season guard rolled back an old unranked match which monthly reconciliation intentionally excludes.

The complete rating-write block and month movement now require both the existing source policy and `match.ranked`. Result, configured rewards, inventory release and ordinary achievement behavior retain their existing paths. An audit of server consumers found no dependency on unranked `amateur_duel_rating_match` rows, so the fix does not preserve unnecessary unranked rating writes.

RED: both `challenge` and `matchmaking` old unranked fixtures returned 409 instead of 200 after August was closed.

GREEN: both sources settle and retry successfully, pay exactly 5 coins / 3 stars / 1 token once, return unused inventory reserves, write zero rating rows, and leave the frozen monthly snapshot/live rating unchanged. A ranked historical survivor control still receives 409 and cannot mutate the frozen season. All pass in the complete **141/141** amateur run. An initial green-attempt fixture lacked required inventory metadata; it was corrected before the complete passing run and is not itself counted as GREEN evidence.

## Verification commands and actual results

All integration commands used only disposable local infrastructure:

```text
TEST_DATABASE_URL=postgresql://egorgumenyuk@127.0.0.1:5432/hockey_economy_residual_20260910
TEST_REDIS_URL=redis://127.0.0.1:6398/0
```

| Command / scope | Observed result |
| --- | --- |
| `pnpm --filter @hockey/game-core build` before server tests | PASS; no game-core source change |
| `pnpm typecheck` | Fresh final PASS for all three packages |
| `pnpm lint` | Fresh final PASS |
| `pnpm exec prettier --check <all 13 changed/new TS/TSX paths>` | Fresh final PASS |
| `git diff --check`, `git diff --cached --check`, final commit-range diff check | PASS |
| `pnpm --filter @hockey/game-core test` | Fresh final **77/77**, 14/14 files, 684 ms |
| `pnpm --filter @hockey/web exec vitest run --exclude src/screens/DailyScreen.test.tsx` | **1220/1220**, 125/125 files, 37.21 s |
| `pnpm --filter @hockey/server test` with the disposable env | **1362 passed / 12 failed / 1374**, 121 passed / 9 failed / 130 files, 546.92 s |
| Exact two tournament setup-timeout tests, unchanged default timeout, command below | **2 passed / 108 skipped**, 2.77 s |
| Earlier focused server: amateur, monthly, historical, rules, migration121, tournament | **274/274**, 6/6 files, 223.36 s; predates two nonfinal timer tests and ranked control, all subsequently pass in full amateur141 |
| Final timer/nonfinal/unranked selection | **10 passed / 130 skipped**, 7.05 s; predates ranked control, later full-suite PASS |
| Earlier focused web: TournamentAdmin and queue | **72/72**, before two added async-generation tests; full web includes the final 74 tests |

Exact transient-hook rerun, with the same disposable env:

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t 'publishes a new immutable rules revision when a registering tournament is edited|does not let a forged automatic lifecycle marker enable a legacy tournament revision'
```

The full-server run includes all final source and test changes. The two extra failures were `Hook timed out in 10000ms` setup failures, not failed assertions; the unchanged focused rerun passed both. No timeouts were raised and no tests were disabled. The other ten failure identities exactly match the documented baseline. A complete server rerun was not performed after the isolated hook rerun; **the full-server command remains recorded as failing**, not relabeled green.

Known baseline identities, not fixed or disabled in this wave:

1. `test/admin/communications.integration.test.ts`: official-dialog response wrapper.
2. `test/achievements/engine-duel.test.ts`: old hidden-achievement expectations.
3. `test/db/migration076.test.ts`: old speed-game balance.
4. `test/db/migration077.test.ts`: old World Tour movement.
5. `test/db/migration085.test.ts`: old uniform balance.
6. `test/db/migration106.test.ts`: speed-period total.
7. `test/db/migration106.test.ts`: ledger no-op expectation.
8. `test/onboarding/routes.test.ts`: tutorial shot shape.
9. `test/onboarding/routes.test.ts`: tutorial completion 409 versus 200.
10. `test/tournament/migration-contract.test.ts`: old daily-aggregate DB rejection.

Classification uses the baseline evidence documented by Task 9 and `final-fix-report.md`, plus identical identities in this fresh full run; the old baseline checkout was not re-extracted again. Expected negative-path logs and a swallowed lastSeen missing-table warning during synthetic schema resets are not new assertion failures.

The old `/private/tmp/hockey-residual-typecheck.log` retains an intermediate corrected test typing failure. The final successful typecheck/lint/format command is in the tool transcript; the old file is not proof of the final result. Other retained logs: `/private/tmp/hockey-residual-{month-red,month-green,chain-red,chain-green,tournament-red,tournament-green,wizard-red,wizard-green,finish-red,finish-green,history-red,history-green,unranked-red,unranked-green,focused-server,focused-web,full-server,full-web,hook-rerun}.log`. Some iteration logs contain fixture mistakes explained above.

## Limits, self-review and cleanup

- Reviewed all 13 source/test files, including the initially untracked historical API test, and the complete `510e84e..5434258` diff. Two pre-existing layouts in `tournament/service.ts` were normalized by Prettier without semantic changes.
- No game-core, auth/credentials/environment, dependency/lockfile, deployment workflow or migration diff. No old snapshots, balances or ledgers are repaired/backfilled.
- Actual local engines were PostgreSQL **15.15 (Homebrew)** and Redis **8.4.0**, not claimed as PostgreSQL 16 / Redis 7 equivalence.
- DailyScreen was not rerun here because of its documented pre-existing runner issue; its earlier manually selected evidence is not relabeled fresh. No DailyScreen source changed.
- This is local API/PostgreSQL and component-test evidence, not browser-rendered dev/prod QA, remote migration readiness, runtime SHA acceptance or performance/load certification. Historical oversized active payouts need separately authorized remediation, and release authority remains with the controller/user.
- After all integration tests, the exact database name was verified in `pg_database` and only `hockey_economy_residual_20260910` was dropped. A readback returned count 0. Redis INFO and process inspection identified PID **14916**, bound only to `127.0.0.1:6398`; that dedicated process was stopped using `SHUTDOWN NOSAVE`. Both cleanup commands succeeded. Only disposable synthetic data was removed; it is not recoverable, and logs remain. No shared local DB/Redis or dev/prod data was touched.

Release remains on hold pending controller re-review, baseline disposition and separately authorized deployed/rendered verification. Nothing was pushed or deployed.
