# Pre-Regular Schedule Shift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an administrator to move an already generated but not yet started regular season and every configured future playoff day by one shared calendar-day offset without reopening or changing registration.

**Architecture:** Add one transactional tournament service operation available only in `scheduling`. It calculates the offset from the tournament timezone's current first-tour date to the administrator's requested local date, shifts materialized regular matchdays, rounds, fixtures, and pending attempts, and publishes a new rules revision with equally shifted playoff dates. Expose the operation through an admin endpoint and a confirmation modal in tournament operations.

**Tech Stack:** Fastify, PostgreSQL, TypeScript, React, TanStack Query, Vitest, Testing Library.

**Spec:** User-approved design in the current task: shift regular season and all future playoffs together; do not change registration.

## Global Constraints

- Only tournaments with status `scheduling` may be shifted.
- The new first-tour date must be in the future in the tournament timezone.
- Registration dates and participant state must remain unchanged.
- Use calendar-day arithmetic in the tournament timezone so local game times survive DST changes.
- Reject the operation if any regular fixture attempt, classic session, daily result, or regular fixture has started or reached a non-pristine state.
- Preserve all existing uncommitted playoff and admin calendar changes in this worktree.
- Do not deploy to dev in this task.

---

### Task 1: Transactional server operation

**Files:**

- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Test: `packages/server/test/tournament/service.integration.test.ts`

**Interfaces:**

- Produces: `shiftTournamentSchedule(pool, { tournamentId, expectedRevision, firstMatchdayLocalDate, adminUserId, now })` returning the updated tournament and shifted day count.
- Produces: `POST /admin/tournaments/:tournamentId/schedule/shift` with `{ expectedRevision, firstMatchdayLocalDate }`.

- [ ] **Step 1: Write failing integration tests**

Cover a generated `head_to_head` calendar and a generated `daily_aggregate` calendar. Assert that the tournament start, regular materialized timestamps, pending attempt deadlines, and both `firstGameStartsAt` and `scheduleDays[].localDate` in playoff rules move by the same calendar-day offset, while registration timestamps remain unchanged.

- [ ] **Step 2: Run the focused server tests and verify RED**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "shifts a generated regular schedule"`

Expected: FAIL because `shiftTournamentSchedule` does not exist.

- [ ] **Step 3: Implement the transaction and route**

Lock the tournament, validate `scheduling` and revision, calculate a timezone-aware calendar offset, reject dirty schedules, shift the published rules snapshot into a new revision, update all materialized regular timestamps, write one audit event, and return mapped tournament data.

- [ ] **Step 4: Run focused server tests and verify GREEN**

Run the command from Step 2 and confirm both format scenarios pass.

### Task 2: Admin action and confirmation modal

**Files:**

- Modify: `packages/web/src/tournament/adminApi.ts`
- Modify: `packages/web/src/tournament/TournamentOperations.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/web/src/tournament/TournamentOperations.test.tsx`

**Interfaces:**

- Consumes: `POST /admin/tournaments/:tournamentId/schedule/shift`.
- Produces: an action named `Перенести регулярный сезон`, shown only for `scheduling`, and a modal containing the current first tour, new local date, shared-offset explanation, and `Перенести расписание` CTA.

- [ ] **Step 1: Write failing component tests**

Assert that the action exists only in `scheduling`, opens the modal, sends the current revision and selected `YYYY-MM-DD`, displays server errors in Russian, closes on success, and refreshes tournament plus schedule data.

- [ ] **Step 2: Run the focused web test and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentOperations.test.tsx -t "moves the generated regular schedule"`

Expected: FAIL because the action and API method do not exist.

- [ ] **Step 3: Implement the API wrapper, state, modal, and styles**

Use `AccessibleModal`, a date input, the existing full-width CTA conventions, and a concise warning that registration is unchanged while regular season and playoff dates move together.

- [ ] **Step 4: Run the focused web test and verify GREEN**

Run the command from Step 2 and confirm the interaction passes.

### Task 3: Regression and rendered verification

**Files:**

- Verify all modified files.

**Interfaces:**

- Consumes: completed server and web behavior.
- Produces: local proof for tests, types, lint, build, formatting, and mobile rendering.

- [ ] **Step 1: Run focused and full verification**

Run game-core build, focused server tests, full web tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier check, and `git diff --check`.

- [ ] **Step 2: Run a local browser scenario**

At 390x844, open a scheduling tournament, verify the new shift modal and the green full-width regular-season start button, perform a non-persistent or disposable local shift scenario, and confirm calendar dates plus playoff rule dates move together.

- [ ] **Step 3: Review the final diff**

Confirm registration fields are untouched, no unrelated user changes were overwritten, and no dev deployment occurred.
