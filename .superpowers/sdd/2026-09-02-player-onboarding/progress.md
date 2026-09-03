# SDD ledger — plan: docs/superpowers/plans/2026-09-02-player-onboarding.md

Workspace: `/Users/egorgumenyuk/Projects/Ultimate Hockey/.worktrees/player-onboarding`
Branch: `co_dex/player-onboarding`
Start HEAD: `bca1354dc5e24ca57bea093fc5ad0359cbc45755`
Spec: `docs/superpowers/specs/2026-09-02-player-onboarding-design.md`
GLM: disabled by explicit user request.

Baseline:
- `pnpm install --frozen-lockfile`: PASS after approved network retry.
- `pnpm --filter @hockey/game-core build`: PASS.
- `pnpm test`: PASS; game-core 74 tests and web 531 tests plus focused DailyScreen invocations passed. Server 76 passed and 416 integration tests skipped because TEST_DATABASE_URL/TEST_REDIS_URL are not configured in this shell.

## Preflight task self-consistency

| Task | Tests vs implementation | Files/interfaces | Finding |
|---|---|---|---|
| 1 | Migration assertions precede SQL | Produces all schema consumed later | Clean |
| 2 | Applicability matrix precedes service | Consumes Task 1 schema, produces public DTO/service | Clean |
| 3 | Lifecycle route tests precede routes | Consumes Task 2 service | Clean |
| 4 | Tutorial tests precede route extension | Consumes Task 1 tutorial_state and Task 3 run | Clean |
| 5 | Admin API tests precede routes | Consumes Task 1 version/media schema | Clean |
| 6 | User/stats tests precede API changes | Consumes Task 1 events and Task 5 admin routes | Clean |
| 7 | Gate/flow tests precede React modules | Consumes Tasks 3-4 public API | Clean |
| 8 | PlayView/tutorial tests precede extension | Consumes Task 4 tutorial API and Task 7 flow | Clean |
| 9 | Exit tests precede Daily/Bonus wiring | Consumes Task 7 gate context | Clean |
| 10 | Admin UI tests precede editor | Consumes Task 5 content API | Clean |
| 11 | Stats/checkbox tests precede UI | Consumes Task 6 contracts and Task 10 shell | Clean |
| 12 | Approval gates precede batch assets | Consumes completed admin UI and two approved examples | Clean |
| 13 | Verification follows all implementation | Covers server, web, admin, assets, dev runtime | Clean |

## Preflight shared-file and interface map

| Producer task | Consumer task | Shared file/interface | Finding |
|---|---|---|---|
| 1 | 2 | onboarding tables and user completion/reset columns | Names align |
| 1 | 4 | onboarding_run.tutorial_state and event constraints | Names align |
| 1 | 5 | chain/version/step/media schema | Names align |
| 1 | 6 | run/event aggregation and user flags | Names align |
| 2 | 3 | getRequiredOnboarding/startOnboardingRun and DTO | Names align |
| 2 | 4 | run snapshot and step config | Names align |
| 2 | 5 | shared onboarding types | Admin DTO may extend, not mutate public DTO |
| 3 | 4 | public routes.ts and completion preconditions | Task 4 extends without changing lifecycle contract |
| 3 | 7 | required/start/view/complete HTTP contract | Names align |
| 4 | 8 | tutorial start/shot HTTP contract | Names align |
| 5 | 6 | adminRoutes.ts and admin guards | Task 6 extends API |
| 5 | 10 | admin content/reorder/media/publish/preview API | Names align |
| 6 | 11 | stats DTO and AdminUser flag patch | Names align |
| 7 | 8 | OnboardingFlow tutorial discriminant | Names align |
| 7 | 9 | useOnboardingGate.refreshAfterGameExit | Names align |
| 7 | 10 | OnboardingFlow preview reuse | Preview mode must make no public completion/view calls |
| 8 | 9 | PlayView remains compatible with DailyScreen | Optional resultCopy preserves callers |
| 10 | 11 | OnboardingAdmin.tsx/onboardingApi.ts | Task 11 extends statistics section |
| 10 | 12 | Admin upload/draft/publish surface | Names align |
| 11 | 13 | Statistics and checkbox acceptance | Metrics definition includes 30-minute drop-off |
| 12 | 13 | Published dev versions and approved assets | Publication is an external dev side effect and remains approval-gated |

