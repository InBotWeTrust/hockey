# Open-window Advanced Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace category-targeted advanced exercises with a twelve-step course that teaches open-window decisions at first-period daily-game speed, then deploy and verify it on dev.

**Architecture:** A new game-core module selects and evaluates deterministic daily-motion episodes without repositioning entities. A separately versioned server course owns progress, shot/skip decisions, and one-time stage rewards. The web course reuses `PlayView` without `episodeSampler`, progresses through demonstration/practice/check, and reports decision quality separately from shot outcome.

**Tech Stack:** TypeScript, game-core deterministic simulation, Fastify/Postgres, React/Pixi, Vitest, pnpm, GitHub Actions dev deployment.

**Spec:** `docs/superpowers/specs/2026-09-29-advanced-training-open-windows-design.md`

## Global Constraints

- Only advanced training changes; beginner exercises and ordinary match rules remain unchanged.
- Active scene motion and shot resolution use `getDailyPeriodSpeedPreset(1)` and ordinary game-core simulation; no custom episode sampler, position blending, or slow motion.
- Four stages × three steps; categories and left/right sides are never pass criteria.
- Early curated windows: stage 1 at least 200 ms, stage 2 at least 160 ms; later stages contain mixed widths.
- Practice retries are unlimited. Checks use five unseen decisions; four sound decisions pass. Final step records two complete three-minute runs without a population score cutoff.
- Every active run is server-owned, versioned, and idempotent; four stage rewards are one star plus one experience point each, granted once.
- Preserve old completion history and beginner course; dev deploy only, production untouched.

## Review Focus

- A shot near the edge of an open interval can miss but still reflect a relevant opportunity choice; test both dimensions independently in Task 1.
- No shot during a bounded episode must produce a scored skip, not a fabricated miss; test Task 1 and Task 2.
- Delayed or duplicate shot/skip responses must not advance a different attempt or grant rewards twice; test Task 2 and Task 3.
- Returning to a paused lesson must not resume a different seed or jump figures; test Task 2 and Task 3.
- A first-period speed change must propagate to training without copied literals; test Task 1.

---

### Task 1: Daily-motion episode and decision evaluator

