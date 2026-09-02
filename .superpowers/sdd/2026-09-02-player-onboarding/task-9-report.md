# Task 9 implementation report

Implementation commit: `849fcbc` (`feat(web): defer amateur onboarding until game exit`)

## Scope delivered

- Added one local `DailyScreen` exit helper that first switches the local play view away from the rink, preserves the existing replace-navigation destination, and only then requests onboarding refresh.
- Wired the helper to daily, training, and amateur-duel exits without adding polling or reacting to `/me`, shot, period, or threshold updates.
- Added a separate standalone bonus-game exit helper for terminal return, continue-later, and successfully confirmed abandon paths.
- Kept bonus-game loading/error navigation free of onboarding refresh because those states are not active play surfaces.
- Preserved all existing destinations, replace/push semantics, game-store state, abandon failure behavior, and gameplay callbacks.

## TDD evidence

- RED: the focused transition run produced 5 expected failures: daily, training, duel, terminal bonus return, and continue-later all navigated successfully but called onboarding refresh zero times.
- GREEN: focused DailyScreen, BonusGamePlayScreen, and OnboardingGate run passed 3 files / 92 tests.
- The daily regression updates lifetime goals to the amateur threshold while PlayView remains active and asserts zero refresh calls before Back.
- Bonus tests assert terminal/continue/successful-abandon exits call exactly once, while opening/cancelling the exit prompt and a failed abandon call zero times.

## Verification

- `pnpm --filter @hockey/web test` — 75 non-Daily files / 564 tests PASS, followed by every isolated DailyScreen scenario (67/67) PASS; exit code 0.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `pnpm --filter @hockey/web build` — PASS (only the pre-existing large-chunk warning).
- `pnpm lint` — PASS.
- focused Prettier check — PASS.
- `git diff --check` — PASS.
- No server or game-core source changes.

## Self-review

- No gate refresh is attached to state effects, queries, shots, timers, period completion, or changed profile data, so crossing the threshold cannot interrupt PlayView.
- Each successful exit handler invokes navigation once and refresh once. The asynchronous refresh is intentionally fire-and-forget after navigation initiation so it cannot block the existing exit.
- Failed authoritative abandon keeps the player on the bonus rink and does not refresh.
- Error-state catalog navigation remains plain navigation because there is no gameplay surface to leave.

## Concerns

- React Router's `navigate` call is synchronous and has no failure return value; “successful navigation initiation” is therefore the strongest observable boundary available to these handlers. Tests assert the destination appears before accepting the exit behavior.
