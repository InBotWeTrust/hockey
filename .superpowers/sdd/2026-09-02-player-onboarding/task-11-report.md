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

## Independent review fix round 1

The first independent review found two blocking client-side read-back races:

1. Statistics data was stored independently of the active chain/version/date filters, so an already loaded table could briefly remain visible under a newly selected version and a chain without published versions could retain prior metrics.
2. A successful player mutation updated the detail cache only when that cache already existed; saving before the detail request resolved could discard the authoritative mutation response, and a late stale detail response could overwrite it.

Both were reproduced with deferred-response tests before the fix. Statistics snapshots are now keyed to the exact `chain/version/from/to` tuple; rendering requires an exact key match, chain changes synchronously clear version context, and effect cleanup prevents out-of-order responses from becoming current. Player mutations now keep their returned user as modal-local authoritative state, which remains dominant over an absent or late stale detail cache; save failures still preserve the previous authoritative display and edit state.

Fix verification:

- Deferred version/date/out-of-order, no-version chain, and save-before-detail tests — 3/3 passed.
- Full focused admin UI — 28/28 passed.
- Full non-Daily web suite — 76 files, 589/589 passed.
- Isolated full DailyScreen — 70/70 passed.
- Web typecheck, root lint, root build, Prettier, and `git diff --check` — passed.

Fix commit:

- `9a8a1de fix(web): isolate onboarding admin read-backs`
