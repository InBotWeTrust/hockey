# Beginner Amateur Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let beginners browse the Amateur area, block Amateur mutations with an explanatory remaining-goals toast, allow the first two sequential Bonus Games per skill, and restore empty inventory artwork.

**Architecture:** Centralize Amateur eligibility in a server profile-access module and reuse it from duel, tournament, and Bonus Game mutation routes. Expose the same access snapshot to the web, where a shared guard/toast provides immediate feedback while server checks remain authoritative. Derive the beginner Bonus Game allowance from stable catalogue position without adding persistence.

**Tech Stack:** TypeScript, Fastify 4, PostgreSQL, React 18, TanStack Query, Zustand, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-beginner-amateur-preview-design.md`

## Global Constraints

- Beginner preview is read-only except for the first two active Bonus Games in each skill category.
- Bonus Game position is ordered by `sort_order`, then id; the limit is exactly two per category.
- Existing paid access, sequence, replay, attempt limits, inventory, and one-time reward rules stay unchanged.
- Amateur unlock progress uses the existing qualifying daily-goal counter and configured `amateur.unlock_goals_required`.
- Client checks improve feedback but never replace server authorization.
- Expected access failures expose only `amateur_level_required` plus safe numeric details.
- No destructive migration or backfill is permitted.
- Empty inventory slots use existing versioned base artwork assets.

---

### Task 1: Centralize Amateur access resolution

**Files:**
- Create: `packages/server/src/profile/amateurAccess.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Test: `packages/server/test/profile/amateurAccess.test.ts`
- Test: `packages/server/test/duel/amateur.test.ts`

**Interfaces:**
- Produces: `AmateurAccessSnapshot { competitionLevel, unlockGoalsRequired, qualifyingGoals, goalsRemaining, hasFullAccess }`.
- Produces: `resolveAmateurAccess(db, userId): Promise<AmateurAccessSnapshot>`.
- Produces: `assertFullAmateurAccess(db, userId): Promise<AmateurAccessSnapshot>` throwing `AppError('amateur_level_required', ..., 403, details)`.
- Consumes: `getGameSettings`, `resolveCompetitionLevel`, and `users.level/lifetime_goals_total`.

- [ ] **Step 1: Write failing unit tests for the access snapshot**

Cover a beginner below threshold, an exact-threshold Amateur, a level-2 Amateur, a professional, and a missing user. Assert clamped `goalsRemaining` and the exact public error details:

```ts
await expect(assertFullAmateurAccess(db, beginnerId)).rejects.toMatchObject({
  code: 'amateur_level_required',
  statusCode: 403,
  details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
});
```

- [ ] **Step 2: Run the access test and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/profile/amateurAccess.test.ts`

Expected: FAIL because `profile/amateurAccess.ts` does not exist.

- [ ] **Step 3: Implement the shared resolver and assertion**

Use one user query and `getGameSettings(db)`. Return the resolved level and numeric progress. Throw `not_found` for a missing user and the structured 403 only when `hasFullAccess` is false.

- [ ] **Step 4: Replace the route-local duel assertion**

Remove `assertAmateurEligible` from `duel/amateur/routes.ts`. Import `assertFullAmateurAccess` and replace every player-initiated eligibility check. Preserve checks for both participants when accepting or matchmaking.

- [ ] **Step 5: Run access and duel tests**

Run sequentially:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/profile/amateurAccess.test.ts
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
```

Expected: PASS; beginner duel mutations return `amateur_level_required` without inserts or balance changes.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/profile/amateurAccess.ts packages/server/src/duel/amateur/routes.ts packages/server/test/profile/amateurAccess.test.ts packages/server/test/duel/amateur.test.ts
git commit -m "feat: centralize amateur access checks"
```

---

### Task 2: Enforce read-only tournament preview

**Files:**
- Modify: `packages/server/src/tournament/routes.ts`
- Test: `packages/server/test/tournament/routes-validation.test.ts`
- Test: `packages/server/test/tournament/registration.test.ts`
- Test: `packages/server/test/tournament/classicGame.integration.test.ts`

**Interfaces:**
- Consumes: `assertFullAmateurAccess(db, userId)` from Task 1.
- Produces: read-only tournament GET routes usable by beginners while player mutation routes reject them.

- [ ] **Step 1: Add failing route-contract tests**

Create a beginner below threshold and assert catalogue, detail, standings, bracket, schedule, and rules GET requests remain successful. Assert these player mutations return the structured 403 and make no state change:

- application create/withdraw;
- invitation acceptance through the application route;
- fixture-segment open;
- live-time proposal/respond;
- Classic period start and shot;

Do not block UI-only acknowledgements such as reading a congratulation or dismissing a readiness hint; they do not create gameplay, economy, or participation state.

Do not guard admin routes or the read-only congratulation display contract.

- [ ] **Step 2: Run tournament tests and verify RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/routes-validation.test.ts
pnpm --filter @hockey/server exec vitest run test/tournament/registration.test.ts
pnpm --filter @hockey/server exec vitest run test/tournament/classicGame.integration.test.ts
```

