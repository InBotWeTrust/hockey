# Achievement Mechanics Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved achievement levels, best-attempt progress, reset semantics, token removal, and safe production user reconciliation, then release the exact implementation to dev and production.

**Architecture:** Keep achievement definitions in `stageCatalog.ts`, make stage observation merge progress according to an explicit per-achievement display policy, and keep completion evaluation separate from displayed progress. Add forward-only migrations for catalog data and an idempotent operations command that audits production first, creates compensating ledger entries, never drives balances negative, and records its run. Release through the existing `dev` and `main` GitHub Actions workflows only.

**Tech Stack:** TypeScript, Fastify, PostgreSQL 16, React 18, Vitest, GitHub Actions.

**Spec:** `docs/achievement-mechanics-review.md`

## Global Constraints

- No achievement stage grants tokens in this release.
- Cumulative career counters carry across claimed levels.
- Attempts and streaks only use observations at or after the current stage `opened_at`.
- Best-attempt cards never regress after a weaker observation.
- Composite achievements display `0/1`, not their internal numeric qualifier.
- Dev users are not reconciled.
- Production reconciliation requires a backup, read-only audit, dry run, explicit target counts, and an idempotent apply step.
- Production corrections use compensating ledger entries and never delete financial history or make balances negative.
- Deploy only through `.github/workflows/deploy-dev.yml` and `.github/workflows/deploy.yml`.

---

### Task 1: Lock the catalog and display policies with tests

**Files:**
- Modify: `packages/server/test/achievements/catalog.test.ts`
- Modify: `packages/server/test/achievements/stageDisplayProgress.test.ts`
- Modify: `packages/server/src/achievements/stageCatalog.ts`
- Modify: `packages/server/src/achievements/service.ts`

**Interfaces:**
- Produces: exact stage thresholds/rewards from `docs/achievement-mechanics-review.md` and a display projection returning `{ progressValue, targetValue }`.

- [ ] Add failing catalog tests asserting every approved stage count, threshold, reward, and `rewardTokens === 0`.
- [ ] Run `pnpm --filter @hockey/server exec vitest run test/achievements/catalog.test.ts test/achievements/stageDisplayProgress.test.ts` and confirm failures describe the old catalog.
- [ ] Update `stageCatalog.ts` and the display projection with the approved values and binary `0/1` rules.
- [ ] Re-run the focused tests and confirm PASS.

### Task 2: Preserve best progress and reset stage-local state

**Files:**
- Modify: `packages/server/test/achievements/stageProgress.test.ts`
- Modify: `packages/server/test/achievements/claim.test.ts`
- Modify: `packages/server/src/achievements/stageProgress.ts`
- Modify: `packages/server/src/achievements/claimStage.ts`

**Interfaces:**
- Produces: stage-local progress that merges best numeric observations without changing completion checks; newly claimed stages start with `{}`.

- [ ] Add failing tests for `8/20` surviving a later `5/20`, a completed level staying full until claim, a newly opened level starting at zero, and an old event not affecting the new level.
- [ ] Add failing tests proving host/guest/hunter streak live counters reset while their displayed stage maximum does not regress.
- [ ] Run the two focused test files and confirm RED for the missing merge/reset behavior.
- [ ] Implement minimal best-progress merging and explicit reset behavior without allowing one event to complete two levels.
- [ ] Re-run the focused tests and confirm PASS.

### Task 3: Update all event evaluators

**Files:**
- Modify: `packages/server/test/achievements/engine-daily.test.ts`
- Modify: `packages/server/test/achievements/engine-training.test.ts`
- Modify: `packages/server/test/achievements/engine-duel.test.ts`
- Modify: `packages/server/test/achievements/engine-rating.test.ts`
- Modify: `packages/server/test/achievements/tournamentEvaluator.test.ts`
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/achievements/tournamentEvaluator.ts`
- Modify: `packages/server/src/achievements/tournamentRules.ts`

**Interfaces:**
- Consumes: stage observation API from Task 2.
- Produces: career totals for rating/tournament placements, exclusive first-versus-second/third place rating progress, inclusive semifinal/final/cup progress, exact revenge sequencing, and two-level series comeback events.

- [ ] Add failing scenario tests for every changed evaluator and for observations occurring before/after stage opening.
- [ ] Add failing tests proving monthly and regular-season first place does not also count as medalist/top-3.
- [ ] Add failing tests proving a tournament win counts semifinal, final, and cup progress.
- [ ] Add failing tests for exact revenge adjacency and comeback deficits of two and three series wins.
- [ ] Run the focused evaluator suite and confirm RED.
- [ ] Implement the event mappings and counters, then rerun until PASS.

### Task 4: Add forward-only schema/catalog migration

**Files:**
- Create: `packages/server/db/migrations/139_achievement_mechanics_reconciliation.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**
- Produces: production-safe upserts for approved stages, disabled removed stages, zero token rewards, and any additional audit columns/tables required by reconciliation.

