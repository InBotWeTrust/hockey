# Duel and demo polish implementation plan

**Goal:** Make tournament entry and duel feedback consistent, prevent stationary duel stumbles, and differentiate demo pacing while reusing existing result/login UI.

**Base:** Fresh `origin/dev` at `c06483f4bd57ad29db9ff455097cb6f843d10a9f`; isolated task branch `feature/duel-demo-polish`.

## Tasks

- [x] Compare the training and tournament cube markup/CSS. Give all cube CTAs the same capped width and center the spacious timer/period grid.
- [x] Compare beginner-training feedback positioning with duel/tournament missing-inventory notices. Reuse the under-scoreboard placement and add a regression.
- [x] Reproduce a duel stumble during fatigue rest (observed RED), add a deterministic test, suppress overlap with stationary rest, bump game-core version, and preserve bonus-attempt compatibility with version 63.
- [x] Add spacing between expanded duel result score and statistics, retaining the score.
- [x] Reuse the standard result modal structure and login button styling for demo completion. Add a component test and browser-check a completed demo.
- [x] Give demo an explicit slower speed preset and test that every moving element is slower than each ordinary period.
- [x] Run core/web targeted tests, typecheck, lint, build, and inspect diff. The completed demo was browser-checked at 30/30 shots.

## Remaining acceptance

Authenticated mobile browser acceptance of the tournament cube, duel notices, and expanded duel result remains pending; the isolated front-end has no authenticated game session. Do not deploy without a separate request.

## Constraints

- Preserve unrelated work in the primary checkout.
- Keep user-facing text Russian and server-authoritative duel logic intact.
- Use RED → GREEN tests for behavioral bugs; distinguish automated checks from browser acceptance.
