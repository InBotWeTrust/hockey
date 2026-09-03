# Playoff Bracket Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-to-right playoff overview as the default tab and open series details in one shared modal in both player and admin views.

**Architecture:** Keep the existing bracket API unchanged. Split presentation helpers and the overview layout into focused web components, while the current `TournamentPlayoffBracket` remains the state owner for tab selection and the selected-series modal. Render round columns from `round_number` and `depends_on`, place the bronze branch below the final, and derive champion and schedule labels from existing series data.

**Tech Stack:** React 18, TypeScript, Testing Library/Vitest, existing Ultimate Hockey design system, `AccessibleModal`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-03-playoff-bracket-overview-design.md`

## Global Constraints

- UI copy is Russian; code identifiers and commits are English.
- The bracket flows only left to right.
- Small brackets fill available width; larger brackets preserve readable cards and scroll horizontally.
- Championship series converge by centering every next-round match between its two feeder series; the bronze branch stays outside that alignment flow.
- The existing bracket API, tournament actions, game opening, and readiness behavior remain compatible.
- Use the existing `.modal-backdrop`, `.modal-card`, `.modal-title`, and `.icon-btn` contracts.
- Do not run GLM.

---

### Task 1: Lock the player-facing bracket contract

**Files:**

- Modify: `packages/web/src/tournament/TournamentCatalog.test.tsx`
- Modify: `packages/web/src/tournament/TournamentPlayoffBracket.tsx`
- Create: `packages/web/src/tournament/TournamentPlayoffOverview.tsx`

**Interfaces:**

- Consumes: `TournamentBracketSeries[]`, `currentUserId`, `timezone`, per-round formats.
- Produces: `TournamentPlayoffOverview` with `onOpenSeries(series, title)` and exported schedule-label helpers used by real rendering.

- [ ] **Step 1: Write the failing player test**

Update the existing playoff test to assert that «Сетка» is selected first, all championship rounds are visible together, the bronze branch and champion card are present, a current-user series is highlighted, and clicking a series opens a dialog instead of inline games.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @hockey/web test -- TournamentCatalog.test.tsx -t "shows playoff rounds"`

Expected: FAIL because the overview tab, champion card, date labels, and shared dialog do not exist.

- [ ] **Step 3: Implement the minimal overview and modal selection state**

Create `TournamentPlayoffOverview` to group championship series into ascending round columns, render the bronze series below the final, derive the champion from the completed final, and call `onOpenSeries`. Update `TournamentPlayoffBracket` so `overview` is the initial tab and a selected series is rendered through `AccessibleModal`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @hockey/web test -- TournamentCatalog.test.tsx -t "shows playoff rounds"`

Expected: PASS.

### Task 2: Reuse the modal in detailed rounds and admin controls

**Files:**

- Modify: `packages/web/src/tournament/TournamentPlayoffBracket.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.test.tsx`

**Interfaces:**

- Consumes: existing `renderSeriesAction(series)` and `PlayerAttemptState`.
- Produces: one `SeriesDetailsModal` path used by overview cards and detailed-round cards.

- [ ] **Step 1: Write the failing admin test**

Assert that opening a series from the admin bracket creates a dialog, the manual winner action exists only inside it, switching to a detailed round and opening the same series uses the same dialog, and closing removes it.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @hockey/web test -- TournamentOperations.test.tsx -t "keeps series management"`

Expected: FAIL because the current implementation expands content inline.

- [ ] **Step 3: Move games and actions into the shared modal**

Make `SeriesCard` a summary-only button. Render fixtures, results, the current-player attempt state, empty-schedule copy, and `renderSeriesAction` inside the selected-series modal. Use the standard header close icon and accessible dismissal behavior.

- [ ] **Step 4: Run focused player and admin tests**

Run: `pnpm --filter @hockey/web test -- TournamentCatalog.test.tsx TournamentOperations.test.tsx`

Expected: PASS.

### Task 3: Complete responsive styling and regression verification

**Files:**

- Modify: `packages/web/src/app/design-system.css`
- Modify: `packages/web/src/tournament/TournamentCatalog.test.tsx`
- Modify: `packages/web/src/tournament/TournamentOperations.test.tsx`

**Interfaces:**

- Consumes: overview semantic class names and `data-layout="fit|scroll"`.
- Produces: readable mobile fit layout for up to three columns and horizontal scrolling for larger brackets.

- [ ] **Step 1: Add behavior assertions that distinguish compact and large grids**

Add fixtures for a compact bracket and a four-stage bracket. Assert their rendered overview roots expose `data-layout="fit"` and `data-layout="scroll"`, respectively; these attributes drive the corresponding CSS behavior.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @hockey/web test -- TournamentCatalog.test.tsx TournamentOperations.test.tsx`

Expected: FAIL until responsive layout metadata is rendered.

- [ ] **Step 3: Implement design-system styles**

Add round columns, series connectors, readable player rows, current-user highlighting, gold champion treatment, bronze third-place treatment, modal game list styling, touch scrolling, and narrow-screen safeguards. Preserve existing unified-glass overrides.

- [ ] **Step 4: Run complete local verification**

Run:

```bash
pnpm --filter @hockey/web test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Perform rendered QA**

Open the existing local player and admin tournament flows in the user's in-app browser. Verify small and large brackets, horizontal swipe, modal dismissal, future participants, current-user highlighting, bronze branch, champion, exact game results, and admin controls at the same mobile viewport used by the supplied references.