Expected: mutation assertions fail because routes still permit beginners or return legacy errors.

- [ ] **Step 3: Add the shared assertion to player mutation handlers**

Call `assertFullAmateurAccess(app.pg, req.user.id)` before the first mutation or realtime publication. Keep existing tournament state and participant checks after access authorization. Leave GET handlers untouched.

- [ ] **Step 4: Run the same tournament tests**

Expected: PASS with unchanged Amateur/professional cases.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/tournament/routes.ts packages/server/test/tournament/routes-validation.test.ts packages/server/test/tournament/registration.test.ts packages/server/test/tournament/classicGame.integration.test.ts
git commit -m "feat: make amateur tournaments read only for beginners"
```

---

### Task 3: Allow two sequential Bonus Games per category

**Files:**
- Modify: `packages/server/src/bonusGames/catalog.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Modify: `packages/server/src/bonusGames/economy.ts`
- Modify: `packages/server/src/bonusGames/routes.ts`
- Modify: `packages/server/src/bonusGames/types.ts`
- Test: `packages/server/test/bonusGames/catalog.test.ts`
- Test: `packages/server/test/bonusGames/routes.test.ts`
- Test: `packages/server/test/bonusGames/attempts.test.ts`
- Test: `packages/server/test/bonusGames/serviceDto.test.ts`

**Interfaces:**
- Produces: `BEGINNER_BONUS_GAME_LIMIT_PER_SKILL = 2`.
- Produces: catalogue position metadata internal to server mapping, not a new database column.
- Produces: `assertBonusGameAccessibleToUser(db, userId, gameId)` used by unlock and attempt creation.
- Consumes: Task 1 access snapshot.

- [ ] **Step 1: Write failing catalogue tests**

Seed at least three active games for both `speed` and `accuracy` with non-contiguous sort orders. For a beginner assert:

- game 1 is `available` unless normal purchase rules apply;
- game 2 is `sequence_locked` until game 1 is completed;
- paid game 2 becomes `purchase_required` after completion of game 1;
- completed games 1 and 2 remain replayable;
- game 3+ is `level_locked`;
- Amateur and professional catalogues retain existing states.

- [ ] **Step 2: Run catalogue tests and verify RED**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/catalog.test.ts test/bonusGames/serviceDto.test.ts`

Expected: the beginner's first two cards are currently all `level_locked`.

- [ ] **Step 3: Implement category-position state derivation**

Add `row_number() over (partition by skill_code order by sort_order, id)` to the catalogue query. Change `deriveCardState` so positions 1–2 bypass only the level lock and then follow the existing active-attempt, completion, predecessor, and purchase rules. Position 3+ remains level-locked for beginners.

- [ ] **Step 4: Write failing mutation tests**

Assert a beginner can purchase/start/replay games 1–2 according to ordinary rules, but unlock/start of game 3 returns `amateur_level_required` and creates no unlock, attempt, or economy event. Verify an existing eligible active attempt can continue through preview acknowledgement, period start, shots, and abandon.

- [ ] **Step 5: Add authoritative Bonus Game checks**

Validate category position before purchase and attempt creation. Attempt-owned routes may proceed only when the existing attempt belongs to one of the two eligible games; this preserves an in-progress eligible attempt while blocking crafted ids. Reuse the safe error details from Task 1.

- [ ] **Step 6: Run Bonus Game tests**

Run sequentially:

```bash
pnpm --filter @hockey/server exec vitest run test/bonusGames/catalog.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/routes.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/serviceDto.test.ts
```

Expected: PASS; existing first-clear and attempt-limit tests stay green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/bonusGames packages/server/test/bonusGames
git commit -m "feat: preview two bonus games for beginners"
```

---

### Task 4: Add shared web access state and toast

