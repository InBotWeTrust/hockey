# Duel state follow-up

Base: origin/dev 58d9cc961450e18a21c3008cadcab40d468e59c9. Branch: fix/duel-state-followup.

User authorizes sequential diagnosis and fixes. Production diagnosis remains read-only. Preserve primary checkout changes; reuse the clean task worktree. No delegation.

## Evidence
- Production 55df911. New matches: Rhythm 8febad0d, Marathon 43f7f0fa, Sniper 6d0ca61b, Mix 9d40429d. Public opponent name is Саня Х, matching screenshots.
- Marathon: 11 HTTP 409; exact rejection reasons were not logged. Rhythm shot max 2848ms; Sniper 4428ms; Mix 5908ms. All accepted requests in the other three formats returned 200.
- Mix second periods were 180s on server. Opponent stopped submitting after approximately 48s, while server kept period active; Egor's last shot preceded server end by 35s. UI cause requires reproduction.

## Ordered work
1. Reproduce client/server clock divergence, stale action timing and Rhythm pause inconsistency; RED then isolated fixes and GREEN.
2. Reproduce intermission/start/poll races and own-status priority. Preserve opponent updates without suppressing own confirmed transitions.
3. Refresh profile challenge status after actions and remote completion; prevent overlapping polls and needless request load where proved.
4. Compare timer surface and typography with bonus marksmanship, make the smallest shared-style correction and inspect rendered mobile output.
5. Run focused web/core/server tests as applicable, typecheck/lint/build and review diff. Separate local fixtures from real authenticated device acceptance. Record unresolved evidence gaps rather than calling every delay fixed.

## Implemented and verified
- Reproduced RED: phone wall-clock skew prematurely ends play and changes scoreboard countdown; both now use server time plus monotonic elapsed time. Readiness/break checks use the same clock.
- Reproduced RED: render-captured continuous period time misses 750ms before a tap; tap callbacks sample current monotonic time.
- Reproduced RED: a poll changes object identity and discards a successful period start; reconcile by match identity and participant progress.
- Reproduced RED: concurrent refreshes duplicate requests; share one pending poll. A separate RED test caught indefinite blocking on a stalled poll; use the existing 12s abortable timeout and permit retry.
- Reproduced RED: own continuation deadline and arena break label lose priority to opponent progress; prioritize own state.
- Reproduced RED: period-finish response lacks a local clock anchor; stamp it like other match responses.
- Reproduced RED: an open profile retains outdated duel status. Both profile surfaces now refetch every 2s while mounted; cached data is stale on open.
- Endurance timer uses the shared scoreboard numeral class. Local browser fixture at 390px confirmed matching font, size, weight and backdrop blur with the bonus scoreboard. Screenshot: /private/tmp/duel-timer-mobile.png. This is not authenticated mobile gameplay acceptance.
- Added narrow structured logging for amateur shot 409 rejections (match ID, code, reason; no headers or request body). Test observed RED then GREEN.

## Checks and boundaries
- Final focused web run: 386/386 tests pass across screen, PlayView, stores, profile and API tests.
- Server errors/clock tests: 16/16 pass.
- Web/server typecheck, changed-file ESLint and web build pass. Shared core was rebuilt for current dev before final checks.
- Broad web run: 3173 passed, 9 failed. All nine existing failures reproduced on unchanged HEAD in a temporary baseline: seven observation-training failures and two profile-loading timing assertions. Duel polling test was updated to explicitly advance the 2s polling interval and assert the actual waiting label; all focused tests pass.
- Source review corrected the existing out-of-order-response test to use explicit loads: periodic refreshes intentionally no longer produce parallel requests.
- Current production read-only load sample showed DB CPU usage but no active query waits in the subsequent sample. This does not establish the cause of historical 2–6s requests.
- Exact reasons for the earlier 11 Marathon 409 responses cannot be reconstructed from retained logs. New diagnostics apply only after a future deployment.
- Rhythm sampler already retains flight pauses; no speculative change made. Scoring, deterministic core and DB schema unchanged.
- No new deployment or authenticated two-device replay performed in this follow-up. Do not describe all production sticking as resolved until that acceptance is done.
