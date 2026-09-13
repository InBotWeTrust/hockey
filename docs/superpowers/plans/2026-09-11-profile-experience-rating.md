# Profile Experience Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact inventory units to profile cards and an infinitely paginated experience leaderboard modal with a contextual pinned current-user row.

**Architecture:** A new authenticated profile route uses indexed keyset pagination over `users.experience DESC, users.id ASC` and independently returns the viewer's deterministic rank. A focused web API module and leaderboard modal keep pagination/visibility logic out of `ProfileScreen`, while existing profile formatters and modal primitives remain the visual foundation.

**Tech Stack:** PostgreSQL 16, Fastify 4, Zod, React 18, TanStack Query, Testing Library, Vitest, CSS.

**Spec:** `docs/superpowers/specs/2026-09-11-profile-experience-rating-design.md`

## Global Constraints

- UI text is Russian; code identifiers and commit messages are English.
- Use the standard `AccessibleModal` header and close-button layout.
- Page size is 30 by default and never exceeds 50.
- Ranking order is experience, career goals, career accuracy, then user ID, with distinct deterministic places.
- Use keyset pagination; do not load or return the complete user table.
- Do not modify experience balances or inventory consumption.
- Do not touch the dirty primary checkout or deploy without a separate instruction.

---

### Task 1: Compact profile inventory resource units

**Files:**
- Modify: `packages/web/src/screens/inventoryResourceLabels.ts`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Test: `packages/web/src/screens/ProfileScreen.test.tsx`

**Interfaces:**
- Produces: `formatInventoryBadgeAmount(kind, amount, unit): string` returning `30 мин`, `1 800 бр`, or `14 817 пр` for profile artwork badges.
- Consumes: existing inventory kind, amount, and resource-unit fields.

- [ ] **Step 1: Write failing profile tests**

Add fixtures for an equipped stick, equipped skates, nutrition, and recovery. Assert the artwork badge text using literal Russian strings: `18 бр`, `42 пр`, `3 мин`, and `30 мин`. These fail if the formatter omits the unit or uses full prose.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx
```

Expected: the new compact-unit assertions fail against numeric-only stick, skates, and recovery badges.

- [ ] **Step 3: Implement compact formatting**

Extend `formatInventoryBadgeAmount` so `shot` appends `бр`, `distance` appends `пр`, `energy_ms` appends `мин` or `сек` as today, and recovery receives an explicit minute rendering from `formatRecoveryMinutesTotal` through a compact helper. Use the shared formatter in every `EquipmentPanel` artwork badge.

- [ ] **Step 4: Verify GREEN**

Run the focused profile test and confirm all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/inventoryResourceLabels.ts packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx
git commit -m "fix(profile): label inventory resource badges"
```

### Task 2: Experience-rating database index and server route

**Files:**
- Create: `packages/server/db/migrations/128_experience_rating_index.sql`
- Create: `packages/server/src/profile/experienceRating.ts`
- Modify: `packages/server/src/routes/me.ts`
- Test: `packages/server/test/routes/experienceRating.test.ts`
- Test: `packages/server/test/db/migrations.integration.test.ts`

**Interfaces:**
- Consumes: authenticated `req.user.id`, `users(id, display_name, avatar_url, experience, lifetime_goals_total, lifetime_shots_total)`.
- Produces: `GET /profile/experience-rating?limit=<1..50>&cursor=<opaque>` matching `ExperienceRatingResponse` in the spec.
- Produces: `listExperienceRating(pg, viewerUserId, { limit, cursor })` as the query boundary.

- [ ] **Step 1: Write failing route tests**

Create users with literal UUIDs and experience values covering ties. Authenticate one user and assert:

```ts
expect(body.rows.map(({ place, userId, experience }) => ({ place, userId, experience }))).toEqual([
  { place: 1, userId: '00000000-0000-4000-8000-000000000001', experience: 900 },
  { place: 2, userId: '00000000-0000-4000-8000-000000000002', experience: 700 },
]);
expect(body.currentUser).toMatchObject({ place: 4, experience: 100 });
```

Add separate tests for a second cursor page without duplicates, `limit=51`, malformed cursor, and null avatar. The production change each test catches is respectively wrong sorting/ranking, offset-style duplication, missing validation, unsafe cursor parsing, and omitted fallback data.

- [ ] **Step 2: Verify RED**

Run with the repository test Postgres and Redis variables:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/routes/experienceRating.test.ts
```

Expected: route tests fail with `404` because the endpoint does not exist.

- [ ] **Step 3: Add the additive index migration**

Create:

```sql
create index if not exists users_experience_rating_idx
  on users (experience desc, lifetime_goals_total desc, id asc);
```

Extend the migration integration expectation so a missing or incorrectly ordered index fails.

- [ ] **Step 4: Implement cursor and rating query**

In `experienceRating.ts`, validate and encode an opaque base64url JSON cursor shaped as:

```ts
type ExperienceRatingCursor = {
  experience: number;
  goals: number;
  accuracy: string;
  userId: string;
  place: number;
};
```

Fetch `limit + 1` rows with:

```sql
where ($cursor_experience::int is null)
   or (u.experience, u.id) < ($cursor_experience::int, $cursor_user_id::uuid)
order by u.experience desc, u.id asc
limit $limit_plus_one
```

Use explicit comparisons for experience descending, goals descending, exact calculated accuracy descending, and ID ascending. Derive each returned place from `cursor.place + rowIndex + 1`. Query the viewer and calculate rank as one plus users ahead under the same complete tie-breaker. Return `nextCursor` only when the extra row exists.

- [ ] **Step 5: Register and validate the route**

Add the authenticated route to `meRoutes`. Parse `limit` through `z.coerce.number().int().min(1).max(50).default(30)` and map cursor parse failures to `AppError('bad_request', 'invalid experience rating cursor', 400)`.

- [ ] **Step 6: Verify GREEN**

Run focused route and migration tests, then confirm unauthorized access returns `401` through the real authentication pre-handler.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations/128_experience_rating_index.sql packages/server/src/profile/experienceRating.ts packages/server/src/routes/me.ts packages/server/test/routes/experienceRating.test.ts packages/server/test/db/migrations.integration.test.ts
git commit -m "feat(profile): add paginated experience rating"
```

