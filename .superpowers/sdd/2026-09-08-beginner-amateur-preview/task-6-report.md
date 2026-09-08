# Task 6 implementation report

Status: DONE

## Changed files

- `packages/web/src/api/bonusGames.ts`
- `packages/web/src/screens/BonusGamesScreen.tsx`
- `packages/web/src/screens/BonusGamesScreen.test.tsx`
- `packages/web/src/screens/BonusGamePlayScreen.tsx`
- `packages/web/src/screens/BonusGamePlayScreen.test.tsx`

## Implementation

- Preserved the server-provided `available`, `sequence_locked`, `purchase_required`, `completed`, and active-attempt card behavior for the first two beginner Bonus Games in each skill category.
- Made `level_locked` cards tappable for an explanation while retaining their locked artwork and lock marker.
- Derived the remaining-goals explanation from the shared Amateur access state and refreshed missing daily progress once for a beginner opening the catalogue directly.
- Kept third-and-later Bonus Game interactions client-side only: they show the shared Amateur access toast and do not send start, unlock, or abandon requests.
- Routed structured `amateur_level_required` responses from unlock, attempt creation, period start, preview acknowledgement, shot, and abandon requests to the shared toast exactly once.
- Suppressed duplicate generic catalogue and play-surface errors for that expected access response while preserving all unrelated error UI.

## TDD evidence

### RED

- Initial focused run failed 8 expected regressions: the third card had no action, all six Bonus Game mutation families did not publish the shared toast, and the play exit modal duplicated the expected access denial with a generic error.
- A direct-catalogue regression then failed because missing beginner daily progress was not loaded before the locked-card explanation.

### GREEN

- `pnpm --filter @hockey/web exec vitest run src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx` — PASS, 66/66.
- `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx` — PASS, 95/95 on the final state.
- `pnpm --filter @hockey/web typecheck` — PASS.
- `pnpm --filter @hockey/web build` — PASS; Vite emitted only its existing non-fatal large-chunk advisory.
- Focused ESLint and Prettier checks for all five changed source/test files — PASS.
- `git diff --check` — PASS.
- Full `pnpm --filter @hockey/web test` — PASS: main non-`DailyScreen` batch 123 files / 1123 tests, followed by all 161 `DailyScreen` cases in the repository's isolated sequential runner. The final direct-load catalogue regression was then re-run in the 95-test focused batch above.

## Scope confirmation

- No push or deployment performed.
- No server, database, economy, reward, attempt-limit, or inventory behavior changed.
- The Amateur section color/navigation behavior from Task 5 was left intact.
- Six pre-existing untracked arena reference WebP drafts were not modified or staged.
