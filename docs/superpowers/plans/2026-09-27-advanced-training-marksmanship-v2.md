# Marksmanship-Based Advanced Training V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight advanced drills with deterministic, two-sided instruction and assessment for the eight non-ordinary Marksmanship V6 categories.

**Architecture:** A committed scenario bank contains independently validated engine moments for demonstration, practice, and assessment. A versioned server run owns side-specific progress and recomputes every user shot; the client only renders the scene, countdown, feedback, and transitions. V1 rows remain historical and V2 rewards are independently idempotent.

**Tech Stack:** TypeScript, `@hockey/game-core`, Fastify/PostgreSQL, React/Pixi, Vitest, pnpm.

**Spec:** [2026-09-27-advanced-training-marksmanship-v2-design.md](../specs/2026-09-27-advanced-training-marksmanship-v2-design.md)

## Global Constraints

- Eight exercises: `near_goalie`, `counter_direction`, `complex`, `precise`, `behind_goalie`, `corner`, `edge`, `super_precise`; no ninth intentional-miss drill and no change to Marksmanship/duel scoring.
- Four complete player edge-to-edge traversals precede the validated target tap. Practice displays `4–3–2–1` and `Бросай`; assessment displays neither.
- Practice requires one V6-primary-category goal per side; assessment requires two per side; attempts are unlimited and wrong shots do not erase successes.
- V2 completion grants one star and one experience once per exercise; V1 history and rewards remain untouched. Production deployment is out of scope.
- Keep game-core deterministic and server-authoritative, version active sessions, use Russian UI copy, and preserve existing authentication and gameplay locks.

## Review Focus

1. A V1 completion with the same exercise name must leave the V2 catalog at 0/8 (Task 2 test).
2. Duplicate or delayed shot responses must not duplicate a success/reward or roll back a newer scene (Tasks 3 and 5 tests).
3. A goal satisfying the target only as a secondary `availableTechnique` must fail the V2 assessment (Tasks 1 and 3 tests).
4. No tap through the target plus one traversal must replay without a recorded shot or lost progress (Task 5 test).
5. A tab reload, reduced motion, or narrow mobile viewport must not expose assessment hints or desynchronize the attempt (Task 5 tests/browser acceptance).

---

### Task 1: Pure V2 scenario bank and scoring contract

**Files:** Create `packages/game-core/src/advancedTrainingV2.ts`, `packages/game-core/src/advancedTrainingV2Scenarios.ts`, `packages/game-core/test/advancedTrainingV2.test.ts`, `scripts/generate-advanced-training-v2-scenarios.ts`; modify `packages/game-core/src/index.ts`. Change `packages/game-core/src/version.ts` and its test only if existing deterministic game behavior actually changes.

**Interfaces:** Export `AdvancedTrainingV2Technique = Exclude<MarksmanshipV6Technique, 'ordinary'>`, `AdvancedTrainingV2Side = 'left' | 'right'`, `AdvancedTrainingV2Stage = 'demonstration' | 'practice' | 'assessment'`, `AdvancedTrainingV2Scenario` (id, technique, side, stage, sessionSeed, shotSeed, shotIndex, goalieId, speed snapshot, sceneStartMs, targetTapTimeMs, gameCoreVersion), `getAdvancedTrainingV2Scenario(technique, side, stage, ordinal): AdvancedTrainingV2Scenario`, and `evaluateAdvancedTrainingV2Shot(scenario, input: ShotInput): { result: ShotResult; actualTechnique: MarksmanshipV6Technique | null; actualSide: AdvancedTrainingV2Side | null; success: boolean; measurements: MarksmanshipV6Measurements | null }`.

