# Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opaque locker-room profile with a readable player profile and direct routes to statistics, equipment, home arena, achievements, and settings.

**Architecture:** Keep `GET /me` intact for existing consumers. The web profile becomes a small route hub built from focused profile components; it reuses the existing inventory and home-arena APIs and the existing settings/achievements screens. Initial statistics use the established `ProfileData.stats` contract and expose no invented per-mode data.

**Tech Stack:** React 18, React Router, TanStack Query, Vitest, Testing Library, Fastify API contracts already present in the repository.

**Spec:** Approved profile scheme from the 2026-08-28 conversation: identity header; coin/star/experience cells; Statistics, Equipment, Home Arena, Tasks and Achievements cards; separate Settings card; no locker scene or hidden hotspots.

## Global Constraints

- Do not modify game-core, shot simulation, balance, database schema, or production/deployment state.
- Preserve the existing `/me`, `/inventory/me`, home-arena, achievement, and settings contracts.
- Keep Russian UI copy, standard glass cards, icon-button convention, and no icons inside text buttons.
- An API failure must show explicit retry/error UI; never show invented zeroes or dashes as if data had loaded.
- Retain profile context in bottom navigation for all new `/profile/*` routes.

---

### Task 1: Replace the locker home screen

**Files:**
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `ProfileData`, `InventoryState`, `HomeArenasResponse`.
- Produces: buttons with routes `/profile/stats`, `/profile/equipment`, `/profile/arena`, `/profile/achievements`, and `/profile/settings`.

- [ ] **Step 1: Write the failing profile-home test**

```tsx
expect(await screen.findByRole('heading', { name: 'Профиль игрока' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Статистика' })).toBeInTheDocument();
expect(screen.queryByLabelText('Раздевалка игрока')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx`

Expected: FAIL because the old locker render still exists.

- [ ] **Step 3: Implement the minimal route hub**

```tsx
<main className="screen profile-screen">
  <ProfileIdentityHeader profile={data} balances={balances} onSettings={() => navigate('/profile/settings')} />
  <section className="profile-grid">{/* five direct section buttons */}</section>
</main>
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx`

Expected: PASS.

### Task 2: Add focused profile destination screens

**Files:**
- Create: `packages/web/src/screens/ProfileStatsScreen.tsx`
- Create: `packages/web/src/screens/ProfileEquipmentScreen.tsx`
- Create: `packages/web/src/screens/ProfileArenaScreen.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`

**Interfaces:**
- `ProfileStatsScreen` consumes `GET /me` and renders loaded aggregate values only.
- `ProfileEquipmentScreen` consumes `fetchMyInventory` and routes to `/inventory` for shopping.
- `ProfileArenaScreen` consumes `fetchHomeArenas`, reuses `HomeArenaModal`, and updates its query cache after save.

- [ ] **Step 1: Write failing route tests**

```tsx
renderProfileAt('/profile/stats');
expect(await screen.findByRole('heading', { name: 'Статистика' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx`

Expected: FAIL because no profile destination route exists.

- [ ] **Step 3: Add screens and authenticated routes**

```tsx
<Route path="/profile/stats" element={<PrivateRoute><ProfileStatsScreen /></PrivateRoute>} />
<Route path="/profile/equipment" element={<PrivateRoute><ProfileEquipmentScreen /></PrivateRoute>} />
<Route path="/profile/arena" element={<PrivateRoute><ProfileArenaScreen /></PrivateRoute>} />
<Route path="/profile/achievements" element={<PrivateRoute><AchievementsScreen /></PrivateRoute>} />
```

- [ ] **Step 4: Run focused screens tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx`

Expected: PASS.

### Task 3: Verify regression safety and remove abandoned design artifacts

**Files:**
- Delete: `.superdesign/`
- Modify: `.gitignore` only to remove the agent-added Superdesign temporary-directory entry.

- [ ] **Step 1: Run static checks and focused web suite**

Run: `pnpm --filter @hockey/web typecheck && pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run full type and diff checks**

Run: `pnpm typecheck && pnpm lint && git diff --check`

Expected: PASS.

- [ ] **Step 3: Confirm final changed-file scope**

Run: `git status --short && git diff --stat`

Expected: profile UI, routes, tests, and no `.superdesign` artefacts.
