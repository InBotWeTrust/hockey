# Achievements Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current binary profile achievements with a full task catalogue, manual reward claiming, admin-managed rewards, Sections catalogue UI, Profile claimed-only display, and generated artwork assets.

**Architecture:** Implement this as four PR-sized phases: data/claim foundation, event evaluators, player UI, then admin/assets. Server owns all completion and claiming; web only renders returned state and calls claim. Existing `lifetime_goals_total` is already daily-only, so Amateur unlock can keep using that field with the configured threshold changed to 300.

**Tech Stack:** Fastify 4, PostgreSQL raw SQL migrations, Vitest, React 18, Vite, TanStack Query, Zustand, Pixi game routes, existing admin screen patterns, WebP assets under `packages/web/public`.

---

## Scope Check

This spec spans several independent surfaces: database, server evaluator, claim economy, player UI, admin UI, and asset generation. Execute it as separate commits, preferably separate PRs if schedule allows:

1. Foundation: migration, DTOs, list/claim API, profile/public filtering.
2. Evaluators: daily, training, duel, payment completion logic.
3. Player UI: Sections entry, Achievements screen, badge, claim modal, Profile claimed-only.
4. Admin and assets: admin CRUD, atlas slicing script, generated images.

Do not try to land all evaluator rules before the claim/list foundation is stable.

## File Structure

Create:

- `packages/server/db/migrations/045_achievements_rework.sql` - catalogue/state/reward/progress migration.
- `packages/server/src/achievements/catalog.ts` - typed achievement ids, categories, availability values, seed rows.
- `packages/server/src/achievements/progress.ts` - progress upsert/get helpers.
- `packages/server/src/achievements/engine.ts` - event-driven achievement completion.
- `packages/server/src/achievements/routes.ts` - list and claim endpoints.
- `packages/server/test/achievements/claim.test.ts` - claim/reward/idempotency tests.
- `packages/server/test/achievements/engine-daily.test.ts` - daily evaluator tests.
- `packages/server/test/achievements/engine-training.test.ts` - training evaluator tests.
- `packages/server/test/achievements/engine-duel.test.ts` - duel evaluator tests.
- `packages/web/src/api/achievements.ts` - client API and DTO types.
- `packages/web/src/screens/AchievementsScreen.tsx` - full catalogue screen under Sections.
- `packages/web/src/screens/AchievementsScreen.test.tsx` - UI tests.
- `packages/web/scripts/slice-achievement-atlas.mjs` - atlas cropper.
- `packages/web/public/achievements/atlas-source.png` - generated source atlas when assets are produced.

Modify:

- `packages/server/src/app.ts` - register achievement routes.
- `packages/server/src/achievements/service.ts` - replace binary unlock helpers with state-aware helpers.
- `packages/server/src/profile/summary.ts` - claimed-only profile achievements and unclaimed count.
- `packages/server/src/routes/me.ts` - include `experienceBalance`, `unclaimedAchievementsCount`, claimed achievements only.
- `packages/server/src/chat/service.ts` and `packages/server/src/chat/types.ts` - public profiles expose claimed achievements only.
- `packages/server/src/duel/daily/routes.ts` and `packages/server/src/duel/daily/reconcile.ts` - call daily evaluator and remove old `grantAchievements` calls.
- `packages/server/src/duel/training/routes.ts` - call training evaluator and remove old `grantAchievements` calls.
- `packages/server/src/duel/amateur/routes.ts` - snapshot experience and call duel evaluator on settle.
- `packages/server/src/routes/inventory.ts` or future payment callback route - complete `wallet` on paid real payment.
- `packages/server/src/duel/gameSettings.ts` and relevant migrations/tests - default Amateur unlock to 300 daily goals.
- `packages/server/src/admin/routes.ts` - achievement admin list/update endpoints.
- `packages/web/src/app/App.tsx` - route `/achievements`.
- `packages/web/src/screens/SectionsScreen.tsx` - add "Задания" card.
- `packages/web/src/screens/ProfileScreen.tsx`, `packages/web/src/screens/profileSections.tsx`, `packages/web/src/screens/profileTypes.ts` - claimed-only display, status/reward DTOs.
- `packages/web/src/components/BottomNav.tsx` - badge on Sections tab.
- `packages/web/src/admin/api.ts` and `packages/web/src/admin/AdminScreen.tsx` - admin achievement editor.
- `packages/web/src/chat/components/UserProfileSheet.tsx` and `packages/web/src/chat/screens/UserProfileScreen.tsx` - claimed-only DTO compatibility.

---

## Task 1: Foundation Migration And Catalogue

**Files:**
- Create: `packages/server/db/migrations/045_achievements_rework.sql`
- Create: `packages/server/src/achievements/catalog.ts`
- Modify: `packages/server/test/db/migrations.test.ts`

- [ ] **Step 1: Write the migration test expectation**

Add `045_achievements_rework.sql` to the ordered migration name assertion in `packages/server/test/db/migrations.test.ts`.

Add assertions after the table-name checks:

```ts
const achievementColumns = await pool.query<{ column_name: string }>(
  `select column_name
     from information_schema.columns
    where table_schema = 'public' and table_name = 'achievements'
    order by column_name`,
);
expect(achievementColumns.rows.map((row) => row.column_name)).toEqual(
  expect.arrayContaining([
    'availability',
    'category',
    'future_tag',
    'reward_currency',
    'reward_experience',
    'reward_stars',
    'updated_at',
  ]),
);

const userAchievementColumns = await pool.query<{ column_name: string }>(
  `select column_name
     from information_schema.columns
    where table_schema = 'public' and table_name = 'user_achievements'
    order by column_name`,
);
expect(userAchievementColumns.rows.map((row) => row.column_name)).toEqual(
  expect.arrayContaining(['claimed_at', 'completed_at', 'completion_context']),
);

const progressTable = await pool.query<{ table_name: string }>(
  `select table_name
     from information_schema.tables
    where table_schema = 'public' and table_name = 'achievement_progress'`,
);
expect(progressTable.rowCount).toBe(1);
```

- [ ] **Step 2: Run migration test and verify it fails**

Run:

```bash
pnpm --filter @hockey/server test -- test/db/migrations.test.ts
```

Expected: FAIL because migration `045_achievements_rework.sql` and new columns do not exist.

- [ ] **Step 3: Add catalogue constants**

Create `packages/server/src/achievements/catalog.ts`:

