# Marksmanship V6 Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify new «Меткость» goals with continuous V6 ranges, including «Сложный» at 1.3 points, without rewriting V5 attempts.

**Architecture:** Keep the V5 classifier immutable and add a pure V6 classifier over the same measured shot geometry. Dispatch by the scoring version stored in each attempt snapshot; serialize V6 separately, then switch only future catalog definitions. The web client renders server-confirmed V6 results and uses the shared classifier for hypothetical/replayed V6 descriptions.

**Tech Stack:** TypeScript, pnpm, Vitest, Fastify/PostgreSQL, React/Pixi.

**Spec:** `docs/superpowers/specs/2026-09-27-marksmanship-v6-scoring-design.md`

## Global Constraints

- Only new «Меткость» attempts use `scoring.version = 6`; saved/active V5 attempts and their awarded points remain V5.
- Goal/save/miss physics, scene clocks, shot pauses, other game modes, saved rewards and historic scores do not change.
- All distances use unrounded logical hitboxes at goalie-intersection and goal-plane times; classify the gap on the puck's side.
- V6 priority and points: `super_precise 20 > edge 18 > corner 17 > behind_goalie 16 > precise 14 > complex 13 > counter_direction 13 > near_goalie 12 > ordinary 10` (tenths); `complex` wins the equal-point tie with `counter_direction`, though their geometries do not overlap.
- The inner ranges are `(0,10]`, `(10,60]`, `(60,79.8]`; external proximity is `(0,75]`, including fractional gaps below 1.
- Rink width is 572; goal-edge corner intervals are left 55–105 / right 467–517 with inner gap 6–60; goalie-edge intervals are left 36.7–86.7 / right 485.3–535.3 with inner gap 6–50.
- Future catalog targets use the existing ten duration/percentage controls and floor fractional points; no existing attempt snapshots are updated.
- UI copy is Russian; identifiers/comments/commits are English. No push, merge, PR or deployment without a new user instruction.

## Review Focus

- An external gap of 0.5 must receive `counter_direction` or `near_goalie`, not `ordinary` (Task 1 boundary test).
- At inner gap 10 and 60, higher-priority categories win consistently on both sides (Task 1 boundary test).
- A saved V5 attempt at core version 65 must finish under V5 after V6 is introduced, without a silent score change (Task 2 compatibility test).
- A replay's stored goal/save/miss must remain recorded truth while its V6 situation is clearly hypothetical (Task 4 replay test).
- Updating a catalog row must affect future definitions only; old attempt snapshots and rewards stay byte-for-byte unchanged (Task 3 migration test).

---

## File Map

- `packages/game-core/src/marksmanshipV6.ts`: V6 measurements alias, technique/score types and pure classifier; V5 file stays unchanged.
- `packages/game-core/src/marksmanship.ts`, `src/index.ts`, `src/version.ts`: version-6 rule parsing, shared shot classification, exports and core version bump.
- `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`, `service.ts`: V6 score-detail serialization and support for active core-65 snapshots.
- `packages/server/db/migrations/162_marksmanship_scoring_v6.sql`: future-game V6 rules, copy and calibrated targets, guarded to currently-V5 rows.
- `packages/web/src/api/bonusGames.ts`, `src/game/bonusGameQualification.ts`, `src/screens/BonusGamePlayScreen.tsx`: V6 DTO, client preview and confirmed result copy.
- `packages/web/src/screens/marksmanshipSituation.ts`, `MarksmanshipConstructorScreen.tsx`, `MarksmanshipRecordedReplay.tsx`: V6 explanations, filters and replay labeling. Keep V5 explanation for existing saved V5 details.

### Task 1: Pure V6 rules and versioned game-core dispatch

**Files:** Create `packages/game-core/src/marksmanshipV6.ts`, `packages/game-core/test/marksmanshipV6.test.ts`; modify `packages/game-core/src/marksmanship.ts`, `src/index.ts`, `src/version.ts`, `test/version.test.ts`, `test/marksmanship.test.ts`.

