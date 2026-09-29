# Open-Window Observation Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first three advanced exercises with observation-only lessons that teach players to recognize an open puck-to-goal path at game speed.

**Architecture:** Introduce a versioned observation-scene bank and evaluator in game-core. Branch the existing advanced-training server flow for the first three step keys, preserving the shot-based contract for later steps. Give the web client a dedicated observation flow with mark/skip input and a post-decision visual replay; use curated existing recorded-game data for lesson three.

**Tech Stack:** TypeScript, React/Pixi, Fastify/PostgreSQL, Vitest, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-09-29-open-window-first-lessons-design.md`

## Global Constraints

- Only the first three advanced exercises change; beginner training, ordinary games, and later advanced exercises remain intact.
- Decisions and scene playback use the first-period daily-game speed; no slowdown, countdown, auto-shot, or tap correction.
- A usable opening lasts at least 700 ms of real playback time; a closed scene has no usable opening.
- During an attempt the player sees no diagnostic overlay. Pause and highlighted replay happen only before an independent decision or after it.
- A goal/result category cannot determine success in these observation-only lessons. The server owns evaluation and progress.
- Do not deploy to production. Dev deployment and authenticated browser acceptance are separate gates after implementation.

## Review Focus

- A tap delivered at the first/last millisecond of an opening is classified consistently on web and server (Task 1 tests).
- A no-tap scene cannot be submitted early as a correct skip (Task 2 integration test).
- A duplicate or retried decision never awards completion twice (Task 2 integration test).
- A stale scene/version after reload restarts cleanly without awarding an unseen skip (Task 2 integration test).
- A visible open path in a recorded clip is not mislabeled solely from the historical shot result (Tasks 1 and 4 tests/acceptance).

---

### Task 1: Curate and prove observation scenes

**Files:**
- Create: `packages/game-core/src/openWindowObservation.ts`
- Create: `packages/game-core/src/openWindowObservationBank.json`
- Create: `packages/game-core/test/openWindowObservation.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Produce `type ObservationStepKey = 'notice_frame' | 'notice_motion' | 'notice_independent'`.
- Produce `type ObservationScene = { id: string; stepKey: ObservationStepKey; source: 'authored' | 'recorded'; sessionSeed: string; goalieId: string; shotIndex: number; startMs: number; endMs: number; opening: { startMs: number; endMs: number } | null; bankVersion: number; gameCoreVersion: number; explanation: string }`.
- Produce `getObservationScene(stepKey: ObservationStepKey, variant: number): ObservationScene` and `evaluateObservationDecision(scene: ObservationScene, input: { type: 'mark'; tapTimeMs: number } | { type: 'skip' } | { type: 'observed' }): 'good_mark' | 'early' | 'late' | 'closed' | 'good_skip' | 'missed_opening' | 'observed'`.

- [ ] Write tests for a 700 ms or longer authored opening, a genuinely closed scene, interval boundaries, and a recorded candidate whose historical shot result is ignored by the observation evaluator.
- [ ] Run `pnpm --filter @hockey/game-core exec vitest run test/openWindowObservation.test.ts`; confirm RED from missing observation contracts.
- [ ] Implement the scene contract and minimal candidate bank using existing first-period motion simulation. Lesson 1 needs one demonstration; lesson 2 needs openings at different points and one closed scene. Add candidate recorded segments for lesson 3 from the existing constructor fixture, with source provenance but without player identity in lesson UI.
- [ ] Add a content-validation test that scans each opening at first-period speed, rejects a window under 700 ms, and confirms closed scenes have no usable opening. If no suitable candidate exists, stop and report the content gap; do not widen ordinary shot rules or fabricate an answer.
- [ ] Build game-core and run its focused tests; mark bank entries as provisional until the rendered checks in Tasks 3–4, then commit this self-contained content/evaluator change.

### Task 2: Make observation decisions server-authoritative

**Files:**
- Modify: `packages/server/src/duel/training/openWindowCourseRoutes.ts`
- Modify: `packages/server/src/duel/training/openWindowCourse.ts`
- Modify: `packages/server/test/duel/openWindowCourse.test.ts`
- Modify: `packages/web/src/api/openWindowTraining.ts`

**Interfaces:**
- Consume `getObservationScene` and `evaluateObservationDecision` from Task 1.
- For the three observation step keys, extend the existing decision input with `{ type: 'mark'; tap_time_ms: number }`, `{ type: 'skip' }`, and `{ type: 'observed' }`; keep `{ type: 'shot'; tap_time_ms: number }` for later keys.
- Return `observation_feedback` with the evaluation string and actual decision time; do not return or infer a shot result for observation inputs.

