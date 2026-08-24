# Tournament scheduler fixes report

## Scope

Implemented every item from `task-schedulers-review-1.md` in the isolated
`co_dex/tournaments` worktree. The change is limited to tournament scheduled
push selection and its PostgreSQL integration coverage, plus the approved
daily-maintenance verification coverage. No deploy, production, `main`, feature
flag, GLM, or unrelated tournament-lifecycle code was changed.

## Changed files

- `packages/server/src/push/scheduled.ts`
  - Live reminders now select only `approved` participants while retaining the
    existing `tournament_events` preference condition.
  - Snapshot timing rules are accepted only as integer milliseconds in the
    inclusive `0…86_400_000` range. A malformed reminder container falls back
    to the default one-hour reminder, invalid members of an otherwise valid
    array are ignored, and malformed/fractional/oversized deadline leads fall
    back to the 30-minute default.
  - Scheduler keys include the scheduled-start or window-end epoch millisecond
    for live, opened, and deadline notifications. Thus one rescheduled window
    gets a distinct delivery while repeated ticks for that exact window remain
    protected by `push_delivery_log` uniqueness.
  - Opened and deadline notifications require `window_ends_at > now`.
  - The tournament-live template receives `minutes`, matching its persisted
    `{{minutes}}` variable.
- `packages/server/test/push/scheduled.test.ts`
  - Added PostgreSQL integration regressions for multiple offsets, approved
    recipients and opt-out, `{{minutes}}` rendering, malformed timing rules,
    rescheduled keys, repeated-tick deduplication, and expired windows.
- `packages/server/test/tournament/daily-maintenance.integration.test.ts`
  - Added a real simultaneous `finalizeDueTournamentDailyDays` regression:
    one caller returns one finalized day/two participants, the other returns
    zero, and exactly two result rows exist.
  - Added a Fastify plugin-level regression proving enabled scheduling runs
    daily finalization without any VAPID option.

## Root causes

1. `jsonb_array_elements_text(... )::bigint` trusted every admin snapshot
   member. Non-arrays, strings, decimals, and excessively large numbers could
   fail the global scheduling transaction.
2. The live-reminder query explicitly included withdrawn, removed, and
   disqualified participants.
3. The renderer supplied `minutesLeft`, while the shipped default tournament
   template contains `{{minutes}}`.
4. Delivery keys used only fixture ID and offset/lead, so a valid reschedule
   collided with the delivery of an older schedule version.
5. Opened/deadline selection did not reject a fixture whose window had already
   ended.
6. Daily finalization and its VAPID-independent plugin invocation were already
   implemented, but lacked the requested concurrent and plugin-level evidence.

## TDD evidence

Each scheduler behavior was added test-first, run against local `hockey_test`,
then implemented minimally and rerun green.

1. Approved recipients and multiple reminder offsets
   - Red: `enqueues each valid reminder offset only for active opted-in
     participants` found a withdrawn recipient in `push_delivery_log`.
   - Green: after the `participant.state = 'approved'` predicate, the same
     test passed with exactly two deliveries for the approved, opted-in user.
2. Template variable
   - Red: the persisted body rendered `До согласованного старта осталось  мин.`
     instead of `... 60 мин.`.
   - Green: after supplying `minutes`, the exact rendered body test passed.
3. Malformed rule isolation and bounds
   - Red: a mixed reminder array aborted the scheduler with
     `invalid input syntax for type bigint: "bad"`.
   - Green: invalid array values were ignored, malformed containers/default
     deadline values fell back safely, and unrelated daily delivery plus two
     deadline/default and two live deliveries were committed.
4. Reschedule-aware keys
   - Red: after `rescheduleTournamentFixture`, the new version's scheduled
     event had `targets: 0, claimed: 0` because the old key already existed.
   - Green: both schedule versions receive one live/opened/deadline delivery;
     all six repeated ticks have `targets: 0, claimed: 0`.
5. Expired fixture window
   - Red: a tick one minute after close still targeted an opened/deadline
     delivery.
   - Green: the same test observes zero targets and zero delivery rows.
6. Daily maintenance verification
   - The approved implementation was not changed. The new concurrent test and
     no-VAPID Fastify-plugin test both passed on their first execution, proving
     the existing advisory-lock and scheduling behavior rather than fabricating
     a production red state.

## Verification

All database commands were run serially against local `hockey_test` with the
explicit local `TEST_DATABASE_URL` and `TEST_REDIS_URL` environment variables.

| Command | Result |
| --- | --- |
| `pnpm --filter @hockey/server exec vitest run test/push/scheduled.test.ts` | PASS — 11/11 tests |
| `pnpm --filter @hockey/server exec vitest run test/tournament/daily-maintenance.integration.test.ts` | PASS — 3/3 tests |
| `pnpm --filter @hockey/server typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm exec prettier --check packages/server/src/push/scheduled.ts packages/server/test/push/scheduled.test.ts packages/server/test/tournament/daily-maintenance.integration.test.ts` | PASS |
| `git diff --check` | PASS before report creation; rerun after report/commit follows |

The controller retains ownership of the full test suite, so it was not run in
this task.

## Concerns

None found in scope. Existing global scheduler transaction/advisory lock,
preference semantics, `push_delivery_log` exactly-once constraint, injected
daily-domain clock, and VAPID-independent finalization are preserved.