**Interfaces:** `type MarksmanshipV6Measurements = MarksmanshipV5Measurements`; `classifyMarksmanshipV6Score(m: MarksmanshipV6Measurements): MarksmanshipV6Score`; `DEFAULT_MARKSMANSHIP_V6_SCORING_RULES` with `version: 6`; `MarksmanshipShotClassification.v6Score/v6Measurements` mirror V5 nullable shapes. V5 names and results are unchanged.

- [ ] Write table-driven V6 tests with literal coordinates for both puck sides and directions: super ≤10, edge distance ≤6 with gap >10, precise through 60, complex above 60 through 79.8, external `(0,75]` counter/near, >75 ordinary, mirrored corner windows, behind-goalie side/direction, priority ties, save/miss zero and deterministic repeated calls. Include outer gap 0.5 and exact inner 10/60. Name the wrong branch each test catches.
- [ ] Run `pnpm --filter @hockey/game-core exec vitest run test/marksmanshipV6.test.ts test/marksmanship.test.ts test/version.test.ts`; record expected RED from missing V6 exports/behavior, not a setup error.
- [ ] Implement the V6 classifier and version-6 dispatch in `parseMarksmanshipScoringRules`, `resolveMarksmanshipShotContext` and `classifyMarksmanshipShot`; retain V5 branches exactly. Bump `GAME_CORE_VERSION` from 65 to 66; export V6 types/constants/functions. Keep measured goalie/goal times and goal physics unchanged.
- [ ] Run the same targeted command for GREEN; then run `pnpm --filter @hockey/game-core test` and `pnpm --filter @hockey/game-core build`. Commit only Task 1 files.

### Task 2: Server-authoritative V6 and active V5 compatibility

**Files:** Modify `packages/server/src/bonusGames/marksmanshipScoreDetails.ts`, `service.ts`, `test/bonusGames/marksmanshipScoreDetails.test.ts`, `test/bonusGames/shots.test.ts`.

**Interfaces:** `MarksmanshipScoreDetails` adds a `version: 6` arm with V6 technique, measurements, available techniques, points in tenths and result. `toMarksmanshipScoreDetails(classification, scoring)` selects that arm only for `scoring.version === 6`; `supportsBonusGameCoreVersion(65)` remains true for active saved attempts.

- [ ] Add failing unit tests for a V6 goal, a V6 miss worth zero, V5 score-detail preservation, and core version 65 support. Add integration tests proving a V6 shot persists one selected technique exactly once and a pre-existing V5-snapshot/core-65 attempt continues with V5 scoring.
- [ ] Run `pnpm --filter @hockey/server exec vitest run test/bonusGames/marksmanshipScoreDetails.test.ts`; run `shots.test.ts` only after confirming its `TEST_DATABASE_URL`/`TEST_REDIS_URL` are isolated test targets without printing secrets. Record RED; if integration setup is unavailable, mark it blocked rather than passed.
- [ ] Add the V6 detail arm and dispatch; extend the supported legacy-version list to include 65 without allowing an unsupported snapshot to be evaluated by V6. Keep existing 409/duplicate-shot behavior and stored historical rows unchanged.
- [ ] Repeat the targeted tests for GREEN and run `pnpm --filter @hockey/server test` only with safe dedicated integration targets. Commit only Task 2 files; report skipped integration coverage separately.

### Task 3: Future catalog targets and guarded V6 migration

**Files:** Create `packages/game-core/test/marksmanshipV6Targets.test.ts`, `packages/server/db/migrations/162_marksmanship_scoring_v6.sql`; modify `packages/server/test/bonusGames/catalog.test.ts` or the existing migration test that asserts catalog definitions.

**Interfaces:** The ten target points are integer tenths, computed as `max(10, floor(medianTenths * existingRatio / 10) * 10)` from the existing 30 seeds, durations, 10-ms scan, flight and pause controls. The migration updates only the ten known `bonus_game` rows whose current scoring version is 5; it never updates `bonus_game_attempt` or `shot_session`.

