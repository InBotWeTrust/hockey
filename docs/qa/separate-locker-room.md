# Separate locker room — local acceptance

Date: 2026-10-19. Branch: feature/separate-locker-room. Base: 8c964b0d6a5952138cff9d208eaffd2d75f17a9a, fetched origin/dev before branching. Product implementation commits: 9e7e194b, 262c0abf, 63b3c6b8; this report and DEV fixture adjustments follow them.

## Implemented scope

- One map marker named Раздевалка, positioned by competition level: beginner (15.5%,70%), amateur (50.5%,73%), professional (89%,70%). Actual marker44×44px, separate from existing venue hit areas; existing daily/training venue routes retained.
- Private /locker-room route; /profile/equipment replaces history with /locker-room. The apartment wrapper does not mount on either locker route. /inventory remains the shop.
- One inventory page, exit circle first and inventory circle second. Existing beginner/amateur/detailed locker backgrounds reused; no generated assets.
- Reuses existing DuelLockerTab, inventory API and query cache with duel/profile consumers. Equipment is displayed as confirmed only after the API response. Loading and retry prevent an unsuccessful request from looking like empty/base inventory.
- Recovery and shop remain reachable. No changes to ownership, purchases, equipment effects, resource consumption or server access rules.
- Apartment redesign, clothing constructor and guest visits are separate future stages. The old apartment inventory entry currently leads through the compatible redirect; rearranging apartment pages is not part of this branch.

## Test evidence

- RED before changes: shared component lacked loading/retry (2 intended failures); new screen was missing; legacy equipment was still wrapped by apartment; map lacked locker marker (4 new map failures). An initial shared-query assertion ran before React Query invoked its mutation; changed to waitFor, rather than changing production timing.
- GREEN: 75 tests across DuelLockerTab(5), ProfileDestinationScreens(10), LockerRoomScreen(5), VenuePanorama(21), CityMap(34).
- GREEN: App route/auth tests matching `standalone locker`:3. Covers direct entry, legacy alias, no apartment, exit, history length and unauthenticated redirect. Test auth state is isolated Vitest state, not a browser/account mutation.
- GREEN: DailyScreen test `uses compact shared section headings in the locker and challenge form`:1; 228 other tests intentionally filtered. The test now waits for inventory load before asserting its information button. An earlier incorrect filter skipped all tests and was not counted as success.
- Total:79 distinct selected passing tests.
- Root pnpm typecheck PASS; pnpm lint PASS; pnpm build PASS; git diff --check PASS. Final build contains LockerRoomScreen JS/CSS chunks and PWA output. Chunk-size and Browserslist-age warnings remain.

### Existing App suite failures

Full App suite with new tests:26 PASS /3 FAIL, plus2 image.decode errors. Independently reran the original App.tsx and App.test.tsx from exact base8c964b0d:23 PASS /same3 FAIL and same2 image.decode errors. Restored working versions after comparison. Failures:

1. gates a direct authenticated URL and hides routed content and app chrome;
2. keeps mandatory onboarding visible when browser Back changes the URL;
3. keeps /prices free of bottom navigation for an authenticated visitor.

Onboarding image.decode is unavailable in jsdom; prices expects500 монет. These failures are outside this change and were observed on the exact base, not inferred. The whole suite is not green; no unrelated fixes made.

## Rendered browser acceptance

Internal browser, Vite127.0.0.1:5198, existing DEV section-panoramas-qa.html fixture. Real screen/components with explicit synthetic in-memory transport. No login, real API, purchase, resource consumption or saved account changes.

- All3 levels at320×740 and430×932: correct existing background,1 tab, horizontal overflow0. [Measurements](separate-locker-room-assets/metrics.json).
- [Beginner430](separate-locker-room-assets/beginner-430.png), [professional320](separate-locker-room-assets/professional-320.png).
- Map marker selected via actual tap, then Открыть раздевалку; observed actual inventory screen. Each level's marker measured44×44 and unobstructed at its center; no duplicates. [Amateur map](separate-locker-room-assets/map-amateur-430.png).
- Selected an owned synthetic stick in its real details modal; confirmed card changed to Ультимейт Ван1, Осталось3броска. No live data touched.
- Exit returned to the map. Initially the fixture's GameHub failed because daily fixture state was initialized only for scene=map; extended fixture initialization to locker/locker-alias before repeating the rendered flow.
- Legacy URL fixture redirects to standalone screen. Safe-bottom34px: after scroll, shop button bottom686.5px above dock top759.4px. Long card/navigation captions retain existing duel/shared-dock ellipsis behavior; full equipment name remains available in its detail modal/accessibility label.

Browser fixtures use MemoryRouter, so they do not prove browser history back/forward. Replacement history is covered by App routing tests; actual authenticated browser history and cross-screen duel equipment interaction remain unverified.

## Review and boundaries

Self-review of complete source/test diff against approved first-stage spec: route protection/alias, one page, level-specific marker, existing venue routes, backgrounds, shared confirmed query and error handling. No additional actionable findings identified. No independent reviewer was used: delegation/model changes were outside scope.

Plan rulings:

- The planned extraction already exists on base; reused DuelLockerTab instead of creating a duplicate LockerInventory. Cost: shared component keeps its historical duel-specific name.
- No agents; sequential implementation and self-review. Cost: no independent review.
- Reused DEV fixture for visual acceptance, including its required synthetic daily state. Cost: rendered evidence is not authenticated E2E.

Physical devices, live authenticated inventory mutation, full game suite, CI and dev/production runtime have not been verified. No deployment or merge performed. Unrelated dirty main checkout preserved.
