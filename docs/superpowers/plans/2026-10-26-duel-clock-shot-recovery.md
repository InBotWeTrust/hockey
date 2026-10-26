# Duel clock and shot recovery implementation plan

**Goal:** Fix the reported Marathon window reset/freeze, period countdown, and Rhythm shot responsiveness/recovery.
**Base:** origin/dev f9ed476e409d33fd7a1061d72f44fc76607f63cf. Branch fix/duel-clock-shot-recovery.
**Authorization:** User requested all diagnosed fixes. Implement locally in this session; no production mutation, push, merge or deployment. No delegation/model changes.
**Architecture:** Keep authoritative gameplay and local animation clocks separate. Preserve a monotonic server-time estimate across same-period snapshots without rewriting authoritative snapshot fields. Reconcile rejected optimistic actions without dropping opponent progress. Optimize measured deterministic work only while proving unchanged results.
**Stack:** TypeScript, React/Zustand, Fastify, deterministic game-core, Vitest.
**Spec:** User reports in this chat on 2026-10-26; Rhythm f7ce3ee2-1e64-4697-8683-76fe1f601c8f and Marathon 0d9deab1-8176-498f-af3b-9aaa1da3a90c.

## Constraints and evidence
- Preserve unrelated dirty primary checkout; isolated worktree starts clean.
- Runtime examined: 1526b0c. Relevant duel/core sources match dev base.
- Marathon rules: 4000 ms window, 1000 ms result pause, scoredClockVersion 2.
- Delayed timestamp rebasing reproduces old value, repeated freeze, then jump to full window.
- Rhythm logs: 35 shot requests >2s, 4 >5s, max 7099.7 ms, three 409. This does not establish the exact conflict reason.
- Participant period_paused_ms is 26878/36878 in Rhythm; investigate legitimate fight pauses before attributing all gaps to faults.
- No scoring/balance changes, no bypass of server validations.
- RED before each fix, then GREEN, regression checks, diff review and local rendered acceptance where feasible.

## Task 1: Monotonic clocks and Marathon display
Files: packages/web/src/components/duel/scoredClock.ts and tests; packages/web/src/stores/amateurDuelStore.ts and lock tests; packages/web/src/screens/DailyScreen.tsx and tests; Marathon clock tests.
- [ ] Reproduce delayed response after local goal result closes using actual store + timer functions.
- [ ] Maintain same-match/period monotonic clock anchors through fetch, shot acknowledgement and polling; reset at match/period change. Keep remaining/elapsed snapshots paired with their server timestamp.
- [ ] Test 4s/7s, delayed and out-of-order polls, goal/miss, result pause, final period, reconnection.
- [ ] Show completed active time plus current active period, respecting period bounds and gameplay pauses.
- [ ] Run relevant web suites and render the changed flow.

## Task 2: Rhythm responsiveness and rejected shots
Files: packages/game-core/src/rhythm.ts / tests and/or duelInventory.ts / tests if profiler proves the bottleneck; packages/web/src/stores/amateurDuelStore.ts / lock tests; server duel regression tests if its contract changes.
- [ ] Profile deterministic late-period sampling and history catchup, retain before/after evidence.
- [ ] Add meaningful work-budget and output-equivalence regressions; observe RED.
- [ ] Eliminate repeated deterministic work without changing sample outputs or engine version semantics.
- [ ] Reproduce 409 arriving after an opponent poll; reconcile authoritative local progress and unblock retries while preserving opponent state.
- [ ] Test failure/timeout/retry and stale-match response handling.

## Task 3: Verification and review
- [ ] Build game-core before consumer checks.
- [ ] Run game-core suite if changed, focused web/server regression suites, typecheck and relevant lint.
- [ ] Use dedicated local PostgreSQL/Redis only for integration tests.
- [ ] Review diff for regressions, confirm no unrelated edits and document any missing browser/device/prod acceptance.
- [ ] Record outcomes here; retain local branch for user review.

## Execution notes
- Implementation directly in this session, per user's authorization and prohibition on unsolicited delegation.
- Test environments must use test-only storage; no production data edits.

## Final implementation and verification — 2026-10-26

The checklist above records the original plan; the final scope and evidence are below.

### Implemented
- Same-match/period clock anchors no longer rewind on delayed acknowledgements or polls. Authoritative elapsed/remaining values remain paired with their server timestamp. Out-of-order same-revision scored snapshots cannot revive an old Marathon window. New matches and periods reset the anchor.
- A rejected optimistic shot is rolled back even if an opponent poll replaced the state object. Confirmed shots and newer matches/periods are protected; retry can reuse the rejected shot index. Failed recovery also refreshes authoritative state without extending the submit wait.
- Cached immutable deterministic range results in a bounded 2048-entry cache. No scoring, RNG output, balance or engine-version change. The measured late-period Rhythm sample improved from approximately 850 ms to 65 ms with the same output (93733).

### Scope corrections
- The off-rink total-time cell shows completed active duration; it is not the live period countdown. It needs no new live-summary calculation. The reported running period clock is covered by the monotonic-anchor fix.
- Duel result display does not wait for the response by default. The original hypothesis about waiting for the response was rejected.
- Actual production 409 reasons were not logged; the reproduced recovery defect does not establish why those three production requests conflicted. Rhythm fight pauses also account for part of the observed shot gaps.

### Evidence
- Observed RED then GREEN for delayed goal acknowledgement, rollback after opponent polling, stale poll window revival, and excessive RNG creation (330467 before the cache, work budget below 1000 after).
- Final focused web suites: 100/100 passed, including fight revisions, timeouts, shot locks, Marathon/scored clocks and PlayView.
- Rendered DailyScreen regression: 1 selected test passed (240 other tests filtered out). Two new Rhythm performance/equivalence tests passed; earlier focused Rhythm suite: 21 passed.
- Full game-core suite: 603 passed, 4 failed. All four failures reproduce unchanged on the clean base: two stale observation-scene cases in openWindowObservation.test.ts and two training-scene cases in openWindowTrainingScenes.test.ts. They remain outside this fix.
- Server integration: 47 passed against dedicated local PostgreSQL/Redis, covering Rhythm, scored duels/formats and scene clocks. Temporary services stopped afterward.
- game-core build, all-package typecheck, changed-file ESLint and git diff --check passed.
- Local Playwright component fixture at 390x844: delayed response at 1202 ms during the goal result; after result close the window decreased from 3823 ms at 1677 ms to 2322 ms at 3178 ms, while period remaining continued decreasing. Temporary fixture removed. This is not an authenticated duel, physical-device or production acceptance test.
- Final diff reviewed locally; changes confined to this task worktree. No push, merge, deployment or production mutation. Branch remains fix/duel-clock-shot-recovery on base f9ed476e409d33fd7a1061d72f44fc76607f63cf.
