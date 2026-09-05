# Task 5 implementation report

## Delivered behavior

The authenticated public schedule is now selected-date scoped. Its initial
response contains calendar day summaries, only the current player's games for
the requested date, a `hasOtherGames` flag, and daily/classic matchdays. Other
players' fixtures are fetched only after an explicit UI action through stable
cursor pages of five ordered by `(fixture_number, id)`. Each selected date has
an independent TanStack Query cache.

The schedule UI now:

- puts the player's fixtures before the other games;
- keeps other games unloaded until requested and supports further pages;
- labels only the authenticated player's completed fixtures as `Победа` or
  `Поражение`, while foreign results remain neutral score history;
- preserves settled scores, hides regular-season seeds, and shows playoff
  seeds;
- hides individual times for unfinished fixtures and uses the accepted duel
  timestamp for completed history;
- carries `fixture=<id>` into the game route so the result screen can resolve
  the exact tournament attempt.

An unknown projected tournament end no longer clamps the controlled calendar
to the first day. If today is inside an open-ended tournament, the current
available matchday is selected; a configured completed/projected end still
clamps dates normally.

## Readiness preference and result flow

Migration `093_tournament_readiness_hint_preference.sql` adds an additive table
keyed by `(tournament_id, user_id)`. The authenticated GET and idempotent POST
routes read and persist the readiness-explanation dismissal without using
browser-local state. A repeated dismissal preserves the original timestamp,
and another participant remains unaffected.

The tournament result modal uses the fixture-attempt DTO instead of ordinary
league points. It renders `Вы 1:2 Соперник`, a completed-series title such as
`Вы проиграли серию 1:2`, the authoritative inter-game break countdown, and a
button that opens the next fixture when the server marks it available. The
obsolete `nextGameChoice`/`onChooseNextGame` client contract was removed.

## Bracket series modal

The standard accessible modal now contains two equal player rows, the series
score, and the complete fixture history in a bounded scroll region. The series
winner and each game winner are green; the authenticated player's loss is red.
The close action uses the shared circular icon-button in the header. Bracket
fixtures now expose `homeUserId` and `awayUserId`, avoiding name-based identity
for new responses while retaining a compatibility fallback for older payloads.

## RED/GREEN and mutation evidence

- Date-scoped service RED: the initial implementation returned the complete
  fixture list and had no stable page boundary. GREEN returns only the selected
  date player's games, reports hidden other games, and advances duplicate-free
  five-row pages with the composite cursor.
- Readiness persistence RED: there was no server preference table or
  authenticated mutation, and reload relied on `localStorage`. GREEN applies
  migration `093`, stores one row per tournament/user, treats POST as
  idempotent, reads the value after reload, and leaves the other user false.
- Schedule UI RED: other fixtures were eager and shared across date changes.
  GREEN loads them only on demand and the test proves date-specific schedule
  and infinite-query caches.
- Result-history RED: completed personal fixtures had only a generic status,
  future cards exposed individual times, and regular rows leaked seed labels.
  GREEN shows personal win/loss, persisted score and actual start time, hides
  future time, keeps foreign results neutral, and limits seeds to playoffs.
- Result-modal RED: the ordinary duel modal rendered league points and had no
  series/break/next-game contract. GREEN renders the tournament score and
  series outcome, omits points, counts down the break, and opens the returned
  next fixture. Removing the next-game callback made the focused transition
  test fail; restoring it returned GREEN.
- Series-modal RED: the compact history lacked equal player rows, full result
  tones, explicit player identity, and bounded scrolling. GREEN covers all of
  those behaviors and the standard close button.
- Bracket DTO mutation proof: after temporarily replacing `homeUserId` with
  `null`, the real Postgres integration failed on the exact expected player ID.
  Restoring `fixture_home.user_id` returned the same test to GREEN.
- Controlled-calendar regression RED: the full focused web run was 158/162;
  the daily aggregate day was marked `--today` but not `--selected` because a
  missing projected end was incorrectly replaced with `startsAt`. GREEN after
  treating the end as unknown is 162/162.

## Requirement mapping

- Initial public reads do not fetch all fixtures: PASS through the service,
  route, API-wrapper, and authenticated integration tests.
- Stable duplicate-free cursor pages of five: PASS, including route validation
  that requires both cursor fields.
