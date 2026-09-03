# Square onboarding media contract report

User ruling: onboarding images must use a square 1:1 resolution. This supersedes the earlier portrait 2:3 assumption without authorizing the remaining Task 12 asset batch or any dev publication.

Implementation commit: `24cbcd5`

Changes:

- server upload validation now requires exact 1:1 dimensions and a minimum of 800×800;
- MIME, byte limit, decoded-pixel limit and full WebP decode validation remain unchanged;
- the admin upload hint states the same 800×800 square contract;
- the approved repository reference is checked by exact filename as WebP at 1200×1200;
- the design spec and implementation plan no longer describe portrait media.

TDD evidence:

- RED server: 4 expected failures under the old portrait validator (800×800 rejected, 800×1200 accepted, and old error text returned);
- RED web: the new square upload hint assertion failed against the old portrait copy;
- GREEN server: `test/onboarding/admin.test.ts`, 16/16 passed against real local PostgreSQL/Redis;
- GREEN web: `src/admin/OnboardingAdmin.test.tsx`, 19/19 passed.

Verification:

- `pnpm typecheck`: PASS;
- `pnpm lint`: PASS;
- `pnpm build`: PASS (existing Vite chunk-size warning only);
- focused Prettier check: PASS after formatting the new test helper;
- `git diff --check`: PASS.

The existing image file was inspected by the test but was not modified or staged by this change.
