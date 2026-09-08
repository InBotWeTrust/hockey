# Task 5 implementation report

Status: DONE

## Changed files

- `packages/web/src/screens/SectionsScreen.tsx`
- `packages/web/src/screens/SectionsScreen.test.tsx`
- `packages/web/src/screens/DailyScreen.tsx`
- `packages/web/src/screens/DailyScreen.test.tsx`
- `packages/web/src/tournament/TournamentCatalog.tsx`
- `packages/web/src/tournament/TournamentCatalog.test.tsx`
- `packages/web/src/api/amateurDuel.ts`
- `packages/web/src/api/tournament.ts`
- `packages/web/src/api/tournament.test.ts`

## Implementation

- Made the Amateur section card fully colored and browsable for beginners.
- Added the progress copy `Осталось N шайб до статуса «Любитель»` and preserved the existing Amateur/professional copy.
- Kept read-only duel and tournament navigation available, including opponent profiles, filters, tournament details, standings, schedule, bracket, and rules.
- Guarded beginner-owned duel mutations: matchmaking join/leave, challenge, invite accept/decline/cancel, ready state, loadout changes, period start, shots, settlement-trigger paths, and playable tournament-duel entry.
- Guarded tournament application/withdrawal, fixture opening, and live-time proposal/response actions while leaving schedule navigation available.
- Routed structured stale-server `403 amateur_level_required` responses to the shared Amateur access toast and preserved generic error UI for unrelated failures.
- Kept tournament readiness and congratulation acknowledgements outside the access guard.
- Left Bonus Games unchanged; their beginner preview is implemented by Task 3/Task 6 scope.

## TDD evidence

### RED

- The initial Sections regression failed because the beginner card was muted, showed the old progress copy, and opened the lock modal instead of the Amateur section.
- The initial duel/GameHub regressions failed because beginner actions reached mutation callbacks instead of the shared Amateur access toast.
- The initial tournament regressions failed because application, withdrawal, and playable fixture actions reached the API for a known beginner.
- The stale-client fallback regressions failed before mutation wrappers mapped the structured server rejection to the shared toast.

### GREEN

Final isolated focused runs:

- `pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx` — PASS, 19/19.
- `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx` — PASS, 156/156.
- `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentCatalog.test.tsx` — PASS, 49/49.
- `pnpm --filter @hockey/web exec vitest run src/api/tournament.test.ts` — PASS, 8/8, including five mutation-family fallback cases.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `pnpm --filter @hockey/web build` — PASS; Vite emitted only its existing non-fatal large-chunk advisory.
- Focused ESLint for all nine changed source/test files — PASS.
- Focused Prettier check for all nine changed source/test files — PASS.
- `git diff --check` — PASS.
- Earlier full `pnpm --filter @hockey/web test` run — PASS: 120 non-`DailyScreen` files / 1101 tests, plus the sequential `DailyScreen` runner. After the final test-only `act(cleanup)` adjustment, the isolated `DailyScreen` suite passed 156/156 without the prior warning.

## Review

- GLM model requested: `zai-coding-plan/glm-5.2`.
- GLM verdict: BLOCKED. The external review start was rejected by the security policy because the packet would send internal implementation details to Z.AI without explicit authorization. The review was not retried or bypassed.
- Codex verdict: APPROVED. Local source and diff review found no missed Task 5 mutation family and no scope expansion.
- A combined single-process Vitest experiment reproduced cross-file DOM contamination in `TournamentCatalog.test.tsx`; all required files pass in fresh isolated processes, matching the repository's test isolation model.

## Scope confirmation

- No push or deployment performed.
- Bonus Games were not changed.
- `dismissTournamentReadinessHint` and `acknowledgeRegularSeasonPodiumCongratulation` remain available.
- Six pre-existing untracked arena reference WebP files were not touched or staged.