- Own games first, lazy other games, no-own-game CTA, date cache isolation:
  PASS in `TournamentCatalog.test.tsx` and the calendar component tests already
  exercised by its real component render.
- Own win/loss, neutral foreign result, regular/playoff seeds, stored scores,
  future/history times: PASS.
- Tournament result modal without points plus score, series title, break and
  readiness transition: PASS in `DailyScreen.test.tsx`.
- Bracket modal layout, full history, red own loss, green winner and responsive
  containment: PASS in `TournamentCatalog.test.tsx` plus CSS assertions.
- Server-side readiness dismissal scoped to tournament/user: PASS in unit,
  migration-contract, and authenticated Postgres integration coverage.

## Prerequisite regression corrections

The new required `date` query exposed one older integration request to the
public schedule without a date. The request was updated to
`?date=2030-09-01`; its daily-result refresh assertion and the complete 104-test
integration file both pass.

Root lint also exposed four committed no-unused findings outside the Task 5
feature delta: two unused spy bindings in existing `DailyScreen` tests, the
legacy cadence destructuring binding, and an intentionally unused series
finalizer timestamp. The fixes only remove the unused bindings/property and
rename the parameter `_settledAt`; `lifecycleRules.test.ts` remains 18/18 and
the full tournament service integration remains 104/104.

## Fresh verification

- `pnpm --filter @hockey/game-core build` — PASS.
- `pnpm --filter @hockey/server exec vitest run test/tournament/scheduleService.test.ts`
  — PASS, 5/5.
- `pnpm --filter @hockey/server exec vitest run test/tournament/routes-validation.test.ts`
  — PASS, 3/3.
- `pnpm --filter @hockey/server exec vitest run test/tournament/migration-contract.test.ts`
  — PASS, 16/16.
- `pnpm --filter @hockey/server exec vitest run test/tournament/lifecycleRules.test.ts`
  — PASS, 18/18.
- `pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts`
  — PASS, 104/104 against Fastify, PostgreSQL, Redis, and applied migrations.
- Focused web run covering tournament API, catalog/calendar/bracket,
  playoff-attempt view, and `DailyScreen` — PASS, 162/162.
- `pnpm typecheck` — PASS for game-core, server, and web.
- `pnpm lint` — PASS for all package source files.
- `git diff --check` — PASS before report creation; repeated at commit gate.

No GLM review, subagent, push, deployment, production action, synthetic fixture,
or manual dev acceptance was performed. Task 6 remains responsible for
whole-branch review, browser acceptance, integration into `dev`, deployment,
and exact-SHA runtime verification.

## Reviewer fix round 1

The earlier 162/162 focused web run passed, but it did not assert that the
fifth already loaded item was rendered. Adding the reviewer regression to
commit `92dae9b` makes that baseline RED: `other-6` is absent even though the
server page returned five fixtures. The calendar was applying its separate
four-item client collapse to lazy server pages, while the lazy flow never sets
the local expanded-date state. GREEN keeps the four-item collapse for eager
calendar data and renders every item supplied by the lazy paginated contract;
the test also loads the next cursor page and proves `other-7` and `other-8`
remain visible.

The forfeit regression is independently RED on `92dae9b`: a completed
technical result with authoritative winner `away` and numeric storage values
`0:0` is rendered as `Первый 0 : 0 Второй`, so the expected accessible label
`Игра 3: Техническая победа — Второй` cannot be found. GREEN uses the existing
semantic result label for a forfeit and does not expose the misleading numeric
score. Ordinary settled games retain their player-specific color spans and
the established compact accessibility text such as
`Игра 1: Первый 3:2 Четвёртый`.

Fresh fix-round verification after commit `86d070d`:

- Both focused reviewer regressions — PASS, 2/2.
- Focused web run covering tournament API, catalog/calendar/bracket,
  playoff-attempt view, and `DailyScreen` — PASS, 179/179.
- `pnpm typecheck` — PASS for game-core, server, and web.
- `pnpm lint` — PASS for all package source files.
- `git diff --check` — PASS before the code/test commit and repeated at the
  report commit gate.

No GLM review, subagent, push, deployment, production action, synthetic
fixture, or manual dev acceptance was performed during this fix round.
