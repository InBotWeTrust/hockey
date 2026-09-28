# Repeatable Advanced Training Attempts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace millisecond-wide continuous advanced-training moments with repeatable, human-playable episodes for all eight categories on both sides.

**Architecture:** An exercise-only deterministic episode profile in game-core is the single source of motion and shot results for the renderer and server. Each attempt starts eight player traversals before an engine-verified interval, pauses after any result, and resets under an opaque transition after coach acknowledgement. Ordinary match simulation and marksmanship thresholds remain unchanged.

**Tech Stack:** TypeScript, game-core, Fastify/PostgreSQL, React/Pixi, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-advanced-training-repeatable-attempts-design.md`

## Implementation status (2026-09-28)

The exercise-only episode profile, server attempt identity, practice/assessment cues,
modal-to-coach-hint flow, covered reset, and compatibility notice are implemented on
`feature/repeatable-advanced-training`. The core validator checks every millisecond of
the 500 ms target interval for all 16 category/side profiles. Local core/web tests,
typecheck, lint, and build are the verification gates. Server database integration
tests require isolated `TEST_DATABASE_URL`/`TEST_REDIS_URL` and must not be reported as
passing when skipped. Rendered mobile acceptance remains a separate gate; no release
or deployment is implied by this plan.

Final local verification: the bonus-game V6 compatibility check now accepts saved
core-66 and core-67 attempts without changing scoring rules. Server suite: 565 passed,
1233 skipped (isolated DB/Redis unavailable). Full web suite, targeted game-core tests,
typecheck, lint, build, and diff check passed. Rendered browser acceptance is still
unverified; no deployment has been made.

Review hardening: each playable episode now starts through a server endpoint that
rotates its token and records `episode_started_at`. Shot submission must match that
server clock within an early/late tolerance, so waiting with a token cannot submit
an expired target time. The client requests the new start after every acknowledged
hint, stage change, or reconnect before revealing the rink.

## Global Constraints

- Validate at least 500 ms of real, successful tap time in assessment and practice for all 8 categories × 2 sides; no approximate or unvalidated fallback.
- A shot is evaluated at the actual press time in both stages; no tap-to-target queue.
- Eight complete player edge-to-edge traversals precede the valid interval; no visible repositioning within an episode.
- Normal game motion, V6 category boundaries, completed training records, and reward rules remain unchanged.
- Preserve unrelated files and the previous local copy/assets fix branch. Do not deploy without a fresh request.

## Review Focus

- A shot at either interval boundary produces the target category/side, while a tap immediately outside it is evaluated honestly; Task 1 tests all boundaries.
- A no-tap expiration restarts without recording a shot or double-counting progress; Tasks 3 and 4 test it.
- Duplicate, stale, or reordered responses cannot reset a newer attempt or grant a second reward; Tasks 2 and 4 test this.
- A player returning after a reload gets a clean lead-in, not a partially expired episode; Tasks 2 and 4 test it.
- Reduced-motion users see a covered reset with no visible teleport; Task 5 tests the DOM state and rendered mobile acceptance.

---

### Task 1: Deterministic, validated episode profiles

**Files:** Create `packages/game-core/src/advancedTrainingEpisode.ts`; test `packages/game-core/src/advancedTrainingEpisode.test.ts`; modify `packages/game-core/src/index.ts` and `packages/game-core/src/version.ts` with version test.

**Interfaces:** Produce `AdvancedTrainingEpisodeProfile`, `getAdvancedTrainingEpisode(technique, side)`, `sampleAdvancedTrainingEpisode(profile, episodeMs)`, `evaluateAdvancedTrainingEpisodeShot(profile, episodeMs)`, and `validateAdvancedTrainingEpisode(profile)`. Samples expose goal/goalie/player positions and directions. The evaluator returns the existing shot result, V6 technique and side; no duplicate category rules.

- [ ] **Step 1: Write failing tests** for all 16 category/side profiles: eight traversals before the interval, continuous samples at the approach boundary, at least 500 ms valid interval, correct classification at each millisecond and both endpoints, and deterministic replay. Include a 1-ms outside-boundary check that is evaluated rather than silently snapped.
- [ ] **Step 2: Run** `pnpm --filter @hockey/game-core exec vitest run src/advancedTrainingEpisode.test.ts`; expect missing interface/RED.
- [ ] **Step 3: Implement** the exercise-only profile and evaluator using shared game-core geometry. Author positions/velocities with smooth transitions into the stable shot interval; keep the ordinary match resolver untouched. If any profile cannot meet the invariant, stop this task and report the exact category/side rather than relaxing the requirement.
- [ ] **Step 4: Build and run** `pnpm --filter @hockey/game-core build` and `pnpm --filter @hockey/game-core exec vitest run src/advancedTrainingEpisode.test.ts test/version.test.ts`; expect GREEN.
- [ ] **Step 5: Commit** the focused core change and tests.

### Task 2: Versioned, server-authoritative repeated attempts

**Files:** Modify `packages/server/src/duel/training/advancedCourseV2Routes.ts`, `packages/server/test/duel/advancedCourseV2.test.ts`, `packages/server/test/duel/advancedCourseV2State.test.ts`, and `packages/web/src/api/advancedTraining.ts`.

**Interfaces:** Server state exposes profile/version, current side/stage, shot index, server-recorded attempt number, and an episode start token. Shot input carries actual episode-local tap time plus that token. A no-tap restart does not increment shots or successes. Keep existing response result and feedback fields.

- [ ] **Step 1: Write failing server tests** for a boundary shot, wrong category/side, duplicate shot, stale token, replayed local time on a later attempt, no-tap replay, reconnect, version mismatch and unchanged completion rewards.
- [ ] **Step 2: Run** targeted server Vitest tests; expect behavior RED, not a missing test database. If isolated DB is unavailable, run pure route-contract tests and report the integration gap.
- [ ] **Step 3: Implement** new versioned episode state and request validation. Replace the continuous run's monotonic-local-time guard with attempt/shot identity; never weaken the normal game endpoints.
- [ ] **Step 4: Run** targeted server tests and `pnpm typecheck`; expect GREEN.
- [ ] **Step 5: Commit** server and API contract changes.

### Task 3: Episode clocks, cue timing and real taps

**Files:** Modify `packages/web/src/components/AdvancedTrainingPlayV2.tsx`, `packages/web/src/components/advancedTrainingV2Timing.ts`, `packages/web/src/components/advancedTrainingV2Timing.test.ts`, and `packages/web/src/game/PlayView.tsx`/`packages/web/src/game/loop.ts` only as needed to render the shared profile.

**Interfaces:** Web consumes Task 1 samples and Task 2 episode token. `getAdvancedTrainingEpisodeCue(profile, episodeMs, stage)` counts four real seconds and returns practice “Бросай” only inside the validated window. Assessment returns no cue after “1”. `handlePrimaryTap` submits the actual episode-local clock without queuing.

- [ ] **Step 1: Write failing cue and loop tests** for 4→3→2→1, practice valid-window cue, assessment disappearance after 1, actual unmodified tap time, eight-traversal lead-in, and identical rendered/evaluated entity positions.
- [ ] **Step 2: Run** targeted web Vitest tests; expect RED.
- [ ] **Step 3: Implement** profile-driven rendering and cue timing, remove the old continuous next-window scan and practice tap queue for this mode. Keep the button always available.
- [ ] **Step 4: Run** targeted tests, `pnpm --filter @hockey/web build`, and `pnpm typecheck`; expect GREEN.
- [ ] **Step 5: Commit** client timing and rendering changes.

### Task 4: Uniform result, hint and replay state machine

**Files:** Modify `packages/web/src/components/AdvancedTrainingPlayV2.tsx`, `packages/web/src/components/AdvancedTrainingPlayV2.test.tsx`, `packages/web/src/components/AdvancedTrainingV2Explanation.tsx`, and its tests.

**Interfaces:** Phases are `playing → result → coach-hint → covered-reset → playing`, with terminal stage/side transitions after the hint. A no-tap expiration enters `result` with “Момент упущен” and has no shot request.

- [ ] **Step 1: Write failing tests** for each outcome's ordinary result modal, coach hint after modal, no movement until “Понятно”, no-tap path, success/side-change copy, wrong-category two-paragraph copy, and late response isolation.
- [ ] **Step 2: Run** targeted component tests; expect RED.
- [ ] **Step 3: Implement** the state machine and freeze/reset behavior; reuse existing result modal and coach card styles. Do not show a separate wrong-category result modal.
- [ ] **Step 4: Run** targeted tests plus full web suite; expect GREEN.
- [ ] **Step 5: Commit** the result-flow change.

### Task 5: Covered transition, compatibility and acceptance

**Files:** Modify `packages/web/src/app/design-system.css` and relevant component tests; update version tests and server compatibility tests as needed. Do not include the unrelated untracked plan.

**Interfaces:** A full rink cover masks the clock/position reset, then reveals the eight-traversal lead-in. Reduced-motion uses an immediate static cover. Active old-version runs receive an explicit restart prompt; completed records remain.

- [ ] **Step 1: Write failing tests** for cover-before-reset ordering, reduced motion, old-run restart message, and preserved completion state.
- [ ] **Step 2: Run** targeted tests; expect RED.
- [ ] **Step 3: Implement** transition and compatibility behavior.
- [ ] **Step 4: Run** game-core and web suites, relevant isolated server tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`; expect GREEN or explicitly report isolated-environment skips.
- [ ] **Step 5: Browser-check** at mobile width: first and narrow categories on both sides, early/middle/late taps, all modal→hint→covered-reset outcomes, and no visible teleport. If browser access is blocked, report acceptance as unverified.
- [ ] **Step 6: Review and commit** only the task files. Do not merge or deploy without release authorization.
