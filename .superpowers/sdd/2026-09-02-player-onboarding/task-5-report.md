# Task 5 report — versioned onboarding admin backend

Status: PASS for Task 5. Original implementation commit: `1d5e7a3bee763f37aea8602252d3c34053848252`. Review-fix commit: `a9dfdbfcd861b7bcb3963789c7cdaf5c7e6a26fa`.

## Delivered contracts

- Shared `createAdminPreHandlers()` preserves the existing authentication, blocked-user, and global-admin-role checks.
- `GET /admin/onboarding/chains/:chainKey` returns the authoritative published and draft snapshots.
- Draft step create, full patch, duplicate, delete, and reorder endpoints always return the full authoritative chain DTO.
- The first edit of published content clones a new version; published step rows remain immutable. Patch, duplicate, delete, and first-edit reorder map published IDs to their cloned draft rows.
- `POST /admin/onboarding/media` accepts a real, decodable, non-empty, in-limit WebP with an exact portrait `2:3` aspect ratio and minimum dimensions `800×1200`, stores it below `onboarding/`, persists an `onboarding_image` `media_objects` row, and returns a protected proxy URL. Replacing a step reference never deletes old media.
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

- The previously reported migration-list baseline failure was fixed before this review round by preserved commit `a7f282d81ba41c18c35b204ffa9b8f0f712bf2b3`. This focused review round did not rerun the full server suite.
- Publish intentionally fails closed during a transient object-storage GET outage. This protects players from a newly published chain with unavailable imagery, at the cost of requiring the administrator to retry publication after storage recovers.
- Expected storage-failure tests emit error-level application log lines even though their assertions pass; this matches the existing bonus-game media test pattern.

## Review fix round — image dimensions and safe teardown

The review correctly identified two gaps. Section 5.2 requires server-side image-dimension validation, while the upload path previously accepted any decodable WebP. The test teardown also called `app.close()` after a failed setup even when `app` had never been initialized.

The backend now applies one onboarding image export contract: exact portrait `2:3`, at least `800×1200`, with larger same-ratio images allowed up to the existing byte and decoded-pixel limits. This matches the planned mobile portrait composition and gives source illustrations enough detail without changing the successful upload response DTO or the existing empty-body, content-type, byte-limit, decode, storage, and persistence contracts. A valid WebP with unsuitable geometry returns `422` with code `invalid_image_dimensions` and a human-readable requirement. The test teardown now closes the app only when setup initialized it.

### Review RED evidence

The integration command sourced the repo-root `.env` with `set -a; source ../../.env; set +a`; no values were printed.

- `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts -t "dimensions"`
  - Exit 1 before production changes.
  - The valid `800×1200` WebP passed, while both the `1×1` WebP and the `1200×1200` WebP returned `201` instead of expected `422`.
  - Result: 1 passed, 2 failed, 10 skipped. Both failures were the missing dimension/aspect validation rather than fixture or setup errors.

### Review GREEN and regression evidence

- `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts -t "dimensions"`
  - PASS: 3/3 selected tests.
- `pnpm --filter @hockey/server exec vitest run test/onboarding/admin.test.ts --no-file-parallelism`
  - PASS: 13/13 tests.
- `pnpm --filter @hockey/server exec vitest run test/onboarding/routes.test.ts test/onboarding/service.test.ts --no-file-parallelism`
  - PASS: 20/20 tests.
- `pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts --no-file-parallelism`
  - PASS: 9/9 tests.
- `pnpm --filter @hockey/server typecheck`
  - PASS.
- `pnpm --filter @hockey/server build`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm exec prettier --check packages/server/src/onboarding/adminRoutes.ts packages/server/test/onboarding/admin.test.ts .superpowers/sdd/2026-09-02-player-onboarding/task-5-report.md`
  - PASS.
- `git diff --check`
  - PASS.

No web UI, migrations, public onboarding behavior, credentials, sessions, deployment, or production state changed in this review round. GLM was not used. The controller delegated this fix round once despite the no-subagent instruction; no nested subagents were used.
