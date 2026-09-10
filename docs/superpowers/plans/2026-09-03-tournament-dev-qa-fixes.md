# Tournament Dev QA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every behavior change follows RED -> GREEN -> REFACTOR.

**Goal:** Replace precomputed playoff game slots with a sequential series lifecycle and fix the related readiness, inventory, notifications, schedule, and result UI defects found during the dev tournament.

**Architecture:** Keep the existing tournament round, series, fixture, and attempt entities. A round game day owns one start time; later fixtures become available from actual prior results plus a configured break. Attempt deadlines are event-driven: readiness starts at availability, and the completion deadline starts when the second player becomes ready.

**Tech Stack:** React 18, TypeScript, Zustand, TanStack Query, Fastify 4, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md`

## Global Constraints

- Preserve commits `95f3f28` and `e1c88b8` and all later work based on them.
- Dev and production are separate. Deploy only through the `dev` branch GitHub Actions workflow; do not modify production.
- Do not precompute or display individual future start times for playoff fixtures.
- Every round game day has one date and one start time. All series in the round open in parallel.
- Inter-game break: default 5 minutes, integer 1-30, configurable per round.
- Completion window after both players are ready: default 20 minutes, integer 5-60, configurable per round.
- Readiness is required again before every game. A replay does not consume the configured result-bearing game count for the date.
- Public schedule reads must not load every fixture and filter them only in the browser.
- Existing settled and active attempts are immutable; compatible forward-only migrations must preserve tournament history.

---

### Task 1: Sequential playoff schedule contract and migration

**Files:**
- Modify: `packages/server/src/tournament/playoffScheduling.ts`
- Modify: `packages/server/src/tournament/lifecycleRules.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/fixtureAttempts.ts`
- Create: next numbered migration under `packages/server/db/migrations/`
- Test: `packages/server/test/tournament/playoffScheduling.test.ts`
- Test: `packages/server/test/tournament/service.integration.test.ts`
- Test: `packages/server/test/tournament/migration-contract.test.ts`

**Interfaces:**
- Add `interGameBreakMinutes` to each playoff-round rule.
- Keep `gameDurationMinutes` as the persisted compatibility key, but interpret it as the completion window beginning when both players are ready.
- Stop writing `plannedStartIntervalMinutes` in new admin rule revisions; continue parsing legacy snapshots.
- Persist an additive inter-game break duration on round game days. Do not drop legacy columns.

- [ ] Add failing validation and migration-contract tests for defaults, ranges, legacy parsing, and non-destructive schema changes.
- [ ] Add failing integration tests proving only the first game-day start is scheduled and later games have no independent public slot.
- [ ] Implement the additive migration and compatible rule normalization.
- [ ] Replace slot-based round validation with date/start/count validation. Today is valid when its local start is still in the future.
- [ ] Preserve settled/active attempts and convert only unstarted attempts to event-driven availability.
- [ ] Run focused scheduling, migration-contract, and service integration tests.

### Task 2: Transactional series lifecycle and delayed rounds

**Files:**
- Modify: `packages/server/src/tournament/fixtureAttempts.ts`
- Modify: `packages/server/src/tournament/fixtureLifecycle.ts`
- Modify: `packages/server/src/tournament/playoffs.ts`
- Test: `packages/server/test/tournament/fixtureAttempts.integration.test.ts`
- Test: `packages/server/test/tournament/playoffs.test.ts`

**Interfaces:**
- Replace next-game choice with explicit next-game availability and `breakEndsAt` state.
- Recalculate `readiness_expires_at` and `hard_deadline_at` atomically when the second player becomes ready.
- Keep historical `tournament_next_game_choice` rows readable but create no new rows.

- [ ] Add failing tests for `settled -> inter-game break -> ready_check -> active` without reload.
- [ ] Add failing tests for a new readiness action before every game and for double-request idempotency.
- [ ] Add failing tests for one-player incomplete technical victory and both-incomplete admin incident.
- [ ] Add failing tests proving a replay follows the normal break but does not consume the daily result-bearing count.
- [ ] Add failing tests for round auto-delay to 30 minutes after the final prior-round series settles when the configured next-round start has passed.
- [ ] Implement the transactional state machine and remove runtime use of immediate/scheduled choices.
- [ ] Run the focused lifecycle and playoff suites.

### Task 3: Tournament day visibility and notifications

**Files:**
- Modify: `packages/server/src/tournament/communications.ts`
- Modify: `packages/server/src/push/tournament.ts`
- Modify: tournament classic active-game query/service files discovered during implementation
- Modify: `packages/web/src/components/BottomNav.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: corresponding server communication tests and `packages/web/src/components/BottomNav.test.tsx`

