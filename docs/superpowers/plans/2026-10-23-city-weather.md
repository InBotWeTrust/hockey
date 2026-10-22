# City weather implementation plan

Goal: Save a selected city in the account, use its solar times for map lighting and its actual weather for map effects. Local only.

Approved design: city name entry and one-click search/save in profile settings; no device geolocation; server-side WeatherAPI key and shared city cache; fallback to last weather on outages, device-local lighting until a city is selected. Keep four existing artwork variants. Sunrise -30/+60 minutes is morning; sunset -60/+30 is evening, capped to avoid overlaps on short days. Polar day/night follow solar elevation.

- [x] Add nullable users.map_city JSONB migration and authenticated city search/read/save/weather routes. Canonical locations resolved through WeatherAPI; timeout, validation, shared 30-minute Redis cache, 24-hour stale retention and bounded provider quota.
- [x] Tests first: server ownership/invalid selections/cache/provider failures; solar boundary, timezone, season, polar cases and city changes while images decode.
- [x] Add city settings with explicit save, errors and WeatherAPI attribution. Query keys scoped to account and selected city. Preserve old city on failed save and prevent duplicate submissions.
- [x] Pass selected city/weather to CityMap from SectionsScreen; remove random map weather, add reduced-motion/visibility-safe rain overlay.
- [x] Run focused tests, web/server typecheck and build; inspect mobile settings/map fixture. Report live-provider, fixture, database and authenticated-flow evidence separately.

No push, PR, merge, deployment, credential/account changes or production DB writes. New local key is ignored by Git. Database migration is committed source only unless an isolated local target is confirmed.

## Final verification

- Base: origin/dev 512c1dc9f6a8257429de815fc359374315355cca; feature/city-weather in an isolated managed worktree.
- 133 affected web tests passed before adding the date-label clock; clock/settings/solar targeted suite rerun afterward. 10 server tests passed using Fastify injection with isolated adapters, not a real database.
- Web and server typechecks/builds and scoped ESLint passed.
- Real WeatherAPI search, timezone resolution and current weather checked with the user-supplied local key. Key is ignored and absent from tracked changes.
- Mobile 360px fixture checked: one-click city save, city-not-found leaves previous selection, full-width inset input, circular reset, rain canvas, no overlap with game panel, weather outage preserves map.
- Added account-scoped per-minute limits, 60/day search/save budget, and shared 90k/month upstream cap. Clearing a city does not consume the daily provider budget.
- Database migration 241 is source only: no dedicated local Ultimate Hockey PostgreSQL/Redis target was available; unrelated CRM containers were left untouched. Cross-device persistence and authenticated runtime remain unverified.
- No push, PR, merge, deployment, or database mutation.