### Task 3: Web API and experience leaderboard modal

**Files:**
- Create: `packages/web/src/api/experienceRating.ts`
- Create: `packages/web/src/profile/ExperienceRatingModal.tsx`
- Create: `packages/web/src/profile/ExperienceRatingModal.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `GET /profile/experience-rating` response from Task 2.
- Produces: `fetchExperienceRatingPage({ pageParam }): Promise<ExperienceRatingResponse>`.
- Produces: `ExperienceRatingModal({ open, onClose, currentUserId }): JSX.Element`.

- [ ] **Step 1: Write failing modal tests**

Using real `QueryClientProvider` and `AccessibleModal`, stub only HTTP responses and `IntersectionObserver`. Assert literal rendered rows, sticky table headers, blue current-user class, first-page loading/error/retry, and a second fetch using the returned cursor when the sentinel intersects.

Add a broken-image test that fires `error` on the avatar and asserts the initial fallback. Add visibility tests that drive the row observer: pinned copy exists while the normal current row is absent/outside the viewport and disappears when that row intersects.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/profile/ExperienceRatingModal.test.tsx
```

Expected: import failure because the new component does not exist.

- [ ] **Step 3: Implement the typed API client**

Define the exact response types from the spec. Call `/profile/experience-rating?limit=30` for the first page and append an encoded query parameter for later opaque cursors. Do not decode cursors in the browser.

- [ ] **Step 4: Implement the modal and pagination**

Use `useInfiniteQuery` with `initialPageParam: null`, `getNextPageParam: lastPage.nextCursor ?? undefined`, and a single bottom sentinel observer rooted at the internal scroll viewport. Flatten pages and deduplicate by `userId` defensively.

Render semantic table rows, an `AvatarWithFallback` local component, and a separate pinned row below the scroll viewport. Observe the normal current-user row with the scroll viewport as root; pinned visibility is `true` until the row is confirmed intersecting.

- [ ] **Step 5: Style the fixed-height mobile modal**

Add focused classes for a modal card capped to the viewport, a `clamp()`-based scroll region fitting roughly 10 to 12 compact rows, sticky table header, stable three-column widths, ellipsis names, duel-rating-family current-user blue, loading/retry states, and a pinned footer that occupies its own layout row.

- [ ] **Step 6: Verify GREEN**

Run the modal tests and `git diff --check`.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/api/experienceRating.ts packages/web/src/profile/ExperienceRatingModal.tsx packages/web/src/profile/ExperienceRatingModal.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(profile): add experience rating modal"
```

### Task 4: Connect the profile experience balance

**Files:**
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `ExperienceRatingModal` from Task 3 and authenticated profile ID.
- Produces: keyboard-accessible experience balance trigger with `aria-label="Открыть рейтинг по опыту"`.

- [ ] **Step 1: Write failing integration tests**

Assert the experience balance is a button while coin and star balances are not, clicking it opens `Рейтинг по опыту`, closing restores the profile, and the first rating request occurs only after opening.

- [ ] **Step 2: Verify RED**

Run the focused `ProfileScreen.test.tsx`; expect failure because the balance is not interactive.

- [ ] **Step 3: Implement the connection**

Allow `ProfileBalance` to receive an optional `onClick` and accessible label, rendering a button only for interactive balances. Add local `experienceRatingOpen` state, connect the experience balance, and conditionally mount the modal with `currentUserId={profile.id}`.

- [ ] **Step 4: Verify GREEN**

Run both profile and modal test files and confirm all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx
git commit -m "feat(profile): open rating from experience balance"
```

### Task 5: Full verification and rendered QA

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes: all deliverables above.
- Produces: test, build, lint, and rendered-browser evidence without deployment.

- [ ] **Step 1: Run focused regression tests**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/routes/experienceRating.test.ts test/db/migrations.integration.test.ts
pnpm --filter @hockey/web exec vitest run src/screens/ProfileScreen.test.tsx src/profile/ExperienceRatingModal.test.tsx
```

- [ ] **Step 2: Run static and build checks**

```bash
pnpm typecheck
pnpm lint
pnpm build
git diff --check origin/dev...HEAD
```

- [ ] **Step 3: Run broader affected-package tests**

```bash
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
```

- [ ] **Step 4: Render in the internal browser**

Start the local server/web stack, open the profile at a mobile viewport, and verify compact badge units, modal height, 10–12 visible rows, sticky header, infinite loading, current-user highlighting/pinning, close behavior, and avatar fallback. Capture screenshots for comparison.

- [ ] **Step 5: Review the completed diff**

Inspect `git diff origin/dev...HEAD`, database migration safety, API query ordering, error handling, and tests. Fix only evidenced issues and repeat the affected checks.

- [ ] **Step 6: Final commit if QA required changes**

```bash
git add packages/server/db/migrations/128_experience_rating_index.sql packages/server/src/profile/experienceRating.ts packages/server/src/routes/me.ts packages/server/test/routes/experienceRating.test.ts packages/server/test/db/migrations.integration.test.ts packages/web/src/api/experienceRating.ts packages/web/src/profile/ExperienceRatingModal.tsx packages/web/src/profile/ExperienceRatingModal.test.tsx packages/web/src/screens/inventoryResourceLabels.ts packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "fix(profile): address experience rating QA"
```
