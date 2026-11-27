# Real bar achievements implementation plan

> **For agentic workers:** Use the parallel domain ownership defined in this chat; preserve concurrent edits.

**Goal:** Publish the agreed bar achievements on dev with trusted event progress and normal star/XP claims.

**Architecture:** Existing achievement/stage tables and atomic reward claim remain the economy authority. Add an immutable catalogue migration, launch cutoff and idempotent per-user bar counters. Server game adapters derive special feats from engine state; Maria moves from client-only gameplay to an authoritative server session. Existing cards/modal consume real API DTOs.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, React, Vitest.

**Spec:** Agreed catalogue in packages/web/src/achievements/barCatalogData.ts and barCatalog.ts; authored content in barDescriptions.ts.

## Global constraints
- 95 cards, 274 stages, 10413 stars and same XP; no coins.
- No historical backfill; matches started before launch excluded. Visits are distinct player-local days, completed game or accepted player message.
- Hidden character tasks show only required amateur status; server redacts metadata and denies premature claims.
- Win chains and streaks separated character/online per game; all bar cards in one Bar list.
- No client assertions of wins or feats; duplicate actions/results/claims must not double credit.
- Dev only release after exact Russian release-note approval; no production mutation.

## Review focus
- Results arriving before/after launch and duplicate delivery.
- Concurrent claims/results keep launch totals and do not lose progress while reward waits.
- Technical cancellations and incomplete matches give no match rewards.
- Maria and multiplayer durak count every received trump and single-round feats correctly.
- Novice DTOs/notifications/claims cannot reveal locked characters.

## Task 1: Catalogue, storage and reward lifecycle (root)
- [x] Export approved catalogue snapshot and add migration 265 for catalogue/stages, launch cutoff, idempotent stats/events and Maria sessions.
- [x] RED tests for dedup, totals/streaks/rematch, dates and feat progression; implement barProgress APIs.
- [x] Reuse atomic claims with bar cumulative carry and synchronize next-stage progress.
- [x] Redact real catalogue DTOs by actual bar access; integrate normal UI styles and no extra filters.

## Task 2: Trusted non-card game observations (bar_game_events)
- [x] RED special-feat transition tests; persist telemetry across human/bot/timer transitions.
- [x] Emit game result and feat observations for all six engines; exclude technical cancellation.
- [x] Run scoped tests and report exact acceptance coverage.

## Task 3: Trusted Durak and Maria (bar_durak_events)
- [x] RED telemetry tests for received trumps, sixes, defense, no-take and full hand.
- [x] Observe online two/multiplayer results, move Maria to authoritative server path.
- [x] Run scoped server/web tests and report missing conditions.

## Task 4: Visits, meetings and club card (root)
- [x] Observe accepted message and completed response separately; same local day counts once.
- [x] Observe card purchase/extension only after successful transaction; retries deduplicated.
- [x] Verify reward claim integration and migrations using existing test infrastructure.

## Task 5: Dev release
- [x] Check integrated diff, targeted server/web tests, typechecks/builds and migration safety.
- [ ] Prepare exact What is new text and obtain approval before deployment trigger.
- [ ] Commit and PR to current dev, monitor CI/Actions, verify matching runtime version and assets.
- [ ] Report dev evidence separately from unverified real-device acceptance and pre-existing full-suite failures.

## Implementation evidence

- Real catalogue/stages and launch cutoff are in migration 265; no historical game/stat scans seed progress.
- Win/streak/rematch observations and all approved special feats are server-owned. Maria now uses an authoritative server session; multiplayer Durak records each participant when their game ends. Entirely AFK card games do not grant rewards.
- Maria history preserves server provenance, quota receipts, reconnects and short bot turns. Existing thumbnail/cache scheme is reused.
- PostgreSQL verification: all 135 stage ladders, 8 bar lifecycle tests (including actual Maria/checkers action paths), 39 existing game scenarios passed. Visitor regression suite is checked separately.
- Independent read-only review found no remaining critical blockers after participation gating and telemetry corrections.
- Full baseline web suite has 11 failing files / 10 failing tests, including stale observation banks, a missing profile mock and map geometry assertions; full game-core has 4 failures in unchanged training scene banks (bank version 130 versus engine 132). These files match current origin/dev and are outside this release.
- No push, merge, workflow dispatch or deployment has been performed. Exact dev release-note text is prepared separately for user approval.

Final local acceptance: 9 PostgreSQL bar lifecycle cases (actual Maria/checkers/multiplayer commands), 135 reward ladders, 39 bar-game regressions and 26 visitor regressions passed; 32 targeted server unit checks and 51 web checks passed; pure trace equivalence covered five games. Server/web builds, scoped ESLint and diff whitespace checks passed. No dev runtime claims until deployment and smoke verification.

Release preparation: removed automatic dev access-code reprovisioning from Deploy Dev; deployments must preserve existing authentication state. User approved the exact release-note text on 2026-11-27. No production deploy is authorized.
