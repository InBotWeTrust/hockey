# Independent playoff pair start times

## Approved intent

Allow an administrator to schedule the daily playoff quota at different start times for different pairs in the same round. Keep round-wide daily quotas, formats, readiness windows and inter-game breaks. A pair without an override inherits the round schedule. Existing tournaments retain their current schedule after deployment.

## User behavior

The playoff schedule editor continues to show the round calendar. For each established pair, a section shows its participants and one start-time field per scheduled day. The inherited round time is displayed until an administrator explicitly overrides it. An administrator can restore inheritance before that pair's daily block begins.

An override applies to the first result-bearing game of that pair on that day. Subsequent games start after the previous game finishes plus the configured break; they do not all start at the override time. When the quota is exhausted, the next game waits for the next scheduled day and that pair's start time on that day.

Changing pair A–B never changes pair C–D, the shared round day, or the start times, notices and ordinary-game restrictions of players in other pairs. Player schedule cards and countdowns display their pair's effective start.

## Persistence and scheduling

Add an additive table keyed by playoff series ID and round game-day ID, containing the override start timestamp and schedule revision. Validate that the series and day belong to the same tournament and round. No override row means inheritance. Store absolute timestamps and display dates/times in the tournament timezone, using the existing timezone conversion utilities.

Centralize effective day start resolution: pair override, otherwise the shared day's rescheduled start, otherwise its first-game start. Use the same resolution for initial attempts, next-day activation, public/admin schedule DTOs, reminders and gameplay locks. For later games of an already-started daily block, the actual attempt start remains authoritative.

Expose an admin schedule read and update contract for a series/day. Updates are transactional under the tournament advisory lock, followed by affected fixture/series locks in the project's existing order. Only pending, untouched first attempts may be updated. Recalculate their readiness and hard deadlines using the original durations. Repeated identical updates are idempotent and do not increment revisions or repeat notices.

Reject edits after readiness has started, either player has confirmed readiness, a duel has started, or a result-bearing game of this pair/day has completed. Existing individual-game rescheduling remains available under its current constraints, but must stop writing a pair-specific transfer into the shared round-day timestamp. Individual retry times remain scoped to their fixture/attempt.

## Validation and existing schedules

The new effective start must be in the future and on the configured day's local date. A pair's day order must remain chronological. Reject a start whose planned quota would overlap that pair's next scheduled daily block, accounting for the configured readiness, game duration and breaks. Keep next-round progression dependent on actual series completion; do not move another round silently to accommodate an override.

General schedule shifts move override timestamps by the same offset as the round days. A shared round-day edit preserves explicit pair overrides, revalidates their order/windows and returns a conflict if the resulting schedule is invalid. Removing/replacing days must preserve overrides for matching logical day numbers or reject the edit where preservation is impossible; never silently drop explicit pair scheduling.

Existing closed series and completed days remain unchanged. No production backfill or live-data repair is part of this feature. No change to best-of rules, daily quotas, rewards, equipment or normal duel limits.

## Communication and locks

Starting and reminder messages use the effective pair/day start and a revision that changes only for affected recipients. Updating one pair must neither notify other pairs nor suppress their reminders. Ordinary-game prelocks use the affected pair's effective start, retaining the current recovery/admission policy. A game already admitted continues under the existing rules.

## Acceptance checks

- Two pairs share a day: A–B begins at 18:00, C–D at 21:00. All DTOs, countdowns, attempts, reminders and prelocks agree with these times.
- Changing A–B leaves C–D and the shared round-day record unchanged.
- No override preserves existing behavior; restoring inheritance returns the pair to the round time.
- Subsequent same-day games use completion plus break; the next day uses that pair's next-day override.
- Duplicate updates produce one revision/notification; concurrent readiness versus schedule edits cannot modify an admitted game.
- Invalid timezone/date, chronological overlap, completed block and foreign series/day combinations are rejected without partial writes.
- General shifts and round edits preserve explicit pair scheduling under the rules above.
- Individual fixture rescheduling no longer affects another pair's reminders or prelocks.
- Verify the real admin editor and player schedule on a narrow mobile viewport using synthetic local participants. Local test evidence, CI, deployed SHA and live acceptance are reported separately.

## Implementation scope

Server: additive migration, a pair/day scheduling module, admin routes and schedule DTOs; tournament service, playoff lifecycle, communications and duel gameplay locks consume effective starts. Web: tournament admin API/editor and player schedule types/rendering. Tests: focused scheduling units, isolated server integrations and rendered editor/player regressions.

Implement in a separate dev-based branch. Deployment to dev or production requires release authorization; production must retain the previously agreed exclusions, including new bonus games.