- [ ] Write integration tests: lesson 1 completes only after the demonstration duration and `observed`; lesson 2 requires both a good mark and a good closed-scene skip; lesson 3 completes after all curated segments regardless of accuracy, while reporting mark and skip quality separately; early no-tap, duplicate, stale token, wrong scene/version, and retry do not grant progress.
- [ ] Read the project testing instructions before running tests. Run `pnpm --filter @hockey/server exec vitest run test/duel/openWindowCourse.test.ts` against an isolated test DB/Redis; confirm RED against the old shot/skip-only route. A skipped integration suite is BLOCKED, not GREEN.
- [ ] Branch only the first three keys in the route. Reuse the existing run/completion tables and idempotent decision log; version the new bank so old active runs restart explicitly, while completed records remain.
- [ ] Keep server wall-clock validation for marks and scene-end validation for skips. A failed request can retry the same decision/time without producing a second completion.
- [ ] Build game-core, run server focused tests and typecheck; commit the route/API contract.

### Task 3: Build lessons 1–2 in the rink

**Files:**
- Create: `packages/web/src/components/OpenWindowObservationPlay.tsx`
- Create: `packages/web/src/components/OpenWindowObservationPlay.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Consume the Task 2 observation decision API and Task 1 scene type.
- Route the first three step keys to `OpenWindowObservationPlay`; leave `OpenWindowTrainingPlay` for later steps.

- [ ] Write component tests for lesson 1 demo pause/continuation and lesson 2 mark, closed-scene no-tap, too-early/too-late feedback, request retry with preserved tap time, and reload beginning at a clean scene.
- [ ] Run `pnpm --filter @hockey/web exec vitest run src/components/OpenWindowObservationPlay.test.tsx src/screens/DailyScreen.test.tsx`; confirm RED because the new observation component and route do not exist.
- [ ] Render first-period motion through the existing `PlayView`, but use a separate “Вижу шанс” control rather than the shot action. Hide diagnostic overlays during decisions; freeze only for the demo and post-decision replay.
- [ ] Use the spec's exact trainer copy and short feedback. Show the result of each decision before starting the next scene; do not display goal/save/miss modals for these steps.
- [ ] Run focused web tests, typecheck, and a phone-sized rendered check of lessons 1–2; commit the component and routing.

### Task 4: Add real-game recognition and validate learning

**Files:**
- Modify: `packages/game-core/src/openWindowObservationBank.json`
- Modify: `packages/game-core/test/openWindowObservation.test.ts`
- Modify: `packages/web/src/components/OpenWindowObservationPlay.tsx`
- Modify: `packages/web/src/components/OpenWindowObservationPlay.test.tsx`

**Interfaces:**
- Reuse Task 1 `source: 'recorded'` scenes and Task 2 decision API; no new production endpoint.

- [ ] Write a regression test that lesson 3 uses curated recorded segments and that a historical goal or miss does not affect mark/skip feedback.
- [ ] Run `pnpm --filter @hockey/game-core exec vitest run test/openWindowObservation.test.ts` and `pnpm --filter @hockey/web exec vitest run src/components/OpenWindowObservationPlay.test.tsx`; confirm RED while lesson 3 lacks complete recorded content and flow.
- [ ] Curate self-contained segments from the constructor's recorded runs, preserve their original motion and source attribution, and add both open and closed decisions. Do not expose player personal data in the lesson UI.
- [ ] Render each segment at phone size without hints, inspect the highlighted replay against the actual decision frame, and reject ambiguous candidates. Verify that at least one experienced player who did not understand the old course can explain the puck-to-goal path in their own words after lesson 3; record this as product acceptance, not an automated pass.
- [ ] Run focused tests, game-core build, web/server typecheck and relevant regression tests; commit only if content and user acceptance both pass. Otherwise leave the prototype unshipped and report what failed.

### Task 5: Integration and dev release gate

**Files:** No new feature file expected; change only failures attributable to Tasks 1–4.

- [ ] Review `git diff origin/dev...HEAD` for unrelated edits and verify beginner exercises and later advanced steps still use their original routes/outcomes.
- [ ] Run `pnpm --filter @hockey/game-core build`, `pnpm typecheck`, `pnpm lint`, and the targeted game-core/server/web test commands from Tasks 1–4. Record exact pass/fail output; do not relabel failures as baseline without evidence.
- [ ] In the internal browser, check lessons 1–3 at phone size and normal first-period speed, including open/closed scenes, response time, replay, and reconnect. Keep browser acceptance distinct from unit tests.
- [ ] Only after those gates and user-authorized release scope, follow `docs/engineering/release.md` to merge/deploy to dev. Verify deployed SHA, health, and the authenticated lesson flow separately. No production deployment.
