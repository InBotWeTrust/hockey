# Fight command recovery: local QA, 2026-10-09

Task branch: `fix/fight-command-recovery`.
Base: `origin/dev` at `9680ce26e819b19a83332d162a333a312d5bf91a`.
Scope: local fixes and verification only. No push, merge or deployment authorized.
The unrelated primary checkout was preserved.

## Read-only dev evidence

The latest inspected ordinary duel contained one resolved fight with commands and contacts, followed by two cancelled fights with no commands or contacts. Filtered logs around that duel contained 461 `unknown_fight`, 338 `not_started`, and 5 `duplicate_payload_mismatch` rejections. Match polling reached 553 GET requests over eight minutes. Observed shot request durations increased from roughly 160–355 ms before the first fight to 1294–1899 ms afterward.

There were no opponent shot requests after the first fight. The exact client-side reason their shot button remained unavailable has not been reproduced. This report does not claim that specific incident is conclusively fixed.

## Reproduced regressions and fixes

- Slow acknowledgements produced 14 outstanding client commands instead of one. Commands now use a bounded queue; held input is coalesced, sequence numbers are assigned on dispatch, and a confirming snapshot can replace a lost acknowledgement.
- Rejections released held input and triggered HTTP recovery polling. Correlated errors now retain held intent and recover from an authoritative socket snapshot. Old-fight errors and acknowledgements cannot affect a new fight.
- HTTP selecting a subsequent fight retained the old command sequence. The new fight/phase resets transport scope before sending.
- Existing sockets received compact state for a new fight that the client could not recognize. A change of fight identity now sends a full match snapshot.
- The worker repeatedly selected historical resolved fights during a subsequent paused fight: 17 preparations in 300 ms instead of one. Its candidate query now restricts progression to the latest fight using the existing latest-fight index.
- Late confirmed strikes were replaced by the held idle/block pose before the defender's reaction. Strike presentation now takes precedence during the confirmed attack pose.
- Releasing crouch while a low attack waited for acknowledgement removed the preceding crouch command. Only inputs following a buffered attack are coalesced, preserving the stance before the attack.
- A timed-out fight immediately returned to hockey. It now holds the result, displays “Ничья”, then resumes both players without rewards or medical aid.
- Connection/recovery messages changed modal height. They now overlay the scene. Browser measurements with the message off/on were identical: card 480 × 813.59375; stage 430 × 610.59375, with unchanged coordinates.

Each newly reproduced logic defect had an observed failing regression followed by a passing check. The existing PlayView shot-confirmation-under-modal scenario passed without a production PlayView change.

## Verification

- Final server target: 32 passed, 177 unrelated tests skipped. Dedicated synthetic local PostgreSQL database and Redis container; no dev or production data mutated.
- Focused web target: 162 passed before the final additional ordering regression.
- Final hook/result target: 19 passed; final hook rerun: 16 passed.
- Final DailyScreen target: 3 passed (win, defeat/medical aid, draw and resumed shooting).
- Root typecheck and lint: passed after final input-order changes.
- Root build passed; final web rebuild checked separately.
- Full web run: 2045 passed, 7 failed in observation fixtures. The same 7 failures were reproduced on the unchanged base.
- Full server run: 2008 passed, 24 failed, 11 failed files. All failed files were rerun on the unchanged base with separate synthetic storage; the same failures reproduced, including the migration 153 setup failure. Failures include training/catalog fixtures, historical reward routes, shot-index-plan expectation, and responsive-fight latency expectations. Full suites are not green.
- Browser: rendered result title “Ничья” checked at 390 × 844; recovery-message layout checked at the normal viewport. Local preview is synthetic and does not exercise a real two-phone connection.

## Remaining acceptance