- [ ] Write tests proving every committed scenario is a real goal with its required **primary** V6 technique and side; each side has ≥1 demonstration, ≥1 practice, ≥2 distinct assessment scenes; assessment IDs differ from demonstrations; `sceneStartMs` precedes target by four full player traversals; a secondary-only technique fails evaluation.
- [ ] Run `pnpm --filter @hockey/game-core exec vitest run test/advancedTrainingV2.test.ts` and record RED.
- [ ] Implement deterministic offline scenario search using game-core primitives and commit its output as the bank; no runtime random search, forced hit point, or browser-only calculation. Pin the speed/goalie snapshot and a V2 bank version; fail validation when engine version or classification changes. Do not bump the global `GAME_CORE_VERSION` merely for additive V2 APIs; bump it and update its test if existing deterministic outputs change.
- [ ] Run the targeted core test, `pnpm --filter @hockey/game-core build`, and `pnpm --filter @hockey/game-core test`; expect GREEN. Commit the core/bank task.

### Task 2: Versioned catalog and run lifecycle

**Files:** Create `packages/server/db/migrations/164_advanced_training_v2.sql`, `packages/server/src/duel/training/advancedCourseV2.ts`, `packages/server/src/duel/training/advancedCourseV2Routes.ts`, `packages/server/test/duel/advancedCourseV2.test.ts`; modify `packages/server/src/app.ts`, `packages/server/src/duel/training/initialCourseRoutes.ts` for catalog selection only.

**Interfaces:** V2 endpoint prefix `/duel/training/advanced/v2/:exerciseKey`; `GET/POST` contracts use `run_id`, `stage`, `side`, `side_successes`, `shot_index`, `scenario_id`, server time and pinned scene snapshot. `fetchAdvancedTrainingV2Completions(db, userId): Promise<Set<AdvancedTrainingV2Technique>>` reads only V2 completions. V2 tables are separate from V1 and uniquely constrain one active V2 run per user and one shot per `(run_id, shot_index)`.

- [ ] Add failing catalog/start/resume tests: V1 completion does not complete V2; new catalog shows 0/8; start picks left practice; reload returns same stage/side/scenario; starting V2 abandons (does not delete) a V1 active run; unauthorized/locked access is rejected.
- [ ] Run `pnpm --filter @hockey/server exec vitest run test/duel/advancedCourseV2.test.ts`; require an isolated `TEST_DATABASE_URL` and `TEST_REDIS_URL`, and record RED rather than counting a skip.
- [ ] Add additive migration and V2 endpoints/state query; keep old tables and routes readable. Derive the selected scenario deterministically from run seed, stage, side, and attempt ordinal, and reject stale engine-version runs with a clear restart path.
- [ ] Run targeted integration tests and `pnpm --filter @hockey/server typecheck`; expect GREEN. Commit the persistence/lifecycle task.

### Task 3: Server shot evaluation, side progression, and rewards

**Files:** Modify `packages/server/src/duel/training/advancedCourseV2Routes.ts`, `packages/server/test/duel/advancedCourseV2.test.ts`; create `packages/server/src/duel/training/advancedCourseV2Feedback.ts` for result copy/data mapping if route size warrants it.

**Interfaces:** `POST .../shot` accepts `run_id`, `shot_index`, `scenario_id`, `tapTime`, optional `shooterTapTime`, and claimed visual result; returns authoritative result, actual V6 technique/side, reason measurements, feedback code, updated per-side successes, and next scenario. `POST .../assessment/start` requires one success on each practice side. The server accepts only a goal with target primary technique and target side.

- [ ] Add failing tests for goal/side progression (practice 1+1, assessment 2+2), miss, save, wrong primary category, earlier/later valid tap, duplicate submit, concurrent submit, repeated reward, and a late prior response. Assert reward balances change by exactly 1 star and 1 experience only after the first V2 completion.
- [ ] Run the targeted integration suite and record RED.
- [ ] Implement server recomputation with `evaluateAdvancedTrainingV2Shot`, locked/idempotent shot persistence, monotonic progress, and a versioned reward event key. Do not use the client's claimed category/result as authority.
- [ ] Run targeted integration tests and server typecheck; expect GREEN. Commit the assessment/reward task.

