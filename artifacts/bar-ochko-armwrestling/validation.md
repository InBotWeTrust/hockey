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


## Ochko presentation and bank history follow-up

- Added delayed opponent reveal, four-second reading pause, compact SE layout, rounded cards, forward-facing table scene, compact stake input and profile-style net-star result (loss uses the bank red token).
- Found and reproduced missing bank ledger entries: 4 integration assertions failed against the old balance-only implementation. Added atomic currency_ledger debit, payout and refund entries, migration 226 preserving allowed reasons, and readable bank titles. No second debit at defeat.
- Fresh checks: web games 99 tests; server unit/history 20 tests; isolated PostgreSQL 19 tests including concurrent starts and duplicate settlements; root typecheck. Local browser inspected stake and red loss result. Real authenticated bank UI and deployed runtime remain unverified; no deploy performed.

Arm simplification: replaced pose switching with a single static neutral scene, directional progress marker and reduced-motion-aware support pulse. Removed five unused pose/hand assets. Existing controls, authoritative mechanics and result modal retained.


## Rotating 501 darts

New matches use 501 double-out: a bust, leaving one, or a non-double checkout restores the visit-start score and hands over the turn. Inner bull counts as a double. At every unfinished visit end (three darts, bust or timeout), a seeded shared angle turns the board for 1200 ms after the final dart lands; aiming is disabled and the next timer starts after the turn. Bot aim is transformed by the same angle. Bar engine 9 / game core 100 retain engines 1–8, legacy single-out scoring and hockey versions 88–99.

Fresh checks: 69 core bar/version tests; 104 web game tests including sector rotor and disabled aim; 21 isolated PostgreSQL integration tests including two-participant angle and retry equality; root typecheck and lint pass. Local browser shows 501 and a rotated board after a visit; authenticated real-client online play and physical-device motion acceptance remain unverified. No deployment.


## Pool bot follow-up

Break assignment audited: the existing open-table rule is intentional; groups are assigned on the first legal post-break pot, not on the break. Covered again without changing that rule.

Reproduced a blocked shortest-path plan contacting the eight instead of a legal target (new regression failed before the fix). New bar engine 10 / core 101 filters cue/object corridors, cut direction and ghost-ball bounds, then simulates up to 18 power/direction candidates in shared responsive physics without allocating replay frames. Prioritizes legal pots, penalizes scratch, fouls and premature eight; falls back to legal safety/cushion options. Engines 1–9 retain the prior pool policy; hockey versions 88–100 remain compatible.

Checks: 74 core tests, 104 web tests, core build, root types/lint pass. A local post-break decision took approximately 21ms and potted ball 1 without a foul. This sample is not an exhaustive AI strength benchmark or authenticated runtime acceptance. No deployment.
