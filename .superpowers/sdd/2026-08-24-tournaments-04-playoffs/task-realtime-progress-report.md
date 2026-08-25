# Tournament realtime progress report

## Delivered

- Added a post-commit, best-effort fixture-progress publisher. It resolves the fixture only through the immutable `tournament_fixture_segment.duel_match_id` mapping, re-reads the canonical live DTO from PostgreSQL, and publishes only to `tournament:fixture:<fixtureId>`.
- Hooked the publisher after accepted/ready state, lazy reconciliation on a match read, period start, shot progress, and explicit settlement. The existing tournament-before-duel lock acquisition remains unchanged.
- Redis/WebSocket and snapshot-read failures are swallowed after the gameplay transaction; ordinary amateur duels have no segment mapping and publish nothing.

## Test evidence

- RED: the new route/database test initially failed because no `tournament:fixture_update` was emitted; a separate lazy-transition case also failed before its post-commit hook was added.
- GREEN: `test/tournament/realtime-progress.integration.test.ts` covers committed ready/accepted, period/shot, lazy transition, normal-duel isolation, rejected publisher, and a terminal settlement snapshot.
- Final server run, sequential on `hockey_test`: 66/66 passed across `duel/amateur.test.ts`, `tournament/service.integration.test.ts`, and `tournament/realtime-progress.integration.test.ts`.
- Web realtime regression: 7/7 passed across `TournamentSocket.test.ts` and `TournamentFixtureLive.test.tsx`.
- `@hockey/game-core` build, server/web typecheck, root lint, and `git diff --check` passed.

## Concern

- The Fastify/WebSocket test harness emits the pre-existing `MaxListenersExceededWarning` during server integration runs. It also occurs in the unmodified suite; no test failed and this task does not change the WebSocket server lifecycle.

## Review 1 fixes

- `reconcileMatch` now returns an explicit `changed` signal. The amateur match list and events list collect exactly the changed duel IDs under the existing tournament-before-duel lock, commit, then publish their canonical fixture snapshots outside the transaction.
- A no-op `GET /duel/amateur/matches/:matchId` emits no fixture event; a real lazy transition still emits after commit.
- Opening a pending next tournament fixture segment publishes its new canonical live snapshot after the segment transaction commits.
- The best-effort fixture-progress helper logs canonical-read or publish failures through the app logger with only `{ err }` and a fixed message; it never logs the realtime payload. Gameplay responses remain successful.

## Review 1 verification

- RED/GREEN integration coverage was added for lazy `/matches`, lazy `/events`, no-op match reads, pending next-segment opening, and safe publisher-failure logging.
- Sequential `hockey_test` run: 71/71 — `duel/amateur.test.ts` (43), `tournament/service.integration.test.ts` (18), `tournament/realtime-progress.integration.test.ts` (10).
- `@hockey/game-core` build, server/web typechecks, root lint, and focused web tournament socket tests (7/7) passed.

## Review 2 fixes

- `PATCH /duel/amateur/matches/:matchId/loadout` now retains the lazy reconciliation `changed` signal, commits both reconciliation and loadout changes, then publishes a canonical fixture snapshot only when reconciliation changed live state.
- A mixed-state integration scenario confirms that a caller can update their active-period loadout while an opponent's expired break transitions to `accepted`; the canonical post-commit event exposes that transition.
- A no-op loadout reconciliation produces zero fixture events. Its conditional branch was mutation-checked by temporarily making publication unconditional; the focused regression failed with the unexpected event and passed again after restoring the condition.

## Review 2 verification

- Focused sequential `hockey_test`: `tournament/realtime-progress.integration.test.ts` 12/12 passed.
- Server typecheck, root lint, and `git diff --check` passed.
