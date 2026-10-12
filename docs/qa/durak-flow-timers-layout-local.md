# Durak flow, timers and layout — local QA

Date: 2026-10-12. Base: `bff5a345a0050ac902d76aecc29a5e25e864d0a6` (`origin/dev`).
Branch: `fix/durak-flow-timers-layout`.

## Changes

- Online throw-in action uses «Бито» for a defended bout and «Завершить» when taking. Other players retain their throw-in turns.
- Empty hands with an exhausted deck automatically pass/finish after three seconds. An unbeatable final attack receives an automatic take after three seconds; a beatable attack keeps its normal response window. A last trump ace against each of the four computer opponents resolves in about six seconds without another click.
- Readiness countdown is five seconds for legacy matches and rooms. Each new bout starts with 40 seconds; subsequent accepted actions renew the clock to 30 seconds. Invalid moves, stale retries and reads do not extend the deadline.
- The menu uses one row: player, time and opponent/player count; trump is shown in the menu only for six players. Deck cards are 44 px wide; the trump is upright beside the deck, with the covering back offset down/left inside the reserve pocket. One pair is large; two and three pairs shrink progressively, with the fourth opening a second row. Four to six pairs stay visible in two rows, shrinking to the available space without table scrolling.
- Game-core version increases from 86 to 87. Persisted card-state shapes are unchanged. Existing stored deadlines remain unchanged until the next accepted action/timeout. Release still needs its normal active-session/version checks: initial/advanced/open-window training routes reject stored runs from an older core version with 409. There is no release authorization or runtime change in this task.

## Verification

- RED observed before implementation: core timing tests, computer timer/automatic finish tests, online labels/empty-hand UI tests and server readiness tests.
- Targeted game-core: 20 passed.
- Entire card-client directory: 88 passed across 15 files.
- Server card readiness/state/routes: 21 passed. Room admission and persistence integration: 14 skipped because no dedicated `TEST_CARD_DATABASE_URL` is configured. Storage doubles exercise actual command/reconcile logic but do not prove database locking or persistence.
- Repository typecheck, lint and build: passed. Build reports existing chunk-size and Browserslist warnings.
- Full game-core: 433 passed, 4 failed. All four failures reproduce from the unchanged base in `openWindowObservation.test.ts` and `openWindowTrainingScenes.test.ts` (stored scenes use old core versions).
- Full web wrapper's first phase: 2243 passed, 17 failed, two unhandled `image.decode` errors. Sixteen failures and both errors reproduce from the unchanged base. One asset test exceeded its 5-second limit during the broad run; the unchanged-base targeted file and the current targeted file both pass all 39 tests. The wrapper stops before its separate DailyScreen phase on failure.

## Rendered verification — synthetic local preview

This uses the existing development-only preview transport, not authenticated online players.
Open `/durak-layout-preview.html` on the local Vite server for interactive width/height, seat-count, opponent and scenario controls. Width/height changes resize an iframe viewport without restarting the game.

- Seats 2, 3, 4, 5 and 6; viewports 360×640, 360×740, 390×844, 430×932 and an extra 320×568 check. Controls visible at every seat count, menu trump visible only at six seats; hands stay above the viewport bottom; no document-level horizontal overflow.
- User correction: horizontal table scrolling was removed. Full bouts now use two rows (three columns, second row starting with the fourth pair); card sizes adapt to the available width and height. Browser checks confirm all six pairs fit without horizontal overflow.
- Computer Grigory, synthetic final trump ace: two taps to play, win modal after approximately 6.4 seconds, no finish button. Hook tests cover Maria, Grigory, Arsenich and Daria.
- Preview console: only React Router future-flag warnings; an initial favicon request returned 404.

## Baseline web failures

- src/app/App.test.tsx > App routing + auth > gates a direct authenticated URL and hides routed content and app chrome
- src/app/App.test.tsx > App routing + auth > keeps mandatory onboarding visible when browser Back changes the URL
- src/app/App.test.tsx > App routing + auth > keeps /prices free of bottom navigation for an authenticated visitor
- src/bar/BarPanorama.test.tsx > retains usable defaults on error and retries the read
- src/bar/BarScreen.test.tsx > opens the bar at the manager and pages to the online terminal
- src/components/OpenWindowObservationPlay.test.tsx > observation lessons > explains the first paused opening before completing without a shot
- src/components/OpenWindowObservationPlay.test.tsx > observation lessons > lets the player classify a paused frame without a timer
- src/components/OpenWindowObservationPlay.test.tsx > observation lessons > marks a perceived opening in a moving clip without shooting
- src/components/OpenWindowObservationPlay.test.tsx > observation lessons > submits an untouched moving clip as a skip only at its end
- src/components/OpenWindowObservationPlay.test.tsx > observation lessons > retries the same marked moment after a network failure
- src/components/ScoreBoard.test.tsx > ScoreBoard > renders configurable rows with their own metric counts and a notice
- src/components/recordedObservation.test.ts > recorded observation playback > uses the recording timeline, including separate shooter and scene clocks
- src/components/recordedObservation.test.ts > recorded observation playback > labels the path visible now, not the historical shot result
- src/screens/SectionsScreen.test.tsx > SectionsScreen > opens the bar page from its restaurant card
- src/screens/SectionsScreen.test.tsx > SectionsScreen > groups frequent actions before the longer game modes
- src/screens/SectionsScreen.test.tsx > SectionsScreen > stacks training and tasks beside a tall shop card

## Remaining gates

CI, authenticated multi-browser online acceptance, database integration and deployed dev/production runtime evidence are not claimed. No deployment or merge into dev/main was performed.

Follow-up visual QA: the upright trump is beside the deck and its corner is exposed by moving the covering back down/left; 1–6-pair scenarios are selectable in the local preview. At 360×640 and 390×844, 1–3 pairs progressively shrink, and 4–6 pairs fit in two rows without horizontal overflow.

Menu follow-up: player names use one 11 px font and ellipsis; the hand count remains visible separately. Menu and seat avatars have an explicit 1 px rim. Hint side padding is 13 px, matching the shared ice-game notice style (previously 24 px). Browser verification covers 2–6 seats, including a computer opponent and long names on 320 px screens.

Size/corner follow-up: played-card width caps are 108/90/80 px for one/two/three pairs and 70 px for four to six pairs. The complete artwork fills its common 2:3 box, so the bottom edge meets the same 8 px corner mask as the top (contain previously left unused space below the artwork).

Overlap follow-up: defence cards shift down/right by 16–22 px according to available cell width, exposing the attack corner more clearly while preserving the centered combined footprint. The deck back shifts 16 px left and 18 px down relative to the upright trump.