- [ ] Add a failing migration test that runs all migrations twice and asserts exact stage rows and zero token rewards.
- [ ] Run the migration test and confirm RED because migration 139 is absent.
- [ ] Write an idempotent forward-only migration; do not delete claimed history or reuse a changed stage identity ambiguously.
- [ ] Re-run migration tests and confirm PASS.

### Task 5: Build production reconciliation as audit/dry-run/apply

**Files:**
- Create: `packages/server/src/ops/achievementMechanicsReconciliation.ts`
- Create: `packages/server/src/ops/achievementMechanicsReconciliationCli.ts`
- Create: `packages/server/test/ops/achievementMechanicsReconciliation.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**
- Produces: `achievements:reconcile --mode audit|dry-run|apply --run-id <uuid>` with stable per-user outcomes and a stored run manifest.

- [ ] Write failing tests for idempotency, exact history reconstruction, first honest streak retention, removal of later invalid stages, zero token rewards, capped deductions, and compensating ledger rows.
- [ ] Run the operations test and confirm RED.
- [ ] Implement audit and dry-run as read-only paths, then implement transactional apply with advisory locking and a unique run id.
- [ ] Re-run the operations tests and confirm PASS.

### Task 6: Verify web progress rendering contracts

**Files:**
- Modify: `packages/web/src/screens/AchievementsScreen.test.tsx`
- Modify: `packages/web/src/screens/ProfileDestinationScreens.test.tsx`
- Modify: `packages/web/src/chat/test/UserProfileScreen.test.tsx`
- Modify if required: `packages/web/src/achievements/AchievementStageDetails.tsx`
- Modify if required: `packages/web/src/screens/AchievementsScreen.tsx`

**Interfaces:**
- Consumes: server DTO `progressValue/targetValue`.
- Produces: consistent best-progress and binary progress rendering on achievements, own profile, and chat profile.

- [ ] Add failing UI tests for best result, `0/1` composite progress, full unclaimed progress, and zero newly opened progress.
- [ ] Run focused web tests and confirm any missing behavior fails.
- [ ] Make the minimal UI changes required by the DTO contract.
- [ ] Re-run focused web tests and confirm PASS.

### Task 7: Full verification and dev release

**Files:**
- Verify only.

- [ ] Run game-core build, server/web focused suites, full typecheck, lint, test, build, and `git diff --check`.
- [ ] Commit only intended files and integrate the exact SHA into `dev`.
- [ ] Push `dev`, wait for the exact `Deploy Dev` Actions run, and verify migration, restart, smoke, and dev health.
- [ ] Perform rendered checks on achievements, own profile, and chat profile; record PASS/FAIL separately from deployment evidence.

### Task 8: Production release and controlled reconciliation

**Files:**
- Verify and operate through the checked-in workflow/CLI only.

- [ ] Capture a fresh production database backup and record its identifier before any data mutation.
- [ ] Run the production reconciliation CLI in `audit` and `dry-run`; verify exact affected users, removed stages, currency/star/experience deductions, zero token changes, and no negative resulting balances.
- [ ] Merge the exact tested `dev` SHA to `main`, push, and wait for the exact production Deploy run through migration, restart, and smoke.
- [ ] Verify production health and runtime SHA.
- [ ] Run the same reconciliation manifest in `apply`, read it back, and rerun in `audit` to prove idempotency and zero remaining drift.
- [ ] Perform production rendered acceptance on the three achievement surfaces and report deployment, data reconciliation, and UI acceptance separately.
