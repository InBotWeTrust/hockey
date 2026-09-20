# Story Series One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved cinematic beginner onboarding as the unlocked, replayable first story series after completion.

**Architecture:** A shared `BeginnerStoryFlow` owns cinematic scenes and supports explicit `required` and `replay` modes. Required mode uses the existing onboarding run/tutorial APIs and completion callback; replay mode uses a local deterministic tutorial adapter and never writes server state. The profile API exposes onboarding completion and the current beginner goal threshold so the story catalog and narrative use authoritative values.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Pixi `PlayView`, Fastify, PostgreSQL, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-20-story-series-one-design.md`

## Global Constraints

- Series title is `Путь со двора`.
- Series description is `Последняя шайба и случайная встреча.`
- Required onboarding has no close control; replay has `Закрыть серию` on every scene.
- Replay performs no onboarding, shot-statistics, inventory, achievement, or progress writes.
- The threshold comes from current game settings, never hardcoded narrative copy.
- Series 2–10 remain locked placeholders.
- No dev deployment until local verification and explicit release confirmation.

## Review Focus

- Direct replay-route navigation by an incomplete player must return to `/profile/story`.
- Replay shot must not call onboarding start, tutorial start/submit, step-view, or completion endpoints.
- Required mode must still complete through the server and must not expose a close button.
- Goal and miss must lead to their matching narrative branches and converge on the same next scene.
- The close button must remain usable in safe-area layouts on narrative and shot screens.

---

### Task 1: Expose story unlock and threshold in the profile contract

**Files:**
- Modify: `packages/server/src/routes/me.ts`
- Modify: the `getMe` query/DTO file imported by `packages/server/src/routes/me.ts`
- Modify: `packages/web/src/screens/profileTypes.ts`
- Test: `packages/server/test/routes/me.test.ts` or the existing focused `/me` route test

**Interfaces:**
- Produces: `ProfileData.beginnerOnboardingCompleted: boolean`
- Produces: `ProfileData.amateurUnlockGoalsRequired: number`
- Consumes: `users.beginner_onboarding_completed` and `getGameSettings(...).amateur.unlockGoalsRequired`

- [ ] **Step 1: Write failing server assertions**

Add expectations that `/me` returns both fields with database/settings values for an authenticated player.

- [ ] **Step 2: Verify RED**

Run the focused server `/me` test and confirm both properties are missing.

- [ ] **Step 3: Implement the profile fields**

Extend the profile query/DTO and route response without changing existing response keys.

- [ ] **Step 4: Verify GREEN**

Run the focused server test and web typecheck.

- [ ] **Step 5: Commit**

Commit message: `feat: expose story unlock state`

### Task 2: Port the cinematic story flow and assets

**Files:**
- Create: `packages/web/src/onboarding/BeginnerStoryFlow.tsx`
- Create: `packages/web/src/onboarding/beginnerStory.ts`
- Create: `packages/web/src/onboarding/BeginnerStoryFlow.test.tsx`
- Modify: `packages/web/src/onboarding/onboarding.css`
- Modify: `packages/web/src/onboarding/TutorialShotStep.tsx`
- Copy: approved prototype assets to `packages/web/public/onboarding/story/`

**Interfaces:**
- Produces: `BeginnerStoryFlow({ mode, runId, required, unlockGoalsRequired, onCompleted, onClose })`
- Consumes: existing `TutorialShotStep`, `recordStepView`, `completeOnboarding`, and a replay-only local tutorial adapter
- Produces: exact scene copy/actions and goal/miss branching from the approved prototype

- [ ] **Step 1: Write failing component tests**

Cover fixed-position typed copy, punctuation completion, headlight transition, exact approved copy/actions, required mode without close, replay mode with close, close callback, goal/miss branches, dynamic threshold, and absence of network calls in replay.

- [ ] **Step 2: Verify RED**

Run direct Vitest for `BeginnerStoryFlow.test.tsx`; expect missing component/module failures.

- [ ] **Step 3: Add story data and assets**

Port only the approved final scene images and text. Store threshold text as formatter functions accepting `unlockGoalsRequired`.

- [ ] **Step 4: Implement shared cinematic presentation**

Port typewriter timing, punctuation pauses, stable reserve text, dialogue colors, CTA timing, car headlight swap, and the accessible replay close action.

- [ ] **Step 5: Integrate the real shot renderer**

Reuse `PlayView` through `TutorialShotStep`; required mode uses the server adapter, replay mode injects a deterministic local adapter and performs no fetch. Keep the goal centered, goalie/home/sound/scoreboards hidden, real player movement and puck rendering intact.

- [ ] **Step 6: Verify GREEN**

Run the focused component and `TutorialShotStep` tests.

- [ ] **Step 7: Commit**

Commit message: `feat: add cinematic beginner story flow`

### Task 3: Replace required beginner presentation without changing server completion

**Files:**
- Modify: `packages/web/src/onboarding/OnboardingFlow.tsx`
- Modify: `packages/web/src/onboarding/OnboardingFlow.test.tsx`
- Modify: `packages/web/src/onboarding/OnboardingGate.test.tsx`

**Interfaces:**
- Consumes: `BeginnerStoryFlow` from Task 2
- Preserves: `OnboardingFlow` for amateur chains and admin preview
- Produces: beginner required-mode completion through the existing `completeOnboarding(runId)` lifecycle

- [ ] **Step 1: Write failing integration tests**

Assert beginner chains render `BeginnerStoryFlow`, omit `Закрыть серию`, record required step evidence, complete the run, and preserve amateur/admin behavior.

- [ ] **Step 2: Verify RED**

Run focused onboarding flow/gate tests and confirm the legacy beginner cards render.

- [ ] **Step 3: Route only beginner required chains to the cinematic flow**

Keep existing lifecycle error handling and profile invalidation. Ensure every required server step receives view evidence before completion and tutorial evidence comes from the authoritative tutorial API.

- [ ] **Step 4: Verify GREEN**

Run all web onboarding tests.

- [ ] **Step 5: Commit**

Commit message: `feat: use cinematic flow for beginner onboarding`

### Task 4: Unlock Series 1 and add protected replay navigation

**Files:**
- Modify: `packages/web/src/screens/ProfileDestinationScreens.tsx`
- Modify: `packages/web/src/screens/ProfileDestinationScreens.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Create: `packages/web/src/screens/ProfileStorySeriesScreen.tsx`
- Create: `packages/web/src/screens/ProfileStorySeriesScreen.test.tsx`

