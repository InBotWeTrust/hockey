# Classic Tournament Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add duel-equivalent per-period inventory selection, effects, consumption, and result reporting to classic regular-season tournament games.

**Architecture:** Reuse the existing inventory catalog, profile equipment defaults, deterministic effect/condition formulas, and actual-consumption rules from amateur tournament duels. Persist one immutable loadout snapshot per classic session period; expose the current/next selection and aggregate consumption through the classic-game API. Classic games do not reserve a whole period up front, because partial and zero balances are explicitly allowed. The client reuses the existing circular equipment picker and disables it while a period is active.

**Tech Stack:** PostgreSQL migrations, Fastify/TypeScript, shared game-core simulation, React/Zustand, Vitest.

**Spec:** Approved conversation contract on 2026-09-05.

## Global Constraints

- Inventory must be selectable only before a period and during a break.
- A remaining resource balance never blocks period start: an item works while resource remains,
  then the game continues with the base stick/skates/nutrition behavior.
- A period loadout is immutable after the period starts.
- Initial selection comes from profile equipment; in-game changes never update profile equipment.
- Missing/base equipment keeps the same penalties and slower movement used by amateur duels.
- Result UI reports aggregate non-zero inventory consumption across all periods.
- Daily game and training behavior remain unchanged.

---

### Task 1: Shared inventory mechanics

**Files:**
- Modify: `packages/game-core/src/duelInventory.ts`
- Test: `packages/server/test/duel/amateur.test.ts`

**Interfaces:**
- Reuses the deterministic condition, speed-pressure, stumble, fatigue, and actual-consumption formulas already shared through `@hockey/game-core`, while preserving the existing amateur-duel behavior.

- [x] Cover partial and exhausted shot-resource behavior in the shared inventory domain.
- [x] Reuse the shared condition and consumption formulas from `@hockey/game-core`.
- [x] Preserve existing amateur-duel inventory behavior with focused integration tests.

### Task 2: Persist classic loadout per period

**Files:**
- Create: `packages/server/db/migrations/099_tournament_classic_period_loadout.sql`
- Modify: `packages/server/src/tournament/classicGame.ts`
- Test: `packages/server/test/tournament/classicGame.integration.test.ts`

**Interfaces:**
- Consumes shared inventory mechanics from Task 1.
- Produces `startClassicGamePeriod(..., loadout)` and a period record containing immutable loadout, consumed charges, and an inventory report.

- [x] Add failing integration tests for profile default selection, explicit selection, partial and zero
      resource fallback, period immutability, and changing selection after a break.
- [x] Run the classic integration test and verify RED.
- [x] Add the forward-only table/migration and persist the period snapshot at start.
- [x] Apply duel speed/condition effects to authoritative shot simulation and consume inventory using actual period activity.
- [x] Continue the period with base behavior after a selected item's resource is exhausted.
- [x] Run the classic integration test and verify GREEN.

### Task 3: Extend the classic API contract and result report

**Files:**
- Modify: `packages/server/src/tournament/classicGame.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/web/src/api/tournamentClassic.ts`
- Test: `packages/server/test/tournament/classicGame.integration.test.ts`

**Interfaces:**
- Produces `loadout`, `loadout_editable`, inventory options/availability, and `inventory_consumption` in `ClassicGameState`; period start accepts the three-slot selection.

- [x] Add failing route-contract tests for selection input, editability by state, and aggregate non-zero consumption.
- [x] Implement the DTO and request validation.
- [x] Verify server tests and server/web typecheck.

### Task 4: Reuse circular equipment controls in classic gameplay

**Files:**
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/stores/classicTournamentStore.ts`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**
- Consumes the Task 3 classic state and period-start request.
- Produces three profile-defaulted circles that are editable in idle/break states and disabled during `period_active`.

- [x] Add failing rendered tests for profile defaults, pre-period editing, active-period disabling, and break editing.
- [x] Reuse the existing duel equipment picker and submit selection with period start.
- [x] Add the existing sectional `Общий расход инвентаря` block to the completed classic result, omitting zero entries.
- [x] Run focused rendered tests at normal and narrow mobile widths.

### Task 5: Verification

**Files:**
- Verify all files changed above.

- [x] Build `@hockey/game-core` before server tests.
- [x] Run classic and amateur inventory integration suites.
- [x] Run focused web tests, typecheck, lint, build, and `git diff --check`.
- [x] Review the migration for forward-only dev/prod safety and leave deployment for a separate explicit user command.
