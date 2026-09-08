# Task 7 implementation report

Status: DONE

## Changed files

- `packages/web/src/screens/ProfileDestinationScreens.tsx`
- `packages/web/src/screens/ProfileDestinationScreens.test.tsx`
- `packages/web/src/game/achievementAssets.test.ts`

## Implementation

- The profile inventory destination now always renders artwork for all three equipment slots.
- Empty or unresolved stick, skates, and nutrition slots reuse the centralized `placeholderArtworkForKind` mapping.
- A real equipped item image remains the primary source.
- If a real item image fails, the image switches to the correct kind-specific base artwork. Once the fallback is active, another error is ignored so a broken fallback cannot loop.
- The existing centralized base asset mapping in `inventoryArtwork.ts` was reused unchanged; no asset constants were duplicated.

## TDD evidence

### RED

- `pnpm --filter @hockey/web exec vitest run src/screens/ProfileDestinationScreens.test.tsx`
  - failed exactly 2 new regressions: empty slots rendered no base images, and a broken equipped image stayed on its failed URL.

### GREEN

- `pnpm --filter @hockey/web exec vitest run src/screens/ProfileDestinationScreens.test.tsx src/game/achievementAssets.test.ts`
  - PASS: 2 files, 61 tests.
- `pnpm --filter @hockey/web typecheck`
  - PASS.
- Focused ESLint for all three changed source/test files
  - PASS.
- `git diff --check`
  - PASS.

## Coverage added

- An empty beginner inventory renders `/inventory/stick-base.webp`, `/inventory/skates-base.webp`, and `/inventory/nutrition-none.webp`.
- A broken equipped stick image switches to the base stick artwork and remains on the fallback after another error.
- All three centralized base fallback URLs resolve to shipped WebP files.

## Scope confirmation

- No push or deployment performed.
- No inventory API, economy, gameplay, styling, or database behavior changed.
- The six pre-existing untracked arena reference WebP drafts were not modified or staged.
- GLM was not used because repository `AGENTS.md` prohibits it.