```ts
export const ACHIEVEMENT_CATEGORIES = [
  'daily',
  'training',
  'duel',
  'tournament',
  'shop',
  'rating',
  'level',
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const ACHIEVEMENT_AVAILABILITIES = ['active', 'future', 'hidden'] as const;
export type AchievementAvailability = (typeof ACHIEVEMENT_AVAILABILITIES)[number];

export const ACHIEVEMENT_FUTURE_TAGS = [
  'future/pro',
  'future/tournament',
  'future/monthly_rating',
] as const;

export type AchievementFutureTag = (typeof ACHIEVEMENT_FUTURE_TAGS)[number];

export interface AchievementSeed {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category: AchievementCategory;
  availability: AchievementAvailability;
  futureTag: AchievementFutureTag | null;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  sortOrder: number;
}

export const ACHIEVEMENT_SEEDS: AchievementSeed[] = [
  {
    id: 'ideal-day',
    photoUrl: '/achievements/ideal-day.webp',
    title: 'Идеальный день',
    description: 'День, когда каждая шайба нашла сетку.',
    requirement: 'Завершить ежедневную игру 90/90 и тренировку 50/50 в один день.',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 500,
    rewardStars: 5,
    rewardExperience: 250,
    sortOrder: 10,
  },
  {
    id: 'first-goal',
    photoUrl: '/achievements/first-goal.webp',
    title: 'Первая шайба',
    description: 'Первый гол всегда самый громкий.',
    requirement: 'Забросить первую шайбу в игре.',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 50,
    rewardStars: 1,
    rewardExperience: 25,
    sortOrder: 20,
  },
  {
    id: 'first-daily-game',
    photoUrl: '/achievements/first-daily-game.webp',
    title: 'С почином',
    description: 'Первый полный игровой день позади.',
    requirement: 'Завершить первую ежедневную игру.',
    category: 'daily',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 100,
    rewardStars: 1,
    rewardExperience: 50,
    sortOrder: 30,
  },
  {
    id: 'first-training',
    photoUrl: '/achievements/first-training.webp',
    title: 'Начало положено',
    description: 'Тренировочный лед уже знаком.',
    requirement: 'Завершить первую тренировку.',
    category: 'training',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 100,
    rewardStars: 1,
    rewardExperience: 50,
    sortOrder: 40,
  },
  {
    id: 'amateur-ticket',
    photoUrl: '/achievements/amateur-ticket.webp',
    title: 'Билет в Любители',
    description: 'Пора выходить к живым соперникам.',
    requirement: 'Открыть раздел Любители.',
    category: 'level',
    availability: 'active',
    futureTag: null,
    rewardCurrency: 300,
    rewardStars: 3,
    rewardExperience: 150,
    sortOrder: 50,
  },
  {
    id: 'pro-ticket',
    photoUrl: '/achievements/pro-ticket.webp',
    title: 'Билет в Про',
    description: 'Профессиональная арена ждет своего часа.',
    requirement: 'Открыть раздел Профессионалы.',
    category: 'level',
    availability: 'future',
    futureTag: 'future/pro',
    rewardCurrency: 0,
    rewardStars: 0,
    rewardExperience: 0,
    sortOrder: 60,
  },
];
```

Then complete the array with every row from `docs/superpowers/specs/2026-05-31-achievements-rework-design.md`. Use these default rewards unless product overrides them later:

```ts
const DEFAULT_REWARD_BY_CATEGORY = {
  daily: { rewardCurrency: 150, rewardStars: 1, rewardExperience: 75 },
  training: { rewardCurrency: 120, rewardStars: 1, rewardExperience: 60 },
  duel: { rewardCurrency: 250, rewardStars: 2, rewardExperience: 120 },
  tournament: { rewardCurrency: 0, rewardStars: 0, rewardExperience: 0 },
  shop: { rewardCurrency: 100, rewardStars: 1, rewardExperience: 50 },
  rating: { rewardCurrency: 0, rewardStars: 0, rewardExperience: 0 },
  level: { rewardCurrency: 300, rewardStars: 3, rewardExperience: 150 },
} satisfies Record<AchievementCategory, Pick<AchievementSeed, 'rewardCurrency' | 'rewardStars' | 'rewardExperience'>>;
```

- [ ] **Step 4: Add migration**

Create `packages/server/db/migrations/045_achievements_rework.sql`:

```sql
alter table users
  add column if not exists experience int not null default 0 check (experience >= 0);

alter table achievements
  add column if not exists category text not null default 'daily',
  add column if not exists availability text not null default 'active',
  add column if not exists future_tag text,
  add column if not exists reward_currency int not null default 0 check (reward_currency >= 0),
  add column if not exists reward_stars int not null default 0 check (reward_stars >= 0),
  add column if not exists reward_experience int not null default 0 check (reward_experience >= 0),
  add column if not exists updated_at timestamptz not null default now();

alter table achievements
  drop constraint if exists achievements_category_check,
  add constraint achievements_category_check
    check (category in ('daily', 'training', 'duel', 'tournament', 'shop', 'rating', 'level')),
  drop constraint if exists achievements_availability_check,
  add constraint achievements_availability_check
    check (availability in ('active', 'future', 'hidden')),
  drop constraint if exists achievements_future_tag_check,
  add constraint achievements_future_tag_check
    check (future_tag is null or future_tag in ('future/pro', 'future/tournament', 'future/monthly_rating'));

alter table user_achievements
  rename column unlocked_at to completed_at;

alter table user_achievements
  add column if not exists claimed_at timestamptz,
  add column if not exists completion_context jsonb not null default '{}'::jsonb;

update user_achievements
   set claimed_at = coalesce(claimed_at, completed_at)
 where claimed_at is null;

create table achievement_progress (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index achievement_progress_updated_idx
  on achievement_progress (updated_at desc);

update achievements
   set availability = 'hidden',
       sort_order = sort_order + 10000,
       updated_at = now();
```

Append an `insert into achievements (...) values ... on conflict (id) do update` generated from `ACHIEVEMENT_SEEDS`. Keep IDs stable and include all active/future achievements from the spec.

After inserting the new catalogue, migrate the old `first-game` user rows into `first-daily-game` without losing claimed state:

```sql
insert into user_achievements
  (user_id, achievement_id, completed_at, claimed_at, completion_context)
select user_id, 'first-daily-game', completed_at, claimed_at, completion_context
  from user_achievements
 where achievement_id = 'first-game'
on conflict (user_id, achievement_id) do update
   set completed_at = least(user_achievements.completed_at, excluded.completed_at),
       claimed_at = coalesce(user_achievements.claimed_at, excluded.claimed_at),
       completion_context = user_achievements.completion_context || excluded.completion_context;

delete from user_achievements where achievement_id = 'first-game';
```

Keep obsolete catalogue rows such as old `sniper-hand` hidden instead of deleting them, so migration never cascades away historical rows unexpectedly.

- [ ] **Step 5: Run migration test**

Run:

```bash
pnpm --filter @hockey/server test -- test/db/migrations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/db/migrations/045_achievements_rework.sql packages/server/src/achievements/catalog.ts packages/server/test/db/migrations.test.ts
git commit -m "feat(server): add achievement catalogue schema"
```

---

## Task 2: State-Aware Achievement Service And Claim API

**Files:**
- Modify: `packages/server/src/achievements/service.ts`
- Create: `packages/server/src/achievements/routes.ts`
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/test/achievements/claim.test.ts`

- [ ] **Step 1: Write claim tests**

Create `packages/server/test/achievements/claim.test.ts` with these cases:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createTestUser, issueTestToken } from '../helpers/auth.js';
import { resetDb, testPool } from '../helpers/testDb.js';

describe('achievement claim routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
  });

  it('claims a completed achievement once and grants configured rewards', async () => {
    const userId = await createTestUser(testPool);
    const token = issueTestToken(userId);
    await testPool.query(
      `update achievements
          set reward_currency = 12, reward_stars = 3, reward_experience = 40
        where id = 'first-goal'`,
    );
    await testPool.query(
      `insert into user_achievements (user_id, achievement_id, completed_at)
       values ($1, 'first-goal', now())`,
      [userId],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/achievements/first-goal/claim',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      achievement: { id: 'first-goal', status: 'claimed' },
      balances: { currencyBalance: 12, starBalance: 3, experienceBalance: 40 },
      rewards: { currency: 12, stars: 3, experience: 40 },
    });

    const again = await app.inject({
      method: 'POST',
      url: '/achievements/first-goal/claim',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(again.statusCode).toBe(409);

    const userRows = await testPool.query<{ xp: number; experience: number }>(
      `select xp, experience from users where id = $1`,
      [userId],
    );
    expect(userRows.rows[0]).toMatchObject({ xp: 3, experience: 40 });
  });

  it('lists active and future achievements with status and unclaimed count', async () => {
    const userId = await createTestUser(testPool);
    const token = issueTestToken(userId);
    await testPool.query(
      `insert into user_achievements (user_id, achievement_id, completed_at)
       values ($1, 'first-goal', now())`,
      [userId],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/achievements',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unclaimedCount).toBe(1);
    expect(body.achievements.find((a: { id: string }) => a.id === 'first-goal')).toMatchObject({
      status: 'completed_unclaimed',
      isClaimable: true,
    });
    expect(body.achievements.find((a: { id: string }) => a.id === 'pro-ticket')).toMatchObject({
      availability: 'future',
      futureTag: 'future/pro',
      status: 'locked',
    });
  });
});
```

