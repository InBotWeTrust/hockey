# Ski Resort slope

Task branch: feature/ski-resort-slope. Base origin/dev: 3d3560ff88232f2c604940e62c11ca8974a94d69.

## Approved behavior

- Three minutes, 26 goals from 35 shots. Catalog migration only affects new attempts.
- Upright viewport with accepted slope artwork and matching entity shear. Shared original arena remains unchanged for other modes.
- Uphill starts at 65% of ordinary bonus speed. Every two completed climbs reduces it by five percentage points, down to 35%. Downhill always uses 125%.
- After fourteen completed climbs, player descends to the left edge, rests four seconds, then starts a fresh fatigue cycle.
- Twenty-two seeded slips in eight-second windows: seven per entity and one random extra. Minimum gap after a descent: four seconds. Player events defer around shot pauses/rest.
- Ordinary downhill speed during slipping; pose, shooting block and goal rocking clear at the downhill edge. Goal rocking amplitude: eight degrees. Emitted snow particles finish their short fade.
- Dense snowfall, snow spray, existing goalkeeper save and player stumble poses.
- One notice: persistent fatigue across both directions; slips/rest override it. Yellow fatigue, red severe fatigue/rest, orange slips, green recovery.
- Avalanche story and four separate gameplay hints, edited with humanizer-ru. Avalanche is narrative; final cinematic remains deferred.
- Production Challenges stay closed. No changes to other bonus modes, saved IDs, progress, rewards or existing attempt snapshots.

## Implementation and verification

- [x] Shared seeded movement, player fatigue and shot-paused schedule, reused by client and server.
- [x] New ski snapshot version 1; game core 75; legacy bonus core 74 remains accepted.
- [x] Migration 176 for three-minute catalog rules and launch story; existing snapshots untouched.
- [x] Real attempt renderer, collisions and server shot gate use shared ski rules.
- [x] Observed RED then GREEN for schedule count, shot-pause chains, target rocking, color selection, snapshot parser, shared shot calculation and preview hints.
- [x] Local browser observed yellow fatigue and red rest with blocked shooting.
- [x] Focused UI/core contracts, typechecks, lint and server/web builds.
- [ ] Exact-SHA dev deployment and runtime evidence.
- [ ] Real dev launch, shot and snowfall acceptance.

## Known baseline

Full game-core suite: 317 passed, four failed in openWindowObservation.test.ts and openWindowTrainingScenes.test.ts. The same four failures reproduce with base core version 74; banks still declare 69. Training work is outside this task. Full web: 1843 passed, seven failed in OpenWindowObservationPlay.test.tsx and recordedObservation.test.ts for the same stale banks; seven failures also reproduced with core 74. Full server collection stalled without file results and was interrupted; the entire bonusGames scope passed all 290 tests against dedicated local storage.
