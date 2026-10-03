# Beach gameplay implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. No delegation without project/user authorization.

**Goal:** Implement the approved beach challenge mechanics locally without altering old attempts or other modes.
**Architecture:** Pure shared geometry and flight timeline; server derives input/history from snapshots; client renders that exact trajectory and environment state. Reuse existing condition/animation contracts.
**Tech Stack:** TypeScript, Vitest, Fastify, React/Pixi, SQL only after balance approval.
**Spec:** [beach-gameplay-design.md](beach-gameplay-design.md).

## Global constraints

- Local task branch from refreshed origin/dev; no push, merge, deployment or dev/prod data writes.
- Production challenge tab and direct launch remain closed.
- Preserve existing IDs, progress, rewards and immutable snapshots.
- Other bonus modes and duel/tournament behavior remain compatible.
- Final cinematics and Blender deferred.
- New numerical catalog balance requires user approval; local fixture is separately labelled.

## Review focus

- A slowed puck must use separate goalie and goal arrival times, not one averaged speed.
- Deep water after a goalie save must not override that earlier collision.
- Tangent contact and overlapping puddles must not invent deep-water collisions or duplicate resistance.
- Flight history/retry/reload must reproduce the same shooter pauses, including blocked shots.
- Hidden-tab returns and changing fatigue must preserve positions and immutable release geometry.

## Task 1 — Shared puddle geometry and flight timeline

Files: `packages/game-core/src/beachEnvironment.ts`, `.test.ts`, `index.ts`.
- [x] RED: dry flight, shallow edge, deep stop, tangent, overlap, separate crossing times, deterministic growth.
- [x] Implement immutable release-time puddle sampling and piecewise flight segments in logical coordinates.
- [x] GREEN: targeted Vitest; core build.
- [x] Review invalid inputs, boundary equality and duration limits.

## Task 2 — Shared state reuse and compatibility

Files: `duelInventory.ts`, `bonusChallenge.ts`, their tests, version and version test.
- [x] Pin existing duel fatigue cycle and old challenge cycle before extracting common primitives.
- [x] Add beach-only versioned state: progressive base slowdown, scheduled stumble/rest exclusion.
- [x] Keep historical dispatch on immutable snapshot version; bump core version on active behavior changes.
- [x] RED/GREEN: movement continuity and old/new version compatibility; rebuild core.

## Task 3 — Server snapshot and authoritative shot

Files: `packages/server/src/bonusGames/types.ts`, `service.ts`, relevant tests.
- [ ] RED: parser, snapshot read-back, blocked shot, duplicate/idempotent request, new flight history.
- [x] Validate bounded puddle geometry and new environment version; authoritative server calculation.
- [x] Classify using real goalie/goal crossings and earlier collision; blocked result compatible with API/history.
- [x] Preserve strict tap freshness and motion-clock checks.
- [ ] GREEN: pure tests; integration only with confirmed isolated local database.

## Task 4 — Client trajectory and one status notice

Files: `packages/web/src/screens/BonusGamePlayScreen.tsx`, `game/PlayView.tsx`, renderer/environment module and tests.
- [ ] RED: immutable released state, delayed response, rest/stumble boundaries, tab return, single notice.
- [x] Render puddles with perspective transform, warning/growth and shared flight sampling.
- [x] Reconcile new pause history without position jumps; UI text reflects final effects.
- [ ] GREEN: targeted client tests, typecheck/build; rendered mobile acceptance.

## Task 5 — Beach-only local profile and acceptance

- [ ] Obtain numerical balance approval before changing catalog migration.
- [ ] Add beach-only forward migration and immutable old-attempt regression; retain ID/reward/production gates.
- [ ] Run full affected core and targeted consumers; branch review.
- [ ] Browser: actual local attempt launch/repeated tap/rest/recovery/slow response/tab return/finish.
- [ ] Report local tests, browser acceptance and deployment separately.

## Execution ledger

2026-10-02: user approved plan writing and implementation. Numerical local profile question pending. Begin independent geometry engine; no migration or catalog edits while balance is unresolved. Current spec lacks precise puddle sizes: API accepts bounded explicit geometry, fixtures are synthetic test inputs, not adopted balance.

2026-10-02 checkpoint: shared puddle sampler/flight and resolver implemented, not activated in game. Separate derived goalie and goal crossings added as optional internal parameters to existing perspective helpers; default behavior unchanged. Shared fatigue primitive extracted verbatim from duelInventory and duel caller switched to it; historical challenge cycle remains unchanged pending versioned integration. Numerical profile still awaits user response, no migration/catalog edits. Core version remains 71 because existing runtime mechanics are unchanged and new beach resolver has no active consumer; activation requires explicit new-version dispatch.

Validation: 10 puddle tests and 5 collision tests observed RED then GREEN; one fatigue transition test observed RED then GREEN. Full core before fatigue extraction: 297 passed, 4 failed. Exact same four stale-training-bank failures reproduced against clean base 30389da7 in separate checkout (14 targeted tests: 10 passed, 4 failed); not fixed in this beach branch. Targeted regressions after extraction include 28 duel inventory and 10 historical challenge tests. Dependency offline install lacked cached tarball; existing identical package dependencies reused via node_modules link, no dependency versions changed. Actual server/client wiring and browser gameplay acceptance remain incomplete.


2026-10-02 implementation checkpoint: core 72, optional beach.version=1; snapshots without beach retain the historical challenge cycle. New beach fatigue calls the shared duel primitive. Linear melting is integrated using zeroth/first moments of complete fatigue cycles, including frequency floors, overlapping shot pauses and skipped rest-overlapping stumbles. New tests observed failures for missing melt/recovery/stumble behavior and movement integration before fixes. Puck precision shared by client/server after a mismatch risk was identified; dedicated RED→GREEN coverage. Save flight now ends at goalie contact (observed wrong stopY 75 vs 78 → GREEN). Zero-duration sampled render (including reduced motion) observed RED→GREEN.

