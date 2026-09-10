# Bonus Games and Home Arenas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ten server-authoritative bonus games with first-clear rewards and unlockable home arenas, then apply snapshotted venue rules to amateur duels.

**Architecture:** Add an additive PostgreSQL model for arena themes, bonus definitions, attempts, progression, and economic audit. Keep shot resolution in `@hockey/game-core`, build focused Fastify services around explicit timestamps and transactions, and expose typed React/TanStack/Zustand clients. Reuse the existing Pixi play view through a small extraction and custom-goalie configuration contract; keep bonus admin UI and player UI in separate files.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, PostgreSQL 16 raw SQL migrations, Fastify 4, Zod, React 18, TanStack Query, Zustand, PixiJS 8, Vitest, Testing Library, AI image generation, WebP assets.

**Spec:** `docs/superpowers/specs/2026-08-23-bonus-games-and-home-arenas-design.md`

## Global Constraints

- Run on Node 20+ and pnpm 9+ from the repository root.
- Build `@hockey/game-core` before any server tests: `pnpm --filter @hockey/game-core build`.
- Preserve deterministic behavior: no `Math.random()`, `Date.now()`, or timers in `@hockey/game-core`; time is an explicit service parameter.
- Reuse `resolveShot`, `deriveShotSeed`, and neutral `STICK_NEUTRAL`; bonus mode never reads or consumes inventory.
- Do not bump `GAME_CORE_VERSION` merely for the new mode. Bump it and update `packages/game-core/test/version.test.ts` only if a shared deterministic result changes.
- Server is authoritative for level access, sequence, purchase, attempt state, shot result, first-clear reward, and arena ownership.
- One active bonus attempt per user across all games; active attempts use immutable rule, reward, arena, and media snapshots.
- All balance mutations are atomic and idempotent; lock `users` before `user_currency_account` everywhere in this feature.
- Database changes are forward-only and additive. Existing active daily, training, and amateur duel records remain valid.
- UI copy is Russian; identifiers, code comments, and commit messages are English.
- Standard modals use `.modal-backdrop`, `.modal-card`, `.modal-title`, `.modal-copy`, `.modal-actions`, and `.modal-primary.btn--cta`.
- Text buttons contain no icons. Standalone icon actions use `.icon-btn`.
- Preserve unrelated dirty-worktree files. Stage only files named by the current task.
- Static runtime assets use these exact paths:
  - `/bonus-games/section-card.webp`
  - arena files use `/bonus-games/arenas/` plus one approved slug and `.webp`;
  - ready sprites use `/bonus-games/goalkeepers/` plus one approved slug and `-ready.webp`;
  - save sprites use `/bonus-games/goalkeepers/` plus one approved slug and `-save.webp`.
- Approved slugs are `beach`, `ski-resort`, `cyberpunk-yard`, `abandoned-waterpark`, `pirate-bay`, `north-pole`, `desert`, `volcanic-ice`, `castle`, and `space`.
- Do not push, deploy, or mutate production as part of implementation without a separate explicit user authorization.

## File and Interface Map

### Server files to create

- `packages/server/db/migrations/058_bonus_games_and_home_arenas.sql` — additive schema and safe defaults, without activating the ten catalog entries.
- `packages/server/db/migrations/059_seed_bonus_games.sql` — standard arena plus ten active definitions using committed asset paths.
- `packages/server/src/arenas/types.ts` — arena DTOs and venue-policy types.
- `packages/server/src/arenas/service.ts` — ownership, selection, effective-arena lookup, and duel venue resolution.
- `packages/server/src/arenas/routes.ts` — `/me/home-arenas` player routes.
- `packages/server/src/bonusGames/types.ts` — Zod schemas, database row types, rules snapshots, and response DTOs.
- `packages/server/src/bonusGames/catalog.ts` — active-chain and card-state calculation.
- `packages/server/src/bonusGames/reconcile.ts` — explicit-time lazy attempt state machine.
- `packages/server/src/bonusGames/economy.ts` — paid unlock and first-clear balance transactions.
- `packages/server/src/bonusGames/service.ts` — start/resume, period start, shot acceptance, and abandon orchestration.
- `packages/server/src/bonusGames/routes.ts` — authenticated player endpoints.
- `packages/server/src/bonusGames/admin.ts` — admin CRUD and WebP media upload routes.

### Server files to modify

- `packages/server/src/app.ts` — register arena and bonus player routes.
- `packages/server/src/duel/seed.ts` — add `deriveBonusAttemptSeed`.
- `packages/server/src/admin/routes.ts` — register focused bonus admin routes.
- `packages/server/src/duel/amateur/routes.ts` — template venue policy, venue resolution, snapshots, and DTO fields.
- `packages/server/test/db/migrations.test.ts` — assert schema and seed catalog.

### Web files to create

- `packages/web/src/api/bonusGames.ts` — bonus DTOs and player requests.
- `packages/web/src/api/arenas.ts` — home-arena DTOs and requests.
- `packages/web/src/stores/bonusGameStore.ts` — authoritative attempt state plus optimistic shot count and reconciliation guard.
- `packages/web/src/screens/BonusGamesScreen.tsx` — catalog and purchase flow.
- `packages/web/src/screens/BonusGamePlayScreen.tsx` — attempt lifecycle and Pixi play adapter.
- `packages/web/src/components/HomeArenaModal.tsx` — earned-arena selector.
- `packages/web/src/admin/BonusGamesAdmin.tsx` — focused bonus definition CRUD editor.
- `packages/web/src/game/PlayView.tsx` — extracted generic Pixi play surface.
- `packages/web/src/game/bonusGameAssets.ts` — stable asset-path constants.

### Web files to modify

- `packages/web/src/app/App.tsx` — lazy bonus routes.
- `packages/web/src/components/BottomNav.tsx` — correct sections-tab behavior on bonus routes.
- `packages/web/src/screens/SectionsScreen.tsx` — insert Bonus Games card.
- `packages/web/src/screens/DailyScreen.tsx` — import extracted `PlayView` and render duel arena snapshots.
- `packages/web/src/screens/ProfileScreen.tsx` — rink-photo hotspot and modal.
- `packages/web/src/admin/api.ts` — bonus DTOs/requests and duel venue-policy field.
- `packages/web/src/admin/AdminScreen.tsx` — Bonus Games tab and focused panel mount.
- `packages/web/src/api/amateurDuel.ts` — duel venue snapshot types.
- `packages/web/src/game/loop.ts` — accept a complete `GoalieConfig` provider.
- `packages/web/src/app/design-system.css` — bonus cards, arena selector, and photo preview.

### Core contracts

The server owns these internal shapes in `packages/server/src/bonusGames/types.ts`:

```ts
export const bonusGoaliePatterns = ['linear', 'sine', 'dash'] as const;
export type BonusGoaliePattern = (typeof bonusGoaliePatterns)[number];

export interface BonusPeriodRule {
  periodNumber: number;
  durationMs: number;
  shotsLimit: number;
  goalFrequency: number;
  goalieFrequency: number;
  shooterFrequency: number;
  puckSpeedPerMs: number;
  goaliePattern: BonusGoaliePattern;
  goalieAmplitude: number;
  goalAmplitude: number;
}

export interface BonusRulesSnapshot {
  gameId: string;
  slug: string;
  title: string;
  revision: number;
  targetGoals: number;
  totalPeriods: number;
  breakDurationMs: number;
  periods: BonusPeriodRule[];
  goalkeeperReadyUrl: string;
  goalkeeperSaveUrl: string;
  arena: ArenaSnapshot;
}

export interface BonusRewardSnapshot {
  coins: number;
  stars: number;
  experience: number;
}

export type BonusAttemptStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type BonusAttemptState = 'idle' | 'period_active' | 'break_active' | 'closed';
```

The arena module owns:

```ts
export type MatchmakingVenuePolicy =
  | 'neutral_default'
  | 'random_participant_home'
  | 'random_unselected';

export interface ArenaSnapshot {
  id: string;
  slug: string;
  title: string;
  artworkUrl: string;
  thumbnailUrl: string;
}

export interface ResolvedDuelVenue {
  policy: MatchmakingVenuePolicy | 'direct_challenge';
  homeUserId: string | null;
  arenaThemeId: string;
  arena: ArenaSnapshot;
}
```

The web API keeps the existing snake-case server contract and maps only where a component benefits from a view model. Do not create a second progression calculator in the browser.