If helper names differ, adapt imports to the existing server test helpers, but keep the assertions exactly equivalent.

- [ ] **Step 2: Run claim tests and verify they fail**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/claim.test.ts
```

Expected: FAIL because `/achievements` routes are not registered and service DTOs are still binary.

- [ ] **Step 3: Replace achievement DTOs and helpers**

In `packages/server/src/achievements/service.ts`, define:

```ts
export type AchievementStatus = 'locked' | 'completed_unclaimed' | 'claimed';
export type AchievementAvailability = 'active' | 'future' | 'hidden';

export interface ProfileAchievementDTO {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category: string;
  availability: AchievementAvailability;
  futureTag: string | null;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  status: AchievementStatus;
  isUnlocked: boolean;
  isClaimable: boolean;
  completedAt?: string;
  claimedAt?: string;
}
```

Implement these helpers:

```ts
export async function completeAchievements(
  db: Queryable,
  userId: string,
  achievementIds: string[],
  context: Record<string, unknown> = {},
): Promise<void> {
  if (achievementIds.length === 0) return;
  await db.query(
    `insert into user_achievements (user_id, achievement_id, completed_at, completion_context)
       select $1::uuid, a.id, now(), $3::jsonb
         from achievements a
         join unnest($2::text[]) as completed(id) on completed.id = a.id
        where a.availability = 'active'
      on conflict (user_id, achievement_id) do nothing`,
    [userId, achievementIds, JSON.stringify(context)],
  );
}

export async function fetchAchievementCatalogueForUser(
  db: Queryable,
  userId: string,
  opts: { includeHidden?: boolean; claimedOnly?: boolean } = {},
): Promise<ProfileAchievementDTO[]> {
  const clauses = [opts.includeHidden ? 'true' : `a.availability <> 'hidden'`];
  if (opts.claimedOnly) clauses.push('ua.claimed_at is not null');
  const { rows } = await db.query(
    `select a.id, a.photo_url, a.title, a.description, a.requirement,
            a.category, a.availability, a.future_tag,
            a.reward_currency, a.reward_stars, a.reward_experience,
            ua.completed_at, ua.claimed_at
       from achievements a
       left join user_achievements ua
         on ua.achievement_id = a.id and ua.user_id = $1
      where ${clauses.join(' and ')}
      order by a.sort_order asc`,
    [userId],
  );
  return rows.map(mapAchievementRow);
}
```

Keep `grantAchievements` as a deprecated alias to `completeAchievements` for temporary compatibility:

```ts
export const grantAchievements = completeAchievements;
```

- [ ] **Step 4: Add claim routes**

Create `packages/server/src/achievements/routes.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { fetchAchievementCatalogueForUser } from './service.js';

const paramsSchema = z.object({ achievementId: z.string().min(1).max(120) });

export const achievementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/achievements', { preHandler: [app.authenticate] }, async (req) => {
    const achievements = await fetchAchievementCatalogueForUser(app.pg, req.user.id);
    return {
      achievements,
      unclaimedCount: achievements.filter((achievement) => achievement.status === 'completed_unclaimed').length,
    };
  });

  app.post('/achievements/:achievementId/claim', { preHandler: [app.authenticate] }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid achievement id', 400);

    const client = await app.pg.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{
        achievement_id: string;
        claimed_at: Date | null;
        reward_currency: number;
        reward_stars: number;
        reward_experience: number;
      }>(
        `select ua.achievement_id, ua.claimed_at,
                a.reward_currency, a.reward_stars, a.reward_experience
           from user_achievements ua
           join achievements a on a.id = ua.achievement_id
          where ua.user_id = $1 and ua.achievement_id = $2
          for update`,
        [req.user.id, params.data.achievementId],
      );
      const row = rows[0];
      if (!row) throw new AppError('not_found', 'achievement is not completed', 404);
      if (row.claimed_at !== null) throw new AppError('conflict', 'achievement already claimed', 409);

      await client.query(
        `insert into user_currency_account (user_id) values ($1)
         on conflict do nothing`,
        [req.user.id],
      );
      await client.query(
        `update user_currency_account
            set balance = balance + $2, updated_at = now()
          where user_id = $1`,
        [req.user.id, row.reward_currency],
      );
      await client.query(
        `update users
            set xp = xp + $2,
                experience = experience + $3
          where id = $1`,
        [req.user.id, row.reward_stars, row.reward_experience],
      );
      await client.query(
        `update user_achievements
            set claimed_at = now()
          where user_id = $1 and achievement_id = $2`,
        [req.user.id, params.data.achievementId],
      );
      await client.query('commit');

      const achievements = await fetchAchievementCatalogueForUser(app.pg, req.user.id);
      const claimed = achievements.find((achievement) => achievement.id === params.data.achievementId)!;
      const balances = await app.pg.query<{ currency_balance: number; star_balance: number; experience: number }>(
        `select coalesce(uca.balance, 0)::int as currency_balance,
                u.xp::int as star_balance,
                u.experience::int as experience
           from users u
           left join user_currency_account uca on uca.user_id = u.id
          where u.id = $1`,
        [req.user.id],
      );
      return {
        achievement: claimed,
        rewards: {
          currency: Number(row.reward_currency),
          stars: Number(row.reward_stars),
          experience: Number(row.reward_experience),
        },
        balances: {
          currencyBalance: Number(balances.rows[0]?.currency_balance ?? 0),
          starBalance: Number(balances.rows[0]?.star_balance ?? 0),
          experienceBalance: Number(balances.rows[0]?.experience ?? 0),
        },
        unclaimedCount: achievements.filter((achievement) => achievement.status === 'completed_unclaimed').length,
      };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
};
```

- [ ] **Step 5: Register routes**

In `packages/server/src/app.ts`, import and register:

```ts
import { achievementRoutes } from './achievements/routes.js';
```

Register after auth/db plugins and before admin routes:

```ts
await app.register(achievementRoutes);
```

- [ ] **Step 6: Run claim tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/claim.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/achievements/service.ts packages/server/src/achievements/routes.ts packages/server/src/app.ts packages/server/test/achievements/claim.test.ts
git commit -m "feat(server): add achievement claim API"
```

---

## Task 3: Profile DTOs, Public Profiles, And Badge Count

**Files:**
- Modify: `packages/server/src/profile/summary.ts`
- Modify: `packages/server/src/routes/me.ts`
- Modify: `packages/server/src/chat/service.ts`
- Modify: `packages/server/src/chat/types.ts`
- Modify: `packages/server/test/routes/me.test.ts`
- Modify: `packages/server/test/chat/routes.test.ts`

- [ ] **Step 1: Update route tests**

In `packages/server/test/routes/me.test.ts`, replace expectations that all achievements are returned with:

```ts
expect(fullBody.achievements.every((achievement) => achievement.status === 'claimed')).toBe(true);
expect(fullBody.unclaimedAchievementsCount).toBe(0);
expect(fullBody).toMatchObject({
  experienceBalance: 0,
});
```

Add a case:

```ts
it('reports unclaimed achievement count while profile achievements stay claimed-only', async () => {
  const { userId, token } = await createUserAndToken();
  await pool.query(
    `insert into user_achievements (user_id, achievement_id, completed_at, claimed_at)
     values
       ($1, 'first-goal', now(), null),
       ($1, 'first-training', now(), now())`,
    [userId],
  );

  const res = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: `Bearer ${token}` },
  });

  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.unclaimedAchievementsCount).toBe(1);
  expect(body.achievements.map((achievement: { id: string }) => achievement.id)).toEqual([
    'first-training',
  ]);
});
```

In `packages/server/test/chat/routes.test.ts`, assert public profile achievements do not include unclaimed rows.

- [ ] **Step 2: Run profile tests and verify failure**

Run:

```bash
pnpm --filter @hockey/server test -- test/routes/me.test.ts test/chat/routes.test.ts
```

Expected: FAIL until DTOs change.

- [ ] **Step 3: Update profile summary**

In `packages/server/src/profile/summary.ts`:

- include `experienceBalance` in `ProfileProgressDTO`;
- call `fetchAchievementCatalogueForUser(db, row.id, { claimedOnly: true })`;
- add helper:

```ts
export async function fetchUnclaimedAchievementCount(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::int as count
       from user_achievements
      where user_id = $1 and claimed_at is null`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}
```

- return `unclaimedAchievementsCount`.

- [ ] **Step 4: Update `/me`**

In `packages/server/src/routes/me.ts`:

- select `u.experience`;
- return `experienceBalance: Number(row.experience)`;
- return `unclaimedAchievementsCount: profileProgress.unclaimedAchievementsCount`.

Keep `starBalance` mapped to `users.xp`.

- [ ] **Step 5: Update public profile DTOs**

In `packages/server/src/chat/service.ts`, make public profile building call claimed-only achievements. Ensure `packages/server/src/chat/types.ts` keeps compatibility but includes the new achievement fields as optional/required consistently.

- [ ] **Step 6: Run profile tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/routes/me.test.ts test/chat/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/profile/summary.ts packages/server/src/routes/me.ts packages/server/src/chat/service.ts packages/server/src/chat/types.ts packages/server/test/routes/me.test.ts packages/server/test/chat/routes.test.ts
git commit -m "feat(server): expose claimed achievements and badge count"
```

---

## Task 4: Achievement Progress Helpers And Engine Skeleton

**Files:**
- Create: `packages/server/src/achievements/progress.ts`
- Create: `packages/server/src/achievements/engine.ts`
- Create: `packages/server/test/achievements/engine-progress.test.ts`

- [ ] **Step 1: Write progress helper tests**

Create `packages/server/test/achievements/engine-progress.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getAchievementProgress, setAchievementProgress } from '../../src/achievements/progress.js';
import { createTestUser } from '../helpers/auth.js';
import { resetDb, testPool } from '../helpers/testDb.js';

describe('achievement progress helpers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('upserts and reads json progress', async () => {
    const userId = await createTestUser(testPool);
    await setAchievementProgress(testPool, userId, 'duel_win_streak', { wins: 2 });
    await setAchievementProgress(testPool, userId, 'duel_win_streak', { wins: 3 });

    await expect(getAchievementProgress<{ wins: number }>(testPool, userId, 'duel_win_streak')).resolves.toEqual({
      wins: 3,
    });
  });
});
```

- [ ] **Step 2: Run progress tests and verify failure**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-progress.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement progress helpers**

Create `packages/server/src/achievements/progress.ts`:

```ts
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export async function getAchievementProgress<T>(
  db: Queryable,
  userId: string,
  key: string,
): Promise<T | null> {
  const { rows } = await db.query<{ state: T }>(
    `select state from achievement_progress where user_id = $1 and key = $2`,
    [userId, key],
  );
  return rows[0]?.state ?? null;
}

export async function setAchievementProgress(
  db: Queryable,
  userId: string,
  key: string,
  state: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into achievement_progress (user_id, key, state, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id, key)
     do update set state = excluded.state, updated_at = now()`,
    [userId, key, JSON.stringify(state)],
  );
}

export async function deleteAchievementProgress(
  db: Queryable,
  userId: string,
  key: string,
): Promise<void> {
  await db.query(`delete from achievement_progress where user_id = $1 and key = $2`, [userId, key]);
}
```

- [ ] **Step 4: Implement engine skeleton**

Create `packages/server/src/achievements/engine.ts` with typed no-op-friendly functions:

```ts
import type { Pool, PoolClient } from 'pg';
import { completeAchievements } from './service.js';

type Queryable = Pool | PoolClient;
type ShotResult = 'goal' | 'save' | 'miss';

export interface AchievementShotEvent {
  userId: string;
  mode: 'daily' | 'training' | 'duel';
  ownerId?: string;
  containerId: string;
  periodNumber: number;
  shotIndex: number;
  result: ShotResult;
}

export async function evaluateShotAchievements(
  db: Queryable,
  event: AchievementShotEvent,
): Promise<void> {
  const ids: string[] = [];
  if (event.result === 'goal') ids.push('first-goal');
  await completeAchievements(db, event.userId, ids, event);
}
```

Later tasks extend this file; this task only establishes the interface and first-goal behavior.

- [ ] **Step 5: Run progress tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-progress.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements/progress.ts packages/server/src/achievements/engine.ts packages/server/test/achievements/engine-progress.test.ts
git commit -m "feat(server): add achievement progress helpers"
```

---

## Task 5: Daily Achievement Evaluator

**Files:**
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/duel/daily/routes.ts`
- Modify: `packages/server/src/duel/daily/reconcile.ts`
- Create: `packages/server/test/achievements/engine-daily.test.ts`

- [ ] **Step 1: Write daily evaluator tests**

Create `packages/server/test/achievements/engine-daily.test.ts` with focused tests that seed `day_pool`, `period_log`, and `shot_session` directly:

```ts
it('completes daily close achievements for 95 percent, equal periods, dry finish, and first daily', async () => {
  const userId = await createTestUser(testPool);
  const dayPoolId = await seedClosedDaily({ userId, goalsByPeriod: [29, 29, 29], results: makeResults(90, 87) });

  await evaluateDailyClosedAchievements(testPool, {
    userId,
    dayPoolId,
    dayDate: '2026-05-31',
    totalPeriods: 3,
    shotsPerPeriod: 30,
  });

  const ids = await completedIds(userId);
  expect(ids).toEqual(expect.arrayContaining(['first-daily-game', 'ice-hand', 'steady-tempo', 'dry-finish']));
});

it('requires third period to be strictly best', async () => {
  const userId = await createTestUser(testPool);
  const dayPoolId = await seedClosedDaily({ userId, goalsByPeriod: [20, 21, 22], results: makeResults(90, 63) });

  await evaluateDailyClosedAchievements(testPool, {
    userId,
    dayPoolId,
    dayDate: '2026-05-31',
    totalPeriods: 3,
    shotsPerPeriod: 30,
  });

  await expect(completedIds(userId)).resolves.toContain('third-period-decides');
});
```

Include helper functions in the test file:

```ts
function makeResults(total: number, goals: number): Array<'goal' | 'save'> {
  return Array.from({ length: total }, (_, index) => (index < goals ? 'goal' : 'save'));
}
```

- [ ] **Step 2: Run daily evaluator tests and verify failure**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-daily.test.ts
```

Expected: FAIL because `evaluateDailyClosedAchievements` does not exist.

- [ ] **Step 3: Implement daily evaluator functions**

In `packages/server/src/achievements/engine.ts`, add:

```ts
export async function evaluateDailyShotAchievements(
  db: Queryable,
  event: { userId: string; dayPoolId: string; periodNumber: number; shotIndex: number; result: ShotResult },
): Promise<void> {
  const completed = new Set<string>();
  if (event.result === 'goal') completed.add('first-goal');

  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'daily' and day_pool_id = $1
      order by period_number asc, shot_index asc`,
    [event.dayPoolId],
  );
  if (hasGoalStreak(rows.map((row) => row.server_result), 25)) completed.add('daily-sniper-streak');
  if (hasNoPanicPattern(rows.map((row) => row.server_result))) completed.add('no-panic');

  await completeAchievements(db, event.userId, [...completed], event);
}

export async function evaluateDailyPeriodClosedAchievements(
  db: Queryable,
  event: { userId: string; dayPoolId: string; periodNumber: number },
): Promise<void> {
  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'daily' and day_pool_id = $1 and period_number = $2
      order by shot_index asc`,
    [event.dayPoolId, event.periodNumber],
  );
  const results = rows.map((row) => row.server_result);
  await completeAchievements(
    db,
    event.userId,
    lastNAllGoals(results, 10) ? ['final-push'] : [],
    event,
  );
}

export async function evaluateDailyClosedAchievements(
  db: Queryable,
  event: { userId: string; dayPoolId: string; dayDate: string; totalPeriods: number; shotsPerPeriod: number },
): Promise<void> {
  const completed = new Set<string>(['first-daily-game']);
  const periods = await fetchDailyPeriods(db, event.dayPoolId);
  const shots = await fetchDailyResults(db, event.dayPoolId);
  const goals = shots.filter((result) => result === 'goal').length;
  const accuracy = shots.length > 0 ? goals / shots.length : 0;

  if (accuracy >= 0.95) completed.add('ice-hand');
  if (event.totalPeriods === 3 && periods.length === 3) {
    const [p1, p2, p3] = periods;
    if (p1.goals >= 20 && p1.goals === p2.goals && p2.goals === p3.goals) completed.add('steady-tempo');
    if (p1.goals >= 20 && p2.goals >= 20 && p3.goals > p1.goals && p3.goals > p2.goals) {
      completed.add('third-period-decides');
    }
  }
  if (lastNAllGoals(shots, 20)) completed.add('dry-finish');
  if (await hasCompletedDailyAccuracyWindow(db, event.userId, 7, 0.5, 'each')) completed.add('keeping-fit');
  if (await hasCompletedDailyAccuracyWindow(db, event.userId, 7, 0.75, 'combined')) completed.add('sniper-week');
  if (await hasCompletedDailyAccuracyWindow(db, event.userId, 30, 0.75, 'combined')) completed.add('sniper-month');
  if (await hasIdealDay(db, event.userId, event.dayDate)) completed.add('ideal-day');
  if (await hasReachedAmateurGoalThreshold(db, event.userId)) completed.add('amateur-ticket');

  await completeAchievements(db, event.userId, [...completed], event);
}
```

Add local pure helpers `hasGoalStreak`, `hasNoPanicPattern`, `lastNAllGoals`, `fetchDailyPeriods`, `fetchDailyResults`, `hasCompletedDailyAccuracyWindow`, `hasIdealDay`, `hasReachedAmateurGoalThreshold`.

- [ ] **Step 4: Wire daily routes**

In `packages/server/src/duel/daily/routes.ts`:

- replace `grantAchievements` import with evaluator imports;
- after inserting each shot, call `evaluateDailyShotAchievements`;
- after inserting `period_log`, call `evaluateDailyPeriodClosedAchievements`;
- after final day close, call `evaluateDailyClosedAchievements`;
- remove old `sniper-hand` and `first-game` IDs.

In `packages/server/src/duel/daily/reconcile.ts`, when lazy reconciliation closes periods/day, call the same evaluator functions after `period_log` inserts. This prevents timeout/day-end closes from missing achievements.

- [ ] **Step 5: Run daily tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-daily.test.ts test/duel/daily.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements/engine.ts packages/server/src/duel/daily/routes.ts packages/server/src/duel/daily/reconcile.ts packages/server/test/achievements/engine-daily.test.ts
git commit -m "feat(server): evaluate daily achievements"
```

---

## Task 6: Training Achievement Evaluator

**Files:**
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/duel/training/routes.ts`
- Create: `packages/server/test/achievements/engine-training.test.ts`

- [ ] **Step 1: Write training tests**

Create tests for:

- first 20 goals grants `no-warmup-needed`;
- 30 consecutive goals grants `rhythm-control`;
- last 20 by actual `shots_limit` grants `finish-machine`;
- exact 50 with 45/49 goals grants `training-monster`/`almost-perfect-training`;
- 5 trainings in a row with `40+` out of exactly 50 grants `stable-student`.

Use direct SQL fixtures and call:

```ts
await evaluateTrainingClosedAchievements(testPool, {
  userId,
  trainingSessionId,
  dayDate: '2026-05-31',
  shotsLimit: 50,
});
```

- [ ] **Step 2: Run training tests and verify failure**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-training.test.ts
```

Expected: FAIL because training evaluator does not exist.

- [ ] **Step 3: Implement training evaluator**

Add to `engine.ts`:

```ts
export async function evaluateTrainingClosedAchievements(
  db: Queryable,
  event: { userId: string; trainingSessionId: string; dayDate: string; shotsLimit: number },
): Promise<void> {
  const results = await fetchTrainingResults(db, event.trainingSessionId);
  const goals = results.filter((result) => result === 'goal').length;
  const completed = new Set<string>(['first-training']);

  if (event.shotsLimit === 50 && goals >= 45) completed.add('training-monster');
  if (event.shotsLimit === 50 && goals === 49) completed.add('almost-perfect-training');
  if (hasGoalStreak(results, 30)) completed.add('rhythm-control');
  if (firstNAllGoals(results, 20)) completed.add('no-warmup-needed');
  if (event.shotsLimit >= 20 && lastNAllGoals(results, 20)) completed.add('finish-machine');
  if (event.shotsLimit === 50 && goals >= 40) {
    const progress = await incrementTraining40Of50Streak(db, event.userId);
    if (progress >= 5) completed.add('stable-student');
  } else {
    await setAchievementProgress(db, event.userId, 'training_40_of_50_streak', { count: 0 });
  }
  if (await hasIdealDay(db, event.userId, event.dayDate)) completed.add('ideal-day');
  await setAchievementProgress(db, event.userId, 'training_before_duel_pending', {
    trainingSessionId: event.trainingSessionId,
    dayDate: event.dayDate,
  });

  await completeAchievements(db, event.userId, [...completed], event);
}
```

- [ ] **Step 4: Wire training route**

In `packages/server/src/duel/training/routes.ts`, after training closes:

```ts
await evaluateTrainingClosedAchievements(client, {
  userId: req.user.id,
  trainingSessionId: session.id,
  dayDate: session.day_date,
  shotsLimit: settings.training.shotsLimit,
});
```

Remove old `grantAchievements(client, req.user.id, ['first-training'])`.

- [ ] **Step 5: Run training tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-training.test.ts test/duel/training.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/achievements/engine.ts packages/server/src/duel/training/routes.ts packages/server/test/achievements/engine-training.test.ts
git commit -m "feat(server): evaluate training achievements"
```

---

## Task 7: Duel Achievement Evaluator

**Files:**
- Modify: `packages/server/src/achievements/engine.ts`
- Modify: `packages/server/src/duel/amateur/routes.ts`
- Create: `packages/server/test/achievements/engine-duel.test.ts`

- [ ] **Step 1: Write duel tests**

Create tests for these settle-time cases:

- win by exactly 1 grants `nervous-finish`;
- win by exactly 2 grants `thin-edge`;
- win by 20+ grants `blowout`;
- win with `shots - goals <= 5` grants `no-room-for-error`;
- classic win with every period won grants `clean-win`;
- challenger/opponent role streaks grant `dangerous-host`/`dangerous-guest`;
- immediate win against last-loss opponent grants `revenge`;
- opponent completed earlier grants `handled-pressure`;
- three purchased non-default slots in every played period grants `master-arsenal`;
- 10 wins without inventory grants `economical-master`.

Call:

```ts
await evaluateDuelSettledAchievements(testPool, {
  matchId,
  winnerUserId: userA,
});
```

- [ ] **Step 2: Run duel tests and verify failure**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-duel.test.ts
```

Expected: FAIL because duel evaluator does not exist.

- [ ] **Step 3: Snapshot participant experience**

In `packages/server/src/duel/amateur/routes.ts`, extend accepted match participant/rules snapshot handling to store user experience at accept time. If adding columns is simpler, add them in migration:

```sql
alter table amateur_duel_participant
  add column if not exists experience_snapshot int not null default 0;
```

On accept/ready transition, set `experience_snapshot` from `users.experience`. Use this for `underdog`.

- [ ] **Step 4: Implement duel evaluator**

Add to `engine.ts`:

```ts
export async function evaluateDuelSettledAchievements(
  db: Queryable,
  event: { matchId: string; winnerUserId: string | null },
): Promise<void> {
  if (event.winnerUserId === null) {
    await updateDuelLossDrawProgress(db, event.matchId);
    return;
  }

  const ctx = await fetchDuelAchievementContext(db, event.matchId, event.winnerUserId);
  const completed = new Set<string>();
  const margin = ctx.mine.goals - ctx.other.goals;

  if (margin === 1) completed.add('nervous-finish');
  if (margin === 2) completed.add('thin-edge');
  if (margin >= 20) completed.add('blowout');
  if (ctx.mine.shotsTaken - ctx.mine.goals <= 5) completed.add('no-room-for-error');
  if (ctx.other.experienceSnapshot >= 100 && ctx.other.experienceSnapshot > ctx.mine.experienceSnapshot) {
    completed.add('underdog');
  }
  if (ctx.other.completedAt !== null && ctx.mine.completedAt !== null && ctx.other.completedAt < ctx.mine.completedAt) {
    completed.add('handled-pressure');
  }
  if (ctx.duelKind === 'classic' && ctx.periods.every((period) => period.mineGoals > period.otherGoals)) {
    completed.add('clean-win');
  }
  if (ctx.duelKind === 'classic' && ctx.periods.some((period) => period.durationMs <= 90_000 && period.mineGoals / Math.max(1, period.mineShots) >= 0.85)) {
    completed.add('classic-speed');
  }
  if (ctx.firstTwentyResults.length >= 20 && ctx.firstTwentyResults.every((result) => result === 'goal')) {
    completed.add('cold-start');
  }
  if (ctx.periodResults.some((results) => lastNAllGoals(results, 10))) completed.add('final-push');
  if (ctx.periodResults.some(hasNoPanicPattern)) completed.add('no-panic');
  if (await updateDuelWinStreak(db, ctx)) completed.add('hunter-streak');
  if (await updateRoleStreak(db, ctx, 'challenger')) completed.add('dangerous-host');
  if (await updateRoleStreak(db, ctx, 'opponent')) completed.add('dangerous-guest');
  if (await isImmediateRevenge(db, ctx)) completed.add('revenge');
  if (await updateEconomicalWins(db, ctx)) completed.add('economical-master');
  if (hasFullPurchasedLoadoutEveryPeriod(ctx)) completed.add('master-arsenal');
  if (await resolveTrainingBeforeBattle(db, ctx)) completed.add('training-before-battle');

  await completeAchievements(db, event.winnerUserId, [...completed], ctx);
  await updateLastLossProgressForLoser(db, ctx);
}
```

Keep helper functions private in `engine.ts` unless they become too large; then split to `duelRules.ts`.

- [ ] **Step 5: Wire settle route**

In `packages/server/src/duel/amateur/routes.ts`, after match settlement and rewards:

```ts
await evaluateDuelSettledAchievements(client, {
  matchId: match.id,
  winnerUserId,
});
```

- [ ] **Step 6: Run duel tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/achievements/engine-duel.test.ts test/duel/amateur.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/achievements/engine.ts packages/server/src/duel/amateur/routes.ts packages/server/test/achievements/engine-duel.test.ts
git commit -m "feat(server): evaluate duel achievements"
```

---

## Task 8: Amateur Unlock Threshold And Compatibility Tests

**Files:**
- Modify: `packages/server/src/duel/gameSettings.ts`
- Modify: relevant settings migration if one seeds `amateur.unlockGoalsRequired`
- Modify: `packages/server/test/duel/amateur.test.ts`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`

- [ ] **Step 1: Update tests**

In `packages/server/test/duel/amateur.test.ts`, change unlock setup/expectations from 1000 to 300 where they rely on defaults:

```ts
expect(state.amateur_unlock_goals_required).toBe(300);
```

Add a test proving training goals do not unlock amateurs. Existing `training.test.ts` already asserts lifetime totals stay zero after training; keep that as supporting coverage.

- [ ] **Step 2: Change default setting**

In `packages/server/src/duel/gameSettings.ts`, set default amateur unlock goal count to 300. If the value is seeded in DB migrations, add a new migration updating the setting key to `300` without breaking custom production override semantics.

- [ ] **Step 3: Update web fallback**

In `packages/web/src/screens/SectionsScreen.tsx`, change:

```ts
const DEFAULT_AMATEUR_UNLOCK_GOALS_REQUIRED = 300;
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/duel/amateur.test.ts test/duel/training.test.ts
pnpm --filter @hockey/web test -- src/screens/SectionsScreen.test.tsx
```

Expected: PASS. If `SectionsScreen.test.tsx` does not exist, add one that asserts the locked copy mentions `300`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/duel/gameSettings.ts packages/server/test/duel/amateur.test.ts packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
git commit -m "feat: set amateur unlock to daily 300 goals"
```

---

## Task 9: Player Achievement API Client And Screen

**Files:**
- Create: `packages/web/src/api/achievements.ts`
- Create: `packages/web/src/screens/AchievementsScreen.tsx`
- Create: `packages/web/src/screens/AchievementsScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`

- [ ] **Step 1: Write UI tests**

Create `packages/web/src/screens/AchievementsScreen.test.tsx`:

```tsx
it('renders achievement filters and claimable state', async () => {
  mockApi('/api/achievements', {
    unclaimedCount: 1,
    achievements: [
      achievementFixture({ id: 'first-goal', title: 'Первая шайба', status: 'completed_unclaimed' }),
      achievementFixture({ id: 'pro-ticket', title: 'Билет в Про', availability: 'future', futureTag: 'future/pro' }),
    ],
  });

  renderWithRouter(<AchievementsScreen />);

  expect(await screen.findByText('Задания')).toBeInTheDocument();
  expect(screen.getByText('Первая шайба')).toBeInTheDocument();
  expect(screen.getByText('Забрать')).toBeInTheDocument();
  expect(screen.getByText('Скоро')).toBeInTheDocument();
});
```

Add a second test for claim:

```tsx
it('claims an achievement and shows reward feedback', async () => {
  mockApi('/api/achievements', listWithClaimableFirstGoal);
  mockApi('/api/achievements/first-goal/claim', claimFirstGoalResponse, { method: 'POST' });

  renderWithRouter(<AchievementsScreen />);
  await user.click(await screen.findByRole('button', { name: /Первая шайба/i }));
  await user.click(screen.getByRole('button', { name: 'Забрать' }));

  expect(await screen.findByText('+12 монет')).toBeInTheDocument();
  expect(screen.getByText('+3 звезды')).toBeInTheDocument();
  expect(screen.getByText('+40 опыта')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```bash
pnpm --filter @hockey/web test -- src/screens/AchievementsScreen.test.tsx
```

Expected: FAIL because screen/API do not exist.

- [ ] **Step 3: Add web API**

Create `packages/web/src/api/achievements.ts`:

```ts
import { apiFetch } from './apiFetch.js';

export type AchievementStatus = 'locked' | 'completed_unclaimed' | 'claimed';
export type AchievementAvailability = 'active' | 'future' | 'hidden';

export interface AchievementDTO {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category: 'daily' | 'training' | 'duel' | 'tournament' | 'shop' | 'rating' | 'level';
  availability: AchievementAvailability;
  futureTag: string | null;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  status: AchievementStatus;
  isUnlocked: boolean;
  isClaimable: boolean;
  completedAt?: string;
  claimedAt?: string;
}

export interface AchievementListResponse {
  achievements: AchievementDTO[];
  unclaimedCount: number;
}

export interface ClaimAchievementResponse {
  achievement: AchievementDTO;
  rewards: { currency: number; stars: number; experience: number };
  balances: { currencyBalance: number; starBalance: number; experienceBalance: number };
  unclaimedCount: number;
}

export function fetchAchievements(): Promise<AchievementListResponse> {
  return apiFetch<AchievementListResponse>('/achievements');
}

export function claimAchievement(id: string): Promise<ClaimAchievementResponse> {
  return apiFetch<ClaimAchievementResponse>(`/achievements/${id}/claim`, { method: 'POST' });
}
```

- [ ] **Step 4: Implement screen**

Create `AchievementsScreen.tsx`:

- full-screen scroll layout;
- segmented filter buttons;
- grid/list of tiles;
- standard modal classes for claim;
- no icons inside text CTA buttons;
- render future as grayscale and `Скоро`.

Use `useQuery({ queryKey: ['achievements'], queryFn: fetchAchievements })` and `useMutation({ mutationFn: claimAchievement })`.

- [ ] **Step 5: Add route and Section card**

In `App.tsx`, lazy-load and route:

```tsx
const AchievementsScreen = lazy(() =>
  import('../screens/AchievementsScreen.js').then((module) => ({ default: module.AchievementsScreen })),
);
```

Add:

```tsx
<Route
  path="/achievements"
  element={
    <PrivateRoute>
      <AchievementsScreen />
    </PrivateRoute>
  }
/>
```

In `SectionsScreen.tsx`, add `achievements: '/achievements/first-goal.webp'` artwork and a `SectionCard`:

```tsx
<SectionCard
  title="Задания"
  description="Цели, награды и будущие испытания"
  meta="Забери выполненные награды"
  tone="active"
  artworkSrc={SECTION_ARTWORK.achievements}
  onClick={() => navigate('/achievements')}
/>
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/screens/AchievementsScreen.test.tsx src/screens/SectionsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/api/achievements.ts packages/web/src/screens/AchievementsScreen.tsx packages/web/src/screens/AchievementsScreen.test.tsx packages/web/src/app/App.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
git commit -m "feat(web): add achievements catalogue screen"
```

---

## Task 10: Bottom Nav Badge And Profile Claimed-Only UI

**Files:**
- Modify: `packages/web/src/components/BottomNav.tsx`
- Modify: `packages/web/src/components/BottomNav.test.tsx`
- Modify: `packages/web/src/screens/profileTypes.ts`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`
- Modify: `packages/web/src/screens/profileSections.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.test.tsx`

- [ ] **Step 1: Update web types**

In `profileTypes.ts`, extend `ProfileAchievement` with the new fields from `AchievementDTO`, keeping `isUnlocked` for compatibility:

```ts
status: 'locked' | 'completed_unclaimed' | 'claimed';
availability: 'active' | 'future' | 'hidden';
futureTag: string | null;
rewardCurrency: number;
rewardStars: number;
rewardExperience: number;
isClaimable: boolean;
completedAt?: string;
claimedAt?: string;
```

Add to `ProfileData`:

```ts
unclaimedAchievementsCount?: number;
experienceBalance?: number;
```

- [ ] **Step 2: Update BottomNav tests**

In `BottomNav.test.tsx`, mock `/api/me` or `/api/achievements` so `unclaimedAchievementsCount = 2`, then assert Sections tab badge:

```ts
expect(screen.getByLabelText('Незабранные задания: 2')).toBeInTheDocument();
```

- [ ] **Step 3: Implement badge**

In `BottomNav.tsx`, fetch `/me` already happens as `me-role`; expand the query to use `unclaimedAchievementsCount`, or add a light `fetchAchievements` query with `select`. Put badge on `Package` icon for "Разделы":

```tsx
{!isDemo && unclaimedAchievementsCount > 0 && (
  <span aria-label={`Незабранные задания: ${unclaimedAchievementsCount}`} style={badgeStyle}>
    {unclaimedAchievementsCount > 9 ? '9+' : unclaimedAchievementsCount}
  </span>
)}
```

Reuse the existing red badge style from game/chat badges.

- [ ] **Step 4: Update Profile tests**

Assert Profile only renders claimed achievements from mocked `/me`. Include an unclaimed count prompt:

```ts
expect(screen.getByText('Полученные задания (1)')).toBeInTheDocument();
expect(screen.queryByText('Билет в Про')).not.toBeInTheDocument();
expect(screen.getByText('Есть награды: 2')).toBeInTheDocument();
```

- [ ] **Step 5: Implement Profile claimed-only copy**

In `profileSections.tsx`, change section label for Profile context to `Полученные задания`. Easiest path: add prop:

```ts
title?: string;
```

Use `title ?? 'Задания'`.

In `ProfileScreen.tsx`, pass only `data.achievements` from `/me`, which server already filters to claimed. Add a small CTA/accessory when `data.unclaimedAchievementsCount > 0`:

```tsx
<button type="button" className="btn btn--ghost" onClick={() => navigate('/achievements')}>
  Есть награды: {data.unclaimedAchievementsCount}
</button>
```

- [ ] **Step 6: Run web tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/components/BottomNav.test.tsx src/screens/ProfileScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/BottomNav.tsx packages/web/src/components/BottomNav.test.tsx packages/web/src/screens/profileTypes.ts packages/web/src/screens/ProfileScreen.tsx packages/web/src/screens/profileSections.tsx packages/web/src/screens/ProfileScreen.test.tsx
git commit -m "feat(web): show achievement badge and claimed profile tasks"
```

---

## Task 11: Admin Achievement Management

**Files:**
- Modify: `packages/server/src/admin/routes.ts`
- Modify: `packages/server/test/admin/routes.test.ts`
- Modify: `packages/web/src/admin/api.ts`
- Modify: `packages/web/src/admin/AdminScreen.tsx`
- Modify: `packages/web/src/admin/AdminScreen.test.tsx`

- [ ] **Step 1: Write admin route tests**

In `packages/server/test/admin/routes.test.ts`, add:

```ts
it('manages achievement rewards and availability', async () => {
  const { adminToken } = await createAdminFixture();

  const list = await app.inject({
    method: 'GET',
    url: '/admin/achievements?availability=future&futureTag=future/pro',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(list.statusCode).toBe(200);
  expect(list.json().achievements).toEqual([
    expect.objectContaining({ id: 'pro-ticket', availability: 'future', futureTag: 'future/pro' }),
  ]);

  const patch = await app.inject({
    method: 'PATCH',
    url: '/admin/achievements/first-goal',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { rewardCurrency: 99, rewardStars: 2, rewardExperience: 77, availability: 'active' },
  });
  expect(patch.statusCode).toBe(200);
  expect(patch.json().achievement).toMatchObject({
    id: 'first-goal',
    rewardCurrency: 99,
    rewardStars: 2,
    rewardExperience: 77,
  });
});
```

- [ ] **Step 2: Implement admin API**

In `admin/routes.ts`, add schemas:

```ts
const achievementAvailabilitySchema = z.enum(['active', 'future', 'hidden']);
const achievementCategorySchema = z.enum(['daily', 'training', 'duel', 'tournament', 'shop', 'rating', 'level']);
const achievementFutureTagSchema = z.enum(['future/pro', 'future/tournament', 'future/monthly_rating']);
```

Add:

```ts
app.get('/admin/achievements', { preHandler: adminPreHandlers }, async (req) => { ... });
app.patch('/admin/achievements/:achievementId', { preHandler: adminPreHandlers }, async (req) => { ... });
```

Patch body allows:

```ts
{
  title?: string;
  description?: string;
  requirement?: string;
  photoUrl?: string;
  category?: AchievementCategory;
  availability?: AchievementAvailability;
  futureTag?: AchievementFutureTag | null;
  rewardCurrency?: number;
  rewardStars?: number;
  rewardExperience?: number;
  sortOrder?: number;
}
```

- [ ] **Step 3: Write admin UI tests**

In `AdminScreen.test.tsx`, mock `/api/admin/achievements`, open admin achievement panel, edit reward, submit, and assert PATCH payload contains `rewardCurrency`, `rewardStars`, `rewardExperience`.

- [ ] **Step 4: Implement admin UI**

In `admin/api.ts`, add DTOs and functions:

```ts
export function fetchAdminAchievements(query: AdminAchievementQuery): Promise<AdminAchievementListResponse>;
export function patchAdminAchievement(id: string, patch: AdminAchievementPatch): Promise<{ achievement: AdminAchievement }>;
```

In `AdminScreen.tsx`, add an Achievements admin section using existing admin card/form patterns. Keep it dense and operational; no landing-page styling.

- [ ] **Step 5: Run admin tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/admin/routes.test.ts
pnpm --filter @hockey/web test -- src/admin/AdminScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/admin/routes.ts packages/server/test/admin/routes.test.ts packages/web/src/admin/api.ts packages/web/src/admin/AdminScreen.tsx packages/web/src/admin/AdminScreen.test.tsx
git commit -m "feat(admin): manage achievement rewards"
```

---

## Task 12: Payment Completion Hook For Wallet Achievement

**Files:**
- Modify: payment status update code when YooKassa callback exists, or `packages/server/src/admin/routes.ts` for manual payment status changes if that is the current source.
- Modify: `packages/server/test/admin/routes.test.ts` or payment callback tests.

- [ ] **Step 1: Locate paid transition**

Search:

```bash
rg -n "status.*paid|paid_at|provider_payment_id|payments" packages/server/src packages/server/test
```

If there is no real YooKassa callback yet, wire `wallet` completion into the first code path that inserts/updates `payments.status = 'paid'`. Keep a note in the code comment:

```ts
// Real payment callbacks and admin-paid transitions both complete the wallet achievement.
```

- [ ] **Step 2: Add test**

When a payment transitions to `paid`, assert `wallet` is completed_unclaimed:

```ts
const rows = await pool.query(
  `select claimed_at from user_achievements where user_id = $1 and achievement_id = 'wallet'`,
  [userId],
);
expect(rows.rowCount).toBe(1);
expect(rows.rows[0].claimed_at).toBeNull();
```

- [ ] **Step 3: Implement hook**

Import `completeAchievements` or a tiny engine function:

```ts
await completeAchievements(client, userId, ['wallet'], { paymentId, provider: 'yookassa' });
```

Only run when new status is `paid` and `user_id is not null`.

- [ ] **Step 4: Run payment/admin tests**

Run the test file that covers the paid transition.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src packages/server/test
git commit -m "feat(server): complete wallet achievement on paid purchase"
```

---

## Task 13: Asset Atlas Generation And Slicing

**Files:**
- Create: `packages/web/scripts/slice-achievement-atlas.mjs`
- Add: `packages/web/public/achievements/atlas-source.png`
- Add/replace: `packages/web/public/achievements/*.webp`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Generate atlas image**

Use image generation to create one atlas image with 8 columns and enough rows for every achievement in the final catalogue. Prompt constraints:

```text
Create a single 8-column grid of square hockey achievement mini-poster icons, no text, no logos, no letters, consistent mobile game style, ice rink lighting, bold readable silhouettes, each tile distinct, 1024x1024 per tile feel, clean edges for cropping.
```

Save the generated image as:

```text
packages/web/public/achievements/atlas-source.png
```

- [ ] **Step 2: Add slicing script**

Create `packages/web/scripts/slice-achievement-atlas.mjs` using `sharp` if available in workspace dependencies. If `sharp` is not installed, add it to `packages/web/package.json` as a dev dependency only after checking lockfile conventions.

Script behavior:

```js
const ids = [
  'ideal-day',
  'first-goal',
  'first-daily-game',
  'first-training',
  'amateur-ticket',
  'pro-ticket',
  // every remaining id in sort_order
];
```

For each id, extract its grid cell and write:

```text
packages/web/public/achievements/<id>.webp
```

Use 512x512 output per tile.

- [ ] **Step 3: Add package script**

In `packages/web/package.json`:

```json
"achievements:slice": "node scripts/slice-achievement-atlas.mjs"
```

- [ ] **Step 4: Run slicing**

Run:

```bash
pnpm --filter @hockey/web achievements:slice
```

Expected: all `photo_url` filenames from catalogue exist.

- [ ] **Step 5: Verify asset references**

Run:

```bash
node packages/web/scripts/slice-achievement-atlas.mjs --check
```

Expected: exits 0 and prints missing count 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml packages/web/scripts/slice-achievement-atlas.mjs packages/web/public/achievements
git commit -m "feat(web): add achievement artwork assets"
```

---

## Task 14: Full Verification

**Files:**
- No code changes unless verification finds bugs.

- [ ] **Step 1: Build shared game core**

Run:

```bash
pnpm --filter @hockey/game-core build
```

Expected: PASS.

- [ ] **Step 2: Server tests**

Run:

```bash
pnpm --filter @hockey/server test
```

Expected: PASS.

- [ ] **Step 3: Web tests**

Run:

```bash
pnpm --filter @hockey/web test
```

Expected: PASS.

- [ ] **Step 4: Typecheck and lint**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Manual browser smoke**

Start dev servers:

```bash
pnpm dev:server
pnpm dev:web
```

Open Vite URL and verify:

- Sections contains "Задания".
- `/achievements` loads catalogue.
- future achievements are gray and show `Скоро`.
- completed achievement shows red badge and `Забрать`.
- claim updates badge and Profile claimed-only list.
- admin can edit reward values.

- [ ] **Step 6: Commit fixes if needed**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize achievements rework"
```

If no fixes were needed, do not create an empty commit.

---

## Execution Notes

- Do not revert pre-existing dirty files in `packages/web/src/screens/DailyScreen.tsx`, `packages/web/src/screens/DailyScreen.test.tsx`, or the untracked `Icon\r` file unless the user explicitly asks.
- Keep `users.xp` as star balance. Use `users.experience` only for experience.
- Achievement completion is never reward payment. Rewards are paid only by claim.
- Future achievements must be visible to players but not executable.
- Profile and public profiles show claimed achievements only.
- The full catalogue belongs in Sections at `/achievements`.
