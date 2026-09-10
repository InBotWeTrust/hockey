# Tournament UX and Venue Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tournament creation usable, expose tournaments to players, and make every duel use and display the correct user-relative venue.

**Architecture:** Persist venue intent on tournament fixtures, freeze the resolved arena snapshot when the first segment opens, and pass that immutable venue into every tournament duel segment. Keep ordinary duels on the standard arena. Rebuild the admin wizard around shared compact controls and a serialized save queue, while keeping public tournament navigation and venue badges consistent across all player surfaces.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL 16, React 18, TanStack Query, Zustand, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-08-24-tournaments-design.md`

## Global Constraints

- Base branch is exact `origin/dev`; integrate only into `dev` after verification.
- Do not touch `main`, production, production data, game-core deterministic behavior, shot timing, trajectories, or gameplay API semantics.
- GLM is disabled by direct user instruction and must never be run.
- Ordinary amateur duels always use the standard default arena.
- Tournament fixture arena snapshots are immutable after the first segment opens and are reused by overtime and shootout segments.
- Venue labels are user-relative text badges: `Дома`, `В гостях`, `Нейтрально`; color is supplementary only.
- Public tournaments remain protected by `tournaments.enabled`; enable it only in the dev environment after automated and rendered QA.
- Every production change follows RED -> GREEN and preserves unrelated user files and worktrees.

---

### Task 1: Tournament fixture venue ownership and immutable arena snapshot

**Files:**
- Create: `packages/server/db/migrations/065_tournament_fixture_venue.sql`
- Modify: `packages/server/src/tournament/schedule.ts`
- Modify: `packages/server/src/tournament/materialize.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/tournament/fixtureLifecycle.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify if needed: `packages/server/src/arenas/service.ts`
- Test: `packages/server/test/tournament/schedule.test.ts`
- Test: `packages/server/test/tournament/service.integration.test.ts`
- Test: `packages/server/test/duel/amateur.test.ts`
- Test: `packages/server/test/tournament/migration-contract.test.ts`

**Interfaces:**
- Produces `TournamentPairing.venueMode: 'home_selected' | 'neutral_default'`.
- Persists `tournament_fixture.venue_mode`, nullable venue owner, arena id, and JSON snapshot.
- Extends `createTournamentDuelMatch` with an explicit immutable venue snapshot rather than re-resolving it per segment.
- Keeps fixture `home/away` score sides intact even for neutral fixtures.

- [ ] **Step 1: Write failing schedule tests**

Add literal expectations for one through five cycles. Assert the pairwise sequence is neutral; home/away; home/away/neutral; two mirrored pairs; and two mirrored pairs plus neutral. The test must fail if the final odd cycle receives a home arena.

- [ ] **Step 2: Run schedule RED**

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/schedule.test.ts
```

Expected: fixture venue mode is absent or the odd cycle is not neutral.

- [ ] **Step 3: Write failing arena ownership integration tests**

Create a home participant with a selected non-default arena and assert the first segment freezes it on the fixture and duel. Change the user's selection, create the next segment, and assert the original snapshot is reused. Add a neutral fixture assertion using the default arena. Add an ordinary matchmaking duel assertion that it always uses the default arena regardless of template policy or either player's selected arena.

- [ ] **Step 4: Run server RED**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts test/duel/amateur.test.ts -t "arena snapshot|ordinary duel venue"
```

Expected: tournament fixtures do not store venue snapshots and ordinary matchmaking may select a participant arena.

- [ ] **Step 5: Add the migration and minimal implementation**

Add additive, idempotent fixture columns and constraints. Mark only the final unmatched odd cycle neutral. Resolve and store the fixture arena under the existing fixture lock before creating the first segment; pass the stored snapshot into every duel segment. Force non-tournament duel creation to the default arena.

- [ ] **Step 6: Run GREEN and focused server regressions**

