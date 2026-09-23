# Dev-only Marksmanship Constructor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Project Git policy takes precedence over automatic worktree creation or agent delegation.

**Goal:** Give dev players a profile-avatar entry to an exact, touch-friendly marksmanship situation constructor while keeping it out of production.

**Architecture:** A build-time dev-only gate wraps a new authenticated route. A pure game-core snapshot function supplies rendering positions, hitbox bounds and authoritative shot classification for replay mode. A client-only manual mode uses the same dimensions for static intersections but does not invent time-dependent points. A Pixi court component uses the existing game renderers/assets and has its own pausable clock; it does not submit attempts.

**Tech Stack:** React 18, TypeScript, React Router, Pixi 8, Vite 5, game-core, Vitest, Testing Library, pnpm 9.

**Spec:** `docs/superpowers/specs/2026-09-23-marksmanship-constructor-design.md`

## Global Constraints

- Russian UI; English identifiers/comments/commit messages.
- No grip control, server writes, scoring rebalance or production exposure.
- Use the same game-core position, shot-resolution and V4 scoring functions as the live game; no web copy of scoring thresholds.
- Keep the existing bonus-game screen behaviour and current unrelated checkout changes intact.
- Production gate is disabled by default; a source comment is documentation, not the gate.
- Normal phone viewport shows court, controls and result together; on very short viewports legibility/geometry wins over no-scroll.
- Before implementation re-fetch `origin/dev`, confirm base SHA and task branch/worktree ownership; follow project branch policy. The existing isolated spec worktree can be continued only if its branch/base and user changes remain safe.
- `docs/engineering/testing.md` is absent on the fetched `origin/dev` used for this plan. Recheck at execution; if still absent, use package scripts and report the gap.

## Review Focus

1. Missing or non-V4 scoring snapshot: replay must say inputs are insufficient, never quietly use default points. Task 5 tests it.
2. Manual coordinates at 0/572 or beyond physical bounds: clamp centers to legal hitbox ranges and show feedback. Task 2 tests it.
3. Direct constructor URL in a production build: inaccessible and constructor chunk absent. Task 3 tests it.
4. A narrow phone or screen keyboard opening: controls/result remain operable and scene scale stays correct. Task 5 browser checks it.
5. Result card covering a moving player/goalie: compact/reposition it. Task 5 browser checks it.

---

## File map

- `packages/game-core/src/marksmanshipConstructor.ts`: pure replay snapshot and manual static-geometry projection; exported through `index.ts`.
- `packages/web/src/game/MarksmanshipConstructorCourt.tsx`: deterministic Pixi court using existing `Goal`, `Goalie`, `Player`, `Puck`, background and coordinate scale.
- `packages/web/src/screens/MarksmanshipConstructorScreen.tsx` and `.css`: controls, result card, responsive placement, details drawer and Back button.
- `packages/web/src/app/devOnlyFeatures.ts`: build-time gate, disabled unless an exact build flag is true outside production mode.
- `packages/web/src/screens/ProfileScreen.tsx`, `packages/web/src/app/App.tsx`: avatar and route only behind the gate.
- `packages/web/Dockerfile`, `.github/workflows/deploy-dev.yml`, build verification script: explicit dev flag and production-exclusion proof.
- Unit and UI tests adjacent to each module; do not modify live scoring rules or the bonus-game server.

### Task 1: Authoritative replay snapshot

**Files:** Create `packages/game-core/src/marksmanshipConstructor.ts`, `packages/game-core/src/marksmanshipConstructor.test.ts`; modify `packages/game-core/src/index.ts`.

**Interfaces:**
- Consumes `MarksmanshipShotInput`, `classifyMarksmanshipShot`, `resolveMarksmanshipShotContext`, `simulateShooter`, `simulateGoal`, `simulateGoalie`, perspective constants and `ShotResult`.
- Produces `buildMarksmanshipReplaySnapshot(input: MarksmanshipShotInput): MarksmanshipReplaySnapshot` with `classification`, `tap`, `goalieCross`, `goalCross`, and explicit `hitboxes` in game X coordinates. All timestamps are labelled; the adapter does not infer missing score rules. The screen validates incomplete form input before calling this typed function.

- [ ] Write failing tests using a fixed seed and complete V4 input. Compare `snapshot.classification` with `classifyMarksmanshipShot(input)` for goal, save and miss; check goalie and goal sample times differ by their actual flight distances.
- [ ] Run `pnpm --filter @hockey/game-core test -- marksmanshipConstructor.test.ts` and record RED.
- [ ] Implement the pure adapter by calling game-core's existing functions; extract/export a shared hitbox measurement helper from `marksmanship.ts`/`court/perspective.ts` only where needed, so the snapshot and resolver use the same width, inset and visual-X formula. Example entry contract:

```ts
export function buildMarksmanshipReplaySnapshot(
  input: MarksmanshipShotInput,
): MarksmanshipReplaySnapshot {
  const classification = classifyMarksmanshipShot(input);
  const context = resolveMarksmanshipShotContext(input);
  const goalieCrossMs = input.shotInput.tapTime + (PUCK_START.y - GOALIE_Y) /
    (input.shotInput.puckSpeedPerMs ?? PUCK_SPEED_PER_MS);
  const goalCrossMs = input.shotInput.tapTime + (PUCK_START.y - GOAL_OPENING.y) /
    (input.shotInput.puckSpeedPerMs ?? PUCK_SPEED_PER_MS);
  return sampleReplayPositionsAndBounds(input, classification, context,
    goalieCrossMs, goalCrossMs);
}

// Implement in this file with the signature below; reuse existing simulator
// and perspective-geometry helpers, never duplicate their thresholds.
function sampleReplayPositionsAndBounds(input: MarksmanshipShotInput,
  classification: MarksmanshipShotClassification,
  context: MarksmanshipShotContext,
  goalieCrossMs: number, goalCrossMs: number): MarksmanshipReplaySnapshot;
```

- [ ] Run the targeted test GREEN, then `pnpm --filter @hockey/game-core build` and `pnpm --filter @hockey/game-core typecheck`.
- [ ] Review the diff for changed gameplay logic (should be none beyond an equivalent shared helper); commit this independently testable adapter.

### Task 2: Manual static projection

**Files:** Extend `packages/game-core/src/marksmanshipConstructor.ts` and its test.

**Interfaces:** `projectManualMarksmanship(input: { playerX: number; goalCenterX: number; goalieCenterX: number; goalWidth: number; goalieWidth: number }): ManualProjection` returns clamped centers, X ranges, `goal|save|miss` geometry, and `category: null`, `points: null`, `reason: 'manual_static_only'`.

- [ ] Write failing table tests for center overlap/save, open lane/goal, outside-post/miss, exact edges, and invalid numeric values. Assert min/max center limits equal half-width and `RINK.width - half-width`; assert no awarded points.
- [ ] Run the targeted test and record RED.
- [ ] Implement finite-number validation, bounds clamping and static intersection in one pure function. Keep manual results visibly distinct from `classifyMarksmanshipShot`.

```ts
const goalMin = clampedGoalCenter - goalWidth / 2;
const goalMax = clampedGoalCenter + goalWidth / 2;
const goalieMin = clampedGoalieCenter - goalieWidth / 2;
const goalieMax = clampedGoalieCenter + goalieWidth / 2;
const result = playerX >= goalieMin && playerX <= goalieMax ? 'save'
  : playerX >= goalMin && playerX <= goalMax ? 'goal' : 'miss';
```

- [ ] Run GREEN, rebuild game-core and commit.

### Task 3: Fail-closed dev route and avatar

**Files:** Create `packages/web/src/app/devOnlyFeatures.ts` and test; modify `packages/web/src/app/App.tsx`, `packages/web/src/app/App.test.tsx`, `packages/web/src/screens/ProfileScreen.tsx`, `packages/web/src/screens/ProfileScreen.test.tsx`, `packages/web/Dockerfile`, `.github/workflows/deploy-dev.yml`; create `packages/web/scripts/check-constructor-build.mjs`.

**Interfaces:** `export const MARKSMANSHIP_CONSTRUCTOR_ENABLED = import.meta.env.VITE_MARKSMANSHIP_CONSTRUCTOR === 'dev-only-enabled'`. Route dynamically imports the screen only behind this compile-time gate. Profile avatar uses the same gate and routes to `/profile/marksmanship-constructor`. The Docker ARG defaults to empty; only the dev workflow sets the exact sentinel. Production workflow explicitly runs the bundle-exclusion check.

- [ ] Write failing route tests: dev flag gives an accessible avatar button, direct URL loads only for an authenticated user, Back returns to `/profile`; disabled flag leaves avatar non-interactive and direct URL unavailable. Make the mock explicit per test, not globally permissive.
- [ ] Run `pnpm --filter @hockey/web exec vitest run src/app/App.test.tsx src/screens/ProfileScreen.test.tsx` and record RED.
- [ ] Add the exact gate, conditional lazy route and avatar button. Add `ARG/ENV VITE_MARKSMANSHIP_CONSTRUCTOR=""` to the Docker builder and set it to `dev-only-enabled` only in `deploy-dev.yml`. Do not enable it in a production workflow. Add a script that builds with the flag empty and fails if the emitted manifest/chunk names or output bytes include the constructor module or route marker; build with the sentinel and assert presence. Wire the disabled build check into the production workflow as an explicit release gate.
- [ ] Run tests GREEN and both build-exclusion checks. If Vite includes constructor code despite the conditional import, switch to a separate dev-only entry boundary before treating this task as done.
- [ ] Commit the gate and navigation; do not push/deploy yet.

