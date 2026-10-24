# Continued performance implementation

Scope: approved second and expanded audits, local only. Continue existing fix/app-performance task branch (six preserved implementation commits); refreshed origin/dev still 86b5102a. Primary checkout remains untouched.

Execution order: regression and fix for redundant social reads, daily history batch, coalesced daily recovery; then ranking reads/cache, image loading, and remaining audit findings with evidence gates. No speculative changes to authoritative gameplay tick or payment settlement. Findings requiring device/realistic-data measurements remain explicit acceptance gaps rather than assumed wins.

Ruling: continue the existing optimization branch, already based on current origin/dev, rather than reimplement six unpublished commits on a second branch. Cost: later release must include all earlier optimization checks/migration.

Baseline: earlier implementation checks are historical, not new verification. Each new task records its own RED/GREEN.

## Implemented and verified in this pass

| Finding | Change | Evidence |
| --- | --- | --- |
| R2-9 | Reuse social fan summary for authorization | RED: 2 queries, GREEN: 1; permitted and forbidden branches; fans integration 19 PASS |
| E-18 | Batch periods for visible daily-history page; derive totals from identical period rows | RED: 40 period queries for 20 games, GREEN: 1; daily integration 26 PASS |
| E-23 | Per-pool/per-player recovery single flight with trailing scan | RED: 11 overlapping calls, GREEN: 1 active + 1 trailing; no dropped newly committed events; separate-pool and retry tests |
| R2-4 | One SQL snapshot for stat-rating page, viewer place and eligibility | RED: 3 calls, GREEN: 1; all 3 metrics exercised on PostgreSQL, experience/rating routes 7 PASS |
| R2-5 | Retain first ranking page on modal close, cancel in-flight continuation | 20 cached pages reduced to 1; original updatedAt retained; experience modal regression PASS |
| R2-10 | Shared per-cache artwork queue, max 4 speculative loads, cancelled queued work on screen cleanup | RED: 100 concurrent creations, GREEN: 4; completion, cancellation, shared budget and explicit retry tests |
| E-19 (partial) | Coalesce same tournament/time/pool best-effort requests; no completed-result cache | RED: 2 simultaneous maintenance calls, GREEN: 1; lifecycle integration 11 PASS |
| E-26 (partial) | Locker uses shared owner-scoped compact summary | RED full /me, GREEN countersOnly summary; loading/error/retry/background tests PASS |
| E-21 (partial) | Prior unused-image cleanup carried forward: nine obsolete cards, two hands; hockey preload disabled in both fight renderers | Source asset totals: 5,443,038 + 127,178 bytes; Pixi and gameplay regressions PASS |

The old resurfacer URLs already do not occur in current dev source. Caretaker images remain functional. Original cleanup worktree preserved. Its patch required a manual merge only for artworkCache because this branch already has bounded retention.

## Current checks

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: PASS.
- Build budget check: PASS; entry JS gzip 180559 bytes, CSS gzip 78277. Compared with previous local 180539-byte JS this is essentially unchanged; this pass targets requests/work, not additional entry-code reduction.
- PostgreSQL integration: daily 26, fans 19, rating routes 7, tournament lifecycle 11 = 63 PASS. Dedicated new local database `uh_perf_round2_20261024` and unused local Redis DB 14; no dev/prod data used.
- Server targeted unit/contract: 12 PASS.
- Web targeted suites: artworkCache 10, PixiStage 8, own summary 4, rating cache 1, experience modal 2, locker 6, responsive fight 3, PlayView 61, bonus catalog 71, profile 43, inventory 68 = 277 PASS across targeted runs. Initial new regressions were observed failing before their implementation. A retry-test expectation was corrected to explicitly request a failed URL again (a previously cached URL is not automatically retried by another caller).
- Local browser: synthetic locker → shop successfully rendered; equipment controls, arena background and shop items inspected. QA preview needed compact-summary fixture seeding because it intentionally has no authenticated owner. No credentials or auth session created. This is not real-account acceptance or a device-performance measurement.
- `git diff --check`: PASS. No push, PR, deployment or new commit yet.

## Remaining scope (not claimed complete)