**Files:**
- Create: `packages/game-core/src/openWindowTraining.ts`
- Create: `packages/game-core/test/openWindowTraining.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Defines `OpenWindowScene` (ID, seed, shot index, goalie ID, start/end/target times, bank/game-core versions), `OpenWindowFrame`, `OpenWindowInterval`, and `OpenWindowDecisionEvaluation` in this module.
- Produces: `sampleOpenWindowScene(scene: OpenWindowScene, timeMs: number): OpenWindowFrame`, using `simulateShooter`, `simulateGoal`, and `simulateGoalie` with the first daily preset and seed-derived phase offsets.
- Produces: `resolveOpenWindowShot(scene: OpenWindowScene, tapTimeMs: number): ShotResult`, delegating to existing shot resolution.
- Produces: `scanOpenWindows(scene: OpenWindowScene, startMs: number, endMs: number): OpenWindowInterval[]` and `evaluateOpenWindowDecision(scene, decision, intervals): OpenWindowDecisionEvaluation`.

- [ ] **Step 1: Write failing tests** for sampled shooter/goal/goalie positions at several full traversals matching ordinary daily simulation; no convergence near the target; open interval grouping; shot within interval; near-edge miss with relevant choice; bounded skip; first-period preset propagation.
- [ ] **Step 2: Run RED** with `pnpm --filter @hockey/game-core exec vitest run test/openWindowTraining.test.ts`; the new module/tests must fail before implementation.
- [ ] **Step 3: Implement the four exported functions and types** in `openWindowTraining.ts`. Shot outcome must call the shared resolver, not reproduce geometry rules. Use explicit seed/time inputs and no runtime clocks or `Math.random()`.
- [ ] **Step 4: Run GREEN** for the targeted test; rebuild game-core and run affected existing core tests.
- [ ] **Step 5: Commit** core evaluator and tests.

### Task 2: Curated scene bank and validation

**Files:**
- Create: `packages/game-core/src/openWindowTrainingScenes.ts`
- Create: `packages/game-core/test/openWindowTrainingScenes.test.ts`
- Create: `packages/game-core/scripts/generateOpenWindowScenes.ts`

**Interfaces:**
- Defines `OpenWindowStepKey` as the twelve ordered keys for the stage/step matrix in the spec; exports their metadata for catalog and checks.
- Produces: `getOpenWindowScene(stepKey: OpenWindowStepKey, variant: number): OpenWindowScene` and `validateOpenWindowScene(scene): void`.
- Scene IDs include a bank version, step, and variant. A scene specifies seed, start/end times, teaching intervals, and game-core version, never override coordinates or frequencies.

- [ ] **Step 1: Write failing tests** that every step has a demonstration, practice, and at least five unseen check variants; early-window widths meet 200/160 ms; all entries reproduce at the pinned game-core version; movement spans several traversals; no demonstration/check identity reuse.
- [ ] **Step 2: Run RED** with `pnpm --filter @hockey/game-core exec vitest run test/openWindowTrainingScenes.test.ts`.
- [ ] **Step 3: Implement the generator and committed bank.** Generate candidates with the Task 1 scanner, select valid scenes, and store only seed/time metadata. The runtime validator rejects a stale or non-reproducing bank.
- [ ] **Step 4: Run GREEN** for bank tests and deterministic repeat runs; rebuild core before consumer checks.
- [ ] **Step 5: Commit** bank, generator, and tests.

### Task 3: Server-owned course state and rewards

**Files:**
- Create: `packages/server/db/migrations/166_open_window_training.sql`
- Create: `packages/server/src/duel/training/openWindowCourse.ts`
- Create: `packages/server/src/duel/training/openWindowCourseRoutes.ts`
- Create: `packages/server/test/duel/openWindowCourse.test.ts`
- Modify: `packages/server/src/duel/training/routes.ts`
- Modify: `packages/server/src/duel/training/initialCourseRoutes.ts`

**Interfaces:**
- Produces authenticated `/duel/training/advanced/open-windows/catalog`, `/:stepKey/start`, `/:stepKey/attempt/start`, `/:stepKey/decision`, and `/:stepKey/state` endpoints.
- Decision body contains run ID, attempt token, monotonic decision index, tap input or explicit skip, and scene ID. Response contains actual shot result, opportunity/timing feedback, updated step progress, and any one-time reward.

- [ ] **Step 1: Write failing server tests** for ownership/authentication, start/resume, five-decision check, skip, duplicate/concurrent decisions, stale attempt token, version mismatch, old V2 history preservation, and one-time stage rewards. Confirm a dedicated test DB/Redis before any integration test that resets state.
- [ ] **Step 2: Run RED** with targeted server Vitest in the isolated test environment; record genuine failures and skips separately.
- [ ] **Step 3: Add additive migration and transactional route/service.** Keep V2 tables/history intact; expose the new catalog through the existing training catalog response; abandon old active runs only at an explicit new-course start. Reject client timestamps outside the started scene's wall-clock envelope with normal jitter allowance.
- [ ] **Step 4: Run GREEN** targeted server tests, migration test, typecheck; inspect idempotency and reward transaction paths.
- [ ] **Step 5: Commit** server course and tests.

### Task 4: Web learning flow and feedback

**Files:**
- Create: `packages/web/src/api/openWindowTraining.ts`
- Create: `packages/web/src/components/OpenWindowTrainingPlay.tsx`
- Create: `packages/web/src/components/OpenWindowTrainingPlay.test.tsx`
- Modify: `packages/web/src/components/AdvancedTrainingCourse.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Consumes Task 3 API and Task 1 scene sampling. The play component takes `stepKey`, `onBack`, and `onCatalogRefresh` props.
- `PlayView` receives first-period speed overrides and normal seed/phase sampling; `episodeSampler` and scene slow-motion overrides are absent.

- [ ] **Step 1: Write failing web tests** for twelve ordered step cards, demonstration/practice/check, continuously available shot action, result followed by decision explanation, explicit restart from episode beginning, no “Бросай” cue, skips, progress, duplicate/late network response protection, and mobile copy. Test that beginner route/catalog still render unchanged.
- [ ] **Step 2: Run RED** with direct web Vitest on the new component and affected `DailyScreen` test.
- [ ] **Step 3: Implement API and course UI** with the current design-system modal/card conventions. Demonstrations may pause at marked frames; active movement remains first-period speed. Later steps collect feedback at series end; final step runs two three-minute sessions.
- [ ] **Step 4: Run GREEN** targeted web tests, typecheck, and web build.
- [ ] **Step 5: Commit** web course and tests.

### Task 5: Integration, visual acceptance, and dev release

**Files:**
- Modify only the files from Tasks 1–4 for discovered defects; add focused regression tests before each fix.
- Update the plan/spec only if a newly discovered product requirement changes the agreed behavior.

- [ ] **Step 1: Run relevant complete checks**: game-core build/test, server/web targeted suites, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` where the isolated integration environment permits; report skipped integration tests honestly.
- [ ] **Step 2: Inspect `git diff origin/dev...HEAD`** for unrelated changes, migration safety, old-run behavior, and first-period speed source; request a code review and address concrete findings.
- [ ] **Step 3: Start local app and use the in-app browser** to play each of the four stages on mobile-size layout, verifying active movement against first daily period, feedback sequence, seed replay, and beginner course isolation.
- [ ] **Step 4: Integrate the task branch into `dev`** through the repository's authorized PR/merge path. Wait for the dev workflow's build, migration, recreate, and smoke; verify deployed server/web SHA.
- [ ] **Step 5: Play the deployed advanced course on dev** through the affected flow, verify all requirements and no production mutation, then report exact SHA, checks, browser acceptance, and remaining limits.
