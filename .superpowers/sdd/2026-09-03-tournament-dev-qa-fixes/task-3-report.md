# Task 3: playoff schedule overview and communications

## Implemented

- The active tournament API returns both classic and scheduled/active playoff fixtures.
  A replay between games is represented as `inter_game_break`; completed fixtures are excluded.
- The hub counts a playoff inter-game break as one active game and opens the tournament schedule.
- A T-30 lifecycle reconciliation sends one participant-scoped tournament push and one personal
  system message per round/game-day/start/revision. Its stable game-day key prevents a second
  reminder when the next series game materializes on the same day; advisory-lock and message
  metadata keys make delivery idempotent.
- A normal fixture reschedule sends `tournament.rescheduled` only to the two fixture participants;
  the later T-30 reminder remains separate. A move 1–29 minutes before start sends only the combined
  playoff-day-starting notice.
- Removed legacy immediate `series-next-game` sends from fixture promotion, schedule rebuilding, and
  fixture rescheduling so they cannot duplicate the T-30 flow.
- Fallback game-day grouping uses the tournament timezone rather than UTC when a replay has no
  `round_game_day_id`.

## Evidence

- RED: the normal-reschedule API test initially observed four broad `tournament.rescheduled` pushes
  plus two early `tournament.series_next_game` pushes instead of the two fixture-scoped notices.
- RED: after the first reminder and first settled game, a materialized next same-day game produced
  four pushes rather than two.
- GREEN focused server integration:
  - normal reschedule plus later T-30 reminder: PASS
  - 1–29 minute combined notice: PASS
  - T-30 push/DM idempotency across repeated reconciliation and a materialized second same-day game,
    plus removal of a settled fixture from active games: PASS
  - six regressions proving no early series-next-game notice: PASS
- Full `fixtureAttempts.integration.test.ts`: 37 passed. The run logged a known teardown-time
  last-seen warning after test DB reset; Vitest completed successfully.
- Focused web regression suite: `BottomNav.test.tsx` and `DailyScreen.test.tsx`, 132 passed.
- Server and web TypeScript checks passed. `git diff --check` passed.

## Not performed

- No push, dev deployment, production action, or manual dev UI acceptance.
- The full 99-test `service.integration.test.ts` run was attempted but overlapped a prior runner in
  the shared test DB and failed during reset/migration setup. The affected scenarios were rerun
  serially and passed.

## Review round 1/5

- Added a forward-only, game-day-scoped schedule revision. An administrator reschedule advances the
  owning game day (or its legacy round fallback) and records the actual new start. The T-30 key and
  content use that shared revision/start, so the next materialized game or replay on the same day
  does not send a third reminder.
- Paused `needs_reschedule` and `needs_admin_decision` attempts remain on the hub after their old
  deadline with an explicit administrator-decision card.
- T-30 reconciliation is a safe no-op when `SYSTEM_USER_ID` is unavailable; it never queues a
  push without the paired personal system message.
- RED/GREEN review regressions: 3 passed. The combined reschedule/materialization case proved
  exactly four deliveries (two original plus two after admin reschedule), with no extra Game 2 push.

## Review round 2/5

- Replay attempts do not themselves carry `round_game_day_id`. Both schedule revisioning and T-30
  communication now resolve the most recent non-null game-day assignment for the fixture, so a replay
  preserves the original game-day key rather than falling back to the round and duplicating a paired
  notification.
- When a 1–29 minute admin reschedule cannot produce the paired notice because `SYSTEM_USER_ID` is
  absent, the route records no fallback `tournament.rescheduled` push. The reschedule itself still
  completes successfully; delivery remains all-or-nothing.
- RED: with the old fallback condition and real participant push subscriptions, the no-system-user
  HTTP route test returned 200 but created exactly two `push_delivery_log` rows.
- GREEN: after restoring the guard, that same route test returned 200 with zero push rows, zero direct
  chats, and zero messages. The replay regression passed with game-day revision 1 and exactly four
  `tournament.series_next_game` deliveries (two original plus two after rescheduling), including a
  repeated reconciliation.
- Focused server verification: replay regression PASS; no-system-user route regression PASS; the
  three previous notification/paused-board regressions plus replay PASS (4/4).
- Focused web verification: `BottomNav.test.tsx` and `DailyScreen.test.tsx` PASS (132/132). Server
  and web TypeScript checks PASS; `git diff --check` PASS.
- Full web runner was not green: 918/920 passed and two pre-existing/out-of-scope expectation failures
  remain in `TournamentOperations.test.tsx` (expects `Полуфинал 1`, UI renders `Серия 1`) and
  `glassMaterial.test.ts` (expected selected-round color `#13233c`, received `#ffffff`). They were
  not changed in this notification review.
