# Task 5 implementation report

Status: DONE AFTER REVIEW FIXES

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

## Reviewer fix round 1

The follow-up review in `task-5-review.md` found five access gaps and one duplicate-toast issue. This round fixes only those findings.

### Corrections

- Existing playoff matches remain navigable for beginners; only fixture creation is guarded when `duel_match_id` is absent.
- Expired Amateur previews do not auto-settle for beginners and no longer emit an unsolicited access toast or an unhandled rejection.
- Classic tournament start, shots, and recovery actions use the same known-client guard and stale-server API fallback as other Amateur mutations.
- Classic store and modal error UI suppress generic duplicates for expected `amateur_level_required` responses while preserving normal error handling and optimistic-shot rollback.
- Profile challenge, global invite-toast, and chat invite accept/decline actions are guarded locally without closing or invalidating read-only content on an expected stale-server denial.
- The server rejects `start_classic` recovery before inventory, balance, recovery-application, or ledger mutations.
- API wrappers are the sole owner of structured server-error to toast mapping; components only classify expected access errors to suppress generic UI.

### Added regression coverage

- Existing-match navigation versus absent-match fixture creation for a beginner.
- Expired beginner preview without automatic settlement.
- Classic start, shot, and recovery local guards plus stale-server API mapping.
- Classic store generic-error suppression and optimistic rollback.
- Profile challenge, global invite toast, and in-chat invite actions, including stale-server action visibility.
- Server-side Classic recovery rejection with unchanged inventory and economy state.

### Final verification for this round

- `pnpm --filter @hockey/game-core build` — PASS.
- `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts --no-file-parallelism` — PASS, 88/88.
- `pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx` — PASS, 161/161.
- `pnpm --filter @hockey/web exec vitest run src/tournament/TournamentCatalog.test.tsx` — PASS, 49/49.
- `pnpm --filter @hockey/web exec vitest run src/chat/test/ChatRoomScreen.test.tsx` — PASS, 36/36.
- `pnpm --filter @hockey/web exec vitest run src/chat/components/DuelChallengeModal.test.tsx` — PASS, 2/2.
- `pnpm --filter @hockey/web exec vitest run src/components/DuelInviteToast.test.tsx` — PASS, 5/5.
- `pnpm --filter @hockey/web exec vitest run src/chat/test/UserProfileSheet.test.tsx` — PASS, 11/11.
- Classic/API focused batch — PASS, 13/13.
- Web non-`DailyScreen` suite — PASS, 123 files / 1115 tests.
- Web and server typechecks — PASS.
- Web and server builds — PASS; Vite emitted only its existing non-fatal large-chunk advisory.
- Focused ESLint and changed-web-file Prettier checks — PASS.
- `git diff --check` — PASS.

### Review status

- `task-5-review.md` findings: resolved.
- GLM review was not retried because the previously recorded security-policy block still applies to sending internal implementation details to Z.AI.
- No push or deployment performed.
- Six untracked arena WebP drafts remain untouched and unstaged.
