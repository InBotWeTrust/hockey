# Series-next-game notification task report

## Scope

Implemented transactional `tournament.series_next_game` push queueing for playoff fixtures. The work is confined to tournament lifecycle/service code and its PostgreSQL integration test. No deploy, feature flag, `main`, production, or GLM action was performed.

## Behaviour delivered

- A non-clinching played or technical result that changes the next conditional fixture to `scheduled` queues one `tournament.series_next_game` delivery per opted-in, subscribed, approved participant.
- Completing the second upstream series queues the first scheduled fixture for both the championship final and the bronze series.
- Delivery keys are `${fixtureId}:series-next-game:${startsAt}`. The ISO `startsAt` is rendered into the event template and a later reschedule queues a new timestamped event.
- The query requires a scheduled fixture with both participants, a `scheduled`/`active` playoff series, approved participant rows, and a tournament in `playoff` state. This excludes missing, paused, cancelled, and completed flows.
- Queue insertion reuses `enqueueTournamentPush`; existing preference/subscription checks and the queue's `(user_id, event_type, event_key)` unique constraint retain idempotency.
- Queueing happens through the existing transaction clients. No lock order or tournament-duel settlement policy was changed.

## Changed files

- `packages/server/src/tournament/fixtureNotifications.ts`
  - Added the guarded series-next-game recipient lookup and queue helper.
- `packages/server/src/tournament/playoffSeriesLifecycle.ts`
  - Enqueues after promoting a conditional fixture and after a dependent series first becomes schedulable.
- `packages/server/src/tournament/service.ts`
  - Re-enqueues an eligible scheduled playoff fixture after a successful reschedule, using its new start time.
- `packages/server/test/tournament/service.integration.test.ts`
  - Added PostgreSQL regressions for played, technical, final/bronze dependent, duplicate, opt-out, and reschedule paths.

## TDD evidence

1. RED: all six new scenarios failed against `b7ae239` because `push_delivery_log` had no `tournament.series_next_game` rows. The assertions expected the promoted fixture's ID and current ISO start in the event key.
2. GREEN: the same six scenarios passed after the minimal queue helper and lifecycle/reschedule calls were added.
3. The full focused integration file then passed with the new coverage included.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @hockey/game-core build` | PASS |
| `TEST_DATABASE_URL=.../hockey_test TEST_REDIS_URL=.../15 pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts --no-file-parallelism -t <six cases>` | PASS — 6/6 |
| `TEST_DATABASE_URL=.../hockey_test TEST_REDIS_URL=.../15 pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts --no-file-parallelism` | PASS — 24/24 |
| `pnpm --filter @hockey/server typecheck` | PASS |
| `pnpm lint` | PASS |
| `git diff --check` | PASS |

The integration run used only the local `hockey_test` database and Redis database `15`, both passed explicitly through `TEST_DATABASE_URL` and `TEST_REDIS_URL`. The full server suite was not run; the controller owns that wider verification.

## Concerns

The focused Vitest file emits the pre-existing `MaxListenersExceededWarning` from `WebSocketServer` while still completing 24/24 tests. It is unrelated to this task's push-delivery assertions.