### Task 4: True two-sided demonstration

**Files:** Modify `packages/web/src/components/AdvancedTrainingPlay.tsx`, `packages/web/src/components/AdvancedTrainingPlay.test.tsx`; create `packages/web/src/components/AdvancedTrainingV2Explanation.tsx`; modify `packages/web/src/api/advancedTraining.ts` for V2 DTOs.

**Interfaces:** The demonstration receives `AdvancedTrainingV2Scenario` and uses the shared court resolver plus its validated shot time. `AdvancedTrainingV2Explanation` receives the V6 measurements, technique, side, tap time, and impact time; it displays category name, relevant gap/direction, and the distinct click/impact moments.

- [ ] Add failing tests for actual (not injected) result, left/right explanation, replay button, pause at impact, no persisted demo shot, and no false category when scenario validation fails.
- [ ] Run `pnpm --filter @hockey/web exec vitest run src/components/AdvancedTrainingPlay.test.tsx` and record RED.
- [ ] Replace `demonstrationResult` and the heuristic 20-second search with a scene driven by the validated bank; show exact impact geometry and tap instruction. Preserve Pixi asset loading and modal conventions.
- [ ] Run the targeted web test and web typecheck; expect GREEN. Commit the demonstration task.

### Task 5: Guided practice and unprompted assessment

**Files:** Modify `packages/web/src/components/AdvancedTrainingPlay.tsx`, `packages/web/src/components/AdvancedTrainingCourse.tsx`, `packages/web/src/api/advancedTraining.ts`, their existing tests, and focused styles in `packages/web/src/app/design-system.css`; create `packages/web/src/components/advancedTrainingV2Timing.ts` with its test.

**Interfaces:** `getAdvancedTrainingV2Cue(scenario, sceneMs, stage): { traversal: 4 | 3 | 2 | 1 | null; shootNow: boolean; expired: boolean }` maps actual shooter turnarounds to practice-only cues; `expired` becomes true one full traversal after target. Server state, not local optimistic count, determines current side and successes.

- [ ] Add failing timing/UI tests for four edge-to-edge passes, tap-time `Бросай` cue, no assessment hints, missed-window replay without a shot, wrong-category feedback, explicit «Теперь попробуй справа» side transition, reload/reconnect, delayed old response, reduced motion, and completed V1 vs uncompleted V2 catalog state.
- [ ] Run direct targeted web Vitest files and record RED.
- [ ] Implement cue overlay, result feedback, per-side progress, scene rebase after result/timeout, and side-transition modal. Keep shot controls usable at narrow widths; an error repeats the same side without erasing successes.
- [ ] Run targeted web tests, `pnpm --filter @hockey/web typecheck`, and `pnpm --filter @hockey/web build`; expect GREEN. Commit the UI task.

### Task 6: End-to-end verification and handoff

**Files:** Modify tests only where an acceptance gap is found; update `docs/superpowers/specs/2026-09-27-advanced-training-marksmanship-v2-design.md` only if an approved decision changed.

- [ ] Rebuild core and run core/server/web targeted suites serially against dedicated test DB/Redis; run `pnpm typecheck`, `pnpm lint`, `pnpm build`, and relevant full suites. Record PASS, FAIL, SKIP, and BLOCKED separately.
- [ ] Browser-check the actual advanced course on desktop and narrow mobile: each stage, both sides, no-shot reset, wrong-category explanation, resume, and once-only reward. Treat a demo-mode smoke test as insufficient for authenticated flow acceptance.
- [ ] Review `git diff --check`, migrations, changed-file scope, game-core/bank version compatibility, and the complete branch diff; obtain an independent review before release integration.
- [ ] Report local checks, CI, browser acceptance, and deployment as separate facts. Do not merge or deploy to production; any dev deployment follows separate user authorization and `docs/engineering/release.md`.
