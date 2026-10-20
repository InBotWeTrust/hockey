# Release gameplay polish implementation plan

**Goal:** Preview bonus games without attempts, show marksmanship categories for both duel players in results/history, and keep production exercise/location gates.

**Architecture:** Keep server launch authority. Reuse the existing deployment-target switch for client production gates. Derive duel breakdown from accepted persisted shots using the match scoring snapshot; share the result card with history. Preserve all earlier local UI changes.

**Tech Stack:** React, TypeScript, Fastify, PostgreSQL, Vitest, internal browser.

- [x] Bonus preview: add failing exhausted-attempt regression; enable preview hit area, disable launch using current allowance; preserve active-attempt and purchase/level access behavior.
- [x] Production gates: verify beach-only client/server guards; gate initial/advanced training navigation with development toast, including direct links. Dev keeps exercises available.
- [x] Marksmanship: replay accepted goal classifications with captured rules/input and group primary techniques per participant; expose additive DTO field; render shared breakdown in result/history. Test categories, counts, legacy data and both participants.
- [x] Run targeted tests and typechecks, inspect diffs; demonstrate all changed states in local mobile fixtures in both themes.
- [ ] Await explicit release command. Only then prepare exact-SHA dev/prod releases with production gates and verify runtime/assets separately from authenticated QA.


## Verification
- Web: 113 targeted tests passed (112 component/screen tests plus one production direct-URL regression).
- Server: 12 isolated unit/mocked-route tests passed; no database reset or real account/session mutation.
- Web/server typechecks passed. Web production build passed; nonblocking chunk-size/Browserslist warnings.
- Internal browser at 390x844: result and compact history in both themes; exhausted-attempt preview and record ranking; both production-gated exercise circles.
- Preview data is synthetic. History uses the real compact result card in a QA-only modal wrapper; production history still expands inline.
- Full authenticated database duel and historical-record replay acceptance remain unverified. No dev/prod release performed.