**Files:**
- Create: `packages/web/src/amateur/amateurAccess.ts`
- Create: `packages/web/src/amateur/AmateurAccessToast.tsx`
- Create: `packages/web/src/amateur/amateurAccessStore.ts`
- Modify: `packages/web/src/api/apiFetch.ts`
- Modify: `packages/web/src/app/App.tsx`
- Test: `packages/web/src/amateur/amateurAccess.test.ts`
- Test: `packages/web/src/amateur/AmateurAccessToast.test.tsx`
- Test: `packages/web/src/api/apiFetch.test.ts`

**Interfaces:**
- Produces: `isAmateurLevelRequired(error): error is ApiError`.
- Produces: `showAmateurAccessToast({ goalsRemaining, unlockGoalsRequired })` and a single Zustand toast state.
- Produces: `guardAmateurMutation(access, action): void`, invoking `action` only for full access.
- Consumes: `competitionLevel` and daily/profile progress already returned by current APIs.

- [ ] **Step 1: Write failing helper and toast tests**

Assert the helper recognizes only `ApiError.code === 'amateur_level_required'`, sanitizes numeric details, produces the exact Russian copy, replaces duplicate toasts, uses `aria-live="polite"`, and dismisses after the chosen existing toast duration.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/amateur/amateurAccess.test.ts src/amateur/AmateurAccessToast.test.tsx src/api/apiFetch.test.ts`

- [ ] **Step 3: Implement the access helper, store, and mounted toast**

Use one fixed title `Нужен статус «Любитель»` and body `До открытия осталось забить N шайб в ежедневной игре.` Never display the raw server message or code. Mount one toast beside existing global overlays in `App.tsx`.

- [ ] **Step 4: Run helper and app tests**

Run: `pnpm --filter @hockey/web exec vitest run src/amateur src/api/apiFetch.test.ts src/app/App.test.tsx`

Expected: PASS and exactly one toast instance.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/amateur packages/web/src/api/apiFetch.ts packages/web/src/api/apiFetch.test.ts packages/web/src/app/App.tsx packages/web/src/app/App.test.tsx
git commit -m "feat: add amateur access toast"
```

---

### Task 5: Turn the Amateur section into a browsable preview

**Files:**
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/tournament/TournamentCatalog.tsx`
- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/api/tournament.ts`
- Test: `packages/web/src/screens/SectionsScreen.test.tsx`
- Test: `packages/web/src/screens/DailyScreen.test.tsx`
- Test: `packages/web/src/tournament/TournamentCatalog.test.tsx`

**Interfaces:**
- Consumes: Task 4 guard/toast and the server `amateur_level_required` contract.
- Produces: unrestricted read navigation with guarded player mutation callbacks.

- [ ] **Step 1: Write failing Sections screen tests**

For a beginner assert the Amateur card uses the normal color tone, displays `Осталось N шайб до статуса «Любитель»`, and navigates to `/?view=amateur&from=sections`. Keep existing Amateur/professional copy unchanged.

- [ ] **Step 2: Run Sections tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx`

- [ ] **Step 3: Implement the always-open card**

Remove the locked-info modal path from `openAmateurs`; retain the progress calculation only for supporting copy. Use the full-color tone and no disabled visual treatment for beginners.

- [ ] **Step 4: Write failing duel and tournament preview tests**

Assert beginner navigation opens lists, filters, details, profiles, standings, schedule, bracket, and rules. Click each mutation family and assert no API call is made when local access is known; instead the shared toast receives current remaining goals. Mock a stale client where the API returns the structured 403 and assert the same toast appears.

- [ ] **Step 5: Guard mutation callbacks without guarding navigation**

Apply the guard at duel creation, matchmaking, accept/decline/cancel/ready/start controls and tournament apply/withdraw/invite response/fixture action controls. Keep buttons tappable. Route expected API errors to the shared toast; preserve generic retry UI for unrelated errors.

- [ ] **Step 6: Run preview tests**

Run sequentially:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx
pnpm --filter @hockey/web exec vitest run src/screens/DailyScreen.test.tsx
pnpm --filter @hockey/web exec vitest run src/tournament/TournamentCatalog.test.tsx
```

Expected: PASS for beginner preview and existing Amateur flows.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx packages/web/src/tournament/TournamentCatalog.tsx packages/web/src/tournament/TournamentCatalog.test.tsx packages/web/src/api/amateurDuel.ts packages/web/src/api/tournament.ts
git commit -m "feat: expose amateur preview to beginners"
```

---

### Task 6: Present and enforce beginner Bonus Game states

**Files:**
- Modify: `packages/web/src/api/bonusGames.ts`
- Modify: `packages/web/src/screens/BonusGamesScreen.tsx`
- Modify: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Test: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Test: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`

