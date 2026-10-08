# Fight input and scene continuity QA

Base: origin/dev 81829fbabcdf732fa6bc962ead0805d48d2b6dbf.

## Observed dev case

Read-only audit of fight d57dc947-7fb3-4d26-8119-c7cc2452f5e2 in match f1172041-87ae-49e5-99ca-a17a7d73b3ea, 2026-10-08 12:12 UTC. Stored rules had a 400 ms windup. One successful contact, health [4,5], 65 persisted commands from one side. The attack was followed by forward commands and authoritative positions returned to contact distance. Only two attack commands were persisted, the second rejected as busy. Safe remote log projection found one late_action at fight end and 59 not_started rejections afterward through 12:13:35 UTC. HTTP durations are not WebSocket admission latency and do not establish its bottleneck.

## Changes and regression evidence

- New fights use an 80 ms windup, preserving persisted rules for existing fights. GAME_CORE_VERSION 81; hockey shot simulation is unchanged.
- Attack starts on pointer press; keyboard click remains supported without double firing.
- Arrow taps hold movement for at least 120 ms; longer holds release immediately. Duplicate release/lost capture notifications do not duplicate neutral commands. Cancel, blur, reset and unmount clean timers.
- Local sprite movement is predicted from held input using shared collision constraints. Pending input IDs delay correction until the corresponding command appears in authoritative history; corrections are smoothed. Health/contact remains server-owned. Prediction respects attack/crouch locks, both sides, disconnect timeout and terminal state.
- Busy attack ACK no longer clears held controls. Terminal fights reject local commands and do not replay queued actions on reconnect.
- Modal suppression opts into freezing the loop clock. Ordinary shot-result detach retains its existing continuous-clock behavior. A RED regression showed 30500 ms after a 30-second modal instead of 500 ms; the fix resumes at 500 ms. Component test verifies the next shot retains both scene and shooter tap time.
- Fatigue notice sizes to content capped by the menu. Local preview: ?fatigue=1.

RED was observed for long windup, busy ACK resetting movement, terminal sends, delayed attack activation, lack of movement prediction, short arrow tap, and detached-loop clock jump. All corresponding focused regressions passed after fixes. One broader shot-result clock regression initially failed after globally freezing detach; freezing is now opt-in for modal return and that regression passes.

## Verification

- Core: 51 fight tests plus 2 version tests passed.
- Web: 182 focused tests across fight UI, socket, loop, PlayView and session stores passed.
- Server: 25 ordinary duel fight integration tests passed using dedicated PostgreSQL database hockey_fight_responsive_20261008 and dedicated Redis, not dev player data.
- Monorepo typecheck and lint passed; web and server builds passed.
- Local browser bot: first hit plus renewed approach and second hit reduced opponent HP from 5 to 3. This is not multiplayer latency acceptance.
- Fatigue notice measured 267.68 px versus menu 328.38 px and visually inspected.

## Remaining acceptance

No new deployment performed. Real two-phone dev latency, winner/loser resume, medical aid and confirmed goal acceptance remain to be tested after release. No broad raw logs or credentials were exported. Parallel dirty main checkout preserved.
