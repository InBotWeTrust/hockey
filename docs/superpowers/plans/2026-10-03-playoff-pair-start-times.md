# Playoff Pair Start Times Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate without user authorization.

**Goal:** Configure different daily playoff start times for bracket slots before participants are known, and safely edit individual pairs' future days after materialization.

**Architecture:** Preserve shared round game days as defaults. Persist pre-materialization overrides in each configured schedule day under `pairStartTimes`, keyed by stable series keys (`R1S1`, `R1S2`, `R2S1`, `BRONZE`). Materialize them into a series/day table and centralize effective-start resolution for all consumers.

**Tech Stack:** TypeScript, PostgreSQL, Fastify, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-playoff-pair-start-times-design.md`

## Global Constraints

- Use tournament timezone; override local dates must match their scheduled day.
- Preserve existing formats, daily quotas, readiness durations and inter-game breaks.
- Edits affect only the selected series/day and cannot change a daily block after readiness starts.
- Future days remain editable after an earlier day or round has started.
- Existing schedules inherit round times without backfill; production data is not modified manually.
- Work on `feature/playoff-pair-start-times` from refreshed `origin/dev`; preserve production exclusions on any later selective release.

## Review Focus

- Override earlier than the common round start must not cause a stale round-start barrier or automatic rebasing to shift that pair unexpectedly.
- A late daily block must not overlap the pair's next day or start the next round prematurely.
- Third-place slot `BRONZE` must remain independent of the final despite sharing a round number.
- Concurrent readiness and schedule changes must serialize without partial writes or duplicated notices.
- Replacing round-day records or shifting the tournament must not lose explicit pair overrides.

### Task 1: Validate and preserve pre-playoff slot schedules

**Files:**
- Modify: `packages/server/src/tournament/playoffScheduling.ts`
- Modify: `packages/server/src/tournament/lifecycleRules.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Test: `packages/server/test/tournament/lifecycleRules.test.ts`
- Test: new `packages/server/test/tournament/pairScheduling.test.ts`

**Interfaces:** `RoundGameDay.pairStartTimes?: Record<string, string>` stores local HH:mm by slot key. `resolvePairDayStart(day, seriesKey, timezone): Date` resolves override or default without mutating the day.

- [ ] Add RED tests: `R1S1=18:00`, `R1S2=21:00` resolve independently on the same Moscow date; no override uses the common time; malformed time and a slot outside the configured round are rejected; `BRONZE` is valid only for the third-place slot.
- [ ] Run direct server Vitest for `pairScheduling.test.ts` and `lifecycleRules.test.ts`; observe failures before implementation.
- [ ] Validate keys using `buildPlayoffSeriesPlan` for configured bracket size and preserve mappings through normalization, round rules parsing and calendar rebasing. Include earliest/latest effective pair starts in round bounds.
- [ ] Verify normalization round-trip, inherited behavior and daylight-saving invalid-time rejection. Commit the tested contract.

### Task 2: Persist materialized pair/day scheduling

**Files:**
- Create: next available `packages/server/db/migrations/*_playoff_pair_day_schedule.sql`
- Create: `packages/server/src/tournament/pairScheduling.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/fixtureAttempts.ts`
- Test: new `packages/server/test/tournament/pairScheduling.integration.test.ts`

**Interfaces:** Table `tournament_series_game_day_schedule(series_id, round_game_day_id, starts_at, schedule_revision)` uses a composite primary key and foreign keys. Module exports `getSeriesDayStart(client, seriesId, dayId)` and `setSeriesDayStart(client, input)`; mutations occur under the tournament gate and validate same-round ownership.

- [ ] Add RED isolated integrations for two materialized pairs, inheritance, foreign series/day rejection, idempotent same-value update, and retention of overrides while shifting/replacing shared days.
- [ ] Create additive migration; ensure migration tests use only dedicated local PostgreSQL/Redis targets.
- [ ] Materialize slot/day mappings after series creation; schedule each first attempt at its pair's effective start and preserve original readiness/completion duration.
- [ ] Implement transactional update/reset and recompute pending first attempts only. Reject readiness begun, confirmed readiness, existing active duel, settled result-bearing game in selected block, past start and overlapping daily windows. Lock order follows tournament → fixtures → series.
- [ ] Extend shared-day edits and global shifts to preserve mappings by logical day number; reject edits that cannot preserve them safely. Run GREEN and commit.

