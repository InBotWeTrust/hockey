# Fight Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. No delegation is authorized.

**Goal:** Reduce two-player fight latency and establish measured local capacity then release only this task to dev after verification.
**Architecture:** First improve committed fanout, then introduce a versioned single-owner in-memory runtime with fenced durable completion and technical cancellation on owner failure. Preserve legacy fights and existing hockey settlement.
**Tech Stack:** TypeScript, Fastify, PostgreSQL, Redis, React/Pixi, Vitest.
**Spec:** ../specs/2026-10-09-fight-realtime-design.md

## Global Constraints
- User authorized dev release after verification; production remains out of scope.
- Preserve zero startup and 250 ms attack cycle; shared movement speed increases only after baseline measurement.
- No auth bypass, real-account changes or dev load tests.
- New deterministic behavior gets a new rules/core version; existing stored fights retain semantics.
- One owner per room; durable result before final broadcast; failure cancels unfinished fights and refunds one call exactly once.

## Review Focus
- Publish failure after commit must not turn an accepted action into a rejection.
- Two overlapping outbox batches must not acknowledge unseen revisions.
- Old owner, socket or fight cannot affect a new room.
- Crash before/after result commit must preserve reward and clock invariants.
- Load generator must keep replacing finished rooms and expose overload instead of silently reducing traffic.

### Task 1: Committed fanout
- [x] Add RED tests in server/test/duel/fight-socket-latency.test.ts for immediate channel notification after commit and publication failure fallback.
- [x] Return authoritative revision internally from command transaction; publish to the existing channel in ws.ts after commit, preserving outbox.
- [x] Add bounded/coalesced outbox dispatcher tests and implementation separate from progression.
- [x] Run targeted server tests and record baseline/after measurements.

### Task 2: Runtime ownership and lifecycle
- [x] Add additive ownership/generation/runtime version/refund migration; feature flag applies only to new fights.
- [x] Implement room runtime and bounded registry in server/src/duel/amateur/fight/runtime/.
- [x] Test command admission, independent seq, deterministic time, bounded queues, replay and duplicate input.
- [x] Add lease and fenced result/cancellation persistence; test stale owner, repeated cleanup and failure around commit.

### Task 3: Transport and hockey integration
- [x] Route authorized runtime fights to room owner; legacy fights keep existing handlers.
- [ ] Compact versioned snapshots and contact acknowledgement/resync; immediate events and bounded 20Hz positions.
- [x] Connect invitation/start/finish to durable settlement, aid, clock and shot paths.
- [x] Test two actual sockets, reconnect, match termination and resumed shots.

### Task 4: Timing, client and movement
- [x] New rules remove legacy grace only for new runtime; preserve saved rules.
- [x] Adapt client reconciliation and input acknowledgement to compact packets; verify held combinations and visible hits.
- [x] Centralize and increase movement speed by approximately one third after baseline; preserve old speed by rules version.
- [x] Run core and client regressions; render local QA.

### Task 5: Load and acceptance
- [ ] Dedicated synthetic PostgreSQL/Redis only; 10/50/100 concurrent rooms, 30s warmup, 60s measurement, 3 repetitions, continued replacements and 5% reconnect.
- [ ] Report p50/p95/p99 for queue/calculation/persistence/fanout/other-client receipt, bytes/errors, resource use and overload stop.
- [x] Run integration, types/lint/build; review complete diff and record limits. Do not equate local capacity with VPS capacity.

## Execution Ledger
- 2026-10-09: Spec approved by user. Existing isolated branch feature/fight-realtime-runtime based on dev 24b3b069; no unrelated changes.

### Verified local checkpoint (2026-10-09)
- RED/GREEN: structured room errors; technical cancellation also cancels engine state; reserved revision ceiling prevents cancellation from being older than uncheckpointed live frames.
- One-million revision reservation is persisted at owner acquisition; runtime stops before exhausting it. Technical/system cancellation advances beyond that reservation. This preserves existing client monotonic revision guards without accepting stale snapshots.
- Pair comparison before movement change: 12 commands per mode, old committed fanout p50 50.66 ms / p95 77.40 ms; runtime p50 9.30 ms / p95 17.20 ms. Same-machine synthetic sockets only, not capacity evidence.
- Version 6 movement is 0.0004 normalized units/ms, old versions retain 0.0003. Shared calculation, extrapolation and local prediction agree. GAME_CORE_VERSION 84; shot behavior unchanged.
- Tests: 29 ordinary-fight integrations passed before movement change; 2 runtime lifecycle integrations passed after rebuild. 14 room/fanout/fence unit tests passed. 65 core fight/version tests passed. 27 client movement/socket tests passed. Server typecheck and lint of new runtime modules passed; diff whitespace check passed.
- Browser smoke: runtime QA page opened, attack changed opponent HP from 5 to 4. This is not two-device multiplayer acceptance.
- No push, merge, deployment or dev load traffic.

### Release verification (2026-10-09)
- User authorized deployment of only this task to current dev; preserve concurrent changes and verify exact runtime SHA.
- 32 ordinary fight integrations passed, including paired sockets, owner loss/refund, result durability and resumed hockey. Final targeted server run: 113 passed, 9 opt-in load cases skipped. Additional deadline/sequence regression: 7 room tests passed.
- Core fight/version: 65 passed. Client fight/control/socket/store: 87 passed. All remaining isolated web suites and DailyScreen cases passed.
- Full suites retain unrelated failures reproduced on exact base 24b3b069: 21 server, 4 core, 7 web. Two transient bonus fixture preparation failures cleared in a complete bonus-shot rerun; newly added RED regressions now pass. Do not describe the full suites as green.
- Final typecheck, lint and server build passed; complete application build passed earlier with unchanged client implementation.
- Technical interruption uses the existing draw/result modal: title “Драка прервана”, copy “Вызов возвращён”, no rewards. Local rendered preview checked. Normal result hold precedes resumed hockey.
- Load scope is room CPU/queue only, not WebSocket/PostgreSQL/VPS capacity. Duplicate command replay simulates reconnect delivery; no end-to-end 100-socket test is claimed. Per-stage network/persistence telemetry and real two-phone acceptance remain outside the completed local evidence.
- See 2026-10-09-fight-realtime-verification.md for final load/release results.
