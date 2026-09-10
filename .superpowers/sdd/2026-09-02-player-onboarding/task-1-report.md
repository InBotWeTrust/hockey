# Task 1 report

## Files

- `packages/server/db/migrations/060_player_onboarding.sql`
- `packages/server/test/db/migrations.test.ts`

The migration adds the onboarding completion/reset columns, preserves existing users as completed, creates the chain/version/step/run/event tables and constraints, adds aggregation and idempotency indexes, extends the media-purpose check with `onboarding_image`, and seeds the beginner/amateur chains disabled with no published version.

The migration test covers the pre-060 user backfill/default split, ordered migration ledger, draft/version-position uniqueness, step-kind checks, event-kind and event idempotency checks, onboarding media purpose, and the version/time and partial unique indexes.

## RED evidence

Command:

```text
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts
```

The command completed with exit code 0 but reported `1 skipped` test file and `6 skipped` tests because this worktree has no `TEST_DATABASE_URL`/`TEST_REDIS_URL`; PostgreSQL and Redis are not available locally. Therefore the expected database-level RED failure could not be observed in this environment.

## GREEN verification

- `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts` — command exit 0; 1 file/6 tests skipped for missing integration environment.
- `pnpm --filter @hockey/server exec tsc --noEmit --pretty false` — PASS.
- `git diff --check` — PASS.

## Fix round 3

Updated the migration continuity expectation in `packages/server/test/db/migrations.test.ts` to include `060_player_onboarding.sql` after `059_seed_bonus_games.sql`.

The first focused attempt against the continuity test exposed the existing shared-database reset race when filtering a single test (`pg_type_typname_nsp_index`); the stale expectation was then reproduced as the direct assertion failure (`received []` when setup was filtered out). A clean full run was used for final verification.

Full sequential server suite:

```text
set -a; source ../../.env; set +a
pnpm --filter @hockey/server exec vitest run --no-file-parallelism
```

Result: PASS — `Test Files 61 passed`, `Tests 525 passed`, duration `77.62s`.

Additional verification:

- `pnpm lint` — PASS.
- `pnpm exec prettier --check packages/server/test/db/migrations.test.ts` — PASS.
- `pnpm --filter @hockey/server exec tsc --noEmit --pretty false` — PASS.
- `git diff --check` — PASS.

## Fix round 2

The duplicate `tutorial_goal` regression fixture now supplies the existing valid `tutorialStepId`, so the assertion reaches the partial unique index instead of the event step-id CHECK. The separate null-step regression remains in place for `step_viewed`, `tutorial_attempt`, and `tutorial_goal`.

Focused integration command (repo-root `.env` sourced without printing values):

```text
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts -t '060 player onboarding migration'
```

Result: PASS — `Test Files 1 passed`, `Tests 2 passed | 4 skipped` (the four skipped tests are outside the selected suite). The first sandboxed attempt was blocked by `connect EPERM` to local PostgreSQL; rerunning with local-service access produced the PASS above.

Additional verification:

- `pnpm lint` — PASS.
- `pnpm exec prettier --check packages/server/test/db/migrations.test.ts` — PASS.
- `pnpm --filter @hockey/server exec tsc --noEmit --pretty false` — PASS.
- `git diff --check` — PASS.

## Self-review

- Migration is forward-only and uses the existing migration runner transaction model.
- Existing media purposes remain allowed; only `onboarding_image` was added.
- Existing users are explicitly backfilled to completed for both chains, while the not-null defaults remain false for users created after migration 060.
- Partial unique indexes enforce one draft, one `step_viewed` per run/step, and one `tutorial_goal`/`completed` per run.
- No files outside the requested migration, migration test, and required report were changed.

## Concerns

The integration test could not execute against PostgreSQL/Redis in this environment. Run the focused migration test with the project integration services before merging.

## Fix round 1

Addressed both review findings:

- `tutorial_shot` now requires `tutorial_config is not null` in the step-kind CHECK before checking that its JSON type is `object`.
- `step_viewed`, `tutorial_attempt`, and `tutorial_goal` now require a non-null `step_id`; `completed` explicitly requires a null `step_id`.
- Added regression assertions for missing tutorial config and null step IDs for each step-bearing event kind.

TDD evidence before the SQL fix:

```text
pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts
```

Result: exit code 0, `1 skipped` file and `6 skipped` tests because `TEST_DATABASE_URL`/`TEST_REDIS_URL` are unset. The database-level RED failure could not be observed without PostgreSQL/Redis.

Covering verification after the SQL fix:

- `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts` — exit 0; 1 file/6 tests skipped for missing integration environment.
- `pnpm --filter @hockey/server exec tsc --noEmit --pretty false` — PASS.
- `git diff --check` — PASS.
