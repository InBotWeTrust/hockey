# Bonus Game Final Shot Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every bonus game leaves a stalled final-shot request in a recoverable authoritative state, regardless of skill, target, quota, streak, or period configuration.

**Architecture:** Keep the server as the source of truth. Bound both the shot POST and its fallback attempt GET with abortable client timeouts; after a timed-out POST, reconcile the attempt, and after a timed-out reconciliation expose the existing retry overlay instead of retaining an infinite mutation lock.

**Tech Stack:** React 18, Zustand, TypeScript, Fetch AbortController, Vitest.

**Spec:** User request in the active task; existing bonus-game contracts in `packages/web/src/stores/bonusGameStore.ts` and `packages/server/src/bonusGames/service.ts`.

## Global Constraints

- The behavior must be independent of editable bonus-game targets, quotas, period counts, timers, and skill codes.
- The server response remains authoritative; no client-side completion inference is allowed.
- Existing duplicate-shot idempotency and deferred visual-boundary application must remain intact.
- Deployment target is `dev` only.

---

### Task 1: Bound shot submission and reconciliation

**Files:**
- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/stores/bonusGameStore.ts`
- Test: `packages/web/src/stores/bonusGameStore.test.ts`

**Interfaces:**
- Consumes: existing `submitBonusShot(attemptId, body)` and `fetchBonusAttempt(attemptId)` requests.
- Produces: optional `AbortSignal` request options and a store helper that always settles mutation state.

- [x] **Step 1: Write a failing test for a never-settling shot POST**

Assert that the timeout aborts the POST, fetches the authoritative attempt, applies a completed attempt, and releases `inFlight`.

- [x] **Step 2: Run the focused store test and verify the timeout case fails**

Run: `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts`

- [x] **Step 3: Write a failing test for a never-settling reconciliation GET**

Assert that the second timeout releases `inFlight`, sets `needsReconcile`, and leaves the existing retry path available.

- [x] **Step 4: Run the focused store test and verify the reconciliation case fails**

Run: `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts`

- [x] **Step 5: Add optional AbortSignal support and the minimal bounded-request helper**

Use one timeout constant independent of game configuration. Abort and clear each timer in `finally`; never infer success locally.

- [x] **Step 6: Run store and play-screen regressions**

Run: `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts src/screens/BonusGamePlayScreen.test.tsx src/game/PlayView.test.tsx`

### Task 2: Review, verify, and deploy to dev

**Files:**
- Review: the complete diff from `origin/dev` to the candidate SHA.
- Verify: all web/server bonus-game tests plus repository typecheck, lint, build, and full tests.

**Interfaces:**
- Consumes: the Task 1 commit.
- Produces: one reviewed commit deployed by GitHub Actions to branch `dev`.

- [ ] **Step 1: Review the diff for lock leaks, stale response races, timer cleanup, and abort compatibility**

- [ ] **Step 2: Fix every Critical or Important review finding and rerun focused tests**

- [ ] **Step 3: Run repository verification**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` with local PostgreSQL/Redis access.

- [ ] **Step 4: Commit only scoped tracked files**

Commit message: `fix(bonus-games): recover stalled final shots`

- [ ] **Step 5: Rebase onto fresh `origin/dev`, rerun relevant checks, and push `HEAD:dev` without force**

- [ ] **Step 6: Verify Deploy Dev, `/api/health`, and the deployed SHA**
