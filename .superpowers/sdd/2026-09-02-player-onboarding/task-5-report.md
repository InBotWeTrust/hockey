# Task 5 report — versioned onboarding admin backend

Status: PASS for Task 5. Implementation commit: `1d5e7a3bee763f37aea8602252d3c34053848252`.

## Delivered contracts

- Shared `createAdminPreHandlers()` preserves the existing authentication, blocked-user, and global-admin-role checks.
- `GET /admin/onboarding/chains/:chainKey` returns the authoritative published and draft snapshots.
- Draft step create, full patch, duplicate, delete, and reorder endpoints always return the full authoritative chain DTO.
- The first edit of published content clones a new version; published step rows remain immutable. Patch, duplicate, delete, and first-edit reorder map published IDs to their cloned draft rows.
- `POST /admin/onboarding/media` accepts a real, decodable, non-empty, in-limit WebP, stores it below `onboarding/`, persists an `onboarding_image` `media_objects` row, and returns a protected proxy URL. Replacing a step reference never deletes old media.
- `GET /admin/onboarding/chains/:chainKey/preview` returns the public step shape plus `preview: true`.
- Preview tutorial start/shot endpoints use the shared deterministic tutorial validator and persist only `source='preview'` runs without changing user onboarding flags.
- Publish locks the chain and draft, validates content/order/tutorial/media rules plus object-storage availability, publishes the version, moves the pointer, and enables enforcement in one transaction. Failed validation leaves the old pointer and draft unchanged.

## RED evidence

All integration commands sourced the repo-root `.env` with `set -a; source ../../.env; set +a`; no values were printed.

1. `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts`
   - Exit 1 before production code.
   - The route contracts returned 404 because `/admin/onboarding/*` did not exist. The run also exposed a cleanup flaw in the corruption fixture; the fixture was corrected before implementation verification.
2. `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts -t "lazily clones and reorders"`
   - Exit 1 after self-review added the first-edit reorder edge case.
   - Actual 409 `onboarding_order_invalid`, expected 200, proving published IDs were not yet mapped to cloned draft IDs.

## GREEN and regression evidence

- `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts`
  - PASS: 11/11 tests.
- `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts test/onboarding/service.test.ts`
  - PASS: 20/20 tests.
- `pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts`
  - PASS: 9/9 tests, including the pre-existing admin-role contract after guard extraction.
- `pnpm --filter @hockey/game-core build`
  - PASS.
- `pnpm --filter @hockey/server typecheck`
  - PASS.
- `pnpm --filter @hockey/server build`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm exec prettier --check packages/server/src/admin/guards.ts packages/server/src/admin/routes.ts packages/server/src/onboarding/adminRoutes.ts packages/server/src/app.ts packages/server/test/onboarding/admin.test.ts`
  - PASS.
- `pnpm --filter @hockey/server exec vitest run --no-file-parallelism`
  - 60/61 files PASS, 524/525 tests PASS.
  - The sole FAIL is a baseline expectation outside Task 5: `packages/server/test/db/migrations.test.ts:942` expects applied migrations only through `059_seed_bonus_games.sql`, while input HEAD already contains and applies `060_player_onboarding.sql`.
  - A default parallel full-suite attempt additionally produced shared-test-database reset races; the sequential rerun removed every one of those failures and isolated the single baseline migration-list expectation above.

## Files

- `packages/server/src/admin/guards.ts`
- `packages/server/src/admin/routes.ts`
- `packages/server/src/app.ts`
- `packages/server/src/onboarding/adminRoutes.ts`
- `packages/server/test/onboarding/admin.test.ts`

## Self-review

- Mutation transactions lock `onboarding_chain` before finding/creating the single draft, serializing concurrent administrators.
- The publish transaction performs all DB and storage validation before changing either version status or the active pointer.
- Reorder validates exact set equality and uses a free temporary position; the 100-step full-capacity fallback preserves IDs atomically after invalidating preview-only runs.
- Draft mutations clear only preview runs for that mutable version so old preview events cannot retain deleted step rows; natural/admin-reset runs cannot target drafts through these routes.
- Preview shot calls reuse `startTutorialSession`/`submitTutorialShot`, ignore client frequency overrides, and row-lock the preview run against double taps.
- WebP uploads are decoded with `sharp`; DB failure after storage upload triggers best-effort object deletion.
- No migration, public onboarding behavior, web UI, GLM review, credential/session state, deployment, or production state was changed.

## Concerns / follow-up

- The pre-existing migration-list assertion at `packages/server/test/db/migrations.test.ts:942` must be updated by the owner of migration-test maintenance; it is not a Task 5 behavior and was intentionally left unchanged.
- Publish intentionally fails closed during a transient object-storage GET outage. This protects players from a newly published chain with unavailable imagery, at the cost of requiring the administrator to retry publication after storage recovers.
- Expected storage-failure tests emit error-level application log lines even though their assertions pass; this matches the existing bonus-game media test pattern.
