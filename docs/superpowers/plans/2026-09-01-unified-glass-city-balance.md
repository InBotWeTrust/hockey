# Unified Glass And City Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply exact Accuracy World Tour settings and a consistent Bonus Games-derived glass material outside the personal-profile tab.

**Architecture:** A forward-only SQL migration owns catalog balance. Route-level surface classes and shared CSS custom properties own visual scoping; components consume semantic material tokens rather than duplicate opacity constants.

**Tech Stack:** PostgreSQL raw migrations, React 18, React Router, TypeScript, vanilla CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-unified-glass-city-balance-design.md`

## Global Constraints

- Dev only; production is not modified.
- Preserve active bonus-game attempt snapshots.
- Keep `/profile` and all `/profile/*` screens visually unchanged.
- Keep dark active controls and semantic status colors distinct.
- Use TDD for every behavior change.

---

### Task 1: Accuracy World Tour migration

**Files:**

- Create: `packages/server/db/migrations/085_accuracy_world_tour_uniform_balance.sql`
- Create: `packages/server/test/db/migration085.test.ts`
- Modify: migration-ledger expectations only where required by the new migration

**Interfaces:**

- Consumes: the 13 stable Accuracy game UUIDs and immutable `bonus_game_attempt.rules_snapshot`
- Produces: exact catalog `target_goals`, qualification shot limits, one period, shared movement rules, and incremented revisions

- [ ] Write an integration test with all 13 expected city rows and a pre-migration active attempt.
- [ ] Run the test and confirm it fails because migration 085 is absent.
- [ ] Add the guarded forward-only migration using the bonus-game advisory lock.
- [ ] Run the migration test and relevant bonus-game tests to green.
- [ ] Commit the migration and its regression coverage.

### Task 2: Route-scoped material system

**Files:**

- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/App.test.tsx`
- Modify: `packages/web/src/app/global.css`
- Modify: `packages/web/src/app/design-system.css`
- Create: `packages/web/src/app/glassMaterial.test.ts`

**Interfaces:**

- Produces: `appSurfaceClassName(pathname)` plus `--surface-card-bg`, `--surface-filter-bg`, and `--surface-elevated-bg`
- Consumers: all light cards, filters, headers, dropdowns, balances, and modals outside `/profile*`

- [ ] Add failing route tests for normal, public-user, profile, and profile-settings paths.
- [ ] Add a failing CSSOM behavior test for exact card/filter/elevated resolved backgrounds.
- [ ] Implement route classes and shared tokens with profile-tab isolation.
- [ ] Refactor generic glass, chrome, tabs, modal, and header primitives to semantic tokens.
- [ ] Run App and material tests to green.
- [ ] Commit the shared material foundation.

### Task 3: Application surface audit

**Files:**

- Modify: `packages/web/src/app/design-system.css`
- Modify component tests only where a real rendered contract requires it

**Interfaces:**

- Consumes: shared semantic material tokens from Task 2
- Produces: consistent surfaces across the user application and admin while preserving semantic variants

- [ ] Inventory opaque light backgrounds by screen family and classify card, filter/chrome, elevated, semantic, or profile-only.
- [ ] Convert Sections, Amateur, Daily, Training, Achievements, Inventory/Store, Chat, Tournaments, and Admin surface selectors to semantic tokens.
- [ ] Preserve profile selectors and semantic colored states.
- [ ] Run focused screen/component tests.
- [ ] Commit the audited surface coverage.

### Task 4: Rendered verification and dev release

**Files:**

- Modify only regressions found during rendered QA

- [ ] Start the local stack and capture representative screens at the mobile viewport.
- [ ] Compare material opacity, readability, spacing, dropdown overlays, and profile non-regression against the approved references.
- [ ] Run game-core build, focused tests, full `pnpm test`, typecheck, lint, build, and `git diff --check`.
- [ ] Perform code review and fix every Critical or Important finding.
- [ ] Re-fetch `origin/dev`, reconcile without force-push, and rerun affected verification if the base moved.
- [ ] Push the branch, create and merge a PR into `dev`, wait for official Deploy Dev, and verify runtime SHA, health, migration, and rendered assets.
