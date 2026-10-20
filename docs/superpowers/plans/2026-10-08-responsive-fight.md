# Responsive Fight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute inline, without delegation. Steps use checkbox syntax.

**Goal:** Make ordinary-duel fights immediately responsive, visibly readable and controllable through held movement, crouch and guard.

**Architecture:** Introduce fight rules v3 with deterministic chronological contact resolution; retain the legacy engine for saved v1/v2 fights. The server owns outcomes, while the client predicts action presentation and reconciles stable action/event IDs. Held input is leased and independent from discrete attack presses.

**Tech Stack:** TypeScript, game-core, Fastify/WebSocket, React/Pixi, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-responsive-fight-design.md`

## Global Constraints

- Use existing `feature/fight-responsive-controls` checkout, base ca865ffe6f8469aab4ed0f3cfa819521e1d737df. Preserve unrelated work.
- Prototype: 4 HP, 15s main / 10s sudden death; 250ms windup, 100ms active, 150ms recovery, 200ms hit reaction.
- Guard: shared three-contact pool; third block breaks guard without HP damage, 300ms exposure; regenerate after 600ms without guarding, one unit per 500ms.
- Lease renews every 150ms and expires after 750ms. Attack buffer is only the last 150ms before readiness.
- Crouch stationary; standing guard moves at half speed. No jumps, charged attacks, auto attack or voluntary attack cancellation.
- Server-authoritative damage/rewards; preserve invitations, light modal, menu overlay, result hold and medical assistance.
- No sprite blur/shadows. Russian UI, English identifiers/comments/commits. No credential or database reset.
- Local prototype only; deployment requires a new user release request.

## Review Focus

- Opposite movement keys held simultaneously: neutral direction; releasing one restores the other.
- A delayed head attack at the exact crouch transition: evaluate chronological effective time, never receipt order.
- Guard break while block remains held: no instant reactivation during exposed recovery.
- Old pending commands after reconnect or phase change: discard, never restore stale guard or replay attacks.
- Terminal simultaneous lethal contacts: preserve deterministic legacy terminal policy, never award two settlements.

## Task 1: Version boundary and regression fixtures

**Files:** Modify `packages/game-core/src/fight/{engine,types,config}.ts`, `src/version.ts`, `test/version.test.ts`; create `src/fight/legacyEngine.ts`, `test/fight-version.test.ts`. Test client `packages/web/src/game/fight/fightVisualPose.test.ts`; inspect server version checks in `src/duel/{daily,amateur}`, `src/bonusGames/service.ts`, `src/tournament/classicGame.ts` before changing their compatibility.

**Interfaces:** Keep `createFightState(rules: FightRules, phaseStartMs: number): FightState` and `advanceFight` public signature. Dispatch by `state.rules.version`; v1/v2 delegate unchanged legacy implementation, v3 uses new engine. `GAME_CORE_VERSION` becomes 80, unless refreshed base has advanced it, in which case use next value.

- [ ] Add fixtures asserting legacy saved states and commands produce identical outcomes; add unresolved-after-windup presentation regression with expected attack pose.
- [ ] Run `pnpm --filter @hockey/game-core test -- test/fight-version.test.ts` and focused web pose test; record observed RED for new behavior.
- [ ] Isolate legacy engine without behavior changes and add version dispatch. Document global version compatibility findings before implementing a change to its acceptance policy; do not silently permit unsupported hockey saves.
- [ ] Run legacy fight/version tests GREEN; preserve presentation RED until Task 5. Build game-core before consumers.
- [ ] Commit only Task 1 files and recorded compatibility decision.

## Task 2: Desired input, commitment and guard endurance

**Files:** Modify `packages/game-core/src/fight/{types,config,movement,engine}.ts`; create `src/fight/responsiveInput.ts`, `test/fight-responsive-input.test.ts`; update exports in `src/index.ts`.

**Interfaces:** `FightHeldInput = { direction: -1 | 0 | 1; crouch: boolean; guard: boolean }`; `FightInputCommand` includes existing player/phaseId/seq/effectiveAtMs and `kind: 'input'`, `input: FightHeldInput`. Store per-player held intentions, lease deadline, hit/guard recovery, guard endurance and optional buffered attack. Attack zone is derived from legal posture at start. Add pure `getFightPosture(state: FightState, player: FightPlayer, atMs: number)` selector for effective posture/guard/readiness.

- [ ] Add tests: crouch evades head, body guard blocks low attack; posture captured through commitment; lease neutral at 750ms; guard shared across stance changes; three blocks break without damage; held guard cannot bypass 300ms exposure; regeneration timing; standing half-speed and crouch stationary; early attack ignored, final150ms latest press starts once at readiness.
- [ ] Run `pnpm --filter @hockey/game-core test -- test/fight-responsive-input.test.ts`; observe RED.
- [ ] Implement temporal held-state history so future commands cannot alter past contacts. Advance lease/recovery/regeneration deterministically independent of worker step size.
- [ ] Run focused tests GREEN plus existing distance tests; compare single-step and subdivided advancement.
- [ ] Commit Task 2.

## Task 3: Chronological contact and interruption

**Files:** Create `packages/game-core/src/fight/responsiveContacts.ts`, `test/fight-responsive-contact.test.ts`; modify `fight/{engine,types}.ts`.

**Interfaces:** Extend action outcome with `cancelled`; retain stable action identity from phase/player/seq. Persist contact events with `id`, `actionId`, `atMs`, attacker/defender and outcome. `resolveResponsiveContacts(state: FightState, throughMs: number): FightTransition` groups equal-time contacts against the same pre-contact state; public engine merges events once.

- [ ] Add tests: earlier hit cancels pending enemy contact; already completed contact survives later hit; exact-time trades independent of player/command order; simultaneous lethal contacts settle once; delayed crouch evaluated by effective time; range misses; repeated advance emits no duplicate events.
- [ ] Run `pnpm --filter @hockey/game-core test -- test/fight-responsive-contact.test.ts`; observe RED.
- [ ] Implement chronological groups, cancellation and 200ms hit lock. Block does not interrupt. Preserve existing sudden-death/terminal policy explicitly in fixture assertions.
- [ ] Run GREEN and complete game-core fight suite; build game-core.
- [ ] Commit Task 3.

## Task 4: Server admission and reliable transport

**Files:** Modify `packages/server/src/duel/amateur/fight/{commands,ws,worker,service}.ts`, `packages/server/test/duel/amateur.test.ts`; modify `packages/web/src/hooks/useDuelFightSocket.ts`, its test, `packages/web/src/stores/amateurDuelStore.ts` and `.fight.test.ts`.

**Interfaces:** v3 accepts `input` and discrete `attack` payloads; legacy attack/block/move remain version-specific. Hook adds `sendInput(input: FightHeldInput): void`, `sendAttack(): void`, retains legacy callbacks. Acknowledgements carry stable action identity and accepted/rejected result. Neutral input on reconnect; pending held states/attack retries from old connection are discarded.

- [ ] Add server tests for duplicate/reordered sequence, unsupported version commands, bounded late admission, historical contact, lease expiry without packets, terminal idempotency and unchanged rewards/medical hold. Add hook tests for150ms renewals,750ms server neutralization, reconnect neutral, stale phase commands and timer cleanup.
- [ ] Read applicable testing/isolation instructions from main checkout; run focused isolated tests and record RED. Never run integration against a shared dev DB.
- [ ] Extend validation/admission with existing bounded compensation and150ms delivery grace. Persist v3 input/events using existing JSON state if sufficient; add a migration only if inspected persistence cannot represent them. No arbitrary client-time authority.
- [ ] Run focused GREEN and existing invitation/result/medical regressions.
- [ ] Commit Task 4.

## Task 5: Immediate continuous visuals

**Files:** Modify `packages/web/src/game/fight/{FightView,Fighter,fightVisualPose,fightFeedback,fightDefeatPose}.ts` / `.tsx` and existing tests; create `fightTimeline.ts`, `fightTimeline.test.ts`.

**Interfaces:** `getFightVisualFrame(state: FightState, player: FightPlayer, nowMs: number, prediction?: FightAction)` returns pose, normalized action progress and contact presentation. Local prediction and ack use action IDs; contact presentation deduplicates event IDs. Keep legacy visual path selectable by rules version.

- [ ] Add assertions: unresolved action shows strike at250ms; strike extends across100ms then retracts; matching snapshots do not restart; rejected prediction returns to legal pose; interrupted strike cannot visually finish later; late confirmed contact gets bounded visible segment before hit; stale snapshots/reconnect cannot replay events; lethal hit precedes knee pose and result.
- [ ] Run focused visual/Fighter tests and observe RED, including Task1 regression.
- [ ] Implement animation clock advancing between snapshots, continuous transforms and event-ordered catch-up. Prediction changes visuals only, never HP. Preserve opponent tint and entrance baseline.
- [ ] Run GREEN including existing entrance/defeat/layout regressions.
- [ ] Commit Task 5.

## Task 6: Held mobile controls and crouch art

**Files:** Modify `packages/web/src/components/duel/fight/FightControls.tsx`, its test, `game/fight/{FightView,fightArt,Fighter,fight.css}` and layout tests; update `public/sprites/fight/jersey-atlas-v1.png` or create a versioned atlas and reference. Create `game/fight/fightHeldControls.ts` and test.

**Interfaces:** Control callbacks `onInputChange(input: FightHeldInput): void`, `onAttack(): void`; pointer map owns independent controls. New poses `crouch`, `crouch_block`, `crouch_attack`; shared384x512 canvas and contact landmarks. Render compact guard indicator beside HP.

- [ ] Add RED tests for left ←/→/↓, right block/attack, independent multi-touch, opposite directions, release outside via capture, pointercancel, blur/hidden/socket loss, no attack repeat, blocked commitment records intention without immediate posture change.
- [ ] Implement input controller and two-button right layout; legacy controls retained for old fights. Clear held input on every loss-of-control path and component teardown.
- [ ] Apply imagegen skill to generate crouch/guard/low strike references matching existing art once; inspect art before atlas integration. Review pose consistency in local browser; no unrelated asset regeneration.
- [ ] Integrate compressed atlas, correct baseline/contact anchors and common guard indicator. Run control/art/layout/Fighter tests GREEN, verify390x844.
- [ ] Commit Task 6 assets and code only.

## Task 7: Real two-client latency prototype and acceptance

**Files:** Extend `packages/web/fight-art-qa.tsx`, `fight-transition-qa.tsx` at their actual QA source locations found via `rg --files`; create isolated `packages/server/test/duel/fight-responsive-latency.test.ts`; record evidence in `docs/superpowers/plans/2026-10-08-responsive-fight-qa.md`.

**Interfaces:** Harness uses the real command admission/transport and game-core engine with two distinct players. Instrument action ID, send/ack, effective contact, snapshot arrival and rendered strike/contact. Latency injection is a test-only transport wrapper, never production compensation.

- [ ] Add failing end-to-end assertions for cancellation, holds and event ordering using real admission; label fake clock tests separately from wall-clock browser runs.
- [ ] Implement harness; run RTT50/100/200ms with jitter, document one-way delays and visible telegraph margin. Test both initiating players and concurrent actions. If defence arrives too late despite correct input, revise shared timing before calling prototype acceptable.
- [ ] Open internal browser and verify both clients at390x844 and desktop: immediate press response, visible successful/missed/blocked strikes, crouch dodge/low guard, guard break, release safety, lethal strike→knees→result→medical aid→hockey resume. Check old-version fixture presentation.
- [ ] Run focused regressions, `pnpm typecheck`, `pnpm lint`, `pnpm build` and relevant isolated server tests. Record failures/skips explicitly; inspect full diff and tracked assets.
- [ ] Commit harness/evidence, show local prototype and report local tests, browser acceptance and multiplayer limitations separately. Do not deploy.

## Self-review

Coverage: controls/action rules/endurance→Tasks2/3/6; authoritative transport→Task4; missing strike→Task5; art→Task6; compatibility→Task1; network fairness and acceptance→Task7. All five review-focus cases have owning tests. New interfaces are versioned; legacy public engine signature is preserved. No delegation or dev deployment is included.