**Interfaces:**
- Consumes: server card states from Task 3 and toast mapping from Task 4.
- Produces: playable positions 1–2 and explanatory interaction for position 3+.

- [ ] **Step 1: Write failing catalogue UI tests**

For each skill category assert the first game action is available, the second follows sequence/payment, completed eligible games show `Повторить`, and the third visible locked card emits the Amateur-status toast. Assert no purchase/start request is sent for the third game.

- [ ] **Step 2: Run Bonus Games web tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx`

- [ ] **Step 3: Implement expected state and error handling**

Keep existing card-state rendering. Change `level_locked` interaction from a dead button to a tappable explanation. Route `amateur_level_required` from unlock, attempt creation, and play mutations to the shared toast while leaving attempt-limit, purchase, and gameplay errors unchanged.

- [ ] **Step 4: Run Bonus Games web tests**

Expected: PASS for both beginner and full-access fixtures.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/bonusGames.ts packages/web/src/screens/BonusGamesScreen.tsx packages/web/src/screens/BonusGamesScreen.test.tsx packages/web/src/screens/BonusGamePlayScreen.tsx packages/web/src/screens/BonusGamePlayScreen.test.tsx
git commit -m "feat: show beginner bonus game preview"
```

---

### Task 7: Restore artwork for empty profile inventory slots

**Files:**
- Modify: `packages/web/src/screens/ProfileDestinationScreens.tsx`
- Modify: `packages/web/src/screens/inventoryArtwork.ts`
- Test: `packages/web/src/screens/ProfileDestinationScreens.test.tsx`
- Test: `packages/web/src/game/achievementAssets.test.ts`

**Interfaces:**
- Consumes: `placeholderArtworkForKind(kind)`.
- Produces: an equipment image component that swaps a failed item image to the correct base artwork.

- [ ] **Step 1: Write failing empty-slot tests**

Return null equipped ids and assert the destination renders images containing `/inventory/stick-base.webp`, `/inventory/skates-base.webp`, and `/inventory/nutrition-none.webp`. Add an image-error test proving a broken equipped image switches to its kind fallback.

- [ ] **Step 2: Run profile destination tests and verify RED**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileDestinationScreens.test.tsx`

Expected: empty slots contain no `img` elements.

- [ ] **Step 3: Reuse centralized artwork fallback**

Render `item?.imageUrl ?? placeholderArtworkForKind(equipmentKind)` on `/profile/equipment`. Add a small reusable image wrapper only if needed for `onError`; do not duplicate asset constants.

- [ ] **Step 4: Run destination and asset tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/ProfileDestinationScreens.test.tsx src/game/achievementAssets.test.ts`

Expected: PASS and all referenced WebP assets exist.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/ProfileDestinationScreens.tsx packages/web/src/screens/ProfileDestinationScreens.test.tsx packages/web/src/screens/inventoryArtwork.ts packages/web/src/game/achievementAssets.test.ts
git commit -m "fix: show base artwork for empty inventory slots"
```

---

### Task 8: Integrated verification and rendered QA

**Files:**
- Modify only if a verified regression requires a scoped fix.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: release evidence for the exact integrated SHA.

- [ ] **Step 1: Run server suites sequentially**

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/profile/amateurAccess.test.ts
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
pnpm --filter @hockey/server exec vitest run test/tournament/routes-validation.test.ts
pnpm --filter @hockey/server exec vitest run test/tournament/registration.test.ts
pnpm --filter @hockey/server exec vitest run test/tournament/classicGame.integration.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/catalog.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/routes.test.ts
pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts
```

Expected: all PASS without shared-database concurrency failures.

- [ ] **Step 2: Run web and repository checks**

```bash
pnpm --filter @hockey/web test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Expected: exit 0 for every command.

- [ ] **Step 3: Perform local rendered QA**

Verify beginner, Amateur, and professional accounts on normal and compact mobile widths. For the beginner, verify full-color entry, free navigation, each restricted action family, stale-server fallback, first/second/third Bonus Game states in both categories, repeats, payment, and the three inventory fallback images. Verify no unexpected console errors.

- [ ] **Step 4: Review the final diff**

Confirm no unrelated arena drafts, credentials, generated build output, database dumps, or production data are staged. Confirm no migration was added.

Do not create an empty commit. Any verified fix belongs in the commit for its owning task. Do not push or deploy until the user explicitly requests it after local review.