---

### Task 1: Add the additive database foundation

**Files:**

- Create: `packages/server/db/migrations/058_bonus_games_and_home_arenas.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Consumes: current migration 057 schema, `users.xp`, `users.experience`, `user_currency_account`, `currency_ledger`, `shot_session`, and amateur duel tables.
- Produces: all persistent tables/columns used by Tasks 2–17; ten game rows are not activated here.

- [ ] **Step 1: Extend the migration test with the exact schema contract**

```ts
expect(names).toEqual(
  expect.arrayContaining([
    'arena_theme',
    'bonus_game',
    'bonus_game_attempt',
    'bonus_game_period_log',
    'user_bonus_game_unlock',
    'user_bonus_game_completion',
    'user_arena_unlock',
    'bonus_game_economy_event',
  ]),
);

const attemptColumns = await pool.query<{ column_name: string }>(
  `select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'bonus_game_attempt'`,
);
expect(attemptColumns.rows.map((row) => row.column_name)).toEqual(
  expect.arrayContaining([
    'rules_snapshot',
    'reward_snapshot',
    'arena_theme_id_snapshot',
    'game_core_version',
    'period_started_at',
    'break_started_at',
  ]),
);
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: FAIL because `arena_theme` and the bonus tables do not exist. If `TEST_DATABASE_URL` or `TEST_REDIS_URL` is absent, report BLOCKED instead of treating a skipped suite as passing.

- [ ] **Step 3: Write migration 058**

Implement the schema from the spec with these constraints:

```sql
alter table users
  add column home_arena_theme_id uuid;

alter table amateur_duel_template
  add column matchmaking_venue_policy text not null default 'neutral_default'
    check (matchmaking_venue_policy in (
      'neutral_default', 'random_participant_home', 'random_unselected'
    ));

alter table amateur_duel_match
  add column home_user_id uuid references users(id) on delete set null,
  add column arena_theme_id uuid,
  add column arena_snapshot jsonb,
  add column venue_policy text;

alter table shot_session
  add column bonus_game_attempt_id uuid;
```

Create the eight tables listed in Step 1, then add foreign keys after `arena_theme` and `bonus_game_attempt` exist. Add:

- partial unique index `bonus_game_attempt_one_active_user_idx` on `(user_id) where status='active'`;
- unique `(user_id, bonus_game_id)` constraints for unlock and completion;
- unique `(user_id, arena_theme_id)` for ownership;
- unique `(attempt_id, period_number)` period logs;
- partial unique economy indexes for one `unlock_purchase` and one `first_clear_reward` per user/game;
- `shot_session_mode_check` support for `bonus` requiring attempt and period references;
- `shot_session_bonus_attempt_idx` on attempt, period, and shot index;
- `currency_ledger.reason='bonus_game_reward'`;
- `media_objects.purpose='bonus_game_media'`;
- foreign keys for `users.home_arena_theme_id`, match arena theme, and shot attempt after referenced tables exist.

- [ ] **Step 4: Run the migration suite twice and verify idempotent application**

Run: `pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: PASS, including the existing “applies pending migrations and is idempotent” assertion.

- [ ] **Step 5: Commit the schema**

```bash
git add packages/server/db/migrations/058_bonus_games_and_home_arenas.sql packages/server/test/db/migrations.test.ts
git commit -m "feat: add bonus game and arena schema"
```

### Task 2: Define and validate bonus rules

**Files:**

- Create: `packages/server/src/bonusGames/types.ts`
- Create: `packages/server/test/bonusGames/types.test.ts`
- Modify: `packages/server/src/duel/seed.ts`

**Interfaces:**

- Consumes: `GoalieConfig`, existing validated speed ranges, `GAME_CORE_VERSION`.
- Produces: `parseBonusPeriodRules`, `buildBonusGoalieConfig`, `deriveBonusAttemptSeed`, and DTO/row types used by all bonus services.

- [ ] **Step 1: Write failing validation and deterministic-seed tests**

```ts
it('rejects gaps in period numbering', () => {
  expect(() => parseBonusPeriodRules([validRule(1), validRule(3)], 2)).toThrow(
    'bonus periods must be contiguous',
  );
});

it('builds the exact configured goalkeeper', () => {
  const config = buildBonusGoalieConfig('beach', 'Пляж', validRule(1));
  expect(config).toMatchObject({
    id: 'bonus:beach:p1',
    pattern: 'linear',
    amplitude: 1,
    goalAmplitude: 220,
    frequency: 0.5,
    goalFrequency: 0.45,
    hp: 0,
    baseReward: 0,
    firstClearBonus: 0,
  });
});