**Interfaces:**
- Add a participant-scoped playoff-day-starting event with an idempotency key containing tournament, round/day, user, start instant, and schedule revision.
- A main-screen tournament item is visible from T-30 until all of that user's games for the date are complete.

- [ ] Add failing server tests for T-30 audience selection, push plus personal system message, and duplicate suppression.
- [ ] Add failing tests for reschedule messages and a new reminder after a normal move.
- [ ] Add failing tests for one immediate combined notice when a new start is 1-29 minutes away.
- [ ] Add failing client tests for badge `1`, visibility during inter-game breaks, and complete removal after the user's games are done.
- [ ] Implement event scheduling/reconciliation and main-screen visibility from the same authoritative state.
- [ ] Run focused communication, classic-game-list, DailyScreen, and BottomNav tests.

### Task 4: Separate readiness, loadout confirmation, and inventory effects

**Files:**
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/src/duel/amateur/periodLoadout.ts`
- Modify: tournament attempt/game adapters discovered from the route trace
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Test: amateur-duel and tournament-classic server integration tests
- Test: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Readiness, loadout confirmation, and period start are separate idempotent server actions.
- Tournament-local loadout state never updates profile equipment.
- First series game starts from profile equipment; later periods/games inherit the last series selection with current quantities.

- [ ] Trace a stick, skates, and nutrition item through the working standard duel and record the exact tournament divergence in the implementation report.
- [ ] Add failing tests that the information modal only closes via `Понятно` and readiness remains false.
- [ ] Add failing tests for button states `Готов -> Начать -> Бросок`, reload recovery, and double taps.
- [ ] Add failing tests for profile defaults, series-only changes, inter-period/inter-game carryover, and automatic removal of exhausted items.
- [ ] Add deterministic tests proving tournament stick effects match client/server simulation and all three resource types debit exactly once.
- [ ] Implement the separated actions by reusing the standard amateur-duel loadout service.
- [ ] Run focused inventory, tournament classic, and DailyScreen suites.

### Task 5: Date-scoped schedule, results, and series modals

**Files:**
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Modify: `packages/web/src/tournament/TournamentCatalog.tsx`
- Modify: `packages/web/src/tournament/TournamentPlayoffBracket.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: tournament service and web tournament tests

**Interfaces:**
- Add a date-scoped public response with `myGames` and `hasOtherGames`.
- Add cursor pagination for other games with a fixed page size of 5.
- Replace `nextGameChoice` in the attempt DTO with explicit break/next-game availability.
- Store readiness-hint dismissal by `(tournament_id, user_id)` and expose an authenticated idempotent mutation.

- [ ] Add failing API tests proving initial public reads do not fetch all fixtures and cursor pages are stable and duplicate-free.
- [ ] Add failing UI tests for own games first, lazy other games, no-own-game CTA, and cache separation by date.
- [ ] Add failing tests for own `Победа`/`Поражение`, neutral foreign results, no regular-season seeds, playoff seeds, and persisted scores.
- [ ] Add failing tests that future fixture cards have no individual time while history shows actual start date/time.
- [ ] Add failing tests for the result modal: no points, `Вы 1:2 Соперник`, series outcome title, break countdown, and readiness transition.
- [ ] Add failing tests for the bracket series modal: equal player rows, series score, full game history, red own loss, green foreign winner, responsive containment.
- [ ] Implement the date-scoped API, cursor loading, hint persistence, and both modal layouts.
- [ ] Run focused service and web tournament suites.

### Task 6: Integrated verification and dev release

**Files:**
- Modify only confirmed defects found by review or integrated verification.

- [ ] Build `@hockey/game-core`, then run server and web tests covering every modified subsystem.
- [ ] Run repository `typecheck`, `lint`, `test`, `build`, and `git diff --check`.
- [ ] Perform local browser acceptance with two users: normal series, replay, readiness no-show, incomplete game, loadout changes, reschedule today, delayed next round, lazy schedule, and both modals.
- [ ] Run independent GLM implementation review with a sanitized packet; verify and fix every supported Critical/Important finding.
- [ ] Run a final whole-branch code review and repeat affected tests after fixes.
- [ ] Fetch current `origin/dev`, integrate without resetting or dropping existing work, and create/update the PR into `dev`.
- [ ] Merge only after checks are green, watch the dev deploy workflow through migration/container recreation/smoke test, and verify runtime SHA equals the merged SHA.
- [ ] Repeat the critical two-user acceptance scenarios on `https://dev.hockey.inbotwetrust.ru` and report exact PASS/FAIL evidence. Production remains untouched.