Ruling: Task 12 publication is an external dev mutation, so execution will stop before uploading/publishing content and request explicit approval after the two visual examples are approved — this preserves the spec and safety boundary; if wrong, implementation reaches dev later but no unintended content is published.

Task 1: minor (deferred): migration test does not explicitly read back the two seeded disabled chain rows; final review must decide whether coverage is sufficient.
Task 1: minor (deferred): focused PostgreSQL migration suite is skipped without TEST_* integration services; must be run in an integration-capable contour before merge.
Task 1: fix round 1/5 (2 addressed, 0 open — tutorial config NULL check and nullable step-bearing events; commit ab465e1)
Task 1: complete (commits bca1354..ab465e1, review clean after fix round 1)
Task 2: minor (deferred): service tests do not directly cover threshold-by-goals or same-clientSessionId run idempotency; final review must decide if later route tests close this gap.
Task 2: minor (deferred): focused integration suite is skipped without TEST_*; must run in an integration-capable contour before merge.
Task 2: fix round 1/5 (2 addressed, 0 open — published-status applicability and shared settings normalization; commit be67ae8)
Task 2: complete (commits ab465e1..be67ae8, review clean after fix round 1; integration execution deferred)
Task 2: Ruling: reopened after Task 3 used the repository root integration environment and exposed 12/12 fixture failures — repair Task 2 test setup before treating its contract as verified; if wrong, this costs one extra test-only fix round but avoids building on unexecuted tests.
Task 2: Ruling: the remaining `1.9` failure is still a fixture defect, not a service defect — `TRUNCATE users ... CASCADE` also removes `game_settings`, so the test's `UPDATE game_settings` changes zero rows and the shared normalizer correctly falls back to 300; use INSERT/UPSERT in the fixture. If wrong, this could conceal a production normalization defect, so the real 12/12 integration run remains the acceptance gate.
Task 2: fix round 2/5 (fixture integrity addressed, 12/12 real integration PASS; commit c4b87c4)
Task 2: complete (commits ab465e1..c4b87c4 including interleaved Task 3 commit; review clean, actual integration PASS)
Task 3: minor (deferred): lifecycle tests do not yet parameterize completion for both chains and verify the untouched sibling flag; final review should require coverage before merge if later tests do not close it.
Task 3: complete (commit bab4038, spec and quality approved; lifecycle integration 7/7 PASS)
Task 1: Ruling: reopened after real migration test exposed a contradictory duplicate-event fixture — duplicate `tutorial_goal` must include the required `step_id` so the test reaches the intended unique-index violation; if wrong, only a test fixture changes, while leaving it unfixed guarantees CI failure.
Task 1: fix round 2/5 (duplicate tutorial_goal fixture addressed; commit 59033ca; focused migration integration 2/2 PASS)
Task 1: complete (commits bca1354..59033ca including interleaved Tasks 2-4; review clean and actual integration PASS)
Task 4: minor (deferred): tutorial route tests lack focused negative/concurrency cases for duplicate simultaneous index, second goal, outsider run, lost applicability/completed run and game-core version mismatch; final review must decide required coverage.
Task 4: complete (commit 5771dc7, spec and quality approved; onboarding integration 20/20 PASS)
Task 1: Ruling: reopened for fix round 3 because the full sequential server suite shows the migration continuity assertion still ends at 059 and now must include 060; if wrong, this only updates the expected applied ledger, while omission leaves the branch at 524/525.
Task 1: fix round 3/5 (migration continuity expectation updated through 060; commit a7f282d; full sequential server suite 61 files / 525 tests PASS)
Task 1: complete (independent scoped review aa76e42..a7f282d PASS with no findings; reviewer noted isolated migration-test rerun was disrupted by the known shared-schema reset race, while the clean sequential suite remains the acceptance evidence)
Task 5: Ruling: independent review 59033ca..aa76e42 found an Important spec gap — upload validates WebP decoding and pixel ceiling but not an explicit dimension/aspect contract, so unusable 1x1 or arbitrary landscape media can reach publication; add TDD coverage and server rejection before accepting Task 5. If wrong, this slightly narrows accepted artwork, but preserves the approved requirement that the server validate image dimensions.
Task 5: minor (open): guard test teardown so a failed beforeAll does not produce a secondary app.close TypeError that hides the original setup failure.
Task 5: fix round 1/5 (image dimension/aspect validation and guarded teardown addressed; commits a9dfdbf, 20af612, 0771f75; focused admin 13/13, public onboarding 20/20, existing admin 9/9, typecheck/build/lint/Prettier PASS)
Task 5: minor (deferred): tests do not isolate an exact-ratio but undersized WebP or an in-limit malformed WebP, although the implementation enforces both paths; final review should decide whether broader upload coverage is required.
Task 5: complete (implementation range 59033ca..0771f75; independent fix review Spec PASS and Quality PASS with no blocking findings)
Task 6: Ruling: independent review 0771f75..38e29a8 found filter coverage insufficient because chain+version and other-chain+future-date were only tested in coupled requests; isolate chain, versionId, from, and to so ignored filters cannot pass. If wrong, this adds redundant tests, but protects the documented statistics contract.
Task 6: Ruling: add an onboarding_run version/time index for the version-filtered historical stats path; migration 060 currently lacks it, so the endpoint can degrade to a full run-table scan. If wrong, the extra pre-release index has modest write/storage cost, while preventing predictable admin-stat latency as history grows.
Task 6: fix round 1/5 (independent filter coverage, date-consistent step set, and partial natural version/time index addressed; commits 1e9a896 and 3af6b6a; migrations 6/6, onboarding admin 14/14, full sequential server 528/528 PASS)
Task 6: complete (implementation range 0771f75..3af6b6a; independent fix review Spec PASS and Quality PASS with no findings)
Task 7: Ruling: independent review 3af6b6a..ed896fa found that a transient step-view failure is marked locally as viewed and never retried, while server completion requires every persisted view; make successful persistence the deduplication boundary and ensure completion can recover without a full reload. If wrong, this may add a harmless retry, while the current behavior can permanently strand a mandatory flow.
Task 7: minor (open): make the full-screen flow vertically scroll/compact safely for small-height viewports and text zoom so mandatory controls cannot be clipped by overflow hidden.
Task 7: fix round 1/5 (transient step-view recovery and scroll-safe layout addressed; commits c0de9ba and f95803e; focused 16/16, full web 542 tests plus 65 DailyScreen scenarios PASS)
Task 7: Ruling: fix re-review confirms the recovery implementation but requires explicit deferred in-flight and React StrictMode regression tests, plus a viewport-bounded flow scroll container so the sticky CTA actually sticks. If wrong, this adds small test/CSS specificity, while preserving mandatory-flow reliability on effect replay and short screens.
Task 7: fix round 2/5 (deferred Finish, StrictMode replay, and real viewport scroll-container coverage addressed; commits 7c0a92e and 45fa905; focused 19/19 and static checks PASS)
Task 7: complete (implementation range 3af6b6a..45fa905; independent round-2 review Spec PASS and Quality PASS with no findings)
Task 8: Ruling: independent review 45fa905..d237fce found rejected tutorial submissions leave PlayView permanently pending and unhandled; reset pending state and provide a visible retry path so mandatory onboarding never requires reload after a transient API failure. If wrong, this improves generic submit resilience without changing successful gameplay.
Task 8: Ruling: tutorial navigation must never decrement below zero and must expose exactly one Back control only after the first step, including when admins publish tutorial_shot at position 1. If wrong, this removes duplicate navigation while preserving the approved first-step invariant.
Task 8: Ruling: reduced-motion preference must reach PlayView before shot/result animation begins; applying a confirmed CSS class after animation completion is too late. If wrong, reduced-motion users receive a less animated but still functional tutorial, which is the intended accessibility tradeoff.
Task 8: fix round 1/5 (submit catch/finally, navigation invariants, and upfront reduced motion addressed; commits 5b65106 and 6ea36e8; expanded focused 42/42, full web 562/562 plus 65 DailyScreen PASS)
Task 8: Ruling: re-review found retry still advances the optimistic shot index after rejection, so the server will reject every later attempt; rollback or authoritatively resynchronize so retry uses the server-expected index, and test through the real submit callback. If wrong, repeated index remains idempotently rejected rather than corrupting progress, while current behavior strands the mandatory flow.
Task 8: Ruling: hiding PlayView Back must preserve the three-column controls layout with an explicit empty slot or grid placement; otherwise the shot CTA collapses into the 56px back column. If wrong, only tutorial layout remains visually stable with no behavior change.
Task 8: fix round 2/5 (authoritative rejection resync and hidden-back grid slot addressed; commits a20b78c and 505a984; focused 31/31, expanded 44/44, full web 564/564 plus DailyScreen 65/65 PASS)
Task 8: complete (implementation range 45fa905..505a984; independent fix2 review Spec PASS and Quality PASS with no findings)
Task 9: Ruling: independent review 505a984..a0a9ed6 found implementation behavior sound but required exit-path coverage incomplete; add finished daily/training/duel, non-direct duel destination, and rapid double-action no-duplicate refresh tests, fixing any race they expose. If wrong, the tests are redundant, but they protect the central requirement that Amateur onboarding begins once and only after gameplay exit.
Task 9: fix round 1/5 (complete exit-path, exact-destination, blocked-action and rapid-double coverage added; commits 57eaf12 and 8cf98a2; focused 95/95, full web 564/564 plus DailyScreen 70/70 PASS)
Task 9: complete (implementation range 505a984..8cf98a2; independent re-review Spec PASS and Quality PASS with no findings)
Task 10: Ruling: independent review 8cf98a2..a2d27ff requires structured publish errors rendered beside the responsible step/field, not only a generic alert; minimally extend the server error payload if the current contract cannot identify the offender. If wrong, richer safe validation details still reduce admin repair time without exposing internals.
Task 10: Ruling: preview shot recovery must resume the same preview run rather than create a fresh run; add the smallest authenticated authoritative resume/read contract if needed and verify no natural flags/statistics change. If wrong, same-run recovery remains safer and consistent with public tutorial behavior.
Task 10: minor (open): add informational thumbnails, strict explicit MIME rejection for fake .webp files, and responsive stacking for tutorial speed fields.
Task 10: fix round 1/5 (structured inline publish issues, thumbnails, same-run preview resume, strict MIME, and responsive speed fields addressed; commits eb584d4 and a3d53f0; focused web 66/66, server admin 15/15, server onboarding 35/35, full web 582/582 plus DailyScreen 70/70 PASS)
Task 10: complete (implementation range 8cf98a2..a3d53f0; independent fix review Spec PASS and Quality PASS with no findings)
Task 11: Ruling: the approved version filter cannot inspect historical analytics because the Task 5 chain DTO exposes only the current published version, although Task 6 accepts versionId. Minimally extend the authenticated admin chain read-back with a stable publishedVersions history (id, version number, publishedAt) and integration coverage. If wrong, the extra read-only metadata is backward-compatible, while omitting it makes the required version selector misleading and prevents historical analysis.
Task 11: Ruling: independent review a3d53f0..97986d5 found stale statistics can render under newly selected chain/version/date labels and persist for chains without versions; key displayed results to the exact filter set, clear immediately, and ignore out-of-order responses. If wrong, users see a brief loader instead of cached metrics, while preventing materially misleading cross-version analytics.
Task 11: Ruling: preserve the authoritative user-save response even when the detail request/cache is unresolved, and prevent a late stale detail response from overwriting it. If wrong, this only strengthens response ordering; current behavior can exit edit mode while showing stale onboarding flags.
Task 11: fix round 1/5 (exact stats snapshot keys, out-of-order protection, no-version clearing, and authoritative player read-back ordering addressed; commits 9a8a1de and ace3339; focused 28/28, full web 589/589 plus DailyScreen 70/70 PASS)
Task 11: complete (implementation range a3d53f0..ace3339; independent fix review Spec PASS and Quality PASS with no findings)
Task 12: approval gate reached. Do not generate more than the single `Всё начинается здесь` story example before explicit user approval; do not create the gameplay example until the story example is approved, and do not upload/publish dev content without a later explicit authorization.
Task 12 media-contract Ruling: user approved the story direction only after requiring square 1:1 resolution, so square 1:1 at minimum 800×800 supersedes the earlier portrait 2:3 assumption across server validation, admin help, tests, spec and plan; if wrong, portrait uploads are now intentionally rejected, but the implementation matches the user's direct approval condition.
Task 12 media-contract change: complete in commit 24cbcd5 with strict TDD evidence (server RED then 16/16 GREEN against local PostgreSQL/Redis; web RED then 19/19 GREEN; typecheck/build/lint/Prettier/diff checks PASS). Existing approved reference verified at 1200×1200; no image, Task 12 batch, upload, publication, push or deploy was performed.