- R2-1/2/3: persisted streak/trophy read models, scoped trophy-final SQL, counter-trigger scale/backfill work. Requires realistic PostgreSQL plans, parity and timezone/concurrency coverage.
- R2-4: one-query implementation is complete; large-data EXPLAIN/performance comparison remains. R2-5: close/reopen request bound implemented; live ranking churn and deep-scroll UX remain device acceptance.
- R2-6/7/8: variable-height chat virtualization, revision/tombstone reconnect protocol and paginated chat lists. Existing recovery correctness is preserved.
- R2-10/11/12: image queue completed; viewport-specific scheduling/hidden policy, CSS coverage and further game bundle splitting remain.
- R2-13/14/15/16: idle lobby polling, cursor trophy history, PWA quota/device tests, click-to-interactive stage instrumentation remain.
- E-17: empty fight-worker QPS and event-driven wakeup remain; authoritative combat timing untouched.
- E-19: only identical in-flight read reconciliation is shared; broad periodic reconcile versus scoped requests and worker migration remain.
- E-20: catalogue batching implemented below; pagination and stored final progress remain.
- E-21: exact grip/skin asset sets and caretaker lazy loading remain; current hockey first-frame contract preserved.
- E-22: streaming/Range/abort implemented below; real-storage compatibility and concurrent-client RSS measurements remain.
- E-23: local coalescing implemented; persistent bounded backlog/global concurrency remains.
- E-24/25/26/27: lightweight duel indicators, split inventory catalogue, other auxiliary full-profile consumers and paginated character histories remain.
- E-28/29/30: payment-provider pool isolation, request deadline policy and analytics isolation remain.

Ruling: do not equate SQL call-count/asset reductions with measured user latency or claim all 30 audit findings are closed. Existing full-suite baseline failures from the earlier implementation remain documented; full suites were not rerun in this pass. Mobile FPS/heap, authenticated click-to-ready P50/P95, multiplayer failure recovery, production runtime and deployments are not verified here.


## Final review

Independent read-only review identified a tournament race: post-write reconciliation could join a scan started before the write. Fixed by opt-in `shareInFlight` on GET routes only, default independent reconciliation for writes. Regression observed RED (1 invocation instead of 2), then GREEN; the 11-test tournament lifecycle integration suite passed again. Final reviewer reported no remaining actionable findings. No additional review pass requested.

Ruling: share only concurrent read-triggered tournament maintenance, not mutation-triggered scans. Cost: write/GET concurrency may still do redundant work, preserving immediate post-write progression takes priority.

The local preview showed locker → shop → skates category. QA fixture data was seeded into the compact summary cache without creating an auth session. Browser timing, network waterfall and mobile hardware acceptance remain open.

## Continuation: catalogue, auxiliary profiles and media

- E-20 (partial): weekly catalogue/current/failure reads batch tasks, claims, membership and progress in groups of 50. RED: 301/3001 queries for 100/1000 entries; GREEN: 9/81. Empty and singleton paths stay 1/4 calls. Existing per-window progress computation remains; this is a round-trip reduction, not a stored final-progress model or pagination.
- E-26 (partial): story catalogue, statistics, equipment and story replay use owner-scoped compact profile metadata. Fresh mode preserves no-store, mandatory post-mount refresh and focus refresh for replay. RED: full-profile requests and stale threshold; GREEN: all 22 targeted tests. Other consumers remain to be assessed individually.
- E-22: media delivery now streams storage bodies with backpressure and forwards signed byte ranges. Invalid ranges return 416 before storage fetch; invalid tokens never reach storage. Disconnect aborts upstream; full-body administrative reads retain their existing API. Range responses must match the requested bytes/total; an upstream ignoring Range fails instead of silently downloading the full object. Entire streaming read has a 120-second deadline.
- Checks: weekly query budget/membership parity 5 PASS; dedicated PostgreSQL weekly challenge/lifecycle/progress 47 PASS. Media route/storage 16 PASS including full/suffix/open-ended ranges, auth, cancellation, non-draining stream and rejected upstream range. Monorepo typecheck PASS. Monorepo lint and production build PASS; 139 web tests PASS across affected profile/locker/inventory screens. Local HTTP disconnect test also verifies upstream abort. Independent review recorded below when complete.
- Remaining acceptance: actual object-store Range compatibility, live audio seeking/disconnects and concurrent-client RSS measurements; authenticated profile latency, mobile hardware and deployed runtime. No deployment.

Self-review: storage failure inherited a successful-file cache header. Regression observed RED, fixed by setting success headers only after the upstream stream opens; media suite 16 PASS. Final server build, targeted lint and diff whitespace checks PASS.

Independent read-only review of this continuation (weekly batching, compact profile consumers, streaming media): no remaining actionable findings. This does not close the remaining audit items or replace live storage/device acceptance. Current continuation totals: 139 web tests, 5 catalogue unit tests, 16 media tests, 47 weekly PostgreSQL integration tests PASS. Changes remain local and uncommitted; prior commits and unrelated work are preserved.