### Task 3: Make lifecycle, notices, locks and calendars agree

**Files:**
- Modify: `packages/server/src/tournament/playoffSeriesLifecycle.ts`
- Modify: `packages/server/src/tournament/communications.ts`
- Modify: `packages/server/src/duel/gameplayLocks.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/automaticLifecycle.ts`
- Test: `packages/server/test/tournament/fixtureAttempts.integration.test.ts`
- Test: existing communications and gameplay-lock integration suites located by symbol search

**Interfaces:** Every consumer uses the materialized pair/day start; actual attempt time controls individual retries and already-started same-day continuation. Pair revision augments notification keys only for affected participants.

- [ ] Add RED scenarios proving A–B at 18:00 and C–D at 21:00 have independent calendar starts, prelocks and reminder recipients.
- [ ] Resolve next-day activation using the override. Keep same-day starts at previous completion plus break and keep quotas unchanged.
- [ ] Use effective starts in public/admin schedule DTOs, reminder dispatch and nearest scheduled tournament lock. Respect earlier-than-default starts in automatic lifecycle gates.
- [ ] Fix `rescheduleTournamentFixture`: do not write a selected fixture's new start into shared `tournament_round_game_day.rescheduled_starts_at`. Keep retries scoped to their attempt and notify affected participants only.
- [ ] Run tests for next-day activation, same-day continuation, individual reschedule isolation, both-no-show retry, completed series and final/bronze independence. Commit.

### Task 4: Admin APIs for established and future pairs

**Files:**
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/web/src/tournament/adminApi.ts`
- Test: `packages/server/test/tournament/pairScheduling.integration.test.ts`
- Test: `packages/web/src/tournament/adminApi.test.ts`

**Interfaces:** Admin GET `/admin/tournaments/:tournamentId/playoff-pair-schedule` returns slots, optional participant names and days with `dayNumber`, `localDate`, `defaultStartsAt`, `overrideStartsAt`, `effectiveStartsAt`, `editable`, `lockReason`. PATCH on `/playoff-pair-schedule/:seriesKey/days/:dayNumber` accepts `startsAt: ISO | null` (null restores inheritance). Pre-materialization updates the published scheduling configuration under the same scheduling-only revision policy; post-materialization calls the module from Task 2.

- [ ] Add RED API tests for admin authorization, unknown slot/day, before-regular-completion save, after-materialization save, future-day edit during current-day play and idempotent retry.
- [ ] Implement read/update routes with strict ownership/date validation and user-facing Russian conflicts. Preserve administrative audit history and normal notification dispatch.
- [ ] Add typed web client functions; verify exact method, URL and payload. Run GREEN and commit.

### Task 5: Render pair scheduling controls

**Files:**
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.tsx`
- Modify: relevant tournament stylesheet only if existing field layout is insufficient
- Test: `packages/web/src/tournament/TournamentAdmin.test.tsx`
- Test: `packages/web/src/tournament/TournamentOperations.test.tsx`

- [ ] Add RED rendered tests: visible slot labels before participants exist, names after materialization, different times round-trip, restore inheritance, locked today/editable tomorrow and readable error feedback.
- [ ] Extend round-day editor with slot time fields and inheritance hint, preserving mappings on serialization/load. Display championship slots and bronze separately. Use the same editor behavior in operations for materialized series.
- [ ] Keep existing common-time field; saving a pair override must not resubmit unrelated tournament rules or force a complete round restart.
- [ ] Verify save pending state, retry after server conflict, cache invalidation and small mobile layout. Run GREEN and commit.

### Task 6: Verify integrated feature and prepare release

- [ ] Run targeted units/integrations, server/web typecheck, scoped ESLint, build and diff review. Build game-core before consumers if stale.
- [ ] Use synthetic local tournament with two first-round slots at 18:00/21:00; verify pre-playoff configuration, materialization, named pairs, first and second daily games, next day, reminders and locks.
- [ ] Render the real admin and player schedule in a narrow browser; record scenario-specific evidence and any gap without altering production accounts.
- [ ] Open a dev PR with migration, scope and validation evidence. Do not merge/deploy without release authorization for this feature.
- [ ] Any later prod release cherry-picks this feature independently and preserves excluded bonus games and other previously agreed exclusions.
