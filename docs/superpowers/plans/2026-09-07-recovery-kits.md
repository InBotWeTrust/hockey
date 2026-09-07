# Recovery Kits Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three purchasable single-use recovery kits that reduce eligible gameplay recovery by 15, 30, or 60 minutes.

**Architecture:** Extend inventory with a non-equippable `recovery` kind and persist each use against the exact source shot. A transactional endpoint optionally purchases and consumes one kit, then returns refreshed inventory and lock state. Shared web UI exposes the products in shop/profile/locker and applies them only from eligible daily and Classic locks.

**Tech Stack:** PostgreSQL migrations, Fastify, TypeScript, React 18, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-recovery-kits-design.md`

## Global Constraints

- Recovery is exactly 60 minutes before reductions.
- Kits reduce only `recent_gameplay`, never active or scheduled tournament locks.
- Prices are 600/1,000/1,800 coins for 15/30/60 minutes.
- Recovery items never enter equipment selection or gameplay HUD circles.
- GLM review is disabled by user request.

---

### Task 1: Persistence and seeded products

**Files:**
- Create: `packages/server/db/migrations/109_recovery_kits.sql`
- Create: `packages/web/public/inventory/recovery-15.webp`
- Create: `packages/web/public/inventory/recovery-30.webp`
- Create: `packages/web/public/inventory/recovery-60.webp`

**Interfaces:**
- Produces: inventory kind `recovery`, `effect_recovery_minutes`, `recovery_kit_application` and three active catalog rows.

- [ ] Add a migration test expectation for the schema and seed values.
- [ ] Run it and observe failure before migration creation.
- [ ] Add forward-only schema changes, indexes, constraints, and idempotent seeds.
- [ ] Copy and optimize the three approved images to WebP.
- [ ] Run migration tests.

### Task 2: Recovery-aware lock and atomic use endpoint

**Files:**
- Modify: `packages/server/src/duel/gameplayLocks.ts`
- Modify: `packages/server/src/routes/inventory.ts`
- Modify: `packages/server/test/duel/gameplayLocks.test.ts`
- Create: `packages/server/test/inventory/recoveryKits.test.ts`

**Interfaces:**
- Produces: `POST /inventory/recovery/use` with `{ itemId, action, buyIfNeeded, idempotencyKey }` returning `{ inventory, gameplayLock, appliedMinutes }`.

- [ ] Write failing tests for per-shot reductions, expiry, cap, forbidden lock reasons, FIFO consumption, optional atomic purchase, and idempotency.
- [ ] Run focused tests and verify expected failures.
- [ ] Return the source shot and subtract recorded recovery applications in lock calculation.
- [ ] Implement the locked transaction and ledger/history entries.
- [ ] Run focused server tests.

### Task 3: Inventory API, shop and administration

**Files:**
- Modify: `packages/web/src/api/inventory.ts`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/server/src/admin/routes.ts`

**Interfaces:**
- Consumes: inventory kind/effect from Task 1 and endpoint from Task 2.
- Produces: typed recovery catalog, shop section, admin editor controls, and `useRecoveryKit()`.

- [ ] Write failing shop/API/admin tests.
- [ ] Run them and verify failures.
- [ ] Extend DTOs and category metadata without adding recovery to equipment unions.
- [ ] Render the recovery shop section and correct resource labels.
- [ ] Run focused tests.

### Task 4: Profile and duel locker inventory presentation

**Files:**
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: recovery items from inventory state.
- Produces: horizontal four-category profile row and separate duel-locker recovery card.

- [ ] Write failing rendering tests including zero stock and absence from loadout circles.
- [ ] Run them and verify failures.
- [ ] Implement the snap-scrolling card layout and aggregated recovery stock.
- [ ] Run focused tests at narrow viewport.

### Task 5: Apply-from-lock UX

**Files:**
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `useRecoveryKit()` and `GameplayLockDTO`.
- Produces: confirmed owned-use and buy-and-use flow on daily and Classic `recent_gameplay` locks.

- [ ] Write failing tests for eligible/ineligible buttons, confirmation, zero stock, insufficient currency, and immediate refresh.
- [ ] Run tests and verify failures.
- [ ] Implement the shared modal and wire it to daily and Classic inactive actions.
- [ ] Run focused web tests.

### Task 6: Full verification

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] Build `@hockey/game-core` before server checks.
- [ ] Run focused server and web suites.
- [ ] Run typecheck, lint, tests, and build.
- [ ] Inspect the final diff and confirm `output/` remains untouched.
- [ ] Commit the implementation without deploying until explicitly requested.