Run the complete schedule tests, migration contract, tournament fixture lifecycle cases, and amateur duel venue cases.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations/065_tournament_fixture_venue.sql packages/server/src/tournament packages/server/src/duel/amateur/routes.ts packages/server/src/arenas packages/server/test/tournament packages/server/test/duel/amateur.test.ts
git commit -m "feat(tournaments): persist fixture venue ownership"
```

---

### Task 2: Venue DTOs, badges, and correct gameplay backgrounds

**Files:**
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/server/test/tournament/service.integration.test.ts`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`
- Test: `packages/web/src/app/App.test.tsx`
- Test: `packages/web/src/tournament/TournamentCatalog.test.tsx`

**Interfaces:**
- Duel DTO supports `source: 'challenge' | 'matchmaking' | 'tournament'` and `venue_role: 'home' | 'away' | 'neutral'` for the authenticated player.
- Tournament schedule fixtures expose `venueMode` and a user-relative venue label can be derived from `home`, `away`, and current user id.
- `VenueBadge` renders accessible compact text without relying on color.

- [ ] **Step 1: Write failing DTO and UI tests**

Assert home, away, and neutral tournament participants receive the correct venue role. Render current-duel cards, history, the arena cube, and tournament schedule with literal `Дома`, `В гостях`, and `Нейтрально` expectations. Assert the web type accepts `source: 'tournament'`.

- [ ] **Step 2: Write failing background regressions**

Assert `appBackdropClassName('/', '?view=amateur&match=m1&play=1')` returns no app arena backdrop. Render an ordinary duel and assert `PlayView.longCourtBackground` is omitted. Render a tournament home fixture and assert it receives the frozen tournament arena artwork.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @hockey/web exec vitest run src/app/App.test.tsx src/screens/DailyScreen.test.tsx src/tournament/TournamentCatalog.test.tsx -t "venue|background|площад"
```

Expected: tournament source is missing, badges are absent, ordinary duel forwards arena artwork, and active amateur play keeps the outer backdrop.

- [ ] **Step 4: Implement shared venue presentation**

Add a small reusable badge and user-relative label helper. Put it under the duel format on the cube, in current and historical duel cards, and beside every tournament schedule fixture. Remove the outer backdrop from active amateur play. Supply `longCourtBackground` only for tournament matches; ordinary duels fall back to the existing standard rink.

- [ ] **Step 5: Run GREEN and focused web regressions**

Run the full App, DailyScreen, and TournamentCatalog test files.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/tournament/service.ts packages/server/src/duel/amateur/routes.ts packages/server/test/tournament/service.integration.test.ts packages/web/src/api packages/web/src/screens/DailyScreen.tsx packages/web/src/app packages/web/src/tournament/TournamentCatalog.test.tsx
git commit -m "fix(duels): show and apply fixture venues"
```

---

### Task 3: Compact tournament wizard and serialized draft saving

**Files:**
- Create: `packages/web/src/tournament/tournamentDraftSaveQueue.ts`
- Create: `packages/web/src/tournament/TournamentAdminField.tsx`
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/web/src/tournament/tournamentDraftSaveQueue.test.ts`
- Test: `packages/web/src/tournament/TournamentAdmin.test.tsx`

**Interfaces:**
- `TournamentDraftSaveQueue.enqueue(snapshot)` keeps at most one PATCH in flight and saves the latest pending snapshot after it completes.
- `flush()` resolves only when the latest valid snapshot is acknowledged by the server.
- `TournamentAdminField` consistently renders label, control, and helper copy.

- [ ] **Step 1: Write failing save-queue tests**

Use deferred promises to prove that rapid edits never overlap PATCH requests, the latest snapshot is not lost, revision numbers advance sequentially, `flush()` waits, and a failed write leaves the wizard dirty with a visible retry state.

- [ ] **Step 2: Write failing wizard interaction tests**

