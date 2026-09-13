# Consolidated final fix wave

## Status and scope

All six Important findings in `final-review-findings.md` are addressed and locally verified. No unresolved Important finding remains from that list. This is local implementation evidence, not release or rendered-environment acceptance. Ten previously confirmed baseline server failures remain outside this wave.

- Worktree: `/Users/egorgumenyuk/Projects/Ultimate Hockey/.worktrees/economy-rewards`.
- Branch: `co_dex/economy-rewards`.
- Starting commit: `9229cfc390817810b896930d5bd9c1bf6ab33ae3`.
- Code/test/migration commit: `677e263d9304cbea57bcebf6c62be03f75bb9bcd`, `fix(economy): close reward and season settlement review gaps`.
- Code diff: 24 files, 1156 insertions / 205 deletions. This report is a separate documentation commit.
- One consolidated fix wave; no subagents, GLM, push, merge, workflow dispatch, SSH, remote DB query, dev deployment or production action.

The receiving-code-review, test-driven-development and verification-before-completion skills guided the work. Regression assertions were introduced and observed failing before their corresponding production fixes. Test-fixture mistakes were corrected separately and are not counted as evidence of a product defect.

## Finding 1 — one player-visible star balance

Root cause: weekly and tournament reward producers wrote `users.stars`, while `/me.starBalance`, inventory, achievements and duel settlement use `users.xp`.

Changes:

- `weeklyChallenge/rewards.ts` credits `xp` and returns `xp as stars` to retain the existing response contract.
- `tournament/rewards.ts` credits `xp`; reward-event amounts, experience and coin behavior are unchanged.
- No historical balances, claimed reward rows or ledger rows are backfilled or rewritten.

RED: the weekly user-visible balance and tournament `/me.starBalance` assertions failed on the previous producers. The tournament fixture was first corrected to rebuild actual standings; its earlier missing-standings failure was a fixture error, not the relevant RED. The confirmed RED then showed missing visible stars. The full-server run later exposed one additional stale assertion in `synthetic-seasons.integration.test.ts`, which read `users.stars` and received four zeros instead of the expected 6/7/12/8.

GREEN: weekly 16/16 and tournament service 108/108 in the full-server run. Weekly asserts a visible balance of 2, repeat claim 409 and unchanged balances/one ledger claim. Tournament asserts `/me.starBalance` 25 before and after a repeat grant. Synthetic full-season assertions now read `users.xp as stars`, retain the exact original expected reward amounts, and pass 5/5 in the final rerun.

## Finding 2 — deterministic month closure

Root cause: a monthly snapshot could be frozen before an outstanding ordinary duel wrote its final rating rows, with no shared lock between those operations.

Boundary policy (Moscow time):

1. Before freezing a month, reconcile every ranked, non-tournament open match belonging to it.
2. A match due before the next Moscow midnight, or whose two participants completed before that boundary, settles into the old month before the snapshot.
3. A match still continuing across the boundary moves forward. A later request uses the actual terminal participant completion time, capped by the match deadline, rather than assigning an already-completed match to the request month.
4. Monthly reconciliation processes the oldest pending season, rediscovers pending seasons after each transaction, and therefore handles carry-forward through multiple past months in one call.
5. A closed season is immutable: settlement checks for its close record before inserting rating rows.

`ratingLock.ts` supplies one transaction-scoped rating lifecycle advisory gate. Ordinary creation/reconciliation/settlement and monthly closure acquire it before ordinary match rows or user/account writes. Monthly closure locks the complete UUID-ordered union of existing rating users and outstanding-match recipients, reconciles the due matches, and only then snapshots and pays in the same transaction.

RED: expired prior-month match/closure, boundary-spanning match and concurrent settlement tests exposed missing eligibility and closed-season mutations. A further late-reconciliation regression observed July completion incorrectly recorded as September (`hockey-finalfix-late-month-red.log`); the completion-time policy corrected it.

GREEN: 130/130 amateur duel tests and 16/16 monthly reward tests in the full-server run. Explicit regressions prove 29 prior results plus one due duel become 30 before ranking; actual PostgreSQL barriers serialize concurrent settle/close; accepted or just-completed boundary-spanning matches do not change the frozen August season; a June-origin match completed in July and requested in September records July.

