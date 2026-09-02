# Task 11 report — onboarding metrics and player controls

## Result

- Replaced the statistics placeholder with authoritative Task 6 metrics.
- Added fixed-chain context, an authoritative published-version selector, independent inclusive UTC date bounds, explicit selected-version text, loading/error/retry/validation/empty states, eight summary cards, nullable `—` formatting, and the ordered per-step reached/drop-off table.
- Added the required help text: `Отвал учитывается через 30 минут после последнего действия`.
- Added two independent native completion checkboxes to player edit mode. The patch always sends both local boolean values, while the persisted status remains server-authoritative and updates only from the successful mutation response. Failed saves retain edit state and the prior persisted display.
- Preserved existing user fields, confirmation, block controls, and admin navigation.

## Contract ruling

Task 11 required historical published-version selection, while the existing chain DTO exposed only the current published version and draft. After reporting this mismatch, the controller approved a narrow server extension. `GET /admin/onboarding/chains/:chainKey` now includes only published history as `publishedVersions: [{ id, versionNumber, publishedAt }]`, ordered newest-first; numbering is stable from creation order and the current version remains available through `published.id`.

No other server behavior, game-core behavior, Task 12 content, assets, publication, deployment, or GLM work was added.

## TDD evidence

- RED: focused web suite failed on the missing metrics surface and missing player checkboxes/statuses (4 expected failures).
- RED: the new empty-state test failed specifically because `За выбранный период запусков нет` was absent.
- Server RED execution was initially blocked by sandbox `EPERM` for localhost PostgreSQL; the same focused integration was rerun in the approved local integration contour after implementation.
- GREEN: `pnpm --filter @hockey/web exec vitest run src/admin/OnboardingAdmin.test.tsx src/admin/AdminScreen.test.tsx` — 26/26 passed.
- GREEN: focused published-history integration — 1/1 passed.
- GREEN: `test/onboarding/admin.test.ts test/admin/routes.test.ts` with local test PostgreSQL/Redis — 25/25 passed.

## Regression and static verification

- Full non-Daily web test phase — 76 files, 586/586 passed.
- Isolated full `DailyScreen.test.tsx` — 70/70 passed.
- Web and server typecheck — passed.
- Root build — passed for game-core, server, and web.
- Root lint — passed.
- Prettier check over every changed source/test file — passed.
- `git diff --check` — passed.

The repository wrapper's redundant one-by-one DailyScreen phase was intentionally interrupted after its full non-Daily phase passed; the complete DailyScreen file was separately executed in one process and passed 70/70.

## Commit

- `b3e0284 feat(web): show onboarding metrics and player controls`
