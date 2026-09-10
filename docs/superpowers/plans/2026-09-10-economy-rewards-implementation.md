# Economy and Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align achievements and weekly challenges, add editable tournament and duel reward defaults, and implement idempotent monthly duel-rating payouts with a Sections-tab congratulation.

**Architecture:** Add forward-only migrations and focused reward services for each economy loop. Published tournaments, created duels, completed challenges, and closed rating seasons keep immutable reward snapshots; admin defaults only affect new entities. The Sections screen reuses its existing oldest-first mandatory-modal queue for monthly rating congratulations.

**Tech Stack:** PostgreSQL 16 raw SQL migrations, Fastify 4, TypeScript NodeNext, React 18, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-economy-rewards-design.md`

## Global Constraints

- Monetary conversion is `1 RUB = 50 coins`; reward valuation is `1 star = 50 coins`.
- Tournament entry is coin-only in this release.
- Weekly challenge defaults are 0 coins, 30 stars, 30 experience, and 5 tokens.
- Duel reward amounts default to zero; equal experience tolerance defaults to 10%.
- Monthly seasons use `Europe/Moscow`, require 30 ranked duels per player, and settle once.
- All balance mutation and idempotency records must commit in one database transaction.
- Applied migrations are forward-only; never rewrite an existing migration.
- Do not touch `@hockey/game-core`; economy changes do not alter deterministic shot behavior.
- Preserve unrelated untracked files in the root checkout.
- GLM review is prohibited for this repository.

---

## File Structure

### New server files

- `packages/server/src/tournament/economyPreset.ts` — single source of tournament default calculations.
- `packages/server/src/duel/amateur/rewardRules.ts` — duel reward types, parsing, experience classification, and reward selection.
- `packages/server/src/duel/amateur/monthlyRewards.ts` — monthly season settlement and pending congratulation operations.
- `packages/server/test/tournament/economyPreset.test.ts` — tournament percentage and rounding tests.
- `packages/server/test/duel/amateur/rewardRules.test.ts` — ±10% boundary tests.
- `packages/server/test/duel/amateur/monthlyRewards.test.ts` — settlement, eligibility, payout, and idempotency tests.

### Existing server files

- `packages/server/src/achievements/catalog.ts` — activate rating achievements and configure `monthly-top-3`.
- `packages/server/src/achievements/engine.ts` — recognize achievements from an immutable monthly settlement event.
- `packages/server/src/weeklyChallenge/admin.ts` — accept and default token rewards.
- `packages/server/src/weeklyChallenge/service.ts` — claim token rewards atomically.
- `packages/server/src/weeklyChallenge/types.ts` — expose token rewards.
- `packages/server/src/tournament/routes.ts` — expose the recommended preset to admins.
- `packages/server/src/tournament/service.ts` — keep preset-derived reward snapshots and existing edit locks.
- `packages/server/src/duel/amateur/routes.ts` — snapshot and settle duel reward rules; expose monthly congratulation routes.
- `packages/server/src/admin/routes.ts` — validate and persist editable duel reward matrices.
- `packages/server/src/routes/me.ts` — do not extend the profile payload for monthly rewards; use a focused endpoint.

### Web files

- `packages/web/src/admin/WeeklyChallengesAdmin.tsx` — default and edit weekly token rewards.
- `packages/web/src/admin/api.ts` — weekly and duel reward DTOs.
- `packages/web/src/tournament/TournamentAdmin.tsx` — preset application, dirty-state behavior, and reset button.
- `packages/web/src/tournament/adminApi.ts` — fetch a tournament economy preset.
- `packages/web/src/screens/SectionsScreen.tsx` — append monthly congratulations to the modal queue.
- `packages/web/src/api/amateurDuel.ts` — monthly congratulation DTO and acknowledge call.
- `packages/web/src/components/duel/MonthlyRatingRewardModal.tsx` — accessible reward modal.
- Existing adjacent test files for all modified components.

### Migrations

- Use migrations `117` through `120` in the order defined below. Before execution, verify that `116_weekly_challenge_future_publication.sql` is still the latest migration; if the branch has advanced, renumber all four new files together without changing their order.

---

### Task 1: Synchronize Achievement Rewards

**Files:**
- Modify: `packages/server/src/achievements/catalog.ts`
- Modify: `packages/server/src/achievements/engine.ts`
- Create: `packages/server/db/migrations/117_economy_achievement_rewards.sql`
- Test: `packages/server/test/achievements/catalog.test.ts`
- Create: `packages/server/test/achievements/engine-rating.test.ts`

**Interfaces:**
- Produces: active `monthly-top-1` and `monthly-top-3` seeds with immutable one-time claim semantics.
- Consumes: the existing `(user_id, achievement_id)` uniqueness contract.

- [ ] **Step 1: Add failing catalog assertions**

Assert these exact entries while retaining assertions for the 45 existing active rewards:

```ts
expect(byId('monthly-top-1')).toMatchObject({
  availability: 'active', rewardCurrency: 7_500,
  rewardStars: 100, rewardExperience: 100, rewardTokens: 3,
});
expect(byId('monthly-top-3')).toMatchObject({
  availability: 'active', rewardCurrency: 3_750,
  rewardStars: 50, rewardExperience: 50, rewardTokens: 2,
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --filter @hockey/server exec vitest run test/achievements/catalog.test.ts`

Expected: FAIL because `monthly-top-3` is zero and both rating entries are future.

- [ ] **Step 3: Update the catalog and rating completion event**

Add the approved reward and change both rating entries to `availability: 'active'` with `futureTag: null`. Add a narrowly typed achievement-engine event:

```ts
type MonthlyRatingSettledContext = {
  type: 'monthly_duel_rating_settled';
  seasonKey: string;
  userId: string;
  place: number;
};
```

Complete `monthly-top-1` for `place === 1` and `monthly-top-3` for `place <= 3`; existing uniqueness keeps both achievements career-once.

- [ ] **Step 4: Add the forward-only data migration**

Use an explicit `VALUES` table and update only the IDs listed in §6 of the spec. Set `monthly-top-3` to `(3750, 50, 50, 2)` and activate both monthly IDs. Do not alter completed or claimed user-achievement rows.

- [ ] **Step 5: Run achievement tests**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/achievements/catalog.test.ts test/achievements/engine-rating.test.ts
```

Expected: PASS, including a test proving a second settlement cannot create a second user-achievement row.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements packages/server/test/achievements packages/server/db/migrations
git commit -m "feat(achievements): align economy rewards"
```

---

### Task 2: Add Weekly Challenge Token Defaults and Claims

**Files:**
- Create: `packages/server/db/migrations/118_weekly_challenge_token_rewards.sql`
- Modify: `packages/server/src/weeklyChallenge/admin.ts`
- Modify: `packages/server/src/weeklyChallenge/service.ts`
- Modify: `packages/server/src/weeklyChallenge/types.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/WeeklyChallengesAdmin.tsx`
- Test: `packages/server/test/weeklyChallenge/admin.test.ts`
- Test: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`
- Test: `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx`

**Interfaces:**
- Produces: `rewardTokens: number` in admin and player DTOs and atomic token claims.
- Consumes: `user_reward_token_account` and the existing weekly challenge claim transaction.

- [ ] **Step 1: Write failing default, edit, and claim tests**

Test a fresh form and API body:

```ts
expect(form).toMatchObject({
  rewardCoins: 0,
  rewardStars: 30,
  rewardExperience: 30,
  rewardTokens: 5,
});
```

Also assert that a successful claim increments the token account by 5 and a repeated claim returns `409` without changing any balance.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/weeklyChallenge/admin.test.ts test/weeklyChallenge/weeklyChallenge.test.ts
pnpm --filter @hockey/web test -- WeeklyChallengesAdmin.test.tsx
```

Expected: FAIL because weekly challenges have no token field and the form defaults to zero.

- [ ] **Step 3: Add schema and immutable claim snapshot**

Add `weekly_challenges.reward_tokens int not null default 5 check (reward_tokens >= 0)` and `weekly_challenge_reward_claims.tokens int not null default 0`. Backfill existing unfinished automatic challenges to 5 only when all three existing rewards are the old zero defaults; preserve manually configured rows.

- [ ] **Step 4: Extend server schemas and claim transaction**

Add `rewardTokens` to `nextChallengeInputSchema`, query row types, cloning SQL, DTOs, and the claim insert. Within the existing transaction:

```sql
insert into user_reward_token_account (user_id) values ($1)
on conflict (user_id) do nothing;

update user_reward_token_account
set balance = balance + $2, updated_at = now()
where user_id = $1;
```

Record the exact claimed token amount in `weekly_challenge_reward_claims.tokens`.

- [ ] **Step 5: Update the admin form**

Set fresh-form defaults to `0/30/30/5`, add the token number field, and preserve arbitrary admin edits. The server schedule remains the source of the exact one-week Moscow window.

- [ ] **Step 6: Run focused tests**

Run the commands from Step 2. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge packages/web/src/admin
git commit -m "feat(challenges): add recommended weekly rewards"
```

---

### Task 3: Build the Tournament Economy Preset Service

**Files:**
- Create: `packages/server/src/tournament/economyPreset.ts`
- Create: `packages/server/test/tournament/economyPreset.test.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/web/src/tournament/adminApi.ts`

**Interfaces:**
- Produces: `buildTournamentEconomyPreset(participantLimit: number): TournamentEconomyPreset`.
- Produces admin endpoint: `GET /admin/tournaments/economy-preset?participantLimit=N`.

- [ ] **Step 1: Write failing pure-function tests**

Define the response contract:

```ts
interface TournamentEconomyPreset {
  participantLimit: number;
  entryFeeCoins: number;
  regularRewards: Array<{ place: number; coins: number; stars: number; experience: number }>;
  playoffRewards: Array<{ place: number; coins: number; stars: number; experience: number }>;
  payoutValueCoins: number;
  sinkValueCoins: number;
}
```

Assert fee boundaries at 7/8, 15/16, 31/32, and 63/64. For 16 participants assert the exact §10.3 table and `payoutValueCoins === 136_000`.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/economyPreset.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic calculation**

Implement fee brackets and percentages as constants. Split each place value 50/50 between coins and star-equivalent value, set experience equal to stars, and make rounding conservative so total value never exceeds 85%.

- [ ] **Step 4: Add authenticated admin endpoint tests and route**

Validate `participantLimit` as an integer from 2 through the existing tournament maximum. Return the pure function result; reject unauthenticated/non-admin callers using existing tournament admin guards.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @hockey/server exec vitest run test/tournament/economyPreset.test.ts test/tournament/routes-validation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/tournament packages/server/test/tournament packages/web/src/tournament/adminApi.ts
git commit -m "feat(tournaments): expose economy presets"
```

---

### Task 4: Integrate Tournament Presets into the Wizard

**Files:**
- Modify: `packages/web/src/tournament/TournamentAdmin.tsx`
- Modify: `packages/web/src/tournament/TournamentAdmin.test.tsx`

**Interfaces:**
- Consumes: `fetchTournamentEconomyPreset(participantLimit)` from Task 3.
- Produces: automatic pristine-draft updates and explicit `Применить рекомендуемые значения` action.

- [ ] **Step 1: Add failing wizard behavior tests**

Cover four cases: fresh 16-player draft receives the exact preset; changing 16 to 32 refreshes a pristine economy; editing any fee/reward field prevents automatic overwrite; pressing the reset button replaces all economic fields.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @hockey/web test -- TournamentAdmin.test.tsx`

Expected: FAIL because the wizard currently starts at zero and has no preset dirty state.

- [ ] **Step 3: Implement explicit economy state**

Track:

```ts
type EconomyPresetState = 'loading' | 'pristine' | 'custom' | 'error';
```

Only preset-driven writes keep `pristine`; direct changes to `entryFeeCoins`, `regularRewards`, or `playoffRewards` set `custom`. Ignore stale responses by associating each request with its participant limit.

- [ ] **Step 4: Preserve existing edit locks and snapshots**

Do not change server rules that prohibit fee edits after participants exist or reward edits after payment. Verify submitted `rules.stageRewards` contains the visible values.

- [ ] **Step 5: Run web tests**

Run Task 4 tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/tournament/TournamentAdmin.tsx packages/web/src/tournament/TournamentAdmin.test.tsx
git commit -m "feat(tournaments): autofill recommended economy"
```

---

### Task 5: Add Editable Duel Reward Rules

**Files:**
- Create: `packages/server/db/migrations/119_duel_reward_matrix.sql`
- Create: `packages/server/src/duel/amateur/rewardRules.ts`
- Create: `packages/server/test/duel/amateur/rewardRules.test.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`

**Interfaces:**
- Produces: `DuelRewardRules`, `classifyExperienceOpponent`, and `selectDuelReward`.
- Consumes: participant `experience_snapshot` captured at acceptance.

- [ ] **Step 1: Define failing type and boundary tests**

Use this persisted shape:

```ts
type DuelRewardAmount = { coins: number; stars: number; tokens: number };
type DuelRewardRules = {
  equalExperienceTolerancePercent: number;
  strongerWin: DuelRewardAmount;
  equalWin: DuelRewardAmount;
  weakerWin: DuelRewardAmount;
  draw: DuelRewardAmount;
  loss: DuelRewardAmount;
};
```

Assert 899/900/1100/1101 opponent experience around winner experience 1000, and the special zero-experience behavior from §8.2.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur/rewardRules.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add template and match snapshot columns**

Add validated JSONB `reward_rules` to the duel template and duel match with a zero-valued default and 10% tolerance. Backfill existing rows without changing existing legacy reward columns; keep reading legacy fields only for compatibility during the migration window.

- [ ] **Step 4: Extend admin validation and UI**

Validate every amount as a non-negative safe integer and tolerance from 0 through 100. Render five rows and three currency columns plus one tolerance field. A newly created template sends the zero matrix.

- [ ] **Step 5: Snapshot rules at match creation**

Copy the complete template `reward_rules` into the match. Confirm later template edits do not alter the created match response.

- [ ] **Step 6: Run server and web template tests**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts
pnpm --filter @hockey/web test -- AdminScreen.test.tsx
```

Expected: PASS for template creation, editing, DTO serialization, and snapshot preservation.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations packages/server/src/duel packages/server/src/admin packages/server/test/duel packages/web/src/admin
git commit -m "feat(duels): add editable reward matrix"
```

---

### Task 6: Settle Duel Reward Matrices Atomically

**Files:**
- Modify: `packages/server/src/duel/amateur/rewardRules.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Test: `packages/server/test/duel/amateur.test.ts`

**Interfaces:**
- Consumes: snapshotted `DuelRewardRules` from Task 5.
- Produces: one idempotent reward ledger entry per participant and match.

- [ ] **Step 1: Add failing settlement cases**

Use non-zero test-only matrices to prove stronger/equal/weaker winners select different values, while draw and loss apply to both participants correctly. Repeat settlement and assert no second balance change.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts`

Expected: FAIL because settlement only understands the legacy fields.

- [ ] **Step 3: Implement reward selection and ledgers**

Within the existing match settlement transaction, lock both user balance rows, select rewards from both participants' `experience_snapshot`, update coin/star/token balances, and append immutable metadata:

```ts
{
  match_id: match.id,
  reward_category: 'strongerWin',
  winner_experience: 1000,
  opponent_experience: 1200,
  tolerance_percent: 10,
  coins: 0,
  stars: 0,
  tokens: 0,
}
```

Do not update `users.experience` as if it were a star balance; stars use the project's existing `users.xp` compatibility path.

- [ ] **Step 4: Run settlement tests**

Expected: PASS for all five outcomes, boundaries, zero defaults, and repeated reconciliation.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/duel packages/server/test/duel
git commit -m "feat(duels): settle configured rewards"
```

---

### Task 7: Add Monthly Rating Settlement and Payouts

**Files:**
- Create: `packages/server/db/migrations/120_monthly_duel_rating_rewards.sql`
- Create: `packages/server/src/duel/amateur/monthlyRewards.ts`
- Create: `packages/server/test/duel/amateur/monthlyRewards.test.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`

**Interfaces:**
- Produces: `reconcileCompletedMonthlyRating(pool, now)` and pending/acknowledge operations.
- Produces endpoints: `GET /duel/amateur/rating/congratulations/pending` and `POST /duel/amateur/rating/congratulations/:id/read`.
- Consumes: `amateur_duel_rating_live` and Task 1 rating achievement event.

- [ ] **Step 1: Write failing schema and service integration tests**

Cover: Moscow month boundary; exclusion below 30 matches; ranking after exclusion; no payout below 10 eligible players; 20% rewarded-count formula; exact five reward bands; concurrent settlement; repeat settlement; achievement completion; pending oldest-first order; acknowledgement ownership.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur/monthlyRewards.test.ts`

Expected: FAIL because monthly settlement tables and service do not exist.

- [ ] **Step 3: Add snapshot, award, and congratulation tables**

Create one season row keyed by `season_key`, one placement row unique on `(season_key, user_id)`, and one economy event unique on `(season_key, user_id)`. Persist rank, eligibility counts, matches, reward amounts, and `viewed_at`. Add currency-ledger reasons for monthly rewards without weakening the existing check constraint.

- [ ] **Step 4: Implement one-time reconciliation**

Use a transaction-scoped advisory lock derived from the season key. Settle every unclosed season before the current Moscow month. Rank only users with `matches_played >= 30`; require at least 10 eligible users; calculate:

```ts
const rewardedCount = Math.min(50, Math.max(3, Math.floor(eligibleCount * 0.2)));
```

Apply the exact §9.3 values, emit the Task 1 achievement context, and commit balances plus snapshots atomically.

- [ ] **Step 5: Add pending and acknowledgement routes**

The pending route first reconciles completed months, then returns only positive-reward rows owned by the authenticated user, oldest first. Acknowledge with `viewed_at = coalesce(viewed_at, now())`; reject another user's ID with `404`.

- [ ] **Step 6: Run monthly and achievement tests**

Run Task 7 and Task 1 focused suites. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/db/migrations packages/server/src/duel packages/server/src/achievements packages/server/test
git commit -m "feat(rating): add monthly duel rewards"
```

---

### Task 8: Show Monthly Rewards on the Sections Tab

**Files:**
- Modify: `packages/web/src/api/amateurDuel.ts`
- Create: `packages/web/src/components/duel/MonthlyRatingRewardModal.tsx`
- Create: `packages/web/src/components/duel/MonthlyRatingRewardModal.test.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.test.tsx`

**Interfaces:**
- Consumes: Task 7 pending and acknowledge endpoints.
- Produces: mandatory oldest-first modal shown only on `/sections` context.

- [ ] **Step 1: Add failing modal rendering tests**

Assert exact titles for places 1, 2, and 17, Russian month formatting, hidden zero rewards, all three positive currency rows, blocked backdrop/Escape close, pending button state, and retained modal on acknowledgement error.

- [ ] **Step 2: Add failing Sections queue tests**

Assert the monthly modal is fetched/rendered only by `SectionsScreen`, not `BottomNav`; no reward returns no modal; acknowledgement advances oldest-first; and the existing tournament congratulation remains ahead of weekly failure. Define queue priority explicitly as tournament podium, monthly duel rating, weekly failure.

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
pnpm --filter @hockey/web test -- MonthlyRatingRewardModal.test.tsx SectionsScreen.test.tsx
```

Expected: FAIL because the API and component do not exist.

- [ ] **Step 4: Implement DTO, modal, and queue integration**

Use `AccessibleModal`, the shared `.modal-header` conventions, and reward colors. Filter the list before rendering:

```ts
const rewards = [coins, stars, tokens].filter((reward) => reward.value > 0);
```

Format the season by parsing `YYYY-MM` without browser-local timezone conversion.

- [ ] **Step 5: Run focused web tests**

Run Task 8 tests. Expected: PASS with no regression in existing tournament congratulations or weekly failures.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/amateurDuel.ts packages/web/src/components/duel packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
git commit -m "feat(rating): show monthly reward congratulations"
```

---

### Task 9: Cross-Loop Verification and Dev Release

**Files:**
- Modify only test fixtures or documentation required to make the approved behavior explicit.

**Interfaces:**
- Consumes: deliverables from Tasks 1–8.
- Produces: verified exact-SHA dev deployment and runtime evidence.

- [ ] **Step 1: Build the shared game package before server checks**

Run: `pnpm --filter @hockey/game-core build`

Expected: PASS. No game-core source diff should exist.

- [ ] **Step 2: Run static checks and focused suites**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
```

Expected: all suites PASS. Record any known unrelated baseline separately; do not call the feature complete with a new failure.

- [ ] **Step 3: Run migration rehearsal against a disposable test database**

Apply every new migration once, inspect columns/constraints, apply the runner again, and confirm no duplicate balance or reward rows. Never copy dev data over another environment.

- [ ] **Step 4: Review the final branch diff**

Confirm the diff implements every §13 acceptance criterion, contains no credentials, does not include unrelated root files, and leaves old reward snapshots intact.

- [ ] **Step 5: Push to `dev` and watch deployment**

Push only after all local checks pass. Watch the dev workflow through image build, migration, container recreation, and smoke test. Record workflow URL and exact deployed SHA.

- [ ] **Step 6: Verify dev runtime and database readback**

Verify `/api/health`, the actual migrated schema, achievement rows, fresh weekly defaults, tournament preset endpoint, zero duel matrix defaults, one controlled monthly settlement fixture if safe, and rendered Sections modal behavior. Do not use the admin UI as proof of DB state; query the dev DB directly when SSH is available.

- [ ] **Step 7: Report handoff**

Report expected/actual, PASS/FAIL/BLOCKED, test totals, workflow, deployed SHA, schema readback, rendered scenarios, and any blocked direct DB checks. Production remains untouched.

---

## Plan Self-Review

- Spec §§2–12 map to Tasks 1–8; all 15 acceptance criteria map to focused tests or Task 9 readback.
- Achievement claims, challenge claims, duel settlement, rating settlement, and tournament rewards retain independent idempotency boundaries.
- `rewardTokens`, `reward_rules`, `experience_snapshot`, `stageRewards`, `seasonKey`, and `rewardedCount` use consistent names across tasks.
- The plan does not enable non-zero per-duel rewards or star-based purchases.
- The plan preserves existing tournament and challenge history and avoids changes to game-core behavior.
