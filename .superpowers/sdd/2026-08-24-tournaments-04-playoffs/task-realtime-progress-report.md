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