Tradeoff: the lifecycle gate intentionally serializes ordinary-duel transactions across months, rather than risking a transfer/closure deadlock. This is correctness-first and should be measured under real load before introducing narrower gates. The monthly service calls an exported reconciliation function in `routes.ts`, forming an ESM import cycle; neither module executes the imported function at module initialization, and the complete server runtime suites exercise initialization and the callback successfully. Extracting the duel lifecycle into a standalone service is not required for this fix and was not expanded into this wave.

## Finding 3 — consistent recipient lock ordering

Root cause: `/shot` could write the current player before taking both ordered user locks, tournament rewards traversed placement order, and batch match reads could extend their recipient set in recent-match order.

Changes:

- `lockMatchRewardRecipients` reads immutable match identities, acquires the ordinary lifecycle gate when needed, then tournament gates in UUID order, match rows in UUID order, and the complete user set in UUID order before shot/account writes.
- Tournament-backed final matches include every tournament participant because a final can reward players outside the current duel.
- Match-list and event-list routes prelock their entire batch before processing individual matches.
- Ordinary match creation takes the lifecycle and ordered user locks before the INSERT's foreign-key locks.
- Direct tournament stage payout prelocks all actual reward recipients UUID-ascending before its placement-ordered grant loop.

RED/GREEN proof uses real PostgreSQL lock barriers (`waitForBlockedWriter`) and `FOR UPDATE NOWAIT`, not timing sleeps. The shot test blocks the lower UUID and proves the higher UUID remains free before release. The tournament test makes placement order oppose UUID order and proves no account write lock is held while waiting for the lower user. The batch test deliberately chooses low/high UUID opponents and proves recent-match iteration has not locked the high user first. Each failed on the earlier lock paths and passes in the final full-server run (duel 130/130, tournament 108/108). Existing weekly user-before-account lock regression also passes.

## Finding 4 — no save/publication of a stale automatic preset

Root cause: after initial create, autosave and final publication ignored whether the automatic economy recommendation was loading or had failed.

`TournamentAdmin.tsx` now derives `economyReady` from explicit custom state or a pristine preset applied for the current participant limit. Loading/error blocks autosave, pending debounce continuation, retry-save and final publication. A deliberate manual economic edit changes the state to custom and permits saving again. Existing playoff-schedule-only mode remains unaffected.

RED: four loading/error scenarios cover explicit reapplication after create and participant-limit changes; confirmed failures showed the final action enabled or stale values sent. Initial wizard navigation mistakes were corrected before counting the relevant RED.

GREEN: all 64 tournament admin tests pass. New assertions show no update/publish during delayed or failed recommendation, disabled final action, custom 777 enabling save again, and a successful retry saving the new 32-player preset (entry fee 12500). Existing manual-edit, stale-response, initial-create and published-tournament tests remain passing.

## Finding 5 — storage-compatible rewards and safe headroom

Root cause: JSON/API validation allowed `Number.MAX_SAFE_INTEGER`, while coin/star/token balances and ledger amounts are PostgreSQL `integer`. Legacy reward fields and stakes could add to the configured matrix, exceeding storage even when each part looked valid.

Changes:

- One exported TypeScript limit, `REWARD_AMOUNT_LIMIT = 2147483647`, is used by server schemas and exposed by `GET /admin/duel-templates` to the web editor.
- Matrix values and legacy reward/fee amounts are bounded. Stake is capped so doubling it remains representable. Editor validation includes the editable legacy rewards; the server/database also enforce all aggregate matrix/legacy/stake combinations and fee plus stake.
- New forward-only migration `121_duel_reward_storage_limits.sql` replaces the amount validator and adds aggregate storage checks to templates and matches. Existing 119/120 migration files are untouched. `NOT VALID` constraints enforce new writes without scanning/rewriting historical rows.
- The editor rejects 2147483648 and exposes the current bound through its inputs. An unavailable limit fails closed rather than allowing unchecked amounts.
- Settlement checks both recipients' current coin/XP/token headroom before any reward credit. If a complete promised reward cannot fit, it returns 409 `reward_balance_capacity` with a Russian spend-and-retry message; the transaction rolls back, no amount is clamped, and a later retry can pay the unchanged complete reward.
- Currency update guards use bigint intermediate arithmetic to avoid overflowing while checking bounds.
- Aggregate constraint failures on admin create/update become meaningful 400 responses, not database 500s.

