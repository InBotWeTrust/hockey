# Durak flow, timers and layout — local QA

Date: 2026-10-12. Base: `bff5a345a0050ac902d76aecc29a5e25e864d0a6` (`origin/dev`).
Branch: `fix/durak-flow-timers-layout`.

## Changes

- Online throw-in action uses «Бито» for a defended bout and «Завершить» when taking. Other players retain their throw-in turns.
- Empty hands with an exhausted deck automatically pass/finish after three seconds. An unbeatable final attack receives an automatic take after three seconds; a beatable attack keeps its normal response window. A last trump ace against each of the four computer opponents resolves in about six seconds without another click.
- Readiness countdown is five seconds for legacy matches and rooms. Each new bout starts with 40 seconds; subsequent accepted actions renew the clock to 30 seconds. Invalid moves, stale retries and reads do not extend the deadline.
- Names occupy the first menu row; time and trump remain visible in the second. Deck cards are 44 px wide; the trump is sideways with half exposed. Sparse tables use their available space. Four to six pairs scroll horizontally on short screens.
- Game-core version increases from 86 to 87. Persisted card-state shapes are unchanged. Existing stored deadlines remain unchanged until the next accepted action/timeout. Release still needs its normal active-session/version checks: initial/advanced/open-window training routes reject stored runs from an older core version with 409. There is no release authorization or runtime change in this task.

## Verification

- RED observed before implementation: core timing tests, computer timer/automatic finish tests, online labels/empty-hand UI tests and server readiness tests.
- Targeted game-core: 20 passed.
- Entire card-client directory: 82 passed across 15 files.
- Server card readiness/state/routes: 21 passed. Room admission and persistence integration: 14 skipped because no dedicated `TEST_CARD_DATABASE_URL` is configured. Storage doubles exercise actual command/reconcile logic but do not prove database locking or persistence.
- Repository typecheck, lint and build: passed. Build reports existing chunk-size and Browserslist warnings.
- Full game-core: 433 passed, 4 failed. All four failures reproduce from the unchanged base in `openWindowObservation.test.ts` and `openWindowTrainingScenes.test.ts` (stored scenes use old core versions).
- Full web wrapper's first phase: 2243 passed, 17 failed, two unhandled `image.decode` errors. Sixteen failures and both errors reproduce from the unchanged base. One asset test exceeded its 5-second limit during the broad run; the unchanged-base targeted file and the current targeted file both pass all 39 tests. The wrapper stops before its separate DailyScreen phase on failure.

## Rendered verification — synthetic local preview

This uses the existing development-only preview transport, not authenticated online players.
Open `/durak-layout-preview.html` on the local Vite server for interactive width/height, seat-count, opponent and scenario controls. Width/height changes resize an iframe viewport without restarting the game.

- Seats 2, 3, 4, 5 and 6; viewports 360×640, 360×740, 390×844, 430×932 and an extra 320×568 check. Trump and controls visible; hands stay above the viewport bottom; no document-level horizontal overflow.
- At 360×640 and 360×740, a full six-pair table renders cards 90 px wide and 137 px high. At 320×568 they remain 58.5 px wide and 89 px high. Horizontal scrolling reaches the last pair.
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
