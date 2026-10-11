# Universal Liquid Glass Implementation Plan

> Execution: inline in this chat, as authorized by the user. Preserve the original checkout.

**Goal:** Apply the approved neutral scoreboard glass material throughout Ultimate Hockey.

**Architecture:** Shared CSS material tokens define transparent chrome, denser content surfaces, and modal glass. Existing layout, assets, state, and actions remain unchanged. Migrate local CSS and inline styles to consume the same tokens rather than overriding them with blue or milky fills.

**Tech Stack:** React, CSS custom properties, Vite, Vitest, Playwright.

**Spec:** Approved in-chat mockups `liquid-glass.html`, `liquid-glass-beach.html`, and `liquid-glass-modal.html` on 2026-10-11.

## Global Constraints

- Base: origin/dev at 465b718ee74a63daa56a9c893c45620034050926.
- Branch: feature/universal-liquid-glass; no deployment or changes to authentication.
- Chrome uses a neutral 12% to 6% gradient, 18px blur, neutral highlights, and light text.
- Content is denser than chrome; modals are denser than content and use a dimming scrim.
- Preserve semantic status/reward colors, artwork, geometry, safe areas, gameplay, and interactions.
- Support 360px mobile, reduced transparency, unsupported backdrop blur, and reduced motion.
- No new libraries, authentication fixtures, accounts, or backend mutations.

## Review Focus

- Bright artwork: labels and action states must remain distinguishable.
- Nested cards: do not stack expensive blur on every inner surface.
- Portal menus: material tokens must remain available outside app-shell.
- Local bar/profile/auth styles: no opaque blue or milky overrides.
- Fallback rendering: solid neutral surfaces and legible light text when transparency is reduced.

### Task 1: Shared material and controls

**Files:** app/global.css, app/design-system.css, app/liquid-glass.css, app/App.tsx; existing glassMaterial and ScoreBoard tests.
**Interfaces:** root-level --liquid-* variables; existing --surface-*, --glass-*, and --chrome-* aliases.

- [x] Render the unchanged controls with production CSS on bar, ice, and beach; record baseline.
- [x] Add a browser check rejecting a chrome white fill or opaque navy active tab; observe RED.
- [x] Implement neutral material tokens and migrate shared chrome, buttons, cards, and modal surfaces.
- [x] Run focused tests and the browser check; observe GREEN.

### Task 2: Local surfaces and text

**Files:** bar/*.css, bar/cards/durak.css, onboarding/onboarding.css; components/screens/chat inline presentation styles only.
**Interfaces:** consumes Task 1 tokens without changing component APIs.

- [x] Audit hardcoded neutral blue/gray/white presentation colors.
- [x] Migrate local surfaces and text while preserving semantic colors, illustrated backgrounds, and transparent layout wrappers.
- [x] Check real StartPeriodModal, GlassSelect portal, BottomNav preview, card controls, and login/demo rendering.

### Task 3: Verification and handoff

**Files:** QA results and the plan checklist.
**Interfaces:** final implementation and exact local commit.

- [x] Run relevant web tests, typecheck, lint, and build; report baseline failures separately.
- [x] Inspect screenshots at 360px and 430px on three backgrounds, including modal, selected/disabled controls, and fallback material.
- [x] Review the final diff, commit locally, and provide screenshots and exact status. No push/deployment without authorization.

Validation scope and known baseline failures: see docs/design-system.md, final section. Full authenticated/iPhone acceptance and deployment remain outside this local handoff.
