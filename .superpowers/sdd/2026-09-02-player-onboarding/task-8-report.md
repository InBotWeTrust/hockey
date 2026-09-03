# Task 8 implementation report

Implementation commit: `1c1da10` (`feat(web): add the first-goal onboarding step`)

Review-fix commit: `5b65106` (`fix(web): harden onboarding tutorial recovery`)

Review-fix round 2 commit: `a20b78c` (`fix(web): resync rejected tutorial shots`)

## Scope delivered

- Extended `PlayView` with opt-in result copy while preserving the existing default labels and renderer/gameplay path.
- Reconciled opt-in result copy against `serverResult`, so a locally claimed goal cannot unlock or present the tutorial goal when the server reports a save/miss.
- Added the tutorial start/shot web API contracts. Shot submission strips the PlayView input to server-owned timing plus claimed result.
- Added `TutorialShotStep` using the existing PlayView, normal perspective defaults and sizes, `rookie`, the courtyard background, server snapshot frequencies, normal puck speed, and no shot cap.
- Added retryable session start, StrictMode start de-duplication, immediate retry state after non-goals, and server-only goal confirmation.
- Integrated only `tutorial_shot` into `OnboardingFlow`; a confirmed goal is retained when navigating Back/forward during the mounted run.
- Kept the fixed PlayView contained inside the onboarding rink and added reduced-motion handling after confirmation.

## TDD evidence

- RED 1: focused run failed because `TutorialShotStep` did not exist and the PlayView override still rendered `СЭЙВ` instead of `Ещё раз`.
- RED 2: authoritative mismatch test rendered local `Первая шайба!` instead of server-reconciled `Ещё раз`.
- RED 3: StrictMode replay called tutorial start twice.
- RED 4: containment test proved PlayView's fixed layout escaped the tutorial rink.
- GREEN: `pnpm --filter @hockey/web exec vitest run src/game/PlayView.test.tsx src/onboarding/TutorialShotStep.test.tsx src/onboarding/OnboardingFlow.test.tsx` — 3 files, 22 tests passed.
- Gate regressions: focused PlayView/tutorial/flow/gate/App run — 5 files, 34 tests passed.

## Verification

- `pnpm --filter @hockey/web test` — 553/553 non-Daily tests passed; isolated DailyScreen runner completed all 65 named scenarios with exit code 0.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `pnpm --filter @hockey/web build` — PASS (only the pre-existing large-chunk warning).
- `pnpm lint` — PASS.
- focused Prettier check — PASS.
- `git diff --check` — PASS.
- static game-core diff check — PASS; no `game-core` or version change.
- static tutorial import scan — PASS; no daily, training, bonus, reward, inventory, or achievement API is imported/called.

## Self-review

- The server session snapshot, not editable step data, supplies runtime movement frequencies.
- Tutorial state increments attempts without a finite `shotsTotal`; only `goalConfirmed` from the tutorial response unlocks CTA and increments the displayed goal.
- The API request does not send client frequency or puck-speed fields.
- Existing PlayView callers receive no copy override and therefore preserve their current labels/result behavior.
- Reload semantics remain server-backed: the active in-memory flow is discarded, while a fresh tutorial start reads the run's authoritative session/goal state. An unfinished run without a goal requires a new goal.

## Concerns

- No rendered browser QA was performed in this implementation task. The CSS containment contract is regression-tested and the production build passes, but visual acceptance should still inspect the tutorial at representative mobile heights before release.

## Independent review fix round 1

The initial review reported three Important findings. All were reproduced with failing tests before production changes:

- A rejected `submitShot` produced an unhandled rejection and left PlayView's pending-shot guard stuck. PlayView now catches failures, clears pending state in `finally`, ignores stale/unmounted resolution and exposes an optional error callback. Tutorial UI shows a dismissible retry message and permits another shot; normal callers remain unchanged.
- Tutorial navigation previously exposed both PlayView's Home action and the outer Back button, and a tutorial published at index zero could decrement below zero. PlayView now has an opt-in hidden-back contract, the tutorial owns exactly one outer Back only when `stepIndex > 0`, and the flow clamps backward navigation to zero.
- Reduced motion was applied only after a confirmed goal. Tutorial preference is now detected before PlayView mounts and an opt-in PlayView override shortens flight/result timing from the first attempt; default callers retain existing timing.

Fix verification:

- RED: 7 focused failures plus 2 unhandled promise rejections across the three findings.
- GREEN focused Task 8: 3 files / 30 tests PASS with no unhandled errors or React warnings.
- GREEN expanded PlayView/tutorial/flow/gate/App: 5 files / 42 tests PASS.
- Full web runner: 75 non-Daily files / 562 tests PASS, then all 65 isolated DailyScreen scenarios PASS; exit code 0.
- Web typecheck/build, root lint, focused Prettier, `git diff --check`, and unchanged game-core check: PASS.

## Independent review fix round 2

Two further Important findings were reproduced before the second fix:

- After an optimistic attempt, a rejected response left the tutorial counter at `N + 1` although the server might still expect `N`. The tutorial now calls the existing idempotent `POST /tutorial/start` as an authoritative re-sync before enabling another attempt. Tests cover both safe outcomes: an uncommitted request retries the same index, while a committed request with a lost response continues from the server-advanced index.
- Hiding PlayView's Back button collapsed the first grid column and shifted the shot CTA. The controls now preserve an inert 56px first slot, explicitly keep the shot button in column two, and leave the sound action in column three.

Round-2 verification:

- RED: focused tests failed on missing authoritative re-sync and missing controls structure.
- GREEN focused Task 8: 3 files / 31 tests PASS.
- GREEN expanded PlayView/tutorial/flow/gate/App: 5 files / 44 tests PASS.
- Full web runner: 75 non-Daily files / 564 tests PASS, followed by all 65 isolated DailyScreen scenarios; exit code 0.
- Web typecheck/build, root lint, focused Prettier, `git diff --check`, and unchanged game-core check: PASS.
