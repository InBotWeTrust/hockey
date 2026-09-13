# Task 9 — Local cross-loop verification

## Status

LOCAL VERIFICATION COMPLETE WITH CONCERNS: Steps 1–4 performed. Release acceptance is BLOCKED by the confirmed monthly-modal copy defect below. Four new fixture failures are corrected; ten remaining server failures are freshly reproduced at the original baseline. Steps 5–6 were explicitly excluded by the controller and were not performed.

Worktree: `/Users/egorgumenyuk/Projects/Ultimate Hockey/.worktrees/economy-rewards`.
Branch: `co_dex/economy-rewards`.
Reviewed range: `2166de1..82787a813f0bd1a748574f01543152f91806ee8e`.
Task 9 fixture commit: `b16e905d2bfa409e0376cec4b0a4ffa426338ac8` (`test(economy): update migration ledger fixtures`). It adds only the four approved migration names to two existing expected ledger lists.
Second fixture commit: `f7f476f625a124f2d843797e2587a86184fd56be` (`test(economy): align historical migration fixtures`). It adds the same four names to the two historical migration fixture lists. Final production source is still identical to `82787a8`; the later commits are test/documentation only.

## Commands and fresh results

Commands run from the worktree above, unless an explicit archived-baseline path is shown.

| Command | Actual result |
|---|---|
| `pnpm --filter @hockey/game-core build` | PASS, exit 0; `tsc --build` |
| `git diff --name-only 2166de1..HEAD -- packages/game-core` | PASS, empty output; no deterministic source/version change |
| `pnpm typecheck` | PASS, exit 0; game-core, server and web `tsc --noEmit` all Done |
| `pnpm lint` | PASS, exit 0; repository ESLint command |
| `TEST_DATABASE_URL=postgresql://egorgumenyuk@127.0.0.1:5432/hockey_economy_task9_20260910_1539 TEST_REDIS_URL=redis://127.0.0.1:6397/0 pnpm --filter @hockey/server test` | FAIL, exit 1; **1332 passed / 14 failed / 1346**, **117 passed / 11 failed / 128 files**, 357.37 s |
| Same isolated env + `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts` after fixture correction | PASS, exit 0; **7/7**, one file, 2.72 s |
| Same isolated env + `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts test/db/migration069.test.ts test/db/migration071.test.ts` | PASS, exit 0; **9/9**, three files, 4.13 s; all four new fixture failures corrected |
| `pnpm --filter @hockey/web test` | PASS, exit 0; **1209** tests in 125 non-DailyScreen files plus **152** separately selected DailyScreen tests = **1361** successful unique tests |
| `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx -t 'renders authoritative training lock\|announces the actual\|obeys the active daily period lock\|refreshes a newly appeared'` | PASS, exit 0; **12 passed / 152 skipped**, 2.28 s; fills the existing runner's parameterized-case gap |
| `git diff --check 2166de1..HEAD` and `git diff --check` | PASS, exit 0 |

The initial full server run used production SHA `82787a8`. Subsequent code-tree changes are the fixture-only commits above. Targeted reruns validate all corrected ledger assertions and their existing inventory/progress/snapshot preservation assertions; they do not convert the earlier failed full run into a green full run. The complete unique web coverage is **1373/1373 tests in 126 files**, combining the successful wrapper and the 12 parameterized cases it omitted.

Relevant full-server passing files include:

- `test/tournament/service.integration.test.ts`: 107/107.
- `test/duel/amateur.test.ts`: 122/122, including reward matrices, concurrent/repeated settlement, snapshot classification, zero defaults, legacy compatibility and transaction rollback.
- `test/duel/amateur/monthlyRewards.test.ts`: 16/16, including Moscow boundary, 29-match exclusion, 9/10-player payout boundary, payout bands, 20%/50 cap, concurrency, repeat calls, history, acknowledgement ownership and rollback.
- `test/weeklyChallenge/lifecycle.test.ts`: 26/26; `weeklyChallenge.test.ts`: 16/16; `admin.test.ts`: 11/11.
- `test/achievements/engine-rating.test.ts`: 6/6; achievement claims 3/3 and completion candidates 4/4.