it('derives a stable secret-backed attempt seed', () => {
  expect(deriveBonusAttemptSeed('a1', 'u1', 'g1', 'secret')).toBe(
    deriveBonusAttemptSeed('a1', 'u1', 'g1', 'secret'),
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @hockey/game-core build && pnpm --filter @hockey/server exec vitest run test/bonusGames/types.test.ts`

Expected: FAIL because the new module and seed function are missing.

- [ ] **Step 3: Implement schemas and adapters**

```ts
export function buildBonusGoalieConfig(
  slug: string,
  title: string,
  rule: BonusPeriodRule,
): GoalieConfig {
  return {
    id: `bonus:${slug}:p${rule.periodNumber}`,
    name: title,
    pattern: rule.goaliePattern,
    hp: 0,
    baseReward: 0,
    firstClearBonus: 0,
    speed: 0,
    amplitude: rule.goalieAmplitude,
    frequency: rule.goalieFrequency,
    goalAmplitude: rule.goalAmplitude,
    goalFrequency: rule.goalFrequency,
  };
}
```

Validate `durationMs` 1,000–10,800,000; `shotsLimit` 1–100; frequencies 0.1–3; puck speed 0.2–5; amplitude 0–1; goal amplitude 0–220; contiguous periods; and `targetGoals <= sum(shotsLimit)`.

Add:

```ts
export function deriveBonusAttemptSeed(
  attemptId: string,
  userId: string,
  gameId: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${attemptId}:${userId}:${gameId}:bonus:${secret}`)
    .digest('hex');
}
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/types.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit domain contracts**

```bash
git add packages/server/src/bonusGames/types.ts packages/server/src/duel/seed.ts packages/server/test/bonusGames/types.test.ts
git commit -m "feat: define bonus game rule contracts"
```

### Task 3: Add arena ownership and player selection APIs

**Files:**

- Create: `packages/server/src/arenas/types.ts`
- Create: `packages/server/src/arenas/service.ts`
- Create: `packages/server/src/arenas/routes.ts`
- Create: `packages/server/test/arenas/routes.test.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**

- Consumes: migration 058 arena tables and authenticated user ID.
- Produces: `resolveEffectiveArena`, `listUserArenas`, `selectHomeArena`, `resolveDuelVenue`, `GET /me/home-arenas`, and `PATCH /me/home-arena`.

- [ ] **Step 1: Write failing route tests**

```ts
it('lists default plus earned arenas and rejects an unowned selection', async () => {
  const list = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });
  expect(list.statusCode).toBe(200);
  expect(list.json().arenas.map((arena: { slug: string }) => arena.slug)).toEqual([
    'default',
    'beach',
  ]);

  const denied = await app.inject({
    method: 'PATCH',
    url: '/me/home-arena',
    headers,
    payload: { arena_theme_id: unownedArenaId },
  });
  expect(denied.statusCode).toBe(403);
  expect(denied.json().error.code).toBe('arena_not_owned');
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run: `pnpm --filter @hockey/server exec vitest run test/arenas/routes.test.ts`

Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Implement focused arena services**

```ts
export async function selectHomeArena(
  client: PoolClient,
  userId: string,
  arenaThemeId: string | null,
): Promise<ArenaSnapshot>;

export async function resolveEffectiveArena(db: Queryable, userId: string): Promise<ArenaSnapshot>;

export async function resolveDuelVenue(
  client: PoolClient,
  input: {
    source: 'challenge' | 'matchmaking';
    policy: MatchmakingVenuePolicy;
    challengerUserId: string;
    opponentUserId: string;
    randomUnit: number;
  },
): Promise<ResolvedDuelVenue>;
```

`selectHomeArena(null)` resolves and returns the standard arena. Non-null selection joins `user_arena_unlock`, requires `is_selectable=true`, and updates the user only after validation. `resolveDuelVenue` excludes both effective selections for `random_unselected` and falls back to default on an empty candidate set.

- [ ] **Step 4: Register routes and rerun tests**

Run: `pnpm --filter @hockey/server exec vitest run test/arenas/routes.test.ts`

Expected: PASS for default, owned, unowned, archived-but-selectable, and disabled cases.

- [ ] **Step 5: Commit arena APIs**

```bash
git add packages/server/src/arenas packages/server/src/app.ts packages/server/test/arenas/routes.test.ts
git commit -m "feat: add home arena selection api"
```

### Task 4: Implement catalog state and atomic paid unlocks

**Files:**

- Create: `packages/server/src/bonusGames/catalog.ts`
- Create: `packages/server/src/bonusGames/economy.ts`
- Create: `packages/server/test/bonusGames/catalog.test.ts`

**Interfaces:**

- Consumes: bonus definitions, completion/unlock rows, competition access, and user star balance.
- Produces: `listBonusGameCards`, `purchaseBonusGame`, exact server card states, and `bonus_game_economy_event` unlock records.

- [ ] **Step 1: Write failing progression and concurrency tests**

```ts
it('does not offer payment before the previous active game is complete', async () => {
  const cards = await listBonusGameCards(pool, amateurUserId);
  expect(cards[0]?.state).toBe('available');
  expect(cards[1]?.state).toBe('sequence_locked');
});

it('debits a paid unlock once under concurrent requests', async () => {
  const results = await Promise.all([
    purchaseBonusGame(pool, { userId, gameId, now }),
    purchaseBonusGame(pool, { userId, gameId, now }),
  ]);
  expect(results.every((result) => result.unlocked)).toBe(true);
  const balance = await pool.query<{ xp: number }>('select xp from users where id=$1', [userId]);
  expect(balance.rows[0]?.xp).toBe(9);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/catalog.test.ts`

Expected: FAIL because catalog and purchase services are missing.

- [ ] **Step 3: Implement server-derived card states**

```ts
export async function listBonusGameCards(
  db: Queryable,
  userId: string,
): Promise<BonusGameCardDto[]>;

export async function purchaseBonusGame(
  pool: Pool,
  input: { userId: string; gameId: string; now: Date },
): Promise<{ unlocked: true; starBalance: number }>;
```

Use a single ordered query for active definitions plus user completions/unlocks. Use the same amateur access check as duel routes. In purchase: begin, lock `users`, reload active predecessor and price, return existing unlock idempotently, conditionally decrement `xp`, insert economy event and unlock, commit.

- [ ] **Step 4: Run catalog tests**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/catalog.test.ts`

Expected: PASS for beginner lock, free first game, sequence lock, paid state, reorder, archive reconnect, insufficient balance rollback, and concurrent debit-once.

- [ ] **Step 5: Commit catalog and purchase behavior**

```bash
git add packages/server/src/bonusGames/catalog.ts packages/server/src/bonusGames/economy.ts packages/server/test/bonusGames/catalog.test.ts
git commit -m "feat: add bonus progression and purchases"
```

### Task 5: Implement the lazy attempt state machine

**Files:**

- Create: `packages/server/src/bonusGames/reconcile.ts`
- Create: `packages/server/src/bonusGames/service.ts`
- Create: `packages/server/test/bonusGames/attempts.test.ts`

**Interfaces:**

- Consumes: parsed rule snapshots, `deriveBonusAttemptSeed`, catalog access, and explicit `Date now`.
- Produces: `reconcileBonusAttempt`, `startOrResumeBonusAttempt`, `startBonusPeriod`, and `abandonBonusAttempt`.

- [ ] **Step 1: Write failing state-machine tests with fixed timestamps**

```ts
it('closes an expired period and waits for the next explicit start', async () => {
  const next = await reconcileBonusAttempt(client, attempt, new Date('2026-08-23T12:05:00Z'));
  expect(next.state).toBe('break_active');
  const afterBreak = await reconcileBonusAttempt(client, next, new Date('2026-08-23T12:05:31Z'));
  expect(afterBreak.state).toBe('idle');
  expect(afterBreak.current_period).toBe(1);
});

it('returns the same active attempt for the same game', async () => {
  const first = await startOrResumeBonusAttempt(pool, input);
  const second = await startOrResumeBonusAttempt(pool, input);
  expect(first.created).toBe(true);
  expect(second.created).toBe(false);
  expect(second.attempt.id).toBe(first.attempt.id);
});
```

- [ ] **Step 2: Run the attempt tests and verify they fail**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts -t "expired period|same active attempt"`

Expected: FAIL because the service functions are missing.

- [ ] **Step 3: Implement reconciliation and lifecycle operations**

```ts
export async function reconcileBonusAttempt(
  client: PoolClient,
  attempt: BonusAttemptRow,
  now: Date,
): Promise<BonusAttemptRow>;

export async function startOrResumeBonusAttempt(
  pool: Pool,
  input: { userId: string; gameId: string; now: Date; seedSecret: string },
): Promise<{ attempt: BonusAttemptDto; created: boolean }>;
```

Lock the attempt row before reconciliation. Insert period logs with `on conflict do nothing`. Starting snapshots definition, rules, rewards, arena, media, revision, and current `GAME_CORE_VERSION`. Another-game active attempts throw `bonus_attempt_already_active` with the active ID in the safe message payload. Abandon closes an active period log before marking the attempt `abandoned/closed`.

- [ ] **Step 4: Run the complete attempt lifecycle suite**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/attempts.test.ts`

Expected: PASS for resume, conflicting game, explicit period start, quota, timeout, intermission, final failure, abandon, archive continuation, and snapshot stability.

- [ ] **Step 5: Commit attempt lifecycle**

```bash
git add packages/server/src/bonusGames/reconcile.ts packages/server/src/bonusGames/service.ts packages/server/test/bonusGames/attempts.test.ts
git commit -m "feat: add bonus attempt state machine"
```

### Task 6: Add deterministic shots and exactly-once first-clear rewards

**Files:**

- Modify: `packages/server/src/bonusGames/economy.ts`
- Modify: `packages/server/src/bonusGames/service.ts`
- Create: `packages/server/test/bonusGames/shots.test.ts`

**Interfaces:**

- Consumes: `resolveShot`, `deriveShotSeed`, `STICK_NEUTRAL`, attempt snapshot, and economy locks.
- Produces: `submitBonusShot` and `grantFirstClearReward`.

- [ ] **Step 1: Write failing shot, mismatch, and reward-race tests**

```ts
it('resolves from the snapshot without inventory and completes at the target', async () => {
  const response = await submitBonusShot(pool, {
    userId,
    attemptId,
    claimedShotIndex: 1,
    input,
    claimedResult: expected.type,
    now,
  });
  expect(response.serverResult).toBe(expected.type);
  expect(response.attempt.status).toBe('completed');
  expect(response.rewardGranted).toEqual({ coins: 100, stars: 1, experience: 50 });
});

it('grants a first-clear reward once when the final shot is submitted concurrently', async () => {
  await Promise.allSettled([
    submitBonusShot(pool, finalShotInput),
    submitBonusShot(pool, finalShotInput),
  ]);
  const rewards = await pool.query<{ count: number }>(
    `select count(*)::int as count from bonus_game_economy_event
      where user_id=$1 and bonus_game_id=$2 and kind='first_clear_reward'`,
    [userId, gameId],
  );
  expect(rewards.rows[0]?.count).toBe(1);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/shots.test.ts`

Expected: FAIL because shot submission and reward grant are missing.

- [ ] **Step 3: Implement authoritative submission**

```ts
export interface BalanceSnapshot {
  coins: number;
  stars: number;
  experience: number;
}

export interface FirstClearRewardInput {
  userId: string;
  gameId: string;
  attemptId: string;
  reward: BonusRewardSnapshot;
  arenaThemeId: string;
  now: Date;
}

export interface SubmitBonusShotInput {
  userId: string;
  attemptId: string;
  claimedShotIndex: number;
  input: ShotInput;
  claimedResult: 'goal' | 'save' | 'miss';
  now: Date;
}

export async function submitBonusShot(
  pool: Pool,
  input: SubmitBonusShotInput,
): Promise<SubmitBonusShotResult>;

export async function grantFirstClearReward(
  client: PoolClient,
  input: FirstClearRewardInput,
): Promise<{ granted: boolean; balances: BalanceSnapshot }>;
```

Inside one transaction: lock user, coin account, and attempt; reconcile; calculate server shot index; construct `GoalieConfig` from the period snapshot; resolve with neutral stick effects; reject mismatches with `appendEvent(type='shot_mismatch')`; insert `shot_session(mode='bonus')`; update aggregates; and, at target, insert completion, reward balances, coin ledger, arena ownership, economy event, period log, and closed attempt. Only the transaction that inserts the unique completion grants values.

- [ ] **Step 4: Run shot and economy tests**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/shots.test.ts`

Expected: PASS for accepted shots, index conflict, result conflict, final-shot rollback, immediate completion, replay zero reward, and concurrent exactly-once reward.

- [ ] **Step 5: Commit shot and reward behavior**

```bash
git add packages/server/src/bonusGames/economy.ts packages/server/src/bonusGames/service.ts packages/server/test/bonusGames/shots.test.ts
git commit -m "feat: add bonus shots and first clear rewards"
```

### Task 7: Expose player bonus routes

**Files:**

- Create: `packages/server/src/bonusGames/routes.ts`
- Create: `packages/server/test/bonusGames/routes.test.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**

- Consumes: Tasks 4–6 services and `DAILY_SEED_SECRET` passed as `bonusSeedSecret`.
- Produces: all authenticated `/bonus-games` endpoints from the spec.

- [ ] **Step 1: Write a failing end-to-end route contract test**

```ts
const catalog = await app.inject({ method: 'GET', url: '/bonus-games', headers });
expect(catalog.statusCode).toBe(200);
expect(catalog.json()).toMatchObject({ active_attempt: null });

const start = await app.inject({
  method: 'POST',
  url: `/bonus-games/${gameId}/attempts`,
  headers,
});
expect(start.statusCode).toBe(201);
expect(start.json().attempt).toMatchObject({ game_id: gameId, state: 'idle' });
```

- [ ] **Step 2: Run the route test and verify route-not-found failure**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/routes.test.ts`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Register route schemas and handlers**

Implement exact endpoints:

```ts
GET  /bonus-games
GET  /bonus-games/attempts/current
POST /bonus-games/:gameId/unlock
POST /bonus-games/:gameId/attempts
GET  /bonus-games/attempts/:attemptId
POST /bonus-games/attempts/:attemptId/period/start
POST /bonus-games/attempts/:attemptId/shot
POST /bonus-games/attempts/:attemptId/abandon
```

Every route uses `app.authenticate`, UUID Zod schemas, stable error codes, and DTO mappers. Return `201` only for a newly created attempt and `200` for resume.

- [ ] **Step 4: Run player route tests**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/routes.test.ts`

Expected: PASS for auth, status codes, DTO shape, and all stable error codes.

- [ ] **Step 5: Commit player routes**

```bash
git add packages/server/src/bonusGames/routes.ts packages/server/src/app.ts packages/server/test/bonusGames/routes.test.ts
git commit -m "feat: expose bonus game api"
```

### Task 8: Add bonus-game admin CRUD and media upload

**Files:**

- Create: `packages/server/src/bonusGames/admin.ts`
- Create: `packages/server/test/bonusGames/admin.test.ts`
- Modify: `packages/server/src/admin/routes.ts`

**Interfaces:**

- Consumes: bonus validation, object storage, existing admin authentication, and media proxy helpers.
- Produces: admin list/create/patch/archive/reorder/media endpoints and revision increments.

- [ ] **Step 1: Write failing admin tests**

```ts
it('rejects activation with incomplete media', async () => {
  const response = await app.inject({
    method: 'PATCH',
    url: `/admin/bonus-games/${gameId}`,
    headers: adminHeaders,
    payload: { status: 'active' },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json().error.code).toBe('bonus_game_incomplete');
});

it('increments revision without changing an active attempt snapshot', async () => {
  const response = await patchGame({ rewardStars: 9 });
  expect(response.game.revision).toBe(2);
  const attempt = await readAttempt();
  expect(attempt.reward_snapshot.stars).toBe(1);
});
```

- [ ] **Step 2: Run admin tests and verify they fail**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/admin.test.ts`

Expected: FAIL because admin routes are missing.

- [ ] **Step 3: Implement focused admin registration**

```ts
export async function registerBonusGameAdminRoutes(
  app: FastifyInstance,
  options: {
    preHandlers: preHandlerHookHandler[];
    objectStorage?: ObjectStorageClient;
    mediaAccessSecret: string;
  },
): Promise<void>;
```

Register:

```ts
GET    /admin/bonus-games
POST   /admin/bonus-games
PATCH  /admin/bonus-games/:gameId
DELETE /admin/bonus-games/:gameId
POST   /admin/bonus-games/reorder
POST   /admin/bonus-games/media/:kind
```

`kind` is `arena`, `thumbnail`, `goalkeeper_ready`, or `goalkeeper_save`; uploads accept non-empty WebP only, insert `media_objects(purpose='bonus_game_media')`, and return the signed proxy URL. Activation validates media, target, contiguous rules, price, arena, and unique contiguous active order. Delete sets `status='archived'`.

- [ ] **Step 4: Run admin tests**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames/admin.test.ts`

Expected: PASS for authorization, validation, revision, reorder, archive, and storage failure behavior.

- [ ] **Step 5: Commit admin backend**

```bash
git add packages/server/src/bonusGames/admin.ts packages/server/src/admin/routes.ts packages/server/test/bonusGames/admin.test.ts
git commit -m "feat: add bonus game admin api"
```

### Task 9: Produce the 31 launch assets and seed the catalog

**Files:**

- Create: `packages/web/public/bonus-games/section-card.webp`
- Create: `packages/web/public/bonus-games/arenas/*.webp` — exactly ten approved slugs.
- Create: `packages/web/public/bonus-games/goalkeepers/*-ready.webp` — exactly ten.
- Create: `packages/web/public/bonus-games/goalkeepers/*-save.webp` — exactly ten.
- Create: `packages/web/src/game/bonusGameAssets.ts`
- Create: `packages/web/src/game/bonusGameAssets.test.ts`
- Create: `packages/server/db/migrations/059_seed_bonus_games.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

**Interfaces:**

- Consumes: approved source-render folder, current goalkeeper sprite geometry, migration 058.
- Produces: optimized runtime assets, stable asset constants, standard arena, and ten active seeded games.

- [ ] **Step 1: Write failing asset-manifest and seed assertions**

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';

it('declares all approved bonus asset paths', () => {
  expect(Object.keys(BONUS_GAME_ASSETS)).toEqual([
    'beach',
    'ski-resort',
    'cyberpunk-yard',
    'abandoned-waterpark',
    'pirate-bay',
    'north-pole',
    'desert',
    'volcanic-ice',
    'castle',
    'space',
  ]);
  expect(BONUS_GAME_SECTION_ARTWORK).toBe('/bonus-games/section-card.webp');
  const runtimePaths = [
    BONUS_GAME_SECTION_ARTWORK,
    ...Object.values(BONUS_GAME_ASSETS).flatMap((entry) => [
      entry.arena,
      entry.goalkeeperReady,
      entry.goalkeeperSave,
    ]),
  ];
  expect(runtimePaths).toHaveLength(31);
  for (const runtimePath of runtimePaths) {
    expect(existsSync(path.resolve('public', runtimePath.slice(1)))).toBe(true);
  }
});
```

Extend the migration test to assert ten active bonus games ordered 1–10 and the exact total unlock price `19` and total star reward `30`.

- [ ] **Step 2: Run tests and verify missing assets/constants/seed failure**

Run: `pnpm --filter @hockey/web exec vitest run src/game/bonusGameAssets.test.ts && pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: FAIL because constants, files, and seed rows do not exist.

- [ ] **Step 3: Select and normalize the ten approved arena renders**

Use `view_image` to inspect the source folder in batches and select one render for each approved slug. Normalize each selected render to a portrait 572×700 composition while preserving the goal opening and player lane. Use AI image editing when content must be reframed; use a deterministic image converter only for final resize/WebP encoding. Save to the exact arena paths.

- [ ] **Step 4: Generate twenty consistent goalkeeper sprites with the imagegen skill**

For every slug, first generate the ready pose using the current `/sprites/goalkeeper.webp` as the geometry reference and this exact common direction:

```text
Isolated mobile-game hockey goalkeeper sprite, transparent background, square 1024x1024 canvas, same top-down three-quarter camera, body scale, center anchor, and facing direction as the supplied reference. Full body centered, facing the shooter toward the bottom of frame, compact ready stance, clean readable silhouette at 70px, polished stylized 3D game art, no rink, no goal, no text, no logo, no loose equipment outside the canvas.
```

Apply these costume directions:

| Slug                  | Costume direction                                                    |
| --------------------- | -------------------------------------------------------------------- |
| `beach`               | Hawaiian beach shirt, turquoise/coral pads, sun visor                |
| `ski-resort`          | alpine ski jacket, snow goggles, red/white winter pads               |
| `cyberpunk-yard`      | neon cyan/magenta armored street gear, subtle luminous visor         |
| `abandoned-waterpark` | weathered lifeguard/waterpark uniform, faded aqua/yellow pads        |
| `pirate-bay`          | pirate coat, tricorn-inspired helmet, leather/red/gold pads          |
| `north-pole`          | thick northern down jacket, fur-trim hood, white/ice-blue pads       |
| `desert`              | sand-colored scarf and light desert armor, amber/teal pads           |
| `volcanic-ice`        | heat-protective black armor with restrained lava-orange accents      |
| `castle`              | medieval knight plate armor adapted as goalie pads, steel/royal blue |
| `space`               | white spacesuit goalkeeper gear, dark visor, blue/violet accents     |

Generate each save sprite by editing its approved ready sprite together with `/sprites/save.webp` as pose reference:

```text
Keep exactly the same character identity, costume, colors, camera, scale, transparent 1024x1024 canvas, and center anchor. Change only the action to a wide hockey save pose matching the supplied save reference: pads spread, glove/blocker actively stopping a shot, readable silhouette, no puck baked into the image, no background, no text.
```

- [ ] **Step 5: Generate the section card**

Use imagegen with:

```text
Portrait mobile-game section artwork for “Bonus Games”: a cinematic hockey puck traveling through a portal that blends beach, northern ice, medieval castle, and outer space, polished stylized 3D game art, icy blue composition, strong central subject, no text, no logo, no UI, safe margins for rounded card crop.
```

Save the optimized result at `/bonus-games/section-card.webp`.

- [ ] **Step 6: Implement exact asset constants**

```ts
function asset(slug: string) {
  return {
    arena: `/bonus-games/arenas/${slug}.webp`,
    goalkeeperReady: `/bonus-games/goalkeepers/${slug}-ready.webp`,
    goalkeeperSave: `/bonus-games/goalkeepers/${slug}-save.webp`,
  } as const;
}

export const BONUS_GAME_SECTION_ARTWORK = '/bonus-games/section-card.webp';

export const BONUS_GAME_ASSETS = {
  beach: asset('beach'),
  'ski-resort': asset('ski-resort'),
  'cyberpunk-yard': asset('cyberpunk-yard'),
  'abandoned-waterpark': asset('abandoned-waterpark'),
  'pirate-bay': asset('pirate-bay'),
  'north-pole': asset('north-pole'),
  desert: asset('desert'),
  'volcanic-ice': asset('volcanic-ice'),
  castle: asset('castle'),
  space: asset('space'),
} as const;
```

`asset(slug)` returns arena, ready, and save paths under the approved directories.

- [ ] **Step 7: Seed exact launch definitions in migration 059**

Insert the standard arena and ten active arena themes, then the ten active games with the exact access, formats, targets, rewards, four-minute periods, thirty-second breaks, patterns, and speed rows from the spec. Use stable UUID literals so seed rows and foreign keys are reproducible across environments. Set thumbnail URL equal to artwork URL for launch.

- [ ] **Step 8: Run asset and migration tests**

Run: `pnpm --filter @hockey/web exec vitest run src/game/bonusGameAssets.test.ts && pnpm --filter @hockey/server exec vitest run test/db/migrations.test.ts`

Expected: PASS with exactly 31 files and ten active ordered seed rows.

- [ ] **Step 9: Visually inspect every output before commit**

Use `view_image` at original detail for each arena and both poses. Reject opaque backgrounds, identity drift, wrong orientation, clipped pads, baked pucks, unreadable silhouettes, or arena geometry that hides the goal/lane.

- [ ] **Step 10: Commit assets and seed atomically**

```bash
git add packages/web/public/bonus-games packages/web/src/game/bonusGameAssets.ts packages/web/src/game/bonusGameAssets.test.ts packages/server/db/migrations/059_seed_bonus_games.sql packages/server/test/db/migrations.test.ts
git commit -m "feat: add bonus game artwork and launch catalog"
```

### Task 10: Extract the reusable Pixi play view and support custom goalie configs

**Files:**

- Create: `packages/web/src/game/PlayView.tsx`
- Create: `packages/web/src/game/PlayView.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/PlayView.ice.test.tsx`
- Modify: `packages/web/src/game/loop.ts`
- Modify: `packages/web/src/game/loop.test.ts`

**Interfaces:**

- Consumes: existing `PlayView` implementation and renderers.
- Produces: generic exported `PlayView`, `PlayViewProps`, and `GameLoopOpts.getGoalieConfig` used by bonus play.

- [ ] **Step 1: Add a failing custom-goalie loop test**

```ts
const customGoalie: GoalieConfig = {
  id: 'bonus:beach:p1',
  name: 'Пляж',
  pattern: 'linear',
  hp: 0,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: 1,
  frequency: 0.5,
  goalAmplitude: 220,
  goalFrequency: 0.45,
};

const goalieUpdate = vi.fn();
const loop = makeLoop({
  goalieRenderer: { update: goalieUpdate } as never,
  getGoalieConfig: () => customGoalie,
});
const ticker = makeTicker();
loop.attach(ticker);
const onTick = ticker.add.mock.calls[0]?.[0] as (ticker: Ticker) => void;
onTick(ticker);
expect(goalieUpdate).toHaveBeenCalled();
```

- [ ] **Step 2: Run loop tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/game/loop.test.ts`

Expected: FAIL because `getGoalieConfig` is not accepted.

- [ ] **Step 3: Add custom configuration fallback**

```ts
export interface GameLoopOpts {
  getGoalieId: () => string | null;
  getGoalieConfig?: () => GoalieConfig | null;
}

const custom = opts.getGoalieConfig?.() ?? null;
const id = opts.getGoalieId();
const cfg = custom ?? (id ? getGoalie(id) : null);
if (!cfg) return;
```

Add `goalieConfig?: GoalieConfig` to `PlayViewProps`; use it in both the render loop and shot resolver, with the current `goalieId` fallback for existing modes.

- [ ] **Step 4: Move `PlayView` without behavior changes**

Move the generic component, its props, timing helpers, and required perspective constants from `DailyScreen.tsx` into `game/PlayView.tsx`. Keep mode-specific daily/amateur wrappers in `DailyScreen.tsx`. Update imports in `PlayView.ice.test.tsx` and add a smoke render in `PlayView.test.tsx`.

- [ ] **Step 5: Run focused web tests**

Run: `pnpm --filter @hockey/web exec vitest run src/game/loop.test.ts src/game/PlayView.test.tsx src/screens/PlayView.ice.test.tsx src/screens/DailyScreen.test.tsx`

Expected: PASS with no visual/gameplay contract change in existing modes.

- [ ] **Step 6: Commit the reusable play surface**

```bash
git add packages/web/src/game/PlayView.tsx packages/web/src/game/PlayView.test.tsx packages/web/src/game/loop.ts packages/web/src/game/loop.test.ts packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/PlayView.ice.test.tsx
git commit -m "refactor: extract reusable hockey play view"
```

### Task 11: Add typed bonus clients and authoritative store

**Files:**

- Create: `packages/web/src/api/bonusGames.ts`
- Create: `packages/web/src/api/arenas.ts`
- Create: `packages/web/src/stores/bonusGameStore.ts`
- Create: `packages/web/src/stores/bonusGameStore.test.ts`
- Modify: `packages/web/src/api/apiFetch.ts`
- Modify: `packages/web/src/api/apiFetch.test.ts`

**Interfaces:**

- Consumes: Task 7 and Task 3 API contracts.
- Produces: request functions, DTOs, `useBonusGameStore`, optimistic shot update, and reconciliation lock.

- [ ] **Step 1: Write failing store tests**

```ts
it('blocks the next shot after an uncertain network failure until refresh succeeds', async () => {
  mockSubmit.mockRejectedValueOnce(new TypeError('network'));
  await useBonusGameStore.getState().submitShot(payload);
  expect(useBonusGameStore.getState().needsReconcile).toBe(true);
  expect(useBonusGameStore.getState().canSubmitShot()).toBe(false);
  await useBonusGameStore.getState().refresh();
  expect(useBonusGameStore.getState().needsReconcile).toBe(false);
});
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts`

Expected: FAIL because the API and store modules are missing.

- [ ] **Step 3: Implement API functions**

```ts
export const fetchBonusGames = () => apiFetch<BonusCatalogResponse>('/bonus-games');
export const purchaseBonusGame = (gameId: string) =>
  apiFetch<BonusUnlockResponse>(`/bonus-games/${gameId}/unlock`, { method: 'POST' });
export const startBonusAttempt = (gameId: string) =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/${gameId}/attempts`, { method: 'POST' });
export const submitBonusShot = (attemptId: string, body: BonusShotRequest) =>
  apiFetch<BonusShotResponse>(`/bonus-games/attempts/${attemptId}/shot`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
```

Add Russian mappings for all stable bonus and arena error codes in `apiFetch.ts`.

- [ ] **Step 4: Implement the non-persisted store**

The store exposes `loadCurrent`, `applyState`, `optimisticAddShot`, `startPeriod`, `submitShot`, `abandon`, `refresh`, and `canSubmitShot`. Keep one in-flight ref guard so two taps cannot submit the same shot before React rerenders.

- [ ] **Step 5: Run store and API error tests**

Run: `pnpm --filter @hockey/web exec vitest run src/stores/bonusGameStore.test.ts src/api/apiFetch.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit typed clients and store**

```bash
git add packages/web/src/api/bonusGames.ts packages/web/src/api/arenas.ts packages/web/src/stores/bonusGameStore.ts packages/web/src/stores/bonusGameStore.test.ts packages/web/src/api/apiFetch.ts packages/web/src/api/apiFetch.test.ts
git commit -m "feat: add bonus game web client state"
```

### Task 12: Add section placement and bonus catalog UI

**Files:**

- Create: `packages/web/src/screens/BonusGamesScreen.tsx`
- Create: `packages/web/src/screens/BonusGamesScreen.test.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/App.test.tsx`
- Modify: `packages/web/src/components/BottomNav.tsx`
- Modify: `packages/web/src/components/BottomNav.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: bonus catalog API and section-card asset.
- Produces: `/bonus-games` route, card states, purchase modal, start/resume navigation.

- [ ] **Step 1: Write failing placement and catalog-state tests**

```ts
const sectionButtons = screen.getAllByRole('button');
const labels = sectionButtons.map((button) => button.textContent ?? '');
const amateurIndex = labels.findIndex((label) => label.includes('Любители'));
const bonusIndex = labels.findIndex((label) => label.includes('Бонусные игры'));
const proIndex = labels.findIndex((label) => label.includes('Профессионалы'));
expect(bonusIndex).toBe(amateurIndex + 1);
expect(proIndex).toBe(bonusIndex + 1);

expect(screen.getByText('Нужно пройти: Пляж')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Открыть за 1 звезду' })).toBeInTheDocument();
```

- [ ] **Step 2: Run UI tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx src/screens/BonusGamesScreen.test.tsx`

Expected: FAIL because the section and screen do not exist.

- [ ] **Step 3: Add the section card and route**

Insert Bonus Games immediately after the amateur card and before professional. Beginners open a standard lock modal; amateur/pro users navigate to `/bonus-games`. Add lazy route loading and keep the Sections bottom-nav tab selected for both `/bonus-games` and `/bonus-games/:id/play`.

```tsx
const BonusGamesScreen = lazy(() =>
  import('../screens/BonusGamesScreen.js').then((module) => ({
    default: module.BonusGamesScreen,
  })),
);

<Route
  path="/bonus-games"
  element={
    <PrivateRoute>
      <BonusGamesScreen />
    </PrivateRoute>
  }
/>;
```

- [ ] **Step 4: Implement catalog cards and purchase confirmation**

Render only server-provided state. The payment modal copy includes the exact current price and current balance; its CTA calls purchase once. `in_progress` navigates to the active attempt. `completed` shows `Играть снова` and zero repeat reward copy.

```tsx
const purchase = useMutation({
  mutationFn: purchaseBonusGame,
  onSuccess: async () => {
    setPurchaseGame(null);
    await queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
  },
});

const actionLabel =
  game.state === 'purchase_required'
    ? `Открыть за ${game.unlock_price_stars} звезду`
    : game.state === 'in_progress'
      ? 'Продолжить'
      : game.state === 'completed'
        ? 'Играть снова'
        : 'Играть';
```

- [ ] **Step 5: Run route and catalog tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx src/screens/BonusGamesScreen.test.tsx src/app/App.test.tsx src/components/BottomNav.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit catalog UI**

```bash
git add packages/web/src/screens/BonusGamesScreen.tsx packages/web/src/screens/BonusGamesScreen.test.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx packages/web/src/app/App.tsx packages/web/src/app/App.test.tsx packages/web/src/components/BottomNav.tsx packages/web/src/components/BottomNav.test.tsx packages/web/src/app/design-system.css
git commit -m "feat: add bonus games catalog ui"
```

### Task 13: Add bonus gameplay, resume, result, and abandon UI

**Files:**

- Create: `packages/web/src/screens/BonusGamePlayScreen.tsx`
- Create: `packages/web/src/screens/BonusGamePlayScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/game/PixiStage.tsx`
- Modify: `packages/web/src/game/PixiStage.test.tsx`

**Interfaces:**

- Consumes: `PlayView`, `useBonusGameStore`, rule snapshot, custom goalkeeper options, and arena asset URL.
- Produces: `/bonus-games/:gameId/play` complete attempt experience.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('requires confirmation before abandoning an active attempt', async () => {
  await user.click(screen.getByRole('button', { name: 'Завершить попытку' }));
  expect(abandonBonusAttempt).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Завершить попытку?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Да, завершить' }));
  expect(abandonBonusAttempt).toHaveBeenCalledTimes(1);
});

it('passes themed arena and goalie sprites to the play view', () => {
  expect(screen.getByTestId('bonus-rink-background')).toHaveAttribute(
    'src',
    '/bonus-games/arenas/beach.webp',
  );
});
```

- [ ] **Step 2: Run gameplay tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/BonusGamePlayScreen.test.tsx`

Expected: FAIL because the screen is missing.

- [ ] **Step 3: Implement the play adapter**

Construct `GoalieConfig` from the active period snapshot, pass `goalieConfig`, `speedOverrides`, `STICK_NEUTRAL`, and themed `GoalieOptions` into `PlayView`. Use the arena artwork as the rink background and preserve the 572×700 logical geometry. Add dynamic asset preloading to `PixiStage` without adding all 20 goalkeeper files to every other mode's startup list.

```tsx
const goalieConfig: GoalieConfig = {
  id: `bonus:${attempt.game_slug}:p${rule.periodNumber}`,
  name: attempt.game_title,
  pattern: rule.goaliePattern,
  hp: 0,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: rule.goalieAmplitude,
  frequency: rule.goalieFrequency,
  goalAmplitude: rule.goalAmplitude,
  goalFrequency: rule.goalFrequency,
};

const speedOverridesFromBonusRule = (period: BonusPeriodRuleDto): SpeedOverrides => ({
  goalFreq: period.goalFrequency,
  goalieFreq: period.goalieFrequency,
  shooterFreq: period.shooterFrequency,
  puckSpeed: period.puckSpeedPerMs,
});

<PlayView
  goalieId={goalieConfig.id}
  goalieConfig={goalieConfig}
  goalieOptions={{
    idleSpriteUrl: attempt.goalkeeper_ready_url,
    saveSpriteUrl: attempt.goalkeeper_save_url,
  }}
  longCourtBackground={attempt.arena.artwork_url}
  stickEffects={STICK_NEUTRAL}
  speedOverrides={speedOverridesFromBonusRule(rule)}
/>;
```

- [ ] **Step 4: Implement attempt states**

Render explicit states for loading, idle/start period, active play, intermission countdown, failed, completed first-clear reward, completed replay, and abandoned. Timer expiry calls authoritative refresh. Network uncertainty shows `Проверяем результат броска…` and disables the next shot. Define `ModeState`, `BonusResult`, and `BonusBreak` as local presentational components in `BonusGamePlayScreen.tsx`; they receive only the props shown below and perform no API calls.

```tsx
if (store.needsReconcile) return <ModeState text="Проверяем результат броска…" />;
if (attempt.status === 'failed') return <BonusResult kind="failed" attempt={attempt} />;
if (attempt.status === 'completed') {
  return <BonusResult kind="completed" attempt={attempt} reward={attempt.reward_granted} />;
}
if (attempt.state === 'break_active') {
  return <BonusBreak endsAt={attempt.break_ends_at} onElapsed={store.refresh} />;
}
```

- [ ] **Step 5: Implement mandatory abandon confirmation**

Use the standard modal. The first tap only opens it; cancel performs no API call; confirm calls abandon once and returns to the catalog. Copy states that current progress is lost and the paid unlock remains.

```tsx
<button type="button" className="btn btn--ghost" onClick={() => setConfirmAbandon(true)}>
  Завершить попытку
</button>;
{
  confirmAbandon && (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-label="Завершить попытку?">
        <h2 className="modal-title">Завершить попытку?</h2>
        <p className="modal-copy">Прогресс попытки пропадёт. Оплаченное открытие останется.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmAbandon(false)}>
            Продолжить игру
          </button>
          <button type="button" className="modal-primary btn btn--cta" onClick={confirmAndAbandon}>
            Да, завершить
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run gameplay and Pixi tests**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/BonusGamePlayScreen.test.tsx src/game/PixiStage.test.tsx src/game/PlayView.test.tsx`

Expected: PASS for all states, custom media, timer refresh, mismatch rollback, and confirmation.

- [ ] **Step 7: Commit gameplay UI**

```bash
git add packages/web/src/screens/BonusGamePlayScreen.tsx packages/web/src/screens/BonusGamePlayScreen.test.tsx packages/web/src/app/App.tsx packages/web/src/game/PixiStage.tsx packages/web/src/game/PixiStage.test.tsx
git commit -m "feat: add bonus game play flow"
```

### Task 14: Add the locker-room home arena selector

**Files:**

- Create: `packages/web/src/components/HomeArenaModal.tsx`
- Create: `packages/web/src/components/HomeArenaModal.test.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**

- Consumes: arena API and existing rink-photo prop coordinates.
- Produces: accessible photo hotspot, preview, earned-only modal, and confirmed selection.

- [ ] **Step 1: Write failing profile interaction tests**

```ts
expect(screen.getByRole('button', { name: 'Выбрать домашнюю площадку' })).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Выбрать домашнюю площадку' }));
expect(screen.getByRole('radio', { name: 'По умолчанию' })).toBeChecked();
expect(screen.getByRole('radio', { name: 'Пляж' })).toBeInTheDocument();
expect(screen.queryByRole('radio', { name: 'Космос' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run profile tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/components/HomeArenaModal.test.tsx src/screens/ProfileScreen.test.tsx`

Expected: FAIL because the photo is decorative and the modal is missing.

- [ ] **Step 3: Implement `HomeArenaModal`**

Use radio semantics for local choice and a text-only `Сохранить` CTA. Do not optimistically close: call `PATCH /me/home-arena`, update preview after success, then close. Display a safe Russian error and preserve the previous choice on failure.

```tsx
const save = useMutation({
  mutationFn: () => selectHomeArena(selectedId),
  onSuccess: (response) => {
    onSaved(response.selected_arena);
    onClose();
  },
});

{
  arenas.map((arena) => (
    <label key={arena.id} className="home-arena-option">
      <input
        type="radio"
        name="home-arena"
        checked={selectedId === arena.selection_id}
        onChange={() => setSelectedId(arena.selection_id)}
      />
      <img src={arena.thumbnail_url} alt="" />
      <span>{arena.title}</span>
    </label>
  ));
}
```

- [ ] **Step 4: Convert the rink photo into a hotspot**

Add a button aligned to `LOCKER_PROPS.rinkPhoto`, overlay the selected thumbnail inside the existing frame, and open the modal. Keep the existing decorative frame image. Add focus styling and a preview crop that does not block the hotspot.

```tsx
<button
  type="button"
  className="profile-locker-rink-hotspot"
  style={lockerHotspotStyle(LOCKER_HOTSPOTS.rinkPhoto)}
  aria-label="Выбрать домашнюю площадку"
  onClick={() => setArenaModalOpen(true)}
>
  <img src={selectedArena.thumbnail_url} alt="" />
</button>
```

- [ ] **Step 5: Run component and profile tests**

Run: `pnpm --filter @hockey/web exec vitest run src/components/HomeArenaModal.test.tsx src/screens/ProfileScreen.test.tsx`

Expected: PASS for default, earned-only list, selection, server rejection, and preview.

- [ ] **Step 6: Commit locker-room selection**

```bash
git add packages/web/src/components/HomeArenaModal.tsx packages/web/src/components/HomeArenaModal.test.tsx packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/ProfileScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat: add locker room home arena selector"
```

### Task 15: Snapshot venue policy in amateur duels

**Files:**

- Modify: `packages/server/src/duel/amateur/routes.ts`
- Modify: `packages/server/test/duel/amateur.test.ts`

**Interfaces:**

- Consumes: `resolveDuelVenue` and migration 058 fields.
- Produces: template `matchmakingVenuePolicy`, match `home_user_id`, `venue_policy`, `arena_snapshot`, and DTO `arena`.

- [ ] **Step 1: Write failing direct and matchmaking venue tests**

```ts
it('snapshots the challenger home arena for a direct challenge', async () => {
  const match = await createChallenge(challenger, opponent);
  expect(match.home_user_id).toBe(challenger.id);
  expect(match.arena.slug).toBe('beach');
});

it('uses the default neutral arena when configured', async () => {
  const match = await createMatchmakingPair('neutral_default');
  expect(match.venue_policy).toBe('neutral_default');
  expect(match.home_user_id).toBeNull();
  expect(match.arena.slug).toBe('default');
});

it('uses the selected arena of the server-chosen home participant', async () => {
  const match = await createMatchmakingPair('random_participant_home');
  expect([challenger.id, opponent.id]).toContain(match.home_user_id);
  const expectedSlug = match.home_user_id === challenger.id ? 'beach' : 'castle';
  expect(match.arena.slug).toBe(expectedSlug);
});

it('uses an arena selected by neither participant', async () => {
  const match = await createMatchmakingPair('random_unselected');
  expect(match.home_user_id).toBeNull();
  expect([challenger.homeArenaId, opponent.homeArenaId]).not.toContain(match.arena.id);
});
```

- [ ] **Step 2: Run duel tests and verify missing venue fields**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts -t "home arena|matchmaking venue"`

Expected: FAIL because templates and matches do not expose venue policy.

- [ ] **Step 3: Extend template schemas, SQL, and DTOs**

Add `matchmakingVenuePolicy` to create/patch/list with default `neutral_default`. Include it in template rules snapshots. Map match arena snapshot to:

```ts
arena: {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}
home_user_id: string | null;
venue_policy: MatchmakingVenuePolicy | 'direct_challenge';
```

- [ ] **Step 4: Resolve and persist at match creation**

For `source='challenge'`, force direct-challenge resolution with challenger home. For matchmaking, use the template policy and a server random unit derived from `seedBasis`, the deterministic string initially written to `match_seed` by `createOpenMatch`; do not call `Math.random()`. Store the full snapshot in the same transaction as the match.

```ts
function deterministicUnitFromSeed(seed: string, label: string): number {
  const prefix = createHash('sha256').update(`${seed}:${label}`).digest('hex').slice(0, 8);
  return Number.parseInt(prefix, 16) / 0xffffffff;
}

const venue = await resolveDuelVenue(client, {
  source: input.source,
  policy: input.source === 'challenge' ? 'neutral_default' : template.matchmakingVenuePolicy,
  challengerUserId: input.challengerUserId,
  opponentUserId: input.opponentUserId,
  randomUnit: deterministicUnitFromSeed(seedBasis, 'venue'),
});

await client.query(
  `update amateur_duel_match
      set home_user_id=$2, arena_theme_id=$3, arena_snapshot=$4, venue_policy=$5
    where id=$1`,
  [matchId, venue.homeUserId, venue.arenaThemeId, venue.arena, venue.policy],
);
```

- [ ] **Step 5: Run the full amateur duel suite**

Run: `pnpm --filter @hockey/server exec vitest run test/duel/amateur.test.ts`

Expected: PASS for existing duel behavior plus direct home, neutral default, deterministic participant home, unselected venue, empty-pool fallback, and immutable snapshot.

- [ ] **Step 6: Commit duel venue backend**

```bash
git add packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts
git commit -m "feat: snapshot arena venues in amateur duels"
```

### Task 16: Render duel venues and expose both admin editors

**Files:**

- Create: `packages/web/src/admin/BonusGamesAdmin.tsx`
- Create: `packages/web/src/admin/BonusGamesAdmin.test.tsx`
- Modify: `packages/web/src/api/amateurDuel.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`
- Modify: `packages/web/src/screens/DailyScreen.tsx`
- Modify: `packages/web/src/screens/DailyScreen.test.tsx`

**Interfaces:**

- Consumes: Task 8 admin API, Task 15 duel DTO, and committed assets.
- Produces: complete bonus admin section, duel venue-policy selector, and actual arena background in amateur play.

- [ ] **Step 1: Write failing admin and duel-render tests**

```ts
expect(screen.getByRole('button', { name: 'Бонусные игры' })).toBeInTheDocument();
expect(screen.getByLabelText('Площадка при автоматическом подборе')).toHaveValue('neutral_default');

expect(document.querySelector('img[src="/bonus-games/arenas/beach.webp"]')).toBeTruthy();
```

- [ ] **Step 2: Run focused UI tests and verify failure**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/BonusGamesAdmin.test.tsx src/admin/AdminScreen.test.tsx src/screens/DailyScreen.test.tsx -t "bonus|venue|arena"`

Expected: FAIL because admin controls and duel arena rendering are missing.

- [ ] **Step 3: Add typed admin contracts**

Define `AdminBonusGame`, `AdminBonusPeriodRule`, input/patch types, media response, reorder request, and `AdminMatchmakingVenuePolicy`. Add fetch/create/patch/archive/reorder/upload functions to `admin/api.ts`.

```ts
export type AdminMatchmakingVenuePolicy =
  | 'neutral_default'
  | 'random_participant_home'
  | 'random_unselected';

export function fetchAdminBonusGames(): Promise<{ games: AdminBonusGame[] }> {
  return apiFetch('/admin/bonus-games');
}

export function patchAdminBonusGame(
  gameId: string,
  body: AdminBonusGamePatch,
): Promise<{ game: AdminBonusGame }> {
  return apiFetch(`/admin/bonus-games/${gameId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 4: Implement `BonusGamesAdmin`**

Render ordered cards plus create/edit modal. The editor contains title, description, order, status, free/paid and price, target, periods, break, all four speed fields, pattern, amplitude fields, rewards, arena/thumbnail, and two goalkeeper media uploads. Validate client-side before submit but display server validation errors. Archive uses a standard confirmation modal explaining that active attempts continue from snapshots.

- [ ] **Step 5: Mount the admin tab and duel venue selector**

Add `bonus-games` to `AdminTab`, fetch only while active, and mount `BonusGamesAdmin`. In `DuelTemplateEditor`, add the three Russian options:

```ts
const venueOptions = [
  { value: 'neutral_default', label: 'Нейтральная стандартная' },
  { value: 'random_participant_home', label: 'Случайный хозяин' },
  { value: 'random_unselected', label: 'Случайная нейтральная' },
] as const;

<GlassSelect
  ariaLabel="Площадка при автоматическом подборе"
  value={matchmakingVenuePolicy}
  options={venueOptions}
  onChange={setMatchmakingVenuePolicy}
/>
```

- [ ] **Step 6: Render the match arena snapshot**

Use `match.arena.artwork_url` as the amateur duel `PlayView` background for both participants. Never re-fetch either player's current arena while rendering an existing match.

```tsx
<PlayView
  longCourtBackground={match.arena.artwork_url}
  seed={match.match_seed}
  goalieId={match.rules.goalieId}
/>
```

- [ ] **Step 7: Run admin, duel, and React quality tests**

Run: `pnpm --filter @hockey/web exec vitest run src/admin/BonusGamesAdmin.test.tsx src/admin/AdminScreen.test.tsx src/screens/DailyScreen.test.tsx`

Expected: PASS.

Run the `vercel:react-best-practices` review required after editing multiple TSX components and correct any concrete findings before commit.

- [ ] **Step 8: Commit admin and duel rendering**

```bash
git add packages/web/src/admin/BonusGamesAdmin.tsx packages/web/src/admin/BonusGamesAdmin.test.tsx packages/web/src/api/amateurDuel.ts packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx packages/web/src/screens/DailyScreen.tsx packages/web/src/screens/DailyScreen.test.tsx
git commit -m "feat: manage bonus games and duel venues"
```

### Task 17: Run complete verification and prepare dev acceptance

**Files:**

- No planned file modifications; verified failures return to the owning task for a focused fix and commit.
- Read: `docs/superpowers/specs/2026-08-23-bonus-games-and-home-arenas-design.md`
- Read: `.github/workflows/ci.yml`
- Read: `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes: all prior tasks.
- Produces: a locally verified implementation commit range and an evidence checklist ready for an authorized dev deployment.

- [ ] **Step 1: Run read-only formatting checks on touched areas**

Run: `pnpm exec prettier --check packages/server/src/arenas packages/server/src/bonusGames packages/server/test/arenas packages/server/test/bonusGames packages/server/src/app.ts packages/server/src/admin/routes.ts packages/server/src/duel/amateur/routes.ts packages/server/test/duel/amateur.test.ts packages/server/test/db/migrations.test.ts packages/web/src`

Expected: PASS. If it fails, run Prettier only on each reported task-owned file, review its diff, and commit that file with the owning task; never run a workspace-wide write formatter in the dirty worktree.

- [ ] **Step 2: Run static verification**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Build in dependency order**

Run: `pnpm --filter @hockey/game-core build && pnpm build`

Expected: PASS.

- [ ] **Step 4: Run focused suites**

Run: `pnpm --filter @hockey/server exec vitest run test/bonusGames test/arenas test/duel/amateur.test.ts test/db/migrations.test.ts`

Expected: PASS with integration environment present; skipped integration suites are BLOCKED evidence.

Run: `pnpm --filter @hockey/web exec vitest run src/game/bonusGameAssets.test.ts src/game/PlayView.test.tsx src/stores/bonusGameStore.test.ts src/screens/BonusGamesScreen.test.tsx src/screens/BonusGamePlayScreen.test.tsx src/components/HomeArenaModal.test.tsx src/screens/ProfileScreen.test.tsx src/screens/SectionsScreen.test.tsx src/admin/BonusGamesAdmin.test.tsx src/admin/AdminScreen.test.tsx src/screens/DailyScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run complete package tests**

Run: `pnpm test`

Expected: PASS with PostgreSQL 16 and Redis 7 test services available.

- [ ] **Step 6: Start the local stack and run rendered QA**

Run in separate terminals:

```bash
pnpm dev:server
pnpm dev:web
```

Use the real browser to verify narrow and wide mobile viewports, all ten catalog states through synthetic fixtures, all 31 images, ready/save transitions, first-clear balances, replay zero reward, resume after exit, abandon confirmation, the locker photo modal, each earned arena, direct-challenge home venue, and all three matchmaking policies.

- [ ] **Step 7: Record exact economic evidence**

For one synthetic amateur user, record initial/final `user_currency_account.balance`, `users.xp`, `users.experience`, five paid unlock events totaling `-19` stars, ten first-clear events totaling `+5,600` coins, `+2,800` experience, and `+30` stars, ten completions, and ten arena unlocks. Replays must add zero reward events.

- [ ] **Step 8: Run completion review**

Use `superpowers:requesting-code-review`, fix accepted findings with focused tests, then use `superpowers:verification-before-completion`. Do not claim completion from stale test output.

- [ ] **Step 9: Close verified failures through their owning tasks**

For each failure, add a regression test to the task that owns the behavior, make the minimal correction, rerun that task's focused suite, and use that task's explicit staging list. Use commit message `fix: close bonus game acceptance gap`. Skip this step when verification found no failures.

- [ ] **Step 10: Stop at the deployment authorization gate**

Report exact branch, commit range, tests, rendered scenarios, and any BLOCKED evidence. Ask for explicit authorization before pushing `dev` or triggering GitHub Actions. Production remains a separate authorization and acceptance step after an exact-SHA dev deployment.