Assert every visible field has helper text, all categorical choices use `GlassSelect` rather than native `select`, the description textarea has the shared rounded control style and useful minimum height, advanced sections are collapsed initially, the close icon remains in the title row, and the wizard uses `--app-viewport-height` on mobile. Simulate `Готово` during an in-flight save and assert it waits, closes without a warning, and opens operations for the saved tournament.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @hockey/web exec vitest run src/tournament/tournamentDraftSaveQueue.test.ts src/tournament/TournamentAdmin.test.tsx
```

Expected: independent mutations overlap, native selects and unstyled textarea remain, helper copy and flush behavior are absent.

- [ ] **Step 4: Implement the queue and compact field system**

Replace mutation-driven debounce with the serialized queue. Rebuild the wizard shell with sticky title, compact step rail, scrollable body, sticky footer, keyboard-safe viewport sizing, custom glass selects, consistent inputs/textarea, helper copy, and collapsible advanced settings. Preserve expectedRevision conflict handling and immutable published revisions.

- [ ] **Step 5: Run GREEN and wizard regressions**

Run both queue tests and the complete TournamentAdmin test file.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/tournament packages/web/src/app/design-system.css
git commit -m "fix(admin): rebuild tournament draft wizard"
```

---

### Task 4: Player tournament wayfinding and usable tournament details

**Files:**
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/tournament/TournamentCatalog.tsx`
- Modify: `packages/web/src/app/design-system.css`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`
- Test: `packages/web/src/tournament/TournamentCatalog.test.tsx`

**Interfaces:**
- Amateur pages expose a persistent `Дуэли | Турниры` segmented switch.
- Tournament catalog keeps registration state, personal participation, schedule, results, standings, playoffs, and rules reachable from one details flow.

- [ ] **Step 1: Write failing wayfinding tests**

Navigate directly to both amateur sections and assert the same persistent switch is present. Assert tournaments do not silently disappear while the catalog request is loading or unavailable. Assert a user can open a tournament, see application state, move to schedule, identify their venue, and open a playable fixture.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx src/tournament/TournamentCatalog.test.tsx -t "Дуэли|Турниры|расписание|заяв"
```

Expected: navigation is card-gated on request success and tournament details are visually incomplete.

- [ ] **Step 3: Implement compact player surfaces**

Use the shared segmented tabs on both amateur sections, show explicit loading/unavailable states, and compact the tournament details into the established glass-card language. Keep overview, standings, schedule/results, playoff, rules/prizes, registration state, and fixture action visible and understandable.

- [ ] **Step 4: Run GREEN and complete player regressions**

Run the complete DailyScreen and TournamentCatalog test files.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/DailyScreen.tsx packages/web/src/tournament/TournamentCatalog.tsx packages/web/src/app/design-system.css packages/web/src/screens/DailyScreen.test.tsx packages/web/src/tournament/TournamentCatalog.test.tsx
git commit -m "fix(tournaments): expose the player tournament flow"
```

---

### Task 5: Verification and dev-only delivery

**Files:**
- Modify only if a regression is found.

- [ ] Install dependencies with the frozen lockfile.
- [ ] Build `@hockey/game-core` before server tests.
- [ ] Run focused migration, schedule, tournament service, amateur duel, App, DailyScreen, TournamentAdmin, and TournamentCatalog tests.
- [ ] Run complete server and web tests with local PostgreSQL/Redis.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, root `pnpm test`, and `git diff --check`.
- [ ] Run rendered mobile and desktop QA for the wizard, keyboard, cube, duel cards/history, tournament switch, schedule, and both ordinary/tournament gameplay backgrounds.
- [ ] Run a whole-branch code review; any Critical or Important finding blocks integration.
- [ ] Integrate the verified commits into `dev`, push only `dev`, watch GitHub Actions, and confirm the deployed runtime SHA exactly matches the integrated commit.
- [ ] Enable `tournaments.enabled` only on the dev environment after the exact-SHA workflow and rendered QA are green. Production remains unchanged.
