# Grigory Break Games Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. No delegation or deployment.

**Goal:** Five voluntary rink tasks with one server-authoritative break acceleration.
**Architecture:** Separate daily caretaker lifecycle and pure validation rules; an additive migration stores assignments/attempts. Existing daily reconciliation consumes effective readiness. A rink overlay sends bounded inputs and renders server progress using existing caretaker art.
**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Pixi.
**Spec:** docs/superpowers/specs/2026-10-31-grigory-break-games-design.md

## Global Constraints
Local only; no currency/rewards/shot changes. First game is swipe, one kind per break, no repeats in a five-kind cycle. Original timer continues. Effective readiness = min(original, max(completion, period end + 180000)). No automatic period start.

## Review Focus
- Duplicate actions/parallel tabs must not double credit: lifecycle tests.
- Natural expiry must not unmount an active task: UI tests.
- Day rollover or next period invalidates old completion: lifecycle tests.
- Hidden tab/pointer cancellation must stop hold progress: input tests.
- Network retries must not replay actions: sequenced idempotency tests.

### Task 1: Server rules and persistence
Files: server/src/duel/daily/caretakerRules.ts, caretaker.ts, caretakerRoutes.ts; db/migrations/253_daily_caretaker.sql; test/duel/caretaker.test.ts.
Interfaces: caretaker action carries attempt ID, sequence and normalized gesture; start creates/reuses assignment; restart supersedes attempt; action returns authoritative progress and readiness.
- [x] Write failing pure-rule and timing boundary tests, observe RED.
- [x] Implement five rule validators and acceleration formula, observe GREEN.
- [x] Add migration/service/authenticated routes and integration tests for ownership, retry, deck, rollover and one-time completion.

### Task 2: Daily reconciliation
Files: server/src/duel/daily/reconcile.ts and routes.ts.
- [x] Test accelerated readiness before/after three-minute boundary and original timeout.
- [x] Use optional per-pool readiness override; clear it when entering the next break.
- [x] Run daily and caretaker integration suites.

### Task 3: Existing rink interaction
Files: web/src/api/caretaker.ts; game/CaretakerGame.tsx and CSS; game/PlayView.tsx; screens/DailyScreen.tsx.
- [x] Test progress, exit, retry and natural expiry with mocked API.
- [x] Add a caretaker tap target in daily breaks, shared overlay lifecycle and five gesture controls without a new route.
- [x] Keep active task mounted after ordinary expiry, cancel on actual next period/day.
- [x] Add persistent one-time hint and funnel observations.

### Task 4: Local acceptance
- [x] Run relevant server/web tests, types, lint and builds.
- [x] Use isolated browser fixture for all five games and narrow themes.
- [x] Review diff and record remaining physical-device gaps. Keep all work local.

## Execution ledger
- User approved design and execution. Existing dirty changes belong to the approved map integration and are preserved. No commits/pushes are necessary for this local iteration.

## Completed local iteration
- Server: daily regression 28/28, lifecycle 4/4, five-rule validation 8/8, scheduled push 22/22 (62 distinct checks).
- Web: full suite 3787/3787; additional lifecycle suite 3/3. Root types/lint and web build passed.
- Observed RED→GREEN: superseded start retry, accelerated push readiness and dropped short trail gesture. Pure-rule tests initially failed on the missing module, then passed.
- Browser: observed progress for all five variants in the isolated fixture. Authenticated game/device acceptance remains outstanding.
- Ruling: input geometry uses normalized rink coordinates rather than fixed CSS pixel thresholds so the same rules work on both rink sizes. Gesture cadence is server-limited (push 1s, trail 350ms per segment, throw 4s); wrong actions do not remove progress.
- Final review: self-review; no delegation, per project/user constraint. No commit, push or deployment.

## Second local prototype: Grigory vs Blizzard

- Keep Drift physics unchanged; select `drift` / `blizzard` in the local preview toolbar.
- Both variants reuse the rink, sprites, entry/result flow, launch artwork, HUD, exit/rules and current break timing.
- Blizzard uses responsive steering with moderate wind displacement of Grigory, finite snow mass and three gust waves over 54 seconds with two short calm intervals. Wind warnings start 0.7 seconds before a direction change.
- Snow moves with wind, collects at the scraper and only contributes to progress on delivery to a board. All planned snow must be delivered (100%, explicitly requested), including waves not yet released.
- Wind streaks and moving particles follow the existing BeachWind visual approach. Snow curls back from boards rather than collapsing into an inaccessible corner. Remaining snow settles after wave three.
- Server replays the selected variant, preserves it on retries/restarts in the same break, and shares one completion/acceleration guard across variants. Migration 255 adds only the Blizzard intro timestamp.
- Current timing overrides the pasted brief: end immediately at natural break expiry; after completion <=2 minutes ends immediately; otherwise cap remaining time at 2 minutes with at least 45 seconds saved.
- Preview ready state now uses the actual Goal, Goalie, Player and Puck renderers and their daily-screen options. `remaining` URL parameter supports short local expiry checks.
- Local prototype only. No dev or production deployment.

### Blizzard pacing refinement

Cargo progressively reduces movement speed (up to 48%) and turn rate (up to 60%). A new strong crosswind can shed 25% of cargo when at least 12 fragments are carried; released fragments briefly cannot be recollected. This never changes delivered progress and cannot create more snow. HUD identifies heavy cargo and a recent spill. Natural break expiry and 100% completion rules remain shared with Drift.

### Stadium presentation and simple machine

Indoor Blizzard is presented as “Сквозняк на арене”: wall ventilation grilles, directed airflow strokes and angular ice shavings replace outdoor snowfall. Core rules and break acceleration are unchanged; the yard retains its outdoor blizzard presentation. Both stadium game variants now render the simple old cream/blue machine in four fresh directional views, with a seated-driver impact pose for side collisions. The local entry scene and launch artwork use the machine too. Corrected front art keeps the rear equipment within the chassis silhouette. All new images were generated from scratch using the original Grigory identity sheet and vehicle design references, not iteratively repainted sprites. Local-only prototype; no deployment.
