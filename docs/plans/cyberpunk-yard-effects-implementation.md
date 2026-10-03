# Cyberpunk Yard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execution is native in the current session; no delegation authorized.

**Goal:** Add fatigue, interactive magnetic strips and emergency lighting to real cyberpunk attempts, with a linear board-to-board goalkeeper.
**Architecture:** Pure game-core schedules and flight integration are shared by server and client. Append-only panel events are part of the scene history; rendering never decides score. New mechanics are selected by immutable versioned snapshots.
**Tech Stack:** TypeScript, Vitest, Fastify/Postgres, React/Pixi.
**Spec:** [Approved design](cyberpunk-yard-effects-design.md).

## Global constraints

- Local branch `feature/cyberpunk-yard-effects`, base `9b1dd5c494eb08fb06e838ed69fe654ac062e59b`; no push/deploy yet.
- Preserve 18 accuracy points in 150 seconds, unlimited shots, IDs/rewards/progress and old snapshots.
- Existing assets and rink geometry; production Challenges remain closed.
- New core version 76; retain bonus attempts on core 75.
- English code/comments, Russian UI. No authentication or account mutations.

## Review focus

- A strip switches while the puck is in flight: collision uses actual arrival time, never a speed frozen at tap time.
- Out-of-order panel replies cannot revive expired events or overwrite another attempt.
- Lost successful panel response: retry is idempotent and history remains authoritative.
- Player rests while panel is active: panel remains available, shot remains blocked.
- Reload old/new attempts: snapshot selects its own mechanics; no cross-mode rendering leakage.

## Task 1: Shared simulation and linear goalkeeper

**Create:** `packages/game-core/src/cyberpunkEnvironment.ts`, `cyberpunkEnvironment.test.ts`, `cyberpunkCourtShot.ts`, `cyberpunkCourtShot.test.ts`.
**Modify:** `src/bonusChallenge.ts`, `src/index.ts`, `src/version.ts`, `test/version.test.ts` under game-core.
**Interfaces:** `CyberpunkRules {version:1; seed:string; durationMs:number}`; `CyberpunkPanelEvent {id:string; eventId:string; tapTime:number}`; `createCyberpunkSchedule(rules)` returns strip/outage events; `sampleCyberpunkEnvironment(rules, elapsedMs, panelEvents)` returns current warning/active strip, remaining taps and outage state. `traceCyberpunkFlight` returns duration, sampled Y and arrival time at a given Y. `resolveCyberpunkCourtShot` reuses perspective collision rules with those arrival times.

- [ ] Write tests for deterministic 15 s windows, 1 s warning/5 s activity, minimum 4 s gap, three strips and four nonoverlapping 3 s outages; run targeted tests and observe RED.
- [ ] Implement seeded schedule and sampling; verify GREEN.
- [ ] Write flight tests: 10% strip speed, partial overlap, switching mid-flight, third panel tap, correct goalkeeper/goal arrival times. Observe RED; implement integration and shared resolver; verify GREEN.
- [ ] Write condition tests for 12/24/36 s fatigue, 4 s rest, 6 s recovery, 800 ms stumbles at 30% speed, deferral through shot/rest and continuous motion. Observe RED; reuse existing fatigue integration/poses, verify GREEN.
- [ ] Write regression proving linear amplitude 1 reaches both sprite-safe board limits and never has stationary dash intervals. Verify existing linear simulator satisfies the contract; catalog selection is tested in Task 2.
- [ ] Bump version to 76, build game-core, run related shared suites and review diff.

## Task 2: Authoritative attempts, panel and migration

**Create:** `packages/server/db/migrations/178_cyberpunk_yard_effects.sql`, `src/bonusGames/cyberpunkShot.ts`, `test/bonusGames/cyberpunkInteractions.test.ts`, `cyberpunkShot.test.ts`.
**Modify:** `src/bonusGames/types.ts`, `service.ts`, `routes.ts`.
**Consumes:** Task 1 schedule, condition and shot resolver. **Produces:** attempt DTO with confirmed panel event history and `POST /bonus-games/attempts/:attemptId/cyberpunk/panel` accepting event UUID, schedule event ID, period, tap time and expected shot/panel counts.

