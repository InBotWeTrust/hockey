# Task 10 report — onboarding content admin UI

Implementation commit: `7b16689` (`feat(web): add onboarding content administration`)

## Delivered

- Added the top-level `Онбординг` admin tab without moving existing tabs.
- Added typed onboarding admin API contracts for chain read, step create/edit/duplicate/delete,
  reorder, WebP upload, publish, preview, preview tutorial and statistics.
- Mutations replace UI state with the authoritative full-chain response returned by the server.
- Added fixed Beginner/Amateur selection, published/draft/enforcement status, ordered step list,
  keyboard move controls and drag/drop reorder.
- Added informational/tutorial editor fields, WebP upload and server dimension guidance, CTA copy,
  and shooter/goalie/goal speed controls. Tutorial creation is unavailable for Amateur and after a
  Beginner tutorial already exists.
- Added content, preview and truthful Task 11 statistics-placeholder subsections.
- Reused `OnboardingFlow` in explicit preview mode. Preview skips public view/complete lifecycle
  calls and routes tutorial start/shot through the admin preview adapters and returned preview run id.
- Added visible localized publish/preview errors.

## TDD evidence

RED:

- `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx`
- Result: expected failure because `OnboardingAdmin` did not exist and no `Онбординг` top-level tab
  was rendered.

GREEN:

- Focused admin/onboarding regression suite: 5 files, 44 tests passed.
- Full web suite excluding isolated DailyScreen: 76 files, 576 tests passed.
- Isolated `DailyScreen.test.tsx`: 70 tests passed.
- `pnpm --filter @hockey/web typecheck`: passed.
- `pnpm --filter @hockey/web build`: passed (existing bundle-size warning only).
- `pnpm lint`: passed.
- Scoped Prettier check: passed.
- `git diff --check`: passed.

## Scope boundaries

- No server or game-core implementation was changed.
- No content was uploaded or published.
- No push, dev deploy, production deploy or GLM review was performed.
