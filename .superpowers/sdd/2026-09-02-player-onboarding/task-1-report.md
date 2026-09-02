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

## Self-review

- Migration is forward-only and uses the existing migration runner transaction model.
- Existing media purposes remain allowed; only `onboarding_image` was added.
- Existing users are explicitly backfilled to completed for both chains, while the not-null defaults remain false for users created after migration 060.
- Partial unique indexes enforce one draft, one `step_viewed` per run/step, and one `tutorial_goal`/`completed` per run.
- No files outside the requested migration, migration test, and required report were changed.

## Concerns

The integration test could not execute against PostgreSQL/Redis in this environment. Run the focused migration test with the project integration services before merging.
