# Production Release and Economy Rebase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release exact current dev to production and safely perform the approved account deletion and achievement-priced balance rebase.

**Architecture:** A tested server module performs the operation inside one PostgreSQL transaction. A CLI defaults to rollback-only dry-run and requires `--apply` for mutation; an operation ledger prevents a second application. Production is backed up and rehearsed before a short writer-stop window for final execution.

**Tech Stack:** PostgreSQL 16, TypeScript NodeNext, `pg`, Vitest, pnpm, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-production-release-and-economy-rebase-design.md`

## Global Constraints

- Delete only the three immutable IDs in the spec; preserve the other Andrey Rubtsov account.
- Reward totals come from completed achievements and the current post-migration catalogue.
- Do not change level or amateur access; `amateur-ticket` contributes only its reward.
- Preserve payments and non-achievement financial history.
- Dry-run is the CLI default; apply is atomic and idempotent.
- Never copy dev data to production and never build on the VPS.
- GLM is prohibited for this project.

---

### Task 1: Add the operation ledger and tested production rebase service

**Files:**

- Create: `packages/server/db/migrations/122_production_data_operations.sql`
- Create: `packages/server/src/ops/productionEconomyRebase.ts`
- Create: `packages/server/test/ops/productionEconomyRebase.test.ts`

**Interfaces:**

- Produces: `runProductionEconomyRebase(db: Pool, options: { apply: boolean }): Promise<ProductionEconomyRebaseReport>`.
- Produces: operation key `2026-09-11-production-economy-rebase-v1` in `production_data_operations`.

- [ ] Write an integration test fixture with all three target IDs, the protected second Andrey ID, shared chat ownership/messages, completed achievements, prior balances, and unrelated ledger history.
- [ ] Run the focused test and verify RED because the service and migration do not exist.
- [ ] Add the operation-ledger migration and the minimal transactional service.
- [ ] Verify GREEN: dry-run rolls back, apply deletes only targets, preserves shared entities/payment history, credits exact literal reward totals, marks achievements claimed, and repeated apply is a no-op.

### Task 2: Add the guarded CLI

**Files:**

- Create: `packages/server/src/ops/productionEconomyRebaseCli.ts`
- Modify: `packages/server/package.json`

**Interfaces:**

- Consumes: `runProductionEconomyRebase` from Task 1.
- Produces: `node packages/server/dist/ops/productionEconomyRebaseCli.js [--apply]`.

- [ ] Add CLI argument tests for default dry-run and explicit apply mode.
- [ ] Run them RED.
- [ ] Implement environment guard (`NODE_ENV=production`), structured report output, and non-zero error handling.
- [ ] Run focused tests GREEN, then server typecheck and build.

### Task 3: Verify the release candidate

**Files:**

- Verify all files changed by Tasks 1-2 plus the complete `origin/main..HEAD` release range.

- [ ] Build `@hockey/game-core`, then run root typecheck, lint, tests, build, and `git diff --check`.
- [ ] Inspect every pending migration filename and run migrations twice on the integration database.
- [ ] Commit only intended release-operation files and record the exact SHA.

### Task 4: Rehearse against a fresh production backup

**Files:**

- Create outside git: timestamped compressed production `pg_dump` on the VPS.

- [ ] Record current production image tags, health, user count, target identities, and migration maximum.
- [ ] Create a fresh compressed backup and verify it with `pg_restore --list`.
- [ ] Restore to a disposable rehearsal database.
- [ ] Apply all pending migrations using the release-candidate server image/code, then run dry-run and apply.
- [ ] Verify 25 survivors, zero target rows/references, exact per-user reward sums, preserved non-achievement ledger entries, and a no-op second apply.
- [ ] Drop only the explicitly named disposable rehearsal database.

### Task 5: Deploy and execute the production operation

**Files:**

- Release `dev` to `main` through GitHub and `.github/workflows/deploy.yml` only.

- [ ] Push the release branch, merge it with current `origin/main`, and wait for CI/deploy for the exact merge SHA.
- [ ] Confirm GitHub Actions built/pushed images, applied migrations, recreated containers, and passed backend/frontend smoke tests.
- [ ] Verify `/api/health`, running image tags, build SHA, and migration `122`.
- [ ] Stop `server` and `push-worker`, take and validate a fresh pre-operation backup, run the CLI once with `--apply`, and restart services immediately.
- [ ] Verify health, 25 users, exact three-account deletion, protected Andrey survival, exact balances from completed achievements, claimed state, ledger consistency, and no-op idempotency report.
- [ ] Perform authenticated rendered smoke checks for login/profile/achievements and report anything that cannot be verified.