Raw logs are retained in `/private/tmp/hockey-economy-task9.4kNqEd/`: `server-test.log`, `migrations-fixture-green.log`, `all-fixtures-green.log`, `web-test.log`, `web-parameterized.log`, `baseline-test.log`, `rehearsal.log`. They contain synthetic local fixture data, not remote credentials or production data.

## Red/green fixture change and remaining failures

The full run first demonstrated two new failures in `packages/server/test/db/migrations.test.ts`: `records applied migrations in the ledger` and `preserves old inventory balances and equipped items when replacing catalogue`. Actual applied names included 117–120; both literal expected lists stopped at 116. The minimal correction appends those exact four names to each list, without removing or weakening assertions. The focused rerun passed 7/7. No production code was modified.

Fresh execution at archived base `2166de1` showed that two more failures (`migration069.test.ts` and `migration071.test.ts`) were stale migration lists introduced by adding 117–120. Both have been minimally corrected; the combined rerun passes 9/9. The other **ten failures reproduced at baseline** are:

1. `test/admin/communications.integration.test.ts`: official-dialog message response expected wrapped `messages`, actual array.
2. `test/achievements/engine-duel.test.ts`: expected hidden achievements `handled-pressure` and `master-arsenal`; active-only completion excludes them.
3. `test/db/migration076.test.ts`: old speed-game balance expectation.
4. `test/db/migration077.test.ts`: old World Tour movement expectation.
5. `test/db/migration085.test.ts`: old uniform-balance expectation.
6. `test/db/migration106.test.ts`: speed-period total expectation.
7. `test/db/migration106.test.ts`: migration-ledger no-op expectation.
8. `test/onboarding/routes.test.ts`: tutorial shot response shape.
9. `test/onboarding/routes.test.ts`: tutorial completion expects 200, receives 409.
10. `test/tournament/migration-contract.test.ts`: expected old database rejection of daily-aggregate tournament shape.

These ten failing tests are unchanged in the feature range. The baseline run used files extracted with `git archive 2166de1 packages/server packages/game-core package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json` into `/private/tmp/hockey-economy-task9.4kNqEd/baseline`; installed dependencies were linked from the working branch, whose package/lockfiles and game-core have no source diff. No baseline source was patched. The same isolated test DB/Redis env was used, after the current-branch suites had finished.

Baseline command: `pnpm --dir /private/tmp/hockey-economy-task9.4kNqEd/baseline/packages/server exec vitest run test/admin/communications.integration.test.ts test/achievements/engine-duel.test.ts test/db/migration069.test.ts test/db/migration071.test.ts test/db/migration076.test.ts test/db/migration077.test.ts test/db/migration085.test.ts test/db/migration106.test.ts test/onboarding/routes.test.ts test/tournament/migration-contract.test.ts`.

Actual: exit 1; **10 failed / 32 passed / 42 tests**, **8 failed / 2 passed / 10 files**, **11.27 s**. Failure identities match the ten retained current-branch failures above; migration069/071 pass at baseline and pass on the feature branch after the fixture correction. No failure was masked, disabled or silently relabeled.

## Migration rehearsal

Rehearsal used a **fresh separate local database** `hockey_economy_task9_rehearsal_20260910_1542`. Full tests used the distinct disposable database `hockey_economy_task9_20260910_1539` and a newly started Redis process bound to `127.0.0.1:6397`, with persistence disabled. The shared `hockey_test` database and default Redis were not used, reset or flushed. No dev/prod connection was made.

The available local PostgreSQL server reports **15.15 (Homebrew)**. An attempt to initialize a separate PostgreSQL 16 cluster failed before use: `could not create shared memory segment: No space left on device`, with the macOS SHMMNI/shared-memory hint. This is a local engine-version limitation: rehearsal on PostgreSQL 15 is valid local evidence, but is not PostgreSQL 16 or deployed-environment evidence. The failed initialization removed its own incomplete `pgdata` directory; no existing database directory was affected.

Command: `pnpm --filter @hockey/server exec tsx /private/tmp/hockey-economy-task9.4kNqEd/rehearsal.ts`, connected only to the rehearsal DB. The temporary script imports the real `applyMigrations` and achievement catalogue.

Observed evidence:

1. Applied the complete baseline migration set before 117: **118 files**, last `116_weekly_challenge_future_publication.sql` (historical numbering includes more files than the numeric suffix).
2. Created synthetic prior-state fixtures: a player with XP/experience 81/23, 12,345 coins and 7 tokens; one claimed achievement; one old weekly reward claim with 9/8/7 coins/stars/experience; completed automatic, unfinished automatic-zero and manually configured challenge rows.
3. Applied the incremental runner once: exactly `117_economy_achievement_rewards.sql`, `118_weekly_challenge_token_rewards.sql`, `119_duel_reward_matrix.sql`, `120_monthly_duel_rating_rewards.sql`.
4. Deep comparisons confirmed the original user balances, currency/token account rows, claimed achievement row, existing weekly claim amounts/timestamp and currency ledger remained unchanged.
5. Weekly migration readback: unfinished automatic zero-default row receives 5 tokens; historical automatic and manually configured row receive 0; manual coin reward 123 remains 123; the historical claim records 0 tokens. The newly added weekly default is 5 and claim default is 0.
6. Catalogue readback: **51 rows, 47 active, 3 hidden, 1 future**. Every non-hidden database reward tuple matches the current approved catalogue; monthly-top-1/top-3 values match §6.5. Hidden rows remain hidden.
7. Actual schema: both duel `reward_rules` columns are non-null JSONB with all 15 amounts zero and tolerance 10; weekly token columns are non-null integer with nonnegative checks. Both JSONB validator constraints are installed; empty matrix and negative reward probes return false.
8. Actual monthly constraints: season primary key, unique `(season_key,user_id)` placements and economy events, unique `(season_key,place)`, matches >=30, counts/rewards nonnegative, reward cap <=50 and <=eligible count, economy-event foreign key and positive-reward check. The currency-ledger reason constraint retains existing allowed reasons and adds `monthly_duel_rating_reward`.
9. Ran the real migration runner again: **`{ applied: [] }`**, ledger count **122**. Deep history comparison remains equal. Duplicate currency-account, token-account, weekly-claim and monthly-event key groups are all **0**.

Monthly-event duplicate absence in the rehearsal is a schema check on a fresh table; the full monthly integration suite supplies the nonempty concurrent payout evidence (three events for ten eligible players after four concurrent calls and a retry, total coins 32,500).

## Acceptance matrix (§13)

Statuses below concern local code/test/schema evidence, not deployed or rendered-browser acceptance.

| # | Expected | Actual local evidence / status |
|---|---|---|
| 1 | New weekly 0/30/30/5 and one Moscow weekly window | PASS: new-form defaults and submitted body; existing lifecycle/admin window tests; token column/default/claim rehearsal |
| 2 | All weekly rewards editable | PASS: all four fields serialized by form and admin schema; existing custom rewards retained and token updates persisted |
| 3 | New tournament fee and both reward tables derive from limit | PASS: exact 16-player table 136,000 payout / 24,000 sink; bracket boundary and endpoint access/limit validation; wizard initial snapshot |
| 4 | Manual economy survives non-economic changes | PASS: custom state for fee and both reward tables; limit-change and stale-response regressions |
| 5 | Explicit recommendations replace complete economy | PASS: reset updates fee, regular and playoff rewards; tests inspect visible values and saved payload |
| 6 | Published tournament preserves snapshot | PASS: no changes to published revision/reward immutability services or prior migration files; existing 107-test tournament service suite passes; wizard edit starts custom |
| 7 | Approved active achievements; hidden never granted | PASS: all catalogue/database reward tuples agree; 47 active after activating monthly pair; active-only INSERT guard; historical claimed fixture unchanged |
| 8 | Editable 15 duel amounts, tolerance, zero/10 defaults | PASS: server/API/database defaults and validators; form matrix; full duel suite passes |
| 9 | Win category only from experience snapshot | PASS: boundary and zero-experience tests; settlement fixtures intentionally contradict current users.experience and later template edits |
| 10 | Previous monthly season closes/pays once | PASS: Moscow boundary, per-season advisory lock/recheck, immutable rows and repeated/concurrent settlement tests |
| 11 | Fewer than 30 rated duels excluded | PASS: 29-match high scorer excluded before ranking; actual >=30 schema constraint |
| 12 | Rewarded user sees Sections modal, others do not | PASS for mechanics via Sections/BottomNav tests; **FAIL for required §9.4 title copy**, see defect below |
| 13 | Zero currencies absent | PASS: component and Sections positive-reward filtering tests |
| 14 | Failed acknowledgement remains; success not repeated | PASS: request failure keeps modal/error; cancellation of stale pending GET; successful ownership/idempotent read; queue advance tests |
| 15 | Repeated/concurrent calls never double credit | PASS locally: monthly and duel real concurrent settlement/rollback tests, weekly repeat 409 plus unchanged balances/one claim/one ledger, achievement unique key; historical duplicate checks |