Server parser and version/location guards added. New beach shots persist authoritative flightMs/blockedByWater in shot_session input_payload; historical rows use the original SQL fallback. Retry flow, ownership and strict clocks retained. SQL history read-back and concurrent/idempotent writes remain unverified against a real isolated database. No database migrations or writes performed.

Client uses shared beach resolver and sampled flight; warning/growing water renders over the existing arena. Release geometry is frozen, then catches up over 250 ms. One notice reports actual combined slowdown/rest; water misses have their own text and no rebound. Long-flight fallback uses authoritative pause metadata. Tests cover repeated tap, delayed-state reconciliation, old sessions, timing and existing loop/rebounds.

Ruling: stored explicit stumbleWindows remain the deterministic schedule; seeded random variation is deferred. User requested periodic stumbling; no random schedule was approved. See the concrete profile candidate in [beach-gameplay-profile.md](beach-gameplay-profile.md).

Boundary audit found origin/dev lacked a production challenge guard. Added production UI toast with no tab switch, restoration of stored challenge tab falls back to speed, and read-only authenticated API preflight blocks direct game/attempt/period/shot access before handlers. Local development/test remain enabled; NODE_ENV=production and compiled frontend builds are closed. Compiled dev environments are also closed by these defaults; enabling dev is a separate authorized release task. No environment/workflow edits made. UI and API guards observed RED→GREEN; real Fastify injected direct routes covered with synthetic authenticated requests.

Local verification: full core 305 PASS / 4 FAIL, same four previously baseline-proven training-bank failures (openWindowObservation.test.ts, openWindowTrainingScenes.test.ts). Server pure/parser/DTO/guard and synthetic HTTP tests: 38/38 PASS. Web targeted affected screen/store/loop/renderer suites: 267/267 PASS. Core build, server/web typecheck, web production build PASS; build reports existing Browserslist database age notice. Browser fixture at http://127.0.0.1:8770/beach-playground.html: existing beach arena/goalie, three water zones, resting disabled button, one full-width notice, 360×800 layout and simulated 2.5-second reply observed. This is a synthetic frontend fixture, NOT actual attempt/API acceptance. HMR fixture root warning addressed with unmount cleanup.

CI/deployment: not run; no push/merge/release. Catalog profile/preview activation awaits numerical approval. Actual local attempt acceptance, SQL history, immutable attempt read-back, concurrency and full success/failure flow remain open. Final cinematics remain deferred.

Final local check note: ESLint could not run because the reused dependency tree does not expose the eslint executable (`pnpm exec eslint`: command not found). No install/network dependency changes were made. Diff whitespace check PASS. The server HTTP test's initially incorrect guessed plural route paths produced 404; paths corrected against routes.ts, final 38/38 PASS. The final web run includes catalog guard plus loop/rebound regressions: 267/267 PASS. Final server/web typechecks PASS. The frontend-only fixture is a separate HTML entry and not part of the default production build.

## Local interactive additions (2026-10-02)

- Seven puddles activate at 3/8/13/18/23/28/33 seconds, retain 30-second growth and soft neutral water styling. Left and upper-right zones moved upward.
- Cleanup taps remove one eighth of a zone's maximum area; 180 ms debounce, short dry interval and regrowth. Only private fixture rules are edited; no stored snapshot changes. First-puddle hint uses the single notice; intro modal removed. Preview copy is a draft, not active catalog text.
- Wind candidate: 10 seeded gusts, one in each 15-second segment, starts at least 5 seconds apart. Shuffled targets: three player, three goalie, three goal, plus one randomly assigned. One-second reversal at 30% of the current movement speed changes integrated motion phase; subsequent movement resumes continuously. Player wind subtracts only existing moving time, so shots/rest remain stationary and wind does not add movement during stumbles.
- Local wind/sand trails surround the selected entity; the single notice names it. Render and perspective shot resolver use the same separate goal/goalie motion clocks (optional hooks; old calls unchanged). Core version 73.
- Cleanup and wind are frontend-only probes. No API events, catalog activation, migration, push, deployment or data writes. Server-authoritative persistence/validation of those interactions remains required before real attempts can use them.

- Local stumble candidate now retains 30% of fatigue/melt-adjusted movement, with continuous integrated phase and shot/rest pauses taking precedence. Wind streaks doubled in number, enlarged and brightened.

## Authoritative integration — 2026-10-02

The user approved full attempts and dev deployment. Core 74 now shares deterministic wind and cleanup replay. New attempts persist a seeded ten-gust schedule; cleanup uses an append-only, owned, atomic and idempotent endpoint. Migration 174 adds only cleanup history and updates the Beach catalog profile. Existing snapshots, IDs and rewards remain unchanged. Production has separate client/server gates; dev enables Challenges explicitly. The playground remains outside the deployment build. This supersedes the earlier frontend-only status.

Local evidence: core Beach/fatigue 32 checks and existing duel/bonus 38 checks passed; focused web 228 passed. Isolated PostgreSQL integration suites passed (114 and 52 checks), and direct production-route gates passed 8 checks. Core/server/web typechecks, core/server builds, production and development web builds, and full source lint passed. The full core suite retains four previously reproduced baseline training-bank failures. No rendered acceptance of an actual attempt is claimed; browser CDP was unavailable. Deployment remains pending at this checkpoint.

Release recheck: broad web invocation ran 1825 tests before isolated suites: 1818 passed, seven stale observation-scene failures in OpenWindowObservationPlay/recordedObservation. These are reported separately; the full web suite is not green. Focused Beach/bonus verification is independent.