RED: Zod/DB/API boundary regressions accepted 2147483648 under the old rule; the admin save remained enabled. New migration 121 also caused four expected-ledger fixture failures, minimally corrected by adding its name (no assertions removed). Existing rollback coverage was adapted from a database 500 expectation to the now-explicit 409 policy.

GREEN evidence:

- API accepts 2147483646/2147483647, rejects 2147483648; Zod boundary checks cover all three currencies; PostgreSQL rejects an additive legacy-plus-max write.
- Complete real settlement reaches exactly 2147483647 coins, XP and tokens with additive legacy rewards, and a repeat adds no duplicate ledger entries.
- Thirteen matrix scenarios pass, including explicit Russian 409, unchanged balances/active match/no partial ledger while headroom is insufficient, followed by concurrent successful retries after capacity is freed.
- Admin 10/10 passes; nonzero 777 is saved, returned from the mocked endpoint, and verified after closing/reopening the editor. This also addresses the deferred nonzero save/reopen minor.
- New migration121 regression runs from pre-121 schema with nonempty historical balances, claimed achievement/weekly rewards and an oversized immutable match snapshot. Only 121 applies; all those rows compare equal before/after. Constraints are installed as not validated, a new unsafe write is rejected with 23514, the runner's second pass applies nothing, and an explicit safe template edit to 777 succeeds.

Historical oversized templates/snapshots are preserved, not repaired or silently clamped. A later update of an unsafe historical row is rejected until its configuration is explicitly brought within bounds. There is no authorized historical remediation/backfill in this wave. The current-balance retry policy here is for configurable duel settlement, not a new global policy for every legacy reward producer.

## Finding 6 — exact approved monthly modal text

`MonthlyRatingRewardModal` uses exactly `Вы победитель зачета дуэлей за <месяц>` and `Вы заняли N-е место в зачете дуэлей за <месяц>`. Month comes directly from the season key and is lowercase Russian. The redundant separate month/year line is removed; queue, acknowledgement, reward filtering and standard modal behavior are unchanged.

RED: prior title assertions for places 1/2/17 and the separate month-line expectation did not match approved copy. GREEN: component 8/8 and Sections 33/33, including exact titles for places 1/2/17 and no duplicate `Август 2026`. BottomNav 30/30 also passes; full non-DailyScreen web run is green.

## Verification commands and observed results

All commands ran in the worktree above. Integration commands used only:

```text
TEST_DATABASE_URL=postgresql://egorgumenyuk@127.0.0.1:5432/hockey_economy_finalfix_20260910
TEST_REDIS_URL=redis://127.0.0.1:6398/0
```

| Command | Observed result |
| --- | --- |
| `pnpm --filter @hockey/game-core build` | PASS; required dependency built before server tests; no game-core source change |
| `pnpm typecheck` | PASS; all three packages, including final migration test and UI readback assertions |
| `pnpm lint` | PASS; full repository source ESLint command |
| `pnpm exec prettier --check <all 23 changed/new TS/TSX paths>` | PASS; SQL intentionally not sent to an unsupported formatter |
| `git diff --check` and `git diff --cached --check` | PASS before code commit |
| `pnpm --filter @hockey/server test` with isolated env | **1345 passed / 11 failed / 1356**, 119 passed / 9 failed / 128 files, 362.38 s; see classification below |
| `pnpm --filter @hockey/server exec vitest run test/tournament/synthetic-seasons.integration.test.ts test/db/migration121.test.ts test/db/migrations.test.ts test/db/migration069.test.ts test/db/migration071.test.ts` with isolated env | **15/15**, 5/5 files, 11.12 s; covers the one new full-suite fixture failure and new history-preservation check |
| `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t 'settles matrix'` with isolated env | **13 passed / 117 skipped**, 5.44 s; final explicit 409 contract and retry assertions |
| `pnpm --filter @hockey/web exec vitest run --exclude src/screens/DailyScreen.test.tsx` | **1215/1215**, 125/125 files, 18.56 s |
| `pnpm --filter @hockey/web exec vitest run src/admin/AdminScreen.test.tsx` after save/reopen addition | **10/10**, 3.13 s |
| Earlier focused server rerun: amateur/monthly/rules/migration ledger files | **159/159**, 6 files; predates the additional late-month regression, which subsequently passes in the full run |
| Earlier focused web rerun: modal/BottomNav/Sections/Admin/TournamentAdmin | **145/145**, 5 files |

