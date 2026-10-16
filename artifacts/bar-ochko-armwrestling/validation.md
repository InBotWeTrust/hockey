# Local validation, 2026-10-16

Environment: isolated local feature/bar-ochko-armwrestling checkout, base origin/dev 52e33680. Main checkout preserved. No dev/production deployment and no CI run.

| Check | Result |
| --- | --- |
| game-core barGames/layout/version | PASS, 72 tests |
| web games/cards/BarScene/BarPanorama | PASS, 218 tests |
| server games routes/service/economy | PASS, 17 tests |
| PostgreSQL isolated schema | PASS, 16 integration tests |
| core build | PASS |
| pnpm typecheck | PASS |
| pnpm lint | PASS |
| pnpm build | PASS; large-chunk and old Browserslist warnings |
| git diff --check | PASS |
| Local browser 360x780 | Ochko hidden cards, stand, result; arm coherent scene, support grip, result inspected |
| Physical phone, two fingers | NOT RUN |
| Authenticated browser clients / real matchmaking UI | NOT RUN |
| CI, dev runtime, production | NOT RUN / NOT DEPLOYED |

Relevant commands:

```sh
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/game-core exec vitest run test/barGames test/barLayout.test.ts test/version.test.ts
pnpm --filter @hockey/web exec vitest run src/bar/games src/bar/cards src/bar/BarScene.test.tsx src/bar/BarPanorama.test.tsx
pnpm --filter @hockey/server exec vitest run src/bar/games/routes.test.ts src/bar/games/service.test.ts src/bar/games/ochkoEconomy.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Integration execution loads the root test environment and verifies that BAR_GAMES_TEST_DATABASE_URL or TEST_DATABASE_URL names a dedicated test database before invoking src/bar/games/integration.test.ts. The suite creates and drops only its own random bar_games_test_* schema. No Redis access and no real balance changes. Do not run general storage-reset helpers against dev or production.

The broad web bar pass exposed two obsolete assertions already inconsistent with the base implementation (Maria assigned darts; Veronika had no games). Updated those assertions to the existing shipped assignments; production behavior was not changed to satisfy them.

The arm scene uses five coherent poses with brief transitions, rather than arbitrary skeletal deformation. This is a visual limitation to review locally. Physical gesture sensitivity, real network behavior and two-client acceptance remain separate from these tests.

Final review: paid replay modal persistence reproduced with a failing navigation regression, fixed by resetting its visibility on match-id change; regression and 218 targeted web tests pass. Scheduler finding declined: persisted runtimes already expose deadline; a direct tickGames integration test, without readGame reconciliation, proves both new games finish and paid settlement is applied once. All 16 isolated PostgreSQL tests pass. Root typecheck rerun passes.
