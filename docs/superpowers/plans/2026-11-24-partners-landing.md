# Partners landing implementation plan

> Execution: implement directly in this chat. No delegation, per user project instructions.

**Goal:** Build the approved /partners presentation with honest temporary media and the separate /try demo address.
**Architecture:** Static Vite HTML entry with isolated CSS and a small DOM module; existing React demo route reused by alias.
**Tech stack:** HTML, CSS, TypeScript, Vite, Vitest/jsdom.
**Spec:** ../specs/2026-11-24-partners-landing-design.md

## Constraints and review focus
- Preserve unrelated checkout edits; task branch feature/partners-landing starts at d7892827946db4698a1f7e95e9897b408a1f66f1.
- Missing media is visibly pending; configuration must support real video and accessible image enlargement later.
- Only source tags, not arbitrary URL parameters, reach the game. No analytics receiver is introduced.
- /partners must work without auth, game imports, JavaScript-dependent prose, or existing PWA fallback interference.
- /try and /demo stay public; no onboarding or gameplay behavior changes.
- Test 360px, tablet and desktop, reduced motion and keyboard access. No publication.

## Tasks
- [x] Baseline: run App, demoSession and pwaCachePolicy suites (32 tests passed; existing React act warnings).
- [x] RED: add tests for /try public entry, optional media/UTM interactions and excluding the landing entry from critical game precache. Observe failures.
- [x] GREEN: implement isolated HTML/CSS/media module, /try alias and Vite/nginx/PWA boundaries. Generate optimized derivatives from existing art.
- [x] Verify: targeted suites, web typecheck/build, changed-source lint, diff review and built-page browser acceptance.
- [x] Record remaining acceptance gaps and media replacement instructions; leave branch local with no deployment.

## Execution ledger

- /try alias, PWA boundaries and missing-media state verified through RED then GREEN. BottomNav /try regression was observed RED before fixing its demo exclusions.
- Browser checks found video aspect-ratio overflow at 768px; explicit max-width/width fixed it. Verified at 360, 768 and 1355px. /try opened the real demo and accepted a shot.
- Built manifest exposed HTML-facade entries in Rollup; added the realistic RED test and excluded both HTML and TS landing facades from critical precache. Verify actual generated service worker after rebuilding.
- Relevant tests passed 105/105 before the additional HTML-facade regression. Final rerun required below.
- Full web build/typecheck, touched new-source lint and constructor build gate passed. Existing React act and Browserslist-age warnings are present; no dependencies were updated.
- Baseline d7892827 was built separately from copied original source with no checkout edits. Its performance-budget gate fails at 239564 JS gzip bytes and 83928 CSS gzip bytes; current game entry is about 308 gzip bytes larger due to multi-entry/shared polyfill and the demo alias. This pre-existing application budget issue is outside the landing task.
- CI/dev/prod and physical embedded-browser acceptance are not claimed. Video playback and final screenshot quality remain pending user-provided files. Static OG metadata and dimensions verified locally; messenger-unfurl acceptance remains pending publication.
- Ruling: prepare a draft PR to dev per repository Git policy; feature-branch push and PR do not trigger the checked deploy workflows. No merge, dev push, production push, release-note edit or workflow dispatch is authorized.

Final: 106/106 targeted tests passed. Final build confirmed no partners assets in game precache. Original app performance budget failure remains documented above.