**Interfaces:**
- Consumes: profile fields from Task 1 and `BeginnerStoryFlow` from Task 2
- Produces: `/profile/story/series-1`
- Produces: unlocked Series 1 card with title, description, artwork, and completed status

- [ ] **Step 1: Write failing catalog and route tests**

Cover locked/unlocked card rendering, exact title/description, artwork, completed label, navigation, incomplete-user redirect, close return, final return, and direct URL protection.

- [ ] **Step 2: Verify RED**

Run the two focused screen test files and confirm the first series remains a locked placeholder and route is absent.

- [ ] **Step 3: Implement the catalog card**

Query `/me`, render loading/error states, unlock Series 1 only from `beginnerOnboardingCompleted`, and keep Series 2–10 unchanged.

- [ ] **Step 4: Implement the replay screen and route**

Guard with profile data, render replay mode, and navigate to `/profile/story` on close or finish.

- [ ] **Step 5: Style and responsive-check the card and close action**

Use existing glass/card tokens, a labeled button, and safe-area offsets at 360/390/430px.

- [ ] **Step 6: Verify GREEN**

Run focused story and app routing tests.

- [ ] **Step 7: Commit**

Commit message: `feat: unlock and replay first story series`

### Task 5: Full verification and rendered acceptance

**Files:**
- Modify only if a failing regression test identifies a defect.

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified local branch ready for user acceptance, not deployed

- [ ] **Step 1: Run focused server and web suites**

Run `/me`, onboarding, story destination, story replay, and App route tests.

- [ ] **Step 2: Run repository checks**

Run `pnpm typecheck`, `pnpm lint`, relevant package tests, and `pnpm build`.

- [ ] **Step 3: Run browser acceptance**

Verify mandatory onboarding, replay launch, close from narrative and shot scenes, goal/miss branches, final return, and 360/390/430px layouts. Confirm replay produces no mutating onboarding requests.

- [ ] **Step 4: Review the complete diff**

Check assets, copy, accessibility labels, API compatibility, and absence of unrelated changes.

- [ ] **Step 5: Commit verification-only fixes if any**

Use a focused commit message describing the regression fixed.