- [ ] Copy the V5 calibration *method* into a V6-specific test, switching to the V6 classifier and keeping literal duration/ratio/seed inputs; run once to obtain and record the ten exact outputs and compare them to V5's `[90,170,250,340,440,550,670,790,930,1070]`. Assert strictly increasing targets, multiples of ten, and at least half the control runs reaching each target. Do not infer targets from only the two replay fixtures.
- [ ] Before writing SQL, add a failing catalog/migration test asserting the exact V6 ten-target array, `scoring.version = 6`, future-only row update, idempotent second run and unchanged active-attempt snapshots. Confirm RED on the existing V5 catalog.
- [ ] Add `162_marksmanship_scoring_v6.sql` with the calibrated literal target array, V6 rules, preview copy naming all nine techniques, revision increment and `WHERE ... scoring.version = '5'`. No update to attempt/shot rows. Run the targeted migration/catalog test for GREEN and V6 target test after checking its database is an isolated test target; commit only Task 3 files.

### Task 4: Client presentation and the two recorded comparisons

**Files:** Modify `packages/web/src/api/bonusGames.ts`, `src/game/bonusGameQualification.ts`, `src/screens/BonusGamePlayScreen.tsx`, `src/screens/marksmanshipSituation.ts`, `src/screens/MarksmanshipConstructorScreen.tsx`, `src/screens/MarksmanshipRecordedReplay.tsx` and their adjacent `*.test.ts(x)` files.

**Interfaces:** Add `MARKSMANSHIP_V6_NAMES` and `describeMarksmanshipV6Situation(measurements)`; V5 helpers remain available for saved V5 detail. Recorded replay displays `Оценка V6` and recomputes only situation/points, not saved result. Constructor's tutorial uses `DEFAULT_MARKSMANSHIP_V6_SCORING_RULES` and exposes `complex` in the filter.

- [ ] Write failing web tests: V6 detail/points on the game result, V5 detail unchanged, `complex` filter and reason text, goal №7 Dmitry `ordinary 10 → complex 13`, replay fixtures' unchanged 78/79 goal outcomes, and golden V6 totals Egor 936 / Dmitry 943 tenths (corrected from the preliminary offline estimate after running the classifier). Test that the replay calls the new label a V6 estimate rather than a historic award.
- [ ] Run targeted direct Vitest files: `pnpm --filter @hockey/web exec vitest run src/screens/marksmanshipSituation.test.ts src/screens/MarksmanshipRecordedReplay.test.tsx src/screens/MarksmanshipConstructorScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx src/game/bonusGameQualification.test.ts`; confirm expected RED.
- [ ] Add V6 DTO and client qualification branch, preserve V5 DTO/display branch, wire the pure classifier into new explanations and recorded replay, and add `complex` name, filter and result copy. Do not alter playback clocks, recorded shots, or rink hitboxes.
- [ ] Repeat the targeted command for GREEN and run `pnpm --filter @hockey/web test`; commit only Task 4 files.

### Final verification and review gate

- [ ] From the task branch, run `pnpm --filter @hockey/game-core build` before consumer checks, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` with a verified isolated server test environment. Record PASS, FAIL, SKIP and BLOCKED separately; do not call a skipped integration test green.
- [ ] Review `git diff origin/dev...HEAD` and `git diff --check`; verify only V6-scoring files changed, no credentials or historical-data rewrites, and old V5 cases still match their golden values.
- [ ] Browser-check local constructor and new-game result at a mobile viewport, including category filter, goal №7 replay and exact V6 label. This is local rendered acceptance, not dev acceptance.
- [ ] Present the two games' final category transitions and points, ten old→new targets, active-session compatibility evidence, and remaining gaps. Stop before push, PR, merge or deployment unless the user gives a separate instruction.
