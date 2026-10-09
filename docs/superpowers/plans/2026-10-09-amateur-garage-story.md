# Amateur garage story implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement remaining steps inline. Do not regenerate accepted assets or introduce delegation, except the explicitly required humanizer blind text check.

**Goal:** Extend episode two with a garage visit and gifts, then let the equipped adult player enter an indoor amateur rink.

**Architecture:** Keep all nine scenes in amateurStory.ts, shared by required onboarding and profile replay. Reuse decoded current/next-scene loading and versioned WebP caching. Gift narration does not change backend inventory issuance.

**Tech Stack:** React, TypeScript, Vitest, Sharp WebP encoding, built-in image generation.

**Spec:** User-approved garage/form/equipment/rink scope; artwork invariants and source references are recorded in docs/artwork/amateur-story/README.md.

## Constraints

- Local preview only; deployment remains a separate action.
- Mature adult player identity from the approved reference sheet; Arsenich from approved first-series portrait.
- Portrait 941x1672 WebP; no crop/stretch; quality 82, effort 6; each file below 400 KiB.
- Red-blue-white kit and red helmet after garage. Wrapped stick, closed skate box, plain energy packaging.
- Preserve approved Russian wording; dialogue uses en dash. Player white, Arsenich blue.
- At least two frames per new scene; last scene has closed/open/entry frames.
- No auth/account/progress mutations or new backend grant logic.

## Review focus

- Nine-screen sequence shared by required flow and profile replay: AmateurStoryIntegration.test.tsx.
- New scene starts with frame A; timing reset and gate cues: AmateurStoryFlow.test.tsx.
- Assets decode, retain portrait proportions and size budget: onboardingAssets.test.ts.
- Current/next preparation is deduplicated, retryable and versioned: storyImages.test.ts.
- Long copy on 320px viewport and actual anatomy/gate continuity: rendered local browser review; unit tests cannot establish these visual properties.

## Task 1. Narrative and scene sequence

Files: packages/web/src/onboarding/amateurStory.ts and AmateurStoryFlow.test.tsx.

- [x] Add garage-trip, uniform-gift and equipment-gift after professional-arena; retain last stadium/invitation screens.
- [x] Observe missing-scene regression RED, implement scene data, then verify GREEN.
- [x] Keep threshold dynamic and equipment description independent of item models or rarity.

## Task 2. Artwork and cache versions

Files: packages/web/public/onboarding/amateur/; docs/artwork/amateur-story/assets.json; packages/web/src/onboarding/storyImageVersions.ts; onboardingAssets.test.ts.

- [x] Generate and inspect pairs 07, 08, 09 using approved identities and style.
- [x] Replace 05 pair and 06 triple with indoor rink and equipped player.
- [x] Encode without geometry changes; update manifests and content hashes.
- [x] Verify all 20 files and hashes; total 3,841,452 bytes. Each frame passes decode/dimension/size tests.

## Task 3. Text audit

Files: docs/artwork/amateur-story/copy.md and copy-review.md; edit amateurStory.ts only for supported findings.

- [x] Read humanizer patterns and corrections, audit exact current copy before editing.
- [x] Export all nine scenes and button labels for user review.
- [x] Run humanizer lint; assess warnings in dialogue context.
- [x] Run blind text review with only final copy and pattern reference; fix supported findings and repeat lint.

## Task 4. Local acceptance

- [x] Run targeted flows, integration, assets and cache tests: 72 tests pass.
- [x] Run web build (includes TypeScript), scoped ESLint and git diff --check: pass.
- [x] Review new scenes at 320x568 and 390x844; confirm closed gate on entry, same gate across frames and full stick.
- [x] Recheck copy after text audit; open local series at first scene for user review.

Implementation checkpoint: a1acdd4a. Automatic equipment issuance at promotion remains unverified; no grant mutations included.