- Two real clients under latency/reconnect must verify movement, held guard, visible hits, subsequent fights and resumed shooting. No live multiplayer acceptance or latency measurement of this patch has been performed.
- The baseline test expecting a defensive response 150 ms after observing an attack fails at RTT 50/100/200 ms. Current startup is 80 ms. This patch does not silently change attack timing or promise reaction-based blocking under those conditions.
- The opponent's exact client-side shot-button failure remains unproven.
- Full baseline failures remain outside this patch; no assertion was weakened to hide them.
- Full shields currently have a weak 28-percent blue fill; the user was informed. No shield-style redesign was requested in this turn.

Logs are local under `/private/tmp/hockey-fight-recovery-*.log`; the result screenshot is `/private/tmp/hockey-fight-recovery-draw.jpg`.

## Second local audit (2026-10-09)

User requested another fight regression audit and explicitly kept dev deployment prohibited. Four additional defects were reproduced with observed failing tests and then fixed:

1. Delivery compensation could place a newly received command before phase start or exactly on the sealed time boundary. At maximum 150 ms compensation, progression before admission made every such command late. Responsive admission now clamps server-owned effective time to the current phase and strictly after the sealed instant, never past receipt time. Existing contacts cannot be rewritten.
2. Events from a replaced WebSocket could mark its replacement ready prematurely, or close/reset it after it became ready. Message/close/error handlers now require the socket to be the current connection.
3. A held-input command at the exact contact instant could rearm an exhausted guard and block a fourth hit with zero reserve. New fight rules v4 prevent this. Saved rules v3 retain their deterministic replay behavior. `GAME_CORE_VERSION` is now 82. No shot simulation or attack-duration change was made; consumers were checked after rebuilding game-core.
4. A combined snapshot containing the sudden-death transition and its first hit marked that hit already seen. The presentation timeline now excludes inherited contacts while presenting contacts belonging to the new phase's actions. Regression covers strike, defender reaction, defeat pose and no duplicate presentation; another check prevents replaying old main-phase hits.

Final checks:

- All targeted game-core fight/version tests: 55 passed.
- Full game-core: 395 passed, 4 failed in two observation-scene files. The same four failed on unchanged base version 81; this full suite is not green.
- Server regression (ordinary-duel integration plus fight units): 60 passed, 179 skipped by the explicit filter. Unfiltered fight-unit run separately: 35 passed, no skips.
- Real localhost WebSocket connections at 0 and 150 ms compensation: both passed hit/damage, counterpart state delivery, movement, duplicate delivery, malformed duplicate rejection, recovery and resumed-shot/count verification. This is a synthetic integration scenario, not two physical phones.
- Client regression: 125 passed; after adding the inherited-contact regression, final timeline target: 7 passed.
- DailyScreen win, loss/medical aid and draw/resumed-shot flows: 3 passed.
- Root typecheck, lint and build passed. Final web rebuild was performed after the timeline change.
- Diff reviewed; `git diff --check` passed. No remote push, merge or deployment.

The earlier live Rengo shot-button incident remains not conclusively reproduced. The baseline reactive-block latency contract (150 ms after seeing an attack, with 80 ms attack startup) remains unresolved; timings were not silently changed. Real two-phone latency/reconnect acceptance remains open.


## Third local audit (2026-10-09)

Added three transport regressions: releasing controls during rejection recovery, reconnecting to a terminal result before the next fight, and releasing held controls on blur while an ACK is pending. All passed immediately; these scenarios did not reproduce another production defect. No production code was changed in this audit.

- Four targeted client files: 30 passed, including the three new regressions.
- Isolated local server integration: 9 passed, 195 intentionally filtered out. Covered active-period overlap ending, the loser's last three seconds during assistance, assistance deadline on reconnect, recovery clearing on the next period, old-result worker isolation, result hold/resume, terminal match cancellation, and no-winner result after downtime.
- Logs: `/private/tmp/hockey-fight-third-web.log`, `/private/tmp/hockey-fight-third-server.log`.
- No push, merge, or deployment. Real-device multiplayer latency and the original Rengo shot-button incident remain unverified; this audit does not close those gaps.


## Full mechanics follow-up and combined controls (2026-10-09)