- [ ] Write parser/version/catalog tests for new rules and linear goalkeeper amplitude 1, unchanged objective/base frequency, old snapshots untouched. Observe RED, add strict parsing and migration, verify GREEN.
- [ ] Write dedicated-storage integration tests: ownership, wrong period, expired event, rapid taps below 180 ms, three accepted taps, concurrent requests, identical retry and altered UUID payload. Observe RED; implement row-locked append-only panel events and DTO history; verify GREEN.
- [ ] Write real shot regressions for rest/stumble rejection, strip delay, altered client result, lost response/retry and old core 75 attempts. Observe RED; use shared resolver, preserve freshness/ownership/history guards, verify GREEN.
- [ ] Build/typecheck server and run bonusGames suite on dedicated local DB/Redis; never target dev/prod storage.

## Task 3: Actual client flow and rendering

**Create:** `packages/web/src/game/CyberpunkEffects.tsx`, `cyberpunkNotice.ts`, `cyberpunkNotice.test.ts`.
**Modify:** `src/api/bonusGames.ts`, `src/stores/bonusGameStore.ts` and tests, `src/screens/BonusGamePlayScreen.tsx` and tests, `BonusGamesScreen.tsx` and tests, `src/game/PlayView.tsx`, `src/app/design-system.css`.
**Consumes:** snapshot, confirmed/pending panel events and shared samplers. **Produces:** opt-in effects and accessible panel; unchanged other bonus flows.

- [ ] Write store/screen tests for pending feedback, repeated tap, stale response, request failure, accepted duplicate and attempt switch. Observe RED; implement panel API/state without resetting movement samplers; verify GREEN.
- [ ] Write rendering contracts for warning/active strip, emergency outlines, reduced motion, clipping, notice priority and content width capped at menu. Observe RED; implement opt-in effects on shared rink coordinates; verify GREEN.
- [ ] Use shared magnetic flight sampler for actual puck animation; preserve save/post/board rebound and haptics. Cover flight completion, cleanup and delayed server reply with regression tests.
- [ ] Write preview regression for 18 points/2:30 and truthful four hints, observe RED, update existing modal using existing assets, verify GREEN.
- [ ] Run web focused regressions/typecheck/build/lint and review complete diff. Record suite failures and skips separately.

## Task 4: Local browser acceptance

- [ ] Open actual local cyberpunk attempt with dedicated local storage and existing authorized authentication. If authentication is unavailable, report the gap; do not create/bypass credentials.
- [ ] Verify preview, start/repeated start, linear board-to-board goalkeeper, fatigue/rest/stumble and all three panel taps.
- [ ] Verify strip switching mid-flight, outage readability, shot blocking, rebound and return/reload; save screenshots.
- [ ] Report local automated checks and actual browser acceptance separately. Deployment remains pending separate user authorization.

Local tuning approved: 20 strip events per 150 seconds across six zones, 1-second warning and 3-second activity; ten light outages. Entity brightness 16%; goalkeeper speed reduced by 10%.

Follow-up tuning: independently seeded strip and outage schedules can overlap; random strip zones; outages include 1-second warning and 5-second darkness. Strip visuals use tapered polygons with stronger active edges. Local synthetic fixture checked; authenticated browser acceptance and deployment remain pending.

Release QA 2026-10-03: core marksmanship/cyberpunk 84 tests pass; web screen/store/effects 108 pass; server beach/ski/cyberpunk 13 pass; all package typechecks and builds pass. ESLint passes through existing workspace executable (worktree root lacks its bin link). Full core/web suites have stale recorded open-window banks; do not count those suites as green. Local fixture preview, dark entities/scoreboard and breaker placement were inspected; authenticated actual attempt browser acceptance remains pending. Reviewer flight-window and UUID fingerprint issues observed RED and fixed GREEN. Production guards unchanged.

Full isolated server bonus suite: 294/294 passed. Synced current origin/dev (playoff scheduling) before release; renamed unreleased cyberpunk migration to 178 to follow existing 177.
