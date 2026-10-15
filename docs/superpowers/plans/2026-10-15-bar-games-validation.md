# Bar games validation — 2026-10-15

Base: `c3094ea0` (`origin/dev`). Isolated branch: `feature/bar-games`.

## Local evidence

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- game-core: 29 targeted tests passed (engines, runtime, mapping, existing layout, version).
- web: 70 tests passed across new games, bar entry, lobby and bottom navigation; all 95 existing card tests passed after updating the expected sole opponent to Daria.
- API error localization regression: expected 409 busy state now gives a Russian actionable explanation. API contract tests also passed.
- server bar regression: 134 passed, 49 skipped without the general integration environment. New route validation/auth and command idempotency tests passed.
- Dedicated PostgreSQL 16 instance, fresh uniquely named schema: 5 integration tests passed. Covers repeatable migration, concurrent command retries, queue pairing/isolation, duplicate invite acceptance, readiness/countdown, ownership and cross-admission with real old card rooms/local leases. Schema was removed by the test cleanup. New tests use `BAR_GAMES_TEST_DATABASE_URL` or the existing dedicated `TEST_DATABASE_URL` in CI; they do not reset public schema.
- Independent read-only review: no confirmed important defects reported.

## Browser evidence and limits

At 360×780, Playwright exercised a complete checkers move, dart swipe (exactly one dart consumed), pool aim/power-release shot, help modal and character result modal. A local temporary harness used the actual shared engines and components; it did not change authentication or access real accounts. The temporary entrypoint was removed.

Found and corrected: long pool rules exceeded viewport; rules now scroll internally with a sticky header and close control. Also covered navigation suppression during new matches, preservation of a local card game on a lease-renewal failure, and stale snapshot merging.

20 generated WebP assets (about 3.1 MB) inspected as a contact sheet: 3 backgrounds, 3 character invites, 7 character outcomes and 7 online outcomes. Built-in imagegen used; prompts and reference paths are recorded beside the spec. Existing Daria card assets retained.

This is not authenticated two-client dev acceptance or physical-device acceptance. No dev or production deployment was performed during implementation.

## Known baseline failures

The full game-core run had 4 failures in `openWindowObservation.test.ts` and `openWindowTrainingScenes.test.ts`: authored banks still declare version 78. All four were reproduced against original core version 88 before this feature; they are not relabeled as passing. This feature increments core version to 89 and independently pins new bar matches to engine version 1. No old hockey rules or training banks were rewritten.

## Remaining release acceptance

- Exercise invitation/search and full parties using existing authorized accounts on dev in two real clients.
- Check touch controls on a physical phone, reconnect/background behavior, and verify exact deployed SHA after an authorized dev rollout.
- Production is outside scope.

## UI follow-up: card HUD and full-screen darts scene

Reused the existing Durak HUD components/styles: player/avatar on the left, clock in the centre, opponent/avatar on the right, and action feedback directly below. Additive optional runtime feedback records actual scoring/bust, pocketed balls/fouls, captures and timeout actions without changing game rules or requiring a DB migration.

Darts now uses one full-screen bar background. Its SVG board is a separate transparent layer beneath the HUD/feedback; the inset background, rounded frame and field shadow were removed. At 360×780 the rendered scene occupies exactly the viewport, document scroll height is 780, the field background is `none`, shadow is `none`, and corner radius is zero. Timer and menu centres both measured x=180.

Follow-up verification: 20 core bar-game tests, 3 server service tests, 29 web/card regressions, root typecheck/lint and final web build passed. Dedicated HUD tests cover avatars, timer warning colours, feedback placement and bust text. Local browser verified both the updated menu and a real dart gesture. Existing known full-suite baseline gaps remain as described above.