No production behavior changed. Added client multi-pointer regressions, current-rule combined-action tests for both player indices, and expanded the real localhost two-socket scenario so both participants send held input concurrently. Its existing command assertions now scope sequence numbers to the user: sequences are per participant, so querying seq=2 without a user selected the newly added counterpart command. The initial expanded test failed on that fixture ambiguity; the scoped assertions passed afterward.

Coverage and results:

- Client fight components, controls, transport and store: 92 passed in 19 files. New cases cover independent crouch/guard/movement release, attack while other fingers remain held, rapid re-press before a tap-release timer, and resetting held controls between fights.
- Core fight suites: 57 passed. Four new cases use actual default rules (5 HP, 80 ms startup), checking crouch+attack with immediate crouch release and crouch+guard against a low strike for both player sides.
- All ordinary-duel fight integration cases: 27 passed (177 unrelated cases filtered out), covering invitation concurrency, allowance, decline/timeout/forced start, pause boundaries, rewards, assistance, draw and resumed shooting. Two WebSocket cases at 0/150 ms compensation now also verify both participants' concurrent commands and independent releases.
- Combined filtered server run: 55 passed, 184 skipped. Unfiltered seven server fight-unit files: 35 passed and 3 failed, no skips. These three are the already identified 150 ms reactive-block contract at RTT 50/100/200 ms; current 80 ms startup does not satisfy it. This is unresolved, not a green full suite.
- DailyScreen incoming invitation, draw/resumed shooting and defeat/medical aid: 3 passed (214 unrelated cases filtered out).
- Root typecheck passed; diff whitespace check passed.
- Browser QA: outgoing invitation shows a 10-second timer, allowance drops from 3 to 2, hockey stays playable until acceptance. Incoming invitation hides allowance and presents accept. Accepted fight disables shooting and exposes controls after countdown. After fight return, a shot increased the rendered shot counter from 00/30 to 01/30 and the shot button became enabled again; no captured browser warnings/errors. Screenshot: `/private/tmp/hockey-fight-resumed-shot.jpg`. This preview is synthetic, not a real authenticated multiplayer browser session. Multi-touch combinations were exercised in component tests; physical phone touch acceptance remains open.

Logs: `/private/tmp/hockey-fight-complete-*.log`, `/private/tmp/hockey-fight-dual-controls.log`. No remote writes or deployment. Two-phone behavior and the exact original Rengo incident remain unverified.


## Approved instant-hit timing (2026-10-09)

The user approved removing attack startup, keeping visible attacks and short recovery. New fights now store rules v5: startup 0 ms, active 100 ms, recovery 150 ms, maximum normal attack cadence 250 ms. Existing saved fight rules retain their startup; game-core version is 83. Delivery grace and transport latency are not removed or claimed absent.

Observed RED before fixes:
- Default attack did not hit at its press timestamp.
- Zero-startup processing revisited the same event timestamp and spent two shields/reapplied recoil for one contact. v5 does not schedule the current instant twice; older rules preserve replay behavior.
- Late contact presentation imposed another 80 ms reaction delay.
- Removing that delay initially replayed a locally predicted strike on late confirmation. A regression reproduced it; presentation now shows a missing strike only if that action was not already shown.

GREEN:
- 63 targeted core/version tests, including instant contact, single shield/recoil, simultaneous trades, split-step deterministic replay and explicit saved-v4 startup.
- 89 client fight tests and 3 DailyScreen invitation/result/assistance cases.
- 27 ordinary-duel fight integrations, including both real localhost sockets and resumed shots (177 unrelated tests filtered out).
- 41 server fight-unit tests, no skips. The six network-defense cases now express the newly approved contract: guard already held blocks, reaction after contact cannot undo damage, at RTT 50/100/200 ms plus jitter. The former 150 ms reactive-defense requirement has been intentionally superseded, not fixed under its old semantics.
- Root typecheck and lint passed. Local browser click reduced the opponent from 5 to 4 HP; screenshot `/private/tmp/hockey-instant-hit.jpg`.

No deployment. Real-phone latency remains unverified. Logs: `/private/tmp/hockey-instant-*.log`.