The full-server run contains all final production changes but predates the synthetic test read-column correction and added migration121 test. No production code changed after that run. The final affected-file reruns passed. This is **not** claimed as a green full-server suite or a post-correction complete rerun; combining unique observed coverage gives 1347 passing and 10 known baseline failures over the now-1357-test server inventory.

DailyScreen was not re-executed in this wave. Task 9 already verified its 152 individually selected tests plus 12 parameterized cases; neither DailyScreen nor game-core changed here. The existing runner omission remains a tooling concern, and earlier evidence is not relabeled as a fresh run.

RED/iteration/full logs are retained in `/private/tmp/hockey-finalfix-*.log`, notably `hockey-finalfix-month-lock-red.log`, `hockey-finalfix-tournament-lock-red.log`, `hockey-finalfix-list-lock-red.log`, `hockey-finalfix-late-month-red.log`, `hockey-finalfix-storage-red.log`, `hockey-finalfix-limits-red.log`, `hockey-finalfix-admin-red.log`, `hockey-finalfix-wizard-publish-red.log`, `hockey-finalfix-full-server.log`, and `hockey-finalfix-full-web.log`. The final 15-test, 13-test, typecheck, lint, format and Admin readback results are also retained in this task's tool transcript.

## Remaining baseline failures and limitations

The ten remaining identities exactly match the failures independently reproduced at `2166de1` in Task 9's baseline run (see `task-9-report.md`). They were not fixed or disabled here:

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

The baseline was not re-extracted/re-executed again in this wave; classification uses Task 9's fresh baseline evidence plus the identical failure identities in this wave's full run. Expected negative-scenario logger noise and the pre-existing runner issue remain deferred.

Local engine readback: PostgreSQL **15.15 (Homebrew)** and Redis **8.4.0** on the dedicated port. This is not PostgreSQL 16 / Redis 7 equivalence or deployed-environment evidence. No browser-rendered dev modal, remote migration ledger, health endpoint or runtime SHA was checked.

## Final self-review and cleanup

Reviewed the complete fix diff from `9229cfc` through code commit `677e263`, including all untracked new files before staging, tests, migration and integration call sites. Confirmed:

- All six changes stay within the final review findings; the only extra regression closes the explicitly deferred nonzero admin save/reopen minor.
- Game-core, package/lockfiles, authentication/credentials, environment files and deployment workflows have no wave diff. No deterministic behavior/version bump is needed.
- Only new SQL migration 121 is added. Historical 117–120 and all older migration files remain unchanged.
- Reward amounts/snapshots are not silently truncated, old balances are not backfilled, and no one-time payout gains a second ledger path.
- Month closure, shot/final payout, direct tournament payout and batch match iteration acquire complete recipient sets before economy writes. Normal ESM initialization and old tournament lifecycle suites pass.
- No unrelated root-checkout files or changes are included. Whole-file formatting normalized several nearby pre-existing TS/TSX layouts without semantic changes.

After all tests, the exact disposable database name was verified in `pg_database`, then only `hockey_economy_finalfix_20260910` was dropped. The identified dedicated Redis process on `127.0.0.1:6398` was shut down using `NOSAVE`. Both commands succeeded. Only synthetic disposable data was removed and it is not recoverable; test logs remain. Shared local databases/Redis and dev/prod were never used or altered.

Release disposition remains with the controller: reconcile known baseline failures and perform separately authorized remote/deployed/rendered checks. This wave itself does not authorize or perform release actions.
