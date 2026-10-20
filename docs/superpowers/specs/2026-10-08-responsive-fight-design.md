# Responsive ordinary-duel fight

Status: design draft for review. Production implementation has not started.
Base: origin/dev ca865ffe6f8469aab4ed0f3cfa819521e1d737df.

## Goal and observed defect

A press immediately starts the fighter's visible action. Both players see a continuous attack, contact and recovery, with server-authoritative outcomes. Directional controls are on the left; block and attack are on the right. This is a mobile adaptation inspired by Tournament Fighters, not an exact port.

The read-only dev audit found 12 completed fights between the requested players on October 7. The deployed visual pose waits for action.resolved before showing the attack. Current rules provide 500 ms windup, 100 ms active time, 300 ms recovery and 150 ms delivery grace. Server confirmation therefore consumes most of the visible strike window. Incoming-hit feedback can hide an outgoing strike while the server still awards its damage.

## Approved controls

- Left/right: hold to move; down: hold to crouch. No jump/up button.
- Block: hold. Standing guards the head; crouching guards the body.
- Attack: one strike per press. Standing targets the head; crouching targets the body.
- Crouching dodges head strikes. Body strikes can hit crouching players.
- Attack height is captured at attack start and cannot change during that attack.
- Release down to stand when the current action allows it.
- Multiple pointers must work independently; releasing one must not release another.

## Action rules

Prototype timings: windup 250 ms, active 100 ms, recovery 150 ms. They are tunable test values, not verified NES timings or guaranteed network-safe minima. Keep existing HP and round durations during the first comparison.

An attack commits the player to its captured posture until recovery ends. Voluntary crouch, stand, movement or block changes cannot cancel it. Held intentions are recorded and applied after recovery. Crouching initially prevents horizontal movement; standing guard permits movement at half normal speed.

A hit before the opponent's contact interrupts that pending attack. Cancelled attacks cannot later award damage. A block does not interrupt an attack. Equal-time contacts are resolved as one group so both players can trade hits; iteration/player order cannot choose a winner. A hit at a later timestamp cannot undo an already completed contact.

Prototype hit reaction lasts 200 ms. During hit reaction attacks cannot start; held input is restored afterward. No blanket invulnerability is introduced. The earliest legal next action follows the deterministic action timeline rather than a client disabled timer.

Remember only the latest attack press during the final 150 ms before readiness. Earlier presses do not accumulate into a series. Held block and crouch are desired states, not queued attacks. If an attack press is buffered while block is held, attack temporarily opens the guard and held guard returns afterward.

## Guard endurance in both stances

With only head/body strikes, crouch plus body guard defeats both attack types indefinitely. Use the same guard endurance for standing and crouching guards. Changing stance does not reset endurance.

Guard endurance decreases only on blocked contacts, not while holding. Both guard heights use the same pool. Start with three blocked contacts from full endurance; the third breaks guard, without removing HP, and opens a 300 ms recovery window. Endurance regenerates after 600 ms without guarding at one unit per 500 ms. Show a compact guard indicator near HP. These are initial prototype balance values and require playtesting.

Do not add a charged attack or another button in this version.

## Simulation and transport

Keep calculation pure in game-core. Add versioned desired-input commands carrying move direction, crouch and guard flags, alongside discrete attack commands. Commands retain fight/phase identity, monotonically increasing sequence and idempotency. The server assigns effective time using the existing bounded compensation; do not trust arbitrary client timestamps or widen retroactive acceptance silently.

Desired posture transitions received while committed update held intentions without cancelling the action. Apply posture and guard at contact time. Persist cancelled outcomes, hit reaction bounds and contact events with stable IDs and effective timestamps. Resolve historical contacts chronologically, including commands delayed within the accepted delivery window; future input cannot affect past contact.

Held-state lease: renew every 150 ms while holding. On expiry after 750 ms, all held input becomes neutral on the server. On pointer cancellation, blur, visibility loss or socket loss, neutralize local input and send release when transport permits. Reconnect starts neutral; do not restore a stale held block. Pointer capture handles release outside the button.

The server alone awards damage, rewards and terminal results. Continue existing result hold, assistance and hockey clock behavior.

## Rendering and delayed results

Use a predicted visual timeline for the local action immediately. Do not gate the strike pose on resolved. Windup has continuous movement, active time extends the arm, and recovery retracts it. The renderer's clock advances between snapshots.

Reconcile acknowledgements by action ID; do not restart the same action on every snapshot. A rejected action returns smoothly to legal state. A prediction never awards HP damage or a win.

Opponent attacks use their server timestamps. A late snapshot must not silently omit the entire strike: show a bounded contact segment before its confirmed reaction, retaining event order. A confirmed outcome is not played twice across updates or reconnects. This visual catch-up does not imply new time to defend against an already finalized server hit.

A 250 ms windup does not guarantee reactable online defence. Measure send/ack, snapshot delivery and visible contact delays separately. Evaluate the current 150 ms finalization grace with injected latency before approving the timings. If the player sees a telegraph too late to defend, revise the shared timeline/compensation design or windup; do not claim local prediction solves remote fairness.

## Assets

Create a crouch pose and crouch guard pose matching the existing red/blue hockey player without helmet or hockey gloves. A seated low strike must originate from the crouched body; reusing a standing body punch with only a vertical offset is insufficient. Preserve silhouette, sprite baseline and opponent tint. Use shared-canvas atlas frames and compressed assets. No added sprite blur/shadows. Generate approved reference assets once, review, then integrate.

## Compatibility

New fights use a new fight rules version. Existing saved fights use their original version/engine until completion; consumers select the corresponding renderer and controls. Increment GAME_CORE_VERSION and test affected consumers. Inspect active hockey sessions before release; if the current global version check cannot safely coexist, complete a version-dispatch design before implementation. Do not reinterpret existing fight commands as held-state commands.

## Verification

1. Reproduce and test the current missing-strike case before fixing it: an unresolved attack past windup must enter its strike pose; late confirmation must not skip all visible contact.
2. Deterministic tests for hold/release, crouch dodge, low guard, range, interruption, same-time trades, buffering, movement restrictions, lease expiry and chosen guard-break rule.
3. Server tests for duplicate/reordered commands, late actions, simultaneous contacts, terminal idempotency, reconnect, old-version fights and unchanged rewards/medical aid.
4. Client tests for multi-touch, pointer cancellation, blur, ack rejection, stale snapshots, event deduplication and timer cleanup.
5. Two-client local harness using real fight transport and simulation. Inject round-trip latency of 50/100/200 ms and jitter; report one-way delays separately. Compare rendered strikes with authoritative events and audit logs.
6. Browser acceptance at 390 x 844 and desktop: every press visibly begins an action, confirmed hits show a strike/contact, interrupted attacks do not deal later damage, release never leaves input stuck, result/assistance return works.
7. Typecheck, lint, relevant tests and build; review diff. Deploy to dev only after a new explicit release request. Live mobile multiplayer acceptance remains separate from a demo.

## Delivery

Use the existing isolated checkout because the primary checkout contains unrelated work. One feature branch based on current origin/dev; preserve parallel updates on integration. No database data reset, credentials changes or production deployment.

After written design review, write the file-level implementation plan. Implement locally with observed regression failures before fixes, then show the two-player prototype.
