# Recorded Marksmanship Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay two selected real Express attempts in the dev-only marksmanship constructor with play/pause, 0–180 s seeking, adjustable-step arrows and a list of actual goals.

**Architecture:** A minimal checked-in, dev-only fixture holds two participants' recorded shot inputs and wall offsets. A pure timeline module maps wall time to saved scene/player clocks and shot animation phases. The existing constructor screen selects synthetic or recorded mode; the Pixi court consumes explicit replay state so it never guesses historical results from a free-running sample.

**Tech Stack:** React, TypeScript, Pixi, game-core, Vitest, PostgreSQL read-only export.

**Spec:** `docs/superpowers/specs/2026-09-24-marksmanship-duel-replay-design.md`

## Global Constraints

- Production is read-only during extraction; no runtime dev-to-prod connection.
- The constructor and fixture are enabled only by the existing `dev-only-enabled` build flag.
- Stored shots: Egor 83/78 and Dmitry 90/79; all 173 outcomes match current game-core before implementation.
- Default arrow step is 50 ms, editable and clamped; arrows move time, not shot index.
- The slider spans exactly 0–180,000 ms. Saved shot anchors are exact; intervening animation is labeled approximate.
- All user-facing copy is Russian. No new dependency is required.

## Review Focus

- A seek or tab switch during an active result overlay cancels stale animation and hides the prior run's result.
- The first and last 100 ms of the period clamp cleanly and Play stops at 180,000 ms.
- Two shots less than a visual pause apart do not reorder, duplicate, or suppress recorded results.
- A result/position mismatch in fixture verification fails loudly rather than displaying an invented outcome.
- A production build cannot include or navigate to the replay page or load the fixture.

---

### Task 1: Historical fixture and deterministic verification

**Files:**
- Create: `packages/web/src/screens/marksmanshipReplayData.ts`
- Create: `packages/web/src/screens/marksmanshipReplayData.test.ts`
- Modify: `packages/web/src/app/devOnlyFeatures.test.ts`

**Interfaces:**
- Produces: `RecordedRun` and `RecordedShot` types, `RECORDED_RUNS`, `verifyRecordedRun(run): string[]`.
- Each shot includes `index`, `wallMs`, `sceneMs`, `shooterMs`, `seed`, `input`, `result`; each run includes phase offsets, goalie ID, stick multiplier, and label.

- [ ] **Step 1: Write the failing fixture test.** Assert two run counts, increasing shot indices, finite times, and zero mismatches from `verifyRecordedRun`; assert first and last samples are within 0–180,000 ms.
- [ ] **Step 2: Run `pnpm exec vitest run packages/web/src/screens/marksmanshipReplayData.test.ts` and observe RED.**
- [ ] **Step 3: Export only selected participants from prod with read-only SQL.** Use period-log `started_at` and `shot_session.created_at` for approximate wall offsets, the saved shot input/seed/result, match seed-derived phase offsets, goalie ID and effective stick multiplier. Generate a literal fixture in source using `apply_patch`; no IDs/contact fields/raw inventory identifiers in the fixture. Export counts and recompute all results before accepting it.
- [ ] **Step 4: Implement `verifyRecordedRun` with `resolvePerspectiveCourtShot`; it must compare every recorded result and report the shot index on mismatch.**
- [ ] **Step 5: Run targeted fixture and production-gate tests, then commit this independently verifiable data unit.**

### Task 2: Pure replay timeline

**Files:**
- Create: `packages/web/src/screens/marksmanshipReplayTimeline.ts`
- Create: `packages/web/src/screens/marksmanshipReplayTimeline.test.ts`

**Interfaces:**
- Consumes: `RecordedRun` and `RecordedShot` from Task 1.
- Produces: `getReplayFrame(run, wallMs): ReplayFrame`, `seekReplayTime(wallMs, deltaMs): number`, and `formatReplayTime(ms): string`. `ReplayFrame` carries clock values, active shot/result phase and the latest shot anchor.

- [ ] **Step 1: Write RED tests for 0/180 s, exact shot anchors, between-shot clock advancement, flight/result phase, near-adjacent events and clamped steps.** For example, `getReplayFrame(run, run.shots[0].wallMs).shot?.index` equals 1 and its two clocks equal the saved values.
- [ ] **Step 2: Run the targeted timeline test and observe RED.**
- [ ] **Step 3: Implement pure binary-search-based frame lookup.** Anchor both clocks at the preceding shot, advance between events while accounting for the known flight/player pause and one-second result/scene pause; cap a phase at the next shot and correct to that shot's exact saved clocks. Return recorded results only for actual shot phases.
- [ ] **Step 4: Run targeted tests and commit.**

### Task 3: Replay court and controls

**Files:**
- Modify: `packages/web/src/game/MarksmanshipConstructorCourt.tsx`
- Modify: `packages/web/src/game/MarksmanshipConstructorCourt.test.tsx`
- Create: `packages/web/src/screens/MarksmanshipRecordedReplay.tsx`
- Modify: `packages/web/src/screens/MarksmanshipConstructorScreen.tsx`
- Modify: `packages/web/src/screens/MarksmanshipConstructorScreen.css`
- Modify: `packages/web/src/screens/MarksmanshipConstructorScreen.test.tsx`

**Interfaces:**
- `MarksmanshipConstructorCourt` accepts an optional explicit replay frame/input, leaving synthetic mode intact.
- `MarksmanshipRecordedReplay` receives `run: RecordedRun`, owns `wallMs`, `playing`, and `stepInput`; unmount cancels its animation frame.

- [ ] **Step 1: Write RED UI tests for tabs, Play/Pause, step arrows (50 ms and edited value), slider seek, goal jump, reset, overlay and changing tabs mid-playback.** Add a court test showing shooter uses `shooterMs` while goal/goalie use `sceneMs`.
- [ ] **Step 2: Run targeted UI/court tests and observe RED.**
- [ ] **Step 3: Add the three tabs and keep synthetic controls/list isolated to the synthetic tab.** Add replay controls and a compact ordered list of actual goals with a jump/scroll-to-top action.
- [ ] **Step 4: Render explicit frame positions and shot flight in the existing rink.** Use the recorded result for the short overlay. Ghost positions and hitbox visibility use the active shot's effective input; cancel animation frames/timers on seek/unmount/tab switch.
- [ ] **Step 5: Run targeted UI/court tests and commit.**

### Task 4: Verification and dev handoff

**Files:**
- Modify only tests or changed feature files if failures reveal a scoped defect.

- [ ] **Step 1: Build game-core if needed, then run targeted web tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and review the complete diff.** Report any unavailable/skipped checks separately.
- [ ] **Step 2: Open the local constructor at desktop and mobile widths.** Check both tabs, all 173 recorded shots, a first/middle/last goal jump, playback through at least two adjacent results, hitbox toggle, seek while playing and scroll to the goal list.
- [ ] **Step 3: Reconfirm the production flag exclusion and that no production service or DB was mutated.** Do not deploy until the user authorizes a dev release; commit the verified implementation and report local/browser status separately from dev runtime status.
