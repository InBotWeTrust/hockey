# Duel Format Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the approved 25 duel achievement cards with real progress and atomic rewards.

**Architecture:** Extend the existing catalogue/stage/claim lifecycle. A focused module derives feats from accepted shots using existing projectors; a launch-gated, deduplicated SQL tracker retains per-variant wins/streaks and feat peaks. Integrate once at settlement and refresh cached progress on claim.

**Tech Stack:** TypeScript, Fastify, PostgreSQL migrations, Vitest; existing React achievement screen.

**Spec:** docs/superpowers/specs/2026-11-27-duel-format-achievements-design.md

## Global Constraints

- Seven independent variants; Marathon 4/7 are distinct.
- Jeweler is exactly two 2-point goals within one match, not accumulated across games.
- No history import; no engine behavior/auth/production changes.
- Preserve unrelated work and existing catalogue/reward contracts.

## Review Focus

- Concurrent/repeated settlements and duplicate claims never multiply rewards.
- Missing variants keep Universal at zero; a surplus elsewhere cannot compensate.
- Penalties during flights and at final deadline match existing Marathon rules.
- Rhythm board-contact breaks and unqualified short series must not create false recovery.
- Progress retained during pending claims can open future levels without replaying events.

### Task 1: Catalogue and pure observations

**Files:** Create `packages/server/src/achievements/duelFormatCatalog.ts`, `duelFormatObservations.ts`; tests under `packages/server/test/achievements/duelFormats.test.ts`. Extend `catalog.ts`, `stageCatalog.ts`.

**Interfaces:** Export DUEL_FORMAT_DEFINITIONS, DUEL_FORMAT_IDS and `duelFormatKey(kind, rules)`. Export `deriveDuelFormatFeats(input)` returning per-user map achievement ID -> highest fulfilled stage. Inputs are persisted scores, state, shots and rules.

- [x] Write/observe RED for 25 cards/124 levels, corrected thresholds, variant split, same-match Jeweler, scoring win, Marathon miss/penalty cases, Rhythm breaks/tie-break.
- [x] Implement definitions and projections with existing `projectMarathon`, `projectRhythm`, `compareRhythmSeries`; GREEN.

### Task 2: SQL lifecycle and settlement integration

**Files:** Create migration `266_duel_format_achievements.sql`, `duelFormatProgress.ts`, `duelFormatLive.test.ts`; modify `engine.ts`, `claimStage.ts`, `service.ts`.

**Interfaces:** `recordDuelFormatAchievements(client, matchId)` loads trusted records, deduplicates, locks users in sorted order, updates per-variant state and feat totals. `refreshDuelFormatAchievementStages(client,userId,now)` opens/completes stages from retained totals. Pure observation IDs from Task 1 are the only accepted keys.

- [x] Write/observe integration RED for launch cutoff, real engine hook, draws/losses/technical outcomes, variant-isolated streaks, pending reward carry, Universal minima, repeated evaluation/claims and reward balances.
- [x] Add additive migration with seeded cards/stages and launch/events/state/totals tables; implement tracker and claim refresh; GREEN.
- [x] Add RED regression for scored formats incorrectly receiving goal-margin tasks; guard legacy rules to the three goal-count formats; GREEN.

### Task 3: Verification and handoff

- [x] Run game-core build then targeted server SQL suites and catalogue/display/reward regressions; server/web typechecks/builds and scoped ESLint; git diff --check.
- [x] Inspect UI using existing achievement response/layout as needed; do not mutate auth to obtain access.
- [x] Independent whole-diff review; fix concrete findings and rerun affected checks.
- [x] Report local evidence and any existing full-suite baseline failures separately. Prepare exact-scope Russian release-note text only after implementation is complete; do not trigger deploy without its approval.

## Execution ledger

- Task 1 RED: catalogue tests 2 failures (missing cards/levels), observation tests 8 expected undefined-metric failures. GREEN: 2 catalogue and 8 real-projector tests passed.
- Ruling: store actual numeric per-match peaks, not stage ranks. All requested special conditions have monotonic thresholds, so this preserves single-game provenance while displaying meaningful progress (goals/techniques) through the existing DTO.
- Task 2 RED: seven live SQL tests failed on missing cards/progress and reproduced old one-goal achievement incorrectly awarded in Sniper. Added migration and transaction integration; verification in progress.
- User additionally authorized new illustrations and descriptions. Artwork-only worker owns new asset directories/manifest/ID mapping; root owns server behavior. Existing image preparation budgets/cache strategy will be reused.

- Final fresh SQL verification: 214 tests passed across 8 files; pure catalogue/observation/display checks 32 passed. UI checks 32 passed, server/web builds and scoped lint passed.
- Whole server sweep: 2836 passed, 87 skipped; 8 new-test failures came from the pre-review Vite module snapshot and all pass in fresh final runs. Remaining 23 failures in chat/service.test.ts, duel/openWindowCourse.test.ts and bar/memoryPersistence.test.ts independently reproduced on clean HEAD 9b36406 extracted under /private/tmp; unrelated changes preserved.
- Review fixes: fully completed window_end settlements count while any forfeit remains excluded; all supported legacy Sniper labels count toward Arsenal; shots beyond Marathon period are ignored exactly like its projector. RED observed and GREEN confirmed for each fix.
- Artwork complete: 25 distinct built-in image_gen originals, 25 full WebP and 25 thumbnails; all dimensions/budgets verified. Combined full2,062,924bytes and thumbnails149,296bytes, no runtime preload/cache changes.
- One-time hockey tasks now hide artificial level1/1 while preserving actual goal progress. Added observed RED/GREEN UI regression.
