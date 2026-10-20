# Production Training Exclusion Implementation Plan

> Execute inline using superpowers:executing-plans. No delegation.

**Goal:** Release the approved gameplay and UI changes without transferring the unfinished open-window/observation course to production.
**Architecture:** Remove the new course and its consumers from the production integration branch only. Retain the existing advanced course contract and all production UI gates. Preserve migration history and stored results; origin/dev keeps the full development course.
**Tech Stack:** TypeScript, React, Fastify, Vitest, GitHub Actions.
**Spec:** User approval in the current conversation: exercises remain closed on production; only beach challenges are available; do not regenerate exercise scenes.

## Constraints
- Keep dev de843fb8 and its exercise implementation intact.
- Production course/advanced circles show «В разработке»; direct routes cannot start exercises.
- Preserve database migrations, records, and unrelated work.
- Do not skip failing tests or weaken CI gates.
- Release only after checks; verify deployed images, health and frontend assets separately.

## Review Focus
- No unfinished course endpoint is registered.
- Existing advanced catalog retains original exercise keys and stored completions.
- Existing initial training and open practice remain compatible.
- Production client gates and beach-only challenge restriction remain active.
- No production-specific source exclusions are merged back into dev.

## Tasks
- [x] Add regression for retained advanced navigation and server catalog/removed endpoints; observe RED.
- [x] Remove unfinished course source, exports, API registration and feature-specific tests; reconnect legacy course consumers.
- [ ] Rebuild core, run focused tests/typecheck/lint, then CI and database integration. Review complete diff.
- [ ] Commit production-only exclusion, update PR, release through Actions after checks and verify runtime. Carry only shared fixes to dev.

## Execution evidence
- Client retained-course regression: observed RED, then GREEN; production direct-link guard also GREEN.
- Isolated PostgreSQL/Redis: retained catalog, removed endpoint, initial/legacy advanced endpoints: 10/10 PASS.
- Core: 73 files / 585 tests PASS. Main web suite excluding separately isolated DailyScreen: 364 files / 3070 tests PASS.
- Typecheck, lint and server build PASS. Mobile: 4 tests PASS.
- Independent read-only review found no actionable issues in this exclusion diff.
- Local rendered production-gate preview: both circles show «В разработке»; original open training remains selected.
- Ruling: preserve all additive migrations and recorded results, despite excluding course runtime code; deleting database history would risk user data.
- Full server suite remains in progress and has additional duel regressions to investigate. Production release is not yet approved by checks.
