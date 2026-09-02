# Task 8 implementation report

Implementation commit: `1c1da10` (`feat(web): add the first-goal onboarding step`)

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
- Tutorial shot transport failures remain governed by the existing PlayView pending-shot behavior; Task 8 required retryable start lifecycle and immediate retries for authoritative non-goals, not a new generic shot-error UX.
