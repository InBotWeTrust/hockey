# Task 6 report — player completion controls and onboarding statistics

Implementation commit: `0f930c8` (`feat(server): expose onboarding controls and metrics`)

## Delivered

- Admin user list/detail DTOs expose independent Beginner and Amateur completion flags.
- Admin user patch changes either flag without touching the sibling flag or reset timestamp.
- The player row is locked before reading authoritative previous values. Each actual flag transition writes one audit event with `field`, `previous`, `next`, and `administratorId`; equal supplied values write no audit event.
- A `true -> false` transition sets only the matching reset timestamp and a `false -> true` transition clears only the matching timestamp.
- `GET /admin/onboarding/stats?chain=&versionId=&from=&to=` reports natural-only unique starts/completions, conversion, completion time, repeat starts, tutorial attempts, and step reach/drop-off counts.
- Incomplete runs become drop-offs at the inclusive 30-minute boundary; younger active runs are excluded.

## TDD evidence

RED was recorded before production changes:

- `pnpm --filter @hockey/server exec vitest run test/admin/routes.test.ts`
  - `1 failed, 8 passed`; expected completion flags were missing from the admin user DTO.
- The first combined attempt was blocked by sandbox access to local PostgreSQL (`EPERM`) and a later onboarding-only attempt encountered the known shared-schema migration race. Integration runs were therefore repeated one file at a time with local database access.

Focused GREEN after implementation:

- `test/admin/routes.test.ts`: `9/9 PASS`.
- `test/onboarding/admin.test.ts`: `14/14 PASS`.

Regressions and static verification:

- `test/onboarding/service.test.ts`: `12/12 PASS`.
- `test/onboarding/routes.test.ts`: `8/8 PASS`.
- Full server suite, `vitest run --no-file-parallelism`: `61 files, 528 tests PASS`.
- `pnpm --filter @hockey/server typecheck`: PASS.
- `pnpm --filter @hockey/server build`: PASS.
- `pnpm lint`: PASS.
- Scoped Prettier check: PASS.
- `git diff --check`: PASS before implementation commit.

## Files

- `packages/server/src/admin/routes.ts`
- `packages/server/src/onboarding/adminRoutes.ts`
- `packages/server/test/admin/routes.test.ts`
- `packages/server/test/onboarding/admin.test.ts`

## Self-review

- Unique-user totals use `count(distinct user_id)` so repeated runs do not inflate starts or completions; `repeatStarts` is natural run count minus unique starters.
- Tutorial averages and first-attempt rate are based only on natural runs with an authoritative `tutorial_goal` event.
- Chain, version, and started-at date filters feed the same filtered-run CTE for every aggregate.
- Step reach and drop-off counts are unique users per step. A drop-off uses the last viewed step of each old incomplete run.
- Published/draft content management and the shared Task 5 admin guard were not changed.

## Concerns

- The schema has no `migrated` run source: migration compatibility is represented by pre-completed user flags rather than analytics runs. The endpoint's strict `source = 'natural'` predicate excludes every supported non-natural source (`preview` and `admin_reset`) and any future source by default.
- No deployment, push, content publication, or GLM review was performed.