### Task 4: Exact controlled court

**Files:** Create `packages/web/src/game/MarksmanshipConstructorCourt.tsx` and `.test.tsx`; minimally extract shared renderer setup/options from `packages/web/src/game/PlayView.tsx` into `packages/web/src/game/perspectiveCourtVisuals.ts` if the same options cannot be imported safely.

**Interfaces:** `MarksmanshipConstructorCourt({ snapshot, selectedTimeMs, showHitboxes, onDragCenter }: Props)` renders the game's long court background and the existing Pixi `Goal`, `Goalie`, `Player`, `Puck` classes with `coords.ts` scaling. It never starts a live game loop or submits a shot. `onDragCenter` is available only in manual mode.

- [ ] Write failing scene tests for renderer creation/destruction, resizing, selected-time updates, manual drag coordinates and no callbacks that submit attempts. Pin visual option values against the same exported options used by `PlayView`.
- [ ] Run `pnpm --filter @hockey/web exec vitest run src/game/MarksmanshipConstructorCourt.test.tsx` and record RED.
- [ ] Implement the controlled scene using existing sprites/options and game-core snapshot positions. Keep logical court `572×700` separate from visible long-court background proportion; use the same `Scale` conversion and perspective transform as `PlayView`. Show hitbox X bounds as a debug overlay based on authoritative measurements, not sprite edges.
- [ ] Run GREEN, typecheck and existing `PlayView.test.tsx`; visually compare a fixed seed/time with live `PlayView`, then commit.

### Task 5: One-screen constructor UI

**Files:** Create `packages/web/src/screens/MarksmanshipConstructorScreen.tsx`, `.css`, `.test.tsx`.

**Interfaces:** Uses Tasks 1–4. Two modes: `Игровая попытка` and `Ручная расстановка`. Result card shows `ГОЛ`/`МИМО`/`СЕЙВ`, points only when authoritative, decisive trait and short Russian explanation. A details drawer shows bounds and sample timestamps. Back routes to `/profile`.

- [ ] Write failing UI tests for mode switching, initial game arrangement, seed/shot/time inputs, pause/scrub/shoot, manual numeric coordinates with `центр хитбокса` labels, invalid values, missing replay inputs, and no points in manual mode. Add a test for result copy and for the details drawer.
- [ ] Run `pnpm --filter @hockey/web exec vitest run src/screens/MarksmanshipConstructorScreen.test.tsx` and record RED.
- [ ] Implement the controls and result card. Use a full-height court container, safe-area-aware compact controls, center-ice result positioning and collision-aware compact placement. Use CSS `dvh` with fallback; preserve minimum touch targets and allow a short-screen scroll fallback. Keep drag and numeric inputs synchronized through one state model.
- [ ] Run GREEN and typecheck. In the internal browser inspect desktop width, a 390×844 phone and a short 375×667 phone; check visible controls/court/result, safe-area, keyboard, drag, hitbox labels and card/object overlap. Record screenshots or notes.
- [ ] Commit UI separately.

### Task 6: Cross-path regression and release handoff

**Files:** Add fixture tests to `packages/game-core/src/marksmanshipConstructor.test.ts` and `packages/web/src/screens/MarksmanshipConstructorScreen.test.tsx`; update the spec only if implementation discovers an agreed constraint change.

- [ ] Add fixed input fixtures covering `ordinary`, `near_goalie`, `board_side`, `counter_direction`, `precise`, `behind_goalie`, `super_precise`, plus miss/save. Assert constructor classification equals the authoritative `classifyMarksmanshipShot` output and never changes stored scoring rules.
- [ ] Run game-core build before web checks, then targeted game-core/web tests, `pnpm --filter @hockey/web typecheck`, `pnpm --filter @hockey/web build`, lint if available, and production/dev bundle-exclusion checks. Do not label unavailable integration tests as passing.
- [ ] Review `git diff origin/dev...HEAD`, ensure no unrelated work or production route/assets, and get a fresh independent code review only if permitted by current project instructions. Fix concrete findings and re-run affected checks.
- [ ] Open the local route in the in-app browser for rendered acceptance. Dev deployment is a separate user-authorized release step; if authorized, follow the project's release guidance and prove exact runtime SHA and browser behaviour on dev. Never deploy to production.

## Execution handoff

Implement natively in the current task after the user reviews this plan. Do not delegate or create a new task. The dirty `dev` checkout remains untouched; use the isolated task branch/worktree according to the repository's Git policy and refresh its base if `origin/dev` advances before coding.