## Confirmed acceptance defect for controller fix wave

`packages/web/src/components/duel/MonthlyRatingRewardModal.tsx:22–24` returns `Вы выиграли рейтинг дуэлей!` / `Вы заняли N-е место в рейтинге дуэлей!`, with month in a separate copy line. The user explicitly required `Вы победитель зачета дуэлей за сентябрь` / `Вы заняли 2-е место в зачете дуэлей за сентябрь`, dynamically formatted by place/month. The controller confirmed this is still binding. `MonthlyRatingRewardModal.test.tsx:19–23` encodes the wrong titles, so a green test is not evidence of this copy requirement. Sections tests contain the same alternative copy.

This requires a production component fix and matching regression assertions. It is outside Task 9's fixture/docs-only mutation boundary, so it is **not fixed here** and release acceptance remains blocked. No claim that all §13 criteria are complete is made.

## Branch scope, secrets and preservation

- Entire branch diff reviewed across server migrations/services/routes, web DTOs/forms/queues/modal, and associated tests. Baseline-to-feature diff is 45 files, 3827 insertions / 147 deletions before the Task 9 fixture commit.
- No game-core change, package/lockfile change, authentication/credential setup change, deploy workflow change or environment file is in the branch diff.
- Migration changes are four new files only. No existing SQL migration is rewritten. Old claimed achievement/weekly-reward snapshots and balances were checked with nonempty rehearsal fixtures. Existing tournament snapshot services are unchanged and their integration suite passes.
- No unrelated root-checkout files are included. The sole non-package tracked change from Tasks 1–8 is the Task 8 report. Task 9 touched only its report and three migration test fixtures; it did not mutate the root checkout or its untracked files.
- Diff review and a scan of all 3827 added lines found **0 recognizable credential indicators** (private keys, OpenAI/GitHub/AWS/Slack token formats). New apparent secrets in tests are clearly synthetic local fixtures. This is scoped source inspection, not a claim of an exhaustive secret-scanning product audit.
- GLM was not used. No subagents were created.

## Excluded release steps

**Step 5 push/dev deployment: NOT PERFORMED. Step 6 remote runtime/DB/browser readback: NOT PERFORMED.** No push, workflow dispatch, SSH, remote database query or deployment was attempted. There is no workflow URL, deployed SHA, dev health/schema proof or rendered dev modal result to report. Production is untouched. These checks remain the controller's external release checkpoint after the final branch review/fix wave and required user authorization.

## Final follow-up evidence

- The standard web runner parses only literal `it('...')` names and omits four `it.each` groups (12 cases) in DailyScreen. The runner itself was not changed because Task 9 allows only test fixtures/docs. The omitted cases were explicitly executed and all passed, bringing verified unique coverage to 1373 tests. This is a pre-existing tooling concern for the controller, not an untested case left behind.
- Local test and rehearsal DB names were verified in `pg_database`, then exactly those two disposable databases were dropped; the dedicated Redis 6397 was shut down with `NOSAVE`. Cleanup returned exit 0. Only synthetic, disposable test data was removed and is not recoverable; the temporary logs, script and archived baseline remain for audit. Shared local DB/Redis and dev/prod data were untouched.
- No final full-server rerun was performed after fixture-only changes; the fresh full run plus all affected-file reruns and the baseline comparison are reported separately. The server suite is not claimed green.
- Outstanding: controller production fix for approved monthly title wording; disposition of ten confirmed baseline test failures; existing web-runner omission; PostgreSQL 16/remote/rendered verification at the release checkpoint. Local verification did not grant or imply permission to deploy.
