# Bar Achievements Local Preview Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this chat.

**Goal:** Show the agreed bar achievement catalogue locally for beginner and amateur.

**Architecture:** A typed, frontend-local catalogue maps the approved numbered requirements to separate character and online DTOs. The existing achievements screen accepts an optional in-memory data source; normal callers retain API behavior. A DEV-only route provides role, progress and reset controls without touching auth or a real backend.

**Tech Stack:** TypeScript, React, React Query, Vite, Vitest.

**Spec:** docs/superpowers/specs/2026-11-27-bar-achievements-local-design.md

## Global Constraints

- Russian UI; English identifiers and comments. No GLM.
- Base is freshly fetched origin/dev at d7892827; use the isolated task branch.
- Never modify credentials, account records or auth state. No push/deploy.

## Review Focus

- Locked cards must not expose hidden names, game kinds, artwork or rewards.
- Switching role must close stale details and isolate progress.
- All 95 cards and 268 levels must match the reward proposal.
- Claiming must be idempotent and remain local.
- DEV route must not exist in production and mobile lists/modal must fit.

## Task 1: Catalogue and novice redaction

Files: packages/web/src/achievements/barCatalog.ts, barCatalogData.ts, barCatalog.test.ts; packages/web/src/api/achievements.ts.

- [x] Write catalogue tests for 95 unique cards, 268 stages, total rewards 10363, 8 cumulative levels, special conditions and spoiler-free beginner output.
- [x] Run targeted tests and observe RED for the missing catalogue.
- [x] Implement typed catalogue, complete levels and role redaction.
- [x] Run tests and verify GREEN.

## Task 2: Existing UI and local preview

Files: packages/web/src/screens/AchievementsScreen.tsx, packages/web/src/achievements/BarAchievementsPreviewScreen.tsx and test; packages/web/src/app/App.tsx; scoped CSS.

- [x] Write tests for locked card accessibility, bar filtering, opening all levels, role switching and repeated local claim.
- [x] Observe RED before implementation.
- [x] Implement optional data source and bar metadata, reuse current cards and modal, add DEV-only preview.
- [x] Verify tests, web typecheck and relevant existing achievements tests.
- [x] Start Vite locally. Inspect beginner/amateur and a small mobile viewport in the built-in browser. Keep the server running for user review.

## Execution notes

- Implementation stays local and uncommitted until reviewed; do not trigger release workflows.
- The catalogue preview does not claim that real game event accounting is implemented.

## Artwork and descriptions acceptance

- Authored descriptions cover all 54 numbered achievement types, with separate character/online copy where relevant. Full descriptions appear in details; list copy clamps to two lines. Exact level conditions and rewards remain separate.
- All 54 artwork pairs are ready: 45 generated scenes and 9 reused character portraits. Detail WebP is 640px, thumbnail 160px. Total thumbnail bytes: 323124; maximum thumbnail: 8812 bytes. Full images total 3823088 bytes; maximum full image: 99882 bytes. Existing lazy loading and PWA image caching are reused.
- Local verification: 31 tests passed across six achievement/preview suites; web TypeScript and production build passed; scoped ESLint and git diff --check passed. Existing Vite chunk/Browserslist advisories remain. Preview source is absent from production JavaScript.
- Built-in browser verified beginner (25 redacted cards), amateur (all accessible), loaded thumbnail URLs, authored descriptions and four-level pool details at 390px width; no captured console errors. Viewport override was reset.
- This remains a local catalogue preview; no real event accounting, live rewards, push or deployment.

## Follow-up: match hockey achievement details

User requested the existing hockey modal layout. Removed the bar-only all-level table and its CSS: details now reuse the same description, current requirement, progress and reward chips as hockey. Replaced the all-level UI test with single/multi-stage regression coverage; both reproduced duplicated conditions before removal. Verified the updated foul modal in the built-in browser.
