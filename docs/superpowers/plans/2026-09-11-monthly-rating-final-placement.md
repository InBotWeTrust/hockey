# Monthly Rating Final Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one immutable all-player monthly duel rating determine prizes, achievements, and historical display.

**Architecture:** A shared SQL ranking query derives all final rows from `amateur_duel_rating_match`, including head-to-head points inside equal-total-point groups. Settlement stores that full ranking; a migration rebuilds closed seasons and an audit validates achievements against the rebuilt ranks. Closed-month API reads the snapshot.

**Tech Stack:** TypeScript, Fastify, PostgreSQL raw SQL migrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-monthly-rating-final-placement-design.md`

## Global Constraints

- Preserve existing user data and financial ledgers; migrations are forward-only.
- Run `@hockey/game-core` build before server tests.
- Do not use GLM in this project.

---

### Task 1: Final all-player monthly ranking

**Files:**
- Modify: `packages/server/src/duel/amateur/monthlyRewards.ts`
- Test: `packages/server/test/duel/amateur/monthlyRewards.test.ts`

- [ ] Write a failing integration test where a player is third among the former 30-match subset but eighth by the all-player month ranking, and assert that player has no top-three achievement or prize.
- [ ] Run the focused Vitest test and confirm it fails under the eligible-only implementation.
- [ ] Replace the eligible-only settlement query with the specified shared ranking and use its placement for prizes and achievements.
- [ ] Run the focused test and the monthly-reward suite.

### Task 2: Immutable historical snapshots and achievement audit

**Files:**
- Create: `packages/server/db/migrations/125_monthly_rating_final_placements.sql`
- Modify: `packages/server/src/achievements/monthlyRatingAchievementAudit.ts`
- Test: `packages/server/test/achievements/monthlyRatingAchievementAudit.test.ts`

- [ ] Write a failing audit test for an achievement with a stored placement outside top three.
- [ ] Add a forward migration that removes the 30-match constraint and rebuilds closed snapshots from the rating-match ledger with the shared ordering, without deleting economy events.
- [ ] Make the audit validate achievement type against the stored final place.
- [ ] Run focused audit tests and migration-backed integration tests.

### Task 3: Closed-month rating display and release verification

**Files:**
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Test: `packages/server/test/duel/amateur.test.ts`

- [ ] Add a failing route test proving a closed month returns snapshot order rather than the mutable live aggregate.
- [ ] Read closed months from the final-placement snapshot and leave open months live.
- [ ] Run focused server tests, lint, typecheck, and the production audit dry-run after deployment.
