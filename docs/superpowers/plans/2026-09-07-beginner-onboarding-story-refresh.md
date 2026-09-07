# Beginner Onboarding Story Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the beginner onboarding with the approved eight-scene story, one authoritative empty-goal shot, conditional Goal/Miss result copy, and 800x800 WebP artwork, then run it locally for acceptance.

**Architecture:** Keep seven narrative screens as normal admin-managed informational steps. Keep the conditional Goal/Miss screen inside the single tutorial step so only one database step is required and completion evidence remains unambiguous. Add a deterministic empty-goal resolver to shared game-core, make the tutorial server accept exactly one shot, and let the web tutorial show the matching local result artwork after the authoritative response.

**Tech Stack:** TypeScript, React 18, PixiJS 8, Fastify, PostgreSQL, Vitest, Sharp, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-02-player-onboarding-design.md`

## Global Constraints

- Beginner onboarding cannot be skipped or closed; reopening an incomplete run restarts the visible flow from step one.
- The tutorial contains exactly one shot into moving empty goals and yields only `goal` or `miss`.
- All approved beginner artwork is WebP at exactly 800x800 pixels.
- Existing amateur onboarding content remains unchanged.
- Work is local only: no push, dev deployment, or production deployment.

---

### Task 1: Approved artwork pipeline

**Files:**
- Modify: `packages/web/public/onboarding/reference/beginner-*.webp`
- Modify: `packages/web/src/onboarding/onboardingAssets.test.ts`

**Interfaces:**
- Consumes: approved PNG files from the current Codex image-generation session.
- Produces: nine named 800x800 WebP assets used by seed content and tutorial result rendering.

- [ ] Write an asset test that expects each beginner story asset to decode as 800x800 WebP while preserving 1200x1200 expectations for amateur assets.
- [ ] Run the asset test and verify it fails on the current files/missing new result files.
- [ ] Convert the approved PNG files with Sharp to 800x800 WebP and stable semantic filenames.
- [ ] Run the asset test and verify it passes.

### Task 2: One deterministic empty-goal shot

**Files:**
- Modify: `packages/game-core/src/shot/resolve.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/src/version.ts`
- Modify: `packages/game-core/test/version.test.ts`
- Create or modify: `packages/game-core/test/shot/resolve-empty-goal.test.ts`
- Modify: `packages/server/src/onboarding/service.ts`
- Modify: `packages/server/src/onboarding/routes.ts`
- Modify: `packages/server/test/onboarding/routes.test.ts`

**Interfaces:**
- Produces: `resolveEmptyGoalShot(input, goalieConfig, seed, shotIndex, phaseOffsets): 'goal' | 'miss'` and a tutorial API that accepts only shot index 1 and persists its authoritative result.

- [ ] Write failing game-core tests proving the resolver can return only goal/miss and follows the moving goal opening.
- [ ] Run the focused game-core tests and verify the expected failure.
- [ ] Implement and export the resolver; bump `GAME_CORE_VERSION` and update its contract test.
- [ ] Run game-core build/tests and verify green.
- [ ] Write failing server tests for one-shot completion, resume result, second-shot rejection, and completion after either goal or miss.
- [ ] Run focused server tests and verify the expected failures.
- [ ] Implement the server state/API changes and completion evidence rule.
- [ ] Build game-core, run focused server tests, and verify green.

### Task 3: Tutorial result experience and story seed

**Files:**
- Modify: `packages/web/src/api/onboarding.ts`
- Modify: `packages/web/src/onboarding/TutorialShotStep.tsx`
- Modify: `packages/web/src/onboarding/TutorialShotStep.test.tsx`
- Modify: `packages/web/src/onboarding/OnboardingFlow.tsx`
- Modify: `packages/web/src/onboarding/OnboardingFlow.test.tsx`
- Modify: `packages/web/src/onboarding/onboarding.css`
- Modify: `packages/server/src/onboarding/seedDevContent.ts`
- Modify: `packages/server/src/onboarding/seedDevContentCli.ts`
- Modify: `packages/server/test/onboarding/seedDevContent.test.ts`

**Interfaces:**
- Consumes: tutorial API authoritative `result: 'goal' | 'miss' | null` and semantic 800x800 assets.
- Produces: automatic transition from one shot to the matching result card, then navigation to the shared story; explicit `replaceBeginner` seed option for local publication.

- [ ] Write failing web tests for hidden goalie, one allowed shot, automatic Goal/Miss result card, result persistence across Back, and no manual tutorial Next button before a result.
- [ ] Run focused web tests and verify the expected failures.
- [ ] Implement the tutorial UI and minimal PlayView support for hiding the goalie/result modal.
- [ ] Run focused web tests and verify green.
- [ ] Write failing seed tests for the approved Russian copy, eight-step ordering, 800x800 beginner assets, and explicit beginner replacement without touching amateur.
- [ ] Run focused seed tests and verify the expected failures.
- [ ] Implement the new beginner seed content and guarded replacement option.
- [ ] Run focused seed tests and verify green.

### Task 4: Local integration and acceptance runtime

**Files:**
- Verify only; no deployment files.

**Interfaces:**
- Produces: local server and web runtime URLs plus a testable beginner onboarding run.

- [ ] Run typecheck, lint, focused onboarding suites, and production builds.
- [ ] Apply local migrations and publish the replacement beginner chain into the local database only.
- [ ] Reset only the selected local test user's beginner onboarding completion flag if needed for acceptance.
- [ ] Start local server and web processes and verify health plus the rendered onboarding route.
- [ ] Report exact local URLs, test result, and any local account prerequisite without pushing or deploying.
