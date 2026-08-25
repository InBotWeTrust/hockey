# Weekly Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly challenges with admin-created tasks, opt-in participation, server-authoritative progress, and claimable rewards.

**Architecture:** Add a focused server module under `packages/server/src/weeklyChallenge/` for data access, progress aggregation, reward claiming, and public routes. Keep the large existing admin route file thin by delegating weekly challenge logic to a helper module. Add a dedicated web API file, a new challenge screen, a section card, and a compact admin tab.

**Tech Stack:** Fastify 4, PostgreSQL migrations, zod validation, React 18, TanStack Query, Zustand auth store, Vitest, Testing Library.

**Prerequisite:** star/experience separation is handled in a separate session before this plan is executed. This plan assumes `users.stars` and `users.experience` already exist and that `/me` already exposes the separated balances.

---

## File Structure

Create:
- `packages/server/db/migrations/039_weekly_challenges.sql` — challenge tables, task types, participant rows, and reward claim audit.
- `packages/server/src/weeklyChallenge/types.ts` — shared server DTO and row types for this module.
- `packages/server/src/weeklyChallenge/rewards.ts` — reward account helpers and idempotent reward claim transaction.
- `packages/server/src/weeklyChallenge/progress.ts` — task progress aggregation from `shot_session`, `training_session`, `amateur_duel_match`, `amateur_duel_participant`, and `event_log`.
- `packages/server/src/weeklyChallenge/service.ts` — public and admin use-cases.
- `packages/server/src/weeklyChallenge/routes.ts` — public authenticated API.
- `packages/server/src/weeklyChallenge/admin.ts` — admin route registration helpers called from `admin/routes.ts`.
- `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts` — public API and progress tests.
- `packages/server/test/weeklyChallenge/admin.test.ts` — admin CRUD and activation tests.
- `packages/web/src/api/weeklyChallenge.ts` — client DTOs and API calls.
- `packages/web/src/screens/WeeklyChallengeScreen.tsx` — player-facing challenge page.
- `packages/web/src/screens/WeeklyChallengeScreen.test.tsx` — screen tests.
- `packages/web/src/admin/WeeklyChallengesAdmin.tsx` — admin UI section.
- `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx` — admin UI tests.

Modify:
- `packages/server/src/app.ts` — register public weekly challenge routes.
- `packages/server/src/admin/routes.ts` — mount admin weekly challenge routes through helper.
- `packages/server/src/duel/eventLog.ts` — add event types for weekly challenge joins and rewards.
- `packages/web/src/app/App.tsx` — add `/weekly-challenge` route.
- `packages/web/src/screens/SectionsScreen.tsx` — add section card and status fetch.
- `packages/web/src/admin/api.ts` — add weekly challenge admin types and API functions.
- `packages/web/src/admin/AdminScreen.tsx` — add tab entry and render `WeeklyChallengesAdmin`.

Do not modify or revert the existing dirty files unless this plan is being executed in a clean worktree.

---

## Task 1: Database Schema

**Files:**
- Create: `packages/server/db/migrations/039_weekly_challenges.sql`
- Modify: `packages/server/test/db/migrations.test.ts`

- [ ] **Step 1: Write the migration**

Create `packages/server/db/migrations/039_weekly_challenges.sql`:

```sql
-- Weekly challenges: one active challenge can be shown to players.

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward'
    ));

create table weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '',
  join_open_at timestamptz not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_active boolean not null default false,
  join_enabled boolean not null default true,
  reward_coins int not null default 0 check (reward_coins >= 0),
  reward_stars int not null default 0 check (reward_stars >= 0),
  reward_xp int not null default 0 check (reward_xp >= 0),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (join_open_at <= start_at),
  check (start_at < end_at)
);

create unique index weekly_challenges_one_active_idx
  on weekly_challenges ((is_active))
  where is_active;

create index weekly_challenges_timeline_idx
  on weekly_challenges (start_at desc, end_at desc);

create table weekly_challenge_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  type text not null check (
    type in (
      'goals_scored',
      'duels_played',
      'duels_won',
      'duel_invites_sent',
      'trainings_completed'
    )
  ),
  title text,
  target int not null check (target > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index weekly_challenge_tasks_challenge_idx
  on weekly_challenge_tasks (challenge_id, sort_order, created_at);

create table weekly_challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index weekly_challenge_participants_user_idx
  on weekly_challenge_participants (user_id, joined_at desc);

create table weekly_challenge_reward_claims (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  coins int not null check (coins >= 0),
  stars int not null check (stars >= 0),
  xp int not null check (xp >= 0),
  claimed_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);
```

- [ ] **Step 2: Update migration ordering test**

In `packages/server/test/db/migrations.test.ts`, add the new file name to the expected ordered migration list:

```ts
'039_weekly_challenges.sql',
```

- [ ] **Step 3: Run migration tests**

Run:

```bash
pnpm --filter @hockey/server test -- test/db/migrations.test.ts
```

Expected: PASS. If the migration runner requires a database, use the existing local Postgres/Redis test environment described in `AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/db/migrations/039_weekly_challenges.sql packages/server/test/db/migrations.test.ts
git commit -m "feat: add weekly challenge schema"
```

---

## Task 2: Server Types, Reward Helpers, and Progress Aggregation

**Files:**
- Create: `packages/server/src/weeklyChallenge/types.ts`
- Create: `packages/server/src/weeklyChallenge/rewards.ts`
- Create: `packages/server/src/weeklyChallenge/progress.ts`
- Modify: `packages/server/src/duel/eventLog.ts`
- Test: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`

- [ ] **Step 1: Add server types**

Create `packages/server/src/weeklyChallenge/types.ts`:

```ts
export const WEEKLY_CHALLENGE_TASK_TYPES = [
  'goals_scored',
  'duels_played',
  'duels_won',
  'duel_invites_sent',
  'trainings_completed',
] as const;

export type WeeklyChallengeTaskType = (typeof WEEKLY_CHALLENGE_TASK_TYPES)[number];
export type WeeklyChallengeStatus = 'not_open' | 'join_open' | 'running' | 'finished';

export interface WeeklyChallengeRow {
  id: string;
  title: string;
  description: string;
  join_open_at: Date;
  start_at: Date;
  end_at: Date;
  is_active: boolean;
  join_enabled: boolean;
  reward_coins: number;
  reward_stars: number;
  reward_xp: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WeeklyChallengeTaskRow {
  id: string;
  challenge_id: string;
  type: WeeklyChallengeTaskType;
  title: string | null;
  target: number;
  sort_order: number;
  created_at: Date;
}

export interface WeeklyChallengeParticipantRow {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: Date;
  reward_claimed_at: Date | null;
  created_at: Date;
}

export interface WeeklyChallengeTaskDTO {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string;
  target: number;
  progress: number | null;
  completed: boolean | null;
}

export interface WeeklyChallengeDTO {
  id: string;
  title: string;
  description: string;
  status: WeeklyChallengeStatus;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  joinEnabled: boolean;
  reward: { coins: number; stars: number; xp: number };
  participant: { joinedAt: string; rewardClaimedAt: string | null } | null;
  tasks: WeeklyChallengeTaskDTO[];
  canJoin: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}

export interface WeeklyChallengeCurrentResponse {
  challenge: WeeklyChallengeDTO | null;
}
```

- [ ] **Step 2: Add event types**

Modify `packages/server/src/duel/eventLog.ts` and extend `EventType`:

```ts
  | 'weekly_challenge_joined'
  | 'weekly_challenge_reward_claimed'
```

- [ ] **Step 3: Add reward helpers**

Create `packages/server/src/weeklyChallenge/rewards.ts`:

```ts
import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export interface WeeklyChallengeRewardInput {
  challengeId: string;
  userId: string;
  coins: number;
  stars: number;
  xp: number;
}

export async function grantWeeklyChallengeReward(
  client: PoolClient,
  input: WeeklyChallengeRewardInput,
): Promise<{ claimedAt: Date; balances: { coins: number; stars: number; experience: number } }> {
  const existing = await client.query<{ claimed_at: Date }>(
    `select claimed_at
       from weekly_challenge_reward_claims
      where challenge_id = $1 and user_id = $2`,
    [input.challengeId, input.userId],
  );
  if (existing.rows[0]) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }

  await client.query(`insert into user_currency_account (user_id) values ($1) on conflict do nothing`, [
    input.userId,
  ]);

  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account
        set balance = balance + $2,
            updated_at = now()
      where user_id = $1
      returning balance, reserved_balance`,
    [input.userId, input.coins],
  );
  const balance = account.rows[0];
  if (!balance) throw new AppError('server_error', 'weekly challenge currency account missing', 500);

  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'weekly_challenge_reward', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      input.coins,
      Number(balance.balance),
      Number(balance.reserved_balance),
      JSON.stringify({ challenge_id: input.challengeId, stars: input.stars, xp: input.xp }),
    ],
  );

  const user = await client.query<{ stars: number; experience: number }>(
    `update users
        set stars = stars + $2,
            experience = experience + $3
      where id = $1
      returning stars, experience`,
    [input.userId, input.stars, input.xp],
  );
  const updatedUser = user.rows[0];
  if (!updatedUser) throw new AppError('not_found', 'user not found', 404);

  const claim = await client.query<{ claimed_at: Date }>(
    `insert into weekly_challenge_reward_claims
       (challenge_id, user_id, coins, stars, xp)
     values ($1, $2, $3, $4, $5)
     returning claimed_at`,
    [input.challengeId, input.userId, input.coins, input.stars, input.xp],
  );

  await client.query(
    `update weekly_challenge_participants
        set reward_claimed_at = $3
      where challenge_id = $1 and user_id = $2`,
    [input.challengeId, input.userId, claim.rows[0]!.claimed_at],
  );

  return {
    claimedAt: claim.rows[0]!.claimed_at,
    balances: {
      coins: Number(balance.balance),
      stars: Number(updatedUser.stars),
      experience: Number(updatedUser.experience),
    },
  };
}
```

- [ ] **Step 4: Add progress aggregation**

Create `packages/server/src/weeklyChallenge/progress.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import type { WeeklyChallengeTaskRow, WeeklyChallengeTaskType } from './types.js';

type Queryable = Pool | PoolClient;

export interface ProgressWindow {
  userId: string;
  from: Date;
  to: Date;
}

export type WeeklyChallengeProgressMap = Record<WeeklyChallengeTaskType, number>;

export const EMPTY_WEEKLY_CHALLENGE_PROGRESS: WeeklyChallengeProgressMap = {
  goals_scored: 0,
  duels_played: 0,
  duels_won: 0,
  duel_invites_sent: 0,
  trainings_completed: 0,
};

export async function fetchWeeklyChallengeProgress(
  db: Queryable,
  window: ProgressWindow,
): Promise<WeeklyChallengeProgressMap> {
  const [{ rows: goalRows }, { rows: duelRows }, { rows: inviteRows }, { rows: trainingRows }] =
    await Promise.all([
      db.query<{ goals: string }>(
        `select count(*)::text as goals
           from shot_session
          where user_id = $1
            and server_result = 'goal'
            and created_at >= $2
            and created_at <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ played: string; won: string }>(
        `select
            count(*) filter (where p.state = 'completed')::text as played,
            count(*) filter (where m.winner_user_id = $1)::text as won
           from amateur_duel_participant p
           join amateur_duel_match m on m.id = p.match_id
          where p.user_id = $1
            and m.status = 'settled'
            and coalesce(m.settled_at, m.updated_at) >= $2
            and coalesce(m.settled_at, m.updated_at) <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ invites: string }>(
        `select count(*)::text as invites
           from amateur_duel_match
          where challenger_user_id = $1
            and source = 'challenge'
            and created_at >= $2
            and created_at <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ completed: string }>(
        `select count(*)::text as completed
           from training_session
          where user_id = $1
            and state = 'closed'
            and coalesce(closed_at, started_at) >= $2
            and coalesce(closed_at, started_at) <= $3`,
        [window.userId, window.from, window.to],
      ),
    ]);

  return {
    goals_scored: Number(goalRows[0]?.goals ?? 0),
    duels_played: Number(duelRows[0]?.played ?? 0),
    duels_won: Number(duelRows[0]?.won ?? 0),
    duel_invites_sent: Number(inviteRows[0]?.invites ?? 0),
    trainings_completed: Number(trainingRows[0]?.completed ?? 0),
  };
}

export function isTaskCompleted(
  task: Pick<WeeklyChallengeTaskRow, 'type' | 'target'>,
  progress: WeeklyChallengeProgressMap,
): boolean {
  return progress[task.type] >= task.target;
}
```

- [ ] **Step 5: Write focused progress tests**

Create the first test block in `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_WEEKLY_CHALLENGE_PROGRESS, isTaskCompleted } from '../../src/weeklyChallenge/progress.js';

describe('weekly challenge progress helpers', () => {
  it('marks a task complete only when progress reaches the target', () => {
    expect(isTaskCompleted({ type: 'goals_scored', target: 500 }, {
      ...EMPTY_WEEKLY_CHALLENGE_PROGRESS,
      goals_scored: 499,
    })).toBe(false);
    expect(isTaskCompleted({ type: 'goals_scored', target: 500 }, {
      ...EMPTY_WEEKLY_CHALLENGE_PROGRESS,
      goals_scored: 500,
    })).toBe(true);
  });
});
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
pnpm --filter @hockey/server test -- test/weeklyChallenge/weeklyChallenge.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/weeklyChallenge packages/server/src/duel/eventLog.ts packages/server/test/weeklyChallenge/weeklyChallenge.test.ts
git commit -m "feat: add weekly challenge progress helpers"
```

---

## Task 3: Public Weekly Challenge Service and Routes

**Files:**
- Create: `packages/server/src/weeklyChallenge/service.ts`
- Create: `packages/server/src/weeklyChallenge/routes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`

- [ ] **Step 1: Write route behavior tests**

Extend `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts` with integration tests using existing test setup patterns from `packages/server/test/duel/daily.test.ts`:

```ts
it('returns null when there is no active weekly challenge', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/weekly-challenge/current',
    headers: auth(playerToken),
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ challenge: null });
});

it('lets a player join an active challenge and sees progress from joined_at', async () => {
  const challengeId = await seedWeeklyChallenge({
    title: 'Неделя снайпера',
    joinOpenAt: '2026-06-01T09:00:00.000Z',
    startAt: '2026-06-02T09:00:00.000Z',
    endAt: '2026-06-09T09:00:00.000Z',
    rewardCoins: 100,
    rewardStars: 5,
    rewardXp: 50,
    tasks: [{ type: 'goals_scored', target: 2 }],
  });

  const joined = await app.inject({
    method: 'POST',
    url: `/weekly-challenge/${challengeId}/join`,
    headers: auth(playerToken),
  });
  expect(joined.statusCode).toBe(200);
  expect(joined.json().challenge.participant).toMatchObject({ rewardClaimedAt: null });
});
```

Use helpers in the test file:

```ts
function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
```

- [ ] **Step 2: Implement service state calculation**

Create `packages/server/src/weeklyChallenge/service.ts` with these exported functions:

```ts
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { appendEvent } from '../duel/eventLog.js';
import { fetchWeeklyChallengeProgress, isTaskCompleted } from './progress.js';
import { grantWeeklyChallengeReward } from './rewards.js';
import type {
  WeeklyChallengeCurrentResponse,
  WeeklyChallengeDTO,
  WeeklyChallengeParticipantRow,
  WeeklyChallengeRow,
  WeeklyChallengeStatus,
  WeeklyChallengeTaskRow,
} from './types.js';

type Queryable = Pool | PoolClient;

function iso(value: Date): string {
  return value.toISOString();
}

function resolveStatus(challenge: WeeklyChallengeRow, now: Date): WeeklyChallengeStatus {
  if (now < challenge.join_open_at) return 'not_open';
  if (now >= challenge.end_at) return 'finished';
  if (now >= challenge.start_at) return 'running';
  return 'join_open';
}

function defaultTaskTitle(task: WeeklyChallengeTaskRow): string {
  if (task.title?.trim()) return task.title.trim();
  if (task.type === 'goals_scored') return `Забросить ${task.target} шайб`;
  if (task.type === 'duels_played') return `Сыграть ${task.target} дуэлей`;
  if (task.type === 'duels_won') return `Победить в ${task.target} дуэлях`;
  if (task.type === 'duel_invites_sent') return `Пригласить ${task.target} соперников`;
  return `Завершить ${task.target} тренировок`;
}

async function fetchActiveChallenge(db: Queryable): Promise<WeeklyChallengeRow | null> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where is_active
      order by start_at desc
      limit 1`,
  );
  return rows[0] ?? null;
}

async function fetchTasks(db: Queryable, challengeId: string): Promise<WeeklyChallengeTaskRow[]> {
  const { rows } = await db.query<WeeklyChallengeTaskRow>(
    `select *
       from weekly_challenge_tasks
      where challenge_id = $1
      order by sort_order asc, created_at asc`,
    [challengeId],
  );
  return rows;
}

async function fetchParticipant(
  db: Queryable,
  challengeId: string,
  userId: string,
): Promise<WeeklyChallengeParticipantRow | null> {
  const { rows } = await db.query<WeeklyChallengeParticipantRow>(
    `select *
       from weekly_challenge_participants
      where challenge_id = $1 and user_id = $2`,
    [challengeId, userId],
  );
  return rows[0] ?? null;
}

async function mapChallenge(
  db: Queryable,
  challenge: WeeklyChallengeRow,
  userId: string,
  now: Date,
): Promise<WeeklyChallengeDTO> {
  const [tasks, participant] = await Promise.all([
    fetchTasks(db, challenge.id),
    fetchParticipant(db, challenge.id, userId),
  ]);
  const status = resolveStatus(challenge, now);
  const progressFrom =
    participant !== null ? new Date(Math.max(challenge.start_at.getTime(), participant.joined_at.getTime())) : null;
  const progress =
    progressFrom !== null
      ? await fetchWeeklyChallengeProgress(db, { userId, from: progressFrom, to: challenge.end_at })
      : null;
  const taskDtos = tasks.map((task) => {
    const value = progress ? progress[task.type] : null;
    return {
      id: task.id,
      type: task.type,
      title: defaultTaskTitle(task),
      target: task.target,
      progress: value,
      completed: value === null ? null : value >= task.target,
    };
  });
  const allTasksCompleted = taskDtos.length > 0 && taskDtos.every((task) => task.completed === true);
  const canJoin =
    participant === null &&
    challenge.join_enabled &&
    status !== 'not_open' &&
    status !== 'finished';
  const canClaimReward =
    participant !== null && participant.reward_claimed_at === null && allTasksCompleted;

  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    status,
    joinOpenAt: iso(challenge.join_open_at),
    startAt: iso(challenge.start_at),
    endAt: iso(challenge.end_at),
    joinEnabled: challenge.join_enabled,
    reward: {
      coins: Number(challenge.reward_coins),
      stars: Number(challenge.reward_stars),
      xp: Number(challenge.reward_xp),
    },
    participant:
      participant === null
        ? null
        : { joinedAt: iso(participant.joined_at), rewardClaimedAt: participant.reward_claimed_at?.toISOString() ?? null },
    tasks: taskDtos,
    canJoin,
    canClaimReward,
    allTasksCompleted,
    serverNow: iso(now),
  };
}

export async function getCurrentWeeklyChallenge(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const challenge = await fetchActiveChallenge(db);
  if (!challenge) return { challenge: null };
  return { challenge: await mapChallenge(db, challenge, userId, now) };
}
```

Then add `joinWeeklyChallenge` and `claimWeeklyChallengeReward` in the same file:

```ts
export async function joinWeeklyChallenge(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const { rows } = await client.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where id = $1 and is_active
      for update`,
    [challengeId],
  );
  const challenge = rows[0];
  if (!challenge) throw new AppError('not_found', 'weekly challenge not found', 404);
  const status = resolveStatus(challenge, now);
  if (!challenge.join_enabled || status === 'not_open' || status === 'finished') {
    throw new AppError('conflict', 'weekly challenge join is closed', 409);
  }

  await client.query(
    `insert into weekly_challenge_participants (challenge_id, user_id, joined_at)
     values ($1, $2, $3)
     on conflict (challenge_id, user_id) do nothing`,
    [challengeId, userId, now],
  );
  await appendEvent(client, userId, 'weekly_challenge_joined', { challenge_id: challengeId });
  return getCurrentWeeklyChallenge(client, userId, now);
}

export async function claimWeeklyChallengeReward(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const { rows } = await client.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where id = $1 and is_active
      for update`,
    [challengeId],
  );
  const challenge = rows[0];
  if (!challenge) throw new AppError('not_found', 'weekly challenge not found', 404);
  const participant = await fetchParticipant(client, challengeId, userId);
  if (!participant) throw new AppError('conflict', 'weekly challenge participation required', 409);
  if (participant.reward_claimed_at !== null) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }

  const mapped = await mapChallenge(client, challenge, userId, now);
  if (!mapped.allTasksCompleted) {
    throw new AppError('conflict', 'weekly challenge tasks are incomplete', 409);
  }

  await grantWeeklyChallengeReward(client, {
    challengeId,
    userId,
    coins: Number(challenge.reward_coins),
    stars: Number(challenge.reward_stars),
    xp: Number(challenge.reward_xp),
  });
  await appendEvent(client, userId, 'weekly_challenge_reward_claimed', {
    challenge_id: challengeId,
    coins: Number(challenge.reward_coins),
    stars: Number(challenge.reward_stars),
    xp: Number(challenge.reward_xp),
  });
  return getCurrentWeeklyChallenge(client, userId, now);
}
```

- [ ] **Step 3: Add public routes**

Create `packages/server/src/weeklyChallenge/routes.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import {
  claimWeeklyChallengeReward,
  getCurrentWeeklyChallenge,
  joinWeeklyChallenge,
} from './service.js';

const paramsSchema = z.object({ id: z.string().uuid() });

async function withTransaction<T>(
  app: Parameters<FastifyPluginAsync>[0],
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export const weeklyChallengeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/weekly-challenge/current', { preHandler: [app.authenticate] }, async (req) =>
    getCurrentWeeklyChallenge(app.pg, req.user.id),
  );

  app.post('/weekly-challenge/:id/join', { preHandler: [app.authenticate] }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    return withTransaction(app, (client) => joinWeeklyChallenge(client, params.data.id, req.user.id));
  });

  app.post('/weekly-challenge/:id/claim-reward', { preHandler: [app.authenticate] }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    return withTransaction(app, (client) =>
      claimWeeklyChallengeReward(client, params.data.id, req.user.id),
    );
  });
};
```

- [ ] **Step 4: Register routes**

Modify `packages/server/src/app.ts`:

```ts
import { weeklyChallengeRoutes } from './weeklyChallenge/routes.js';
```

Register after duel routes:

```ts
await app.register(weeklyChallengeRoutes);
```

- [ ] **Step 5: Run public API tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test -- test/weeklyChallenge/weeklyChallenge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/weeklyChallenge packages/server/test/weeklyChallenge/weeklyChallenge.test.ts
git commit -m "feat: add weekly challenge public api"
```

---

## Task 4: Admin API for Weekly Challenges

**Files:**
- Create: `packages/server/src/weeklyChallenge/admin.ts`
- Modify: `packages/server/src/admin/routes.ts`
- Test: `packages/server/test/weeklyChallenge/admin.test.ts`

- [ ] **Step 1: Write admin API tests**

Create `packages/server/test/weeklyChallenge/admin.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';

describe('/admin/weekly-challenges', () => {
  it('rejects non-admin users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/weekly-challenges',
      headers: auth(playerToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates, lists, activates, disables join, and deactivates a challenge', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/weekly-challenges',
      headers: auth(adminToken),
      payload: {
        title: 'Неделя снайпера',
        description: 'Забрасывай шайбы и играй дуэли.',
        joinOpenAt: '2026-06-01T09:00:00.000Z',
        startAt: '2026-06-02T09:00:00.000Z',
        endAt: '2026-06-09T09:00:00.000Z',
        rewardCoins: 100,
        rewardStars: 5,
        rewardXp: 50,
        tasks: [{ type: 'goals_scored', title: '500 шайб', target: 500, sortOrder: 0 }],
      },
    });
    expect(created.statusCode).toBe(200);
    const challengeId = created.json().challenge.id;

    const activated = await app.inject({
      method: 'POST',
      url: `/admin/weekly-challenges/${challengeId}/activate`,
      headers: auth(adminToken),
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().challenge.isActive).toBe(true);

    const joinDisabled = await app.inject({
      method: 'POST',
      url: `/admin/weekly-challenges/${challengeId}/join-enabled`,
      headers: auth(adminToken),
      payload: { joinEnabled: false },
    });
    expect(joinDisabled.statusCode).toBe(200);
    expect(joinDisabled.json().challenge.joinEnabled).toBe(false);

    const deactivated = await app.inject({
      method: 'POST',
      url: `/admin/weekly-challenges/${challengeId}/deactivate`,
      headers: auth(adminToken),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().challenge.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Implement admin route helper**

Create `packages/server/src/weeklyChallenge/admin.ts`. Use `assertAdminUser` from `chat/channel.ts` exactly as existing admin code does:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { assertAdminUser } from '../chat/channel.js';
import { AppError } from '../plugins/errors.js';
import { WEEKLY_CHALLENGE_TASK_TYPES, type WeeklyChallengeTaskType } from './types.js';

const taskSchema = z.object({
  type: z.enum(WEEKLY_CHALLENGE_TASK_TYPES),
  title: z.string().trim().max(120).optional(),
  target: z.number().int().min(1).max(1_000_000),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

const challengeInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  joinOpenAt: z.string().datetime(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  rewardCoins: z.number().int().min(0).max(10_000_000).default(0),
  rewardStars: z.number().int().min(0).max(10_000_000).default(0),
  rewardXp: z.number().int().min(0).max(10_000_000).default(0),
  tasks: z.array(taskSchema).min(1).max(12),
});

const paramsSchema = z.object({ id: z.string().uuid() });
const joinEnabledSchema = z.object({ joinEnabled: z.boolean() });

function assertValidTimeline(input: { joinOpenAt: string; startAt: string; endAt: string }): void {
  const joinOpenAt = new Date(input.joinOpenAt);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (joinOpenAt.getTime() > startAt.getTime() || startAt.getTime() >= endAt.getTime()) {
    throw new AppError('bad_request', 'weekly challenge timeline is invalid', 400);
  }
}

async function requireAdmin(app: FastifyInstance, req: FastifyRequest): Promise<void> {
  await assertAdminUser(app.pg, req.user.id);
}
```

Then add CRUD route registration:

```ts
export async function registerWeeklyChallengeAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/weekly-challenges', { preHandler: [app.authenticate] }, async (req) => {
    await requireAdmin(app, req);
    const { rows } = await app.pg.query(
      `select wc.*,
              coalesce(json_agg(wct order by wct.sort_order, wct.created_at)
                filter (where wct.id is not null), '[]'::json) as tasks
         from weekly_challenges wc
         left join weekly_challenge_tasks wct on wct.challenge_id = wc.id
        group by wc.id
        order by wc.start_at desc`,
    );
    return { challenges: rows.map(mapAdminChallengeRow) };
  });

  app.post('/admin/weekly-challenges', { preHandler: [app.authenticate] }, async (req) => {
    await requireAdmin(app, req);
    const body = challengeInputSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid weekly challenge payload', 400);
    assertValidTimeline(body.data);
    const challenge = await withAdminTransaction(app, (client) =>
      createAdminWeeklyChallenge(client, req.user.id, body.data),
    );
    return { challenge };
  });
}
```

The helper functions in this file must include:

```ts
function mapAdminChallengeRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    joinOpenAt: row.join_open_at instanceof Date ? row.join_open_at.toISOString() : row.join_open_at,
    startAt: row.start_at instanceof Date ? row.start_at.toISOString() : row.start_at,
    endAt: row.end_at instanceof Date ? row.end_at.toISOString() : row.end_at,
    isActive: Boolean(row.is_active),
    joinEnabled: Boolean(row.join_enabled),
    rewardCoins: Number(row.reward_coins),
    rewardStars: Number(row.reward_stars),
    rewardXp: Number(row.reward_xp),
    tasks: (row.tasks ?? []).map((task: any) => ({
      id: task.id,
      type: task.type as WeeklyChallengeTaskType,
      title: task.title,
      target: Number(task.target),
      sortOrder: Number(task.sort_order),
    })),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}
```

Use one transaction for create/update/activate:

```ts
async function createAdminWeeklyChallenge(client: PoolClient, adminUserId: string, input: z.infer<typeof challengeInputSchema>) {
  const { rows } = await client.query(
    `insert into weekly_challenges
       (title, description, join_open_at, start_at, end_at, reward_coins, reward_stars, reward_xp, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      input.title,
      input.description,
      input.joinOpenAt,
      input.startAt,
      input.endAt,
      input.rewardCoins,
      input.rewardStars,
      input.rewardXp,
      adminUserId,
    ],
  );
  const challenge = rows[0]!;
  for (const task of input.tasks) {
    await client.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [challenge.id, task.type, task.title ?? null, task.target, task.sortOrder],
    );
  }
  return mapAdminChallengeRow({ ...challenge, tasks: input.tasks.map((task) => ({ ...task, sort_order: task.sortOrder })) });
}
```

Implement `PATCH`, `activate`, `deactivate`, and `join-enabled` with the same schemas and response shape.

- [ ] **Step 3: Mount admin routes**

Modify `packages/server/src/admin/routes.ts`:

```ts
import { registerWeeklyChallengeAdminRoutes } from '../weeklyChallenge/admin.js';
```

Inside `adminRoutes`, after existing admin route declarations are available, call:

```ts
await registerWeeklyChallengeAdminRoutes(app);
```

- [ ] **Step 4: Run admin API tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test -- test/weeklyChallenge/admin.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/admin/routes.ts packages/server/src/weeklyChallenge/admin.ts packages/server/test/weeklyChallenge/admin.test.ts
git commit -m "feat: add weekly challenge admin api"
```

---

## Task 5: Web API and Player Screen

**Files:**
- Create: `packages/web/src/api/weeklyChallenge.ts`
- Create: `packages/web/src/screens/WeeklyChallengeScreen.tsx`
- Create: `packages/web/src/screens/WeeklyChallengeScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`

- [ ] **Step 1: Add web API types**

Create `packages/web/src/api/weeklyChallenge.ts`:

```ts
import { apiFetch } from './apiFetch.js';

export type WeeklyChallengeTaskType =
  | 'goals_scored'
  | 'duels_played'
  | 'duels_won'
  | 'duel_invites_sent'
  | 'trainings_completed';

export type WeeklyChallengeStatus = 'not_open' | 'join_open' | 'running' | 'finished';

export interface WeeklyChallengeTask {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string;
  target: number;
  progress: number | null;
  completed: boolean | null;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  status: WeeklyChallengeStatus;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  joinEnabled: boolean;
  reward: { coins: number; stars: number; xp: number };
  participant: { joinedAt: string; rewardClaimedAt: string | null } | null;
  tasks: WeeklyChallengeTask[];
  canJoin: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}

export interface WeeklyChallengeCurrentResponse {
  challenge: WeeklyChallenge | null;
}

export function fetchWeeklyChallenge(): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>('/weekly-challenge/current');
}

export function joinWeeklyChallenge(id: string): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>(`/weekly-challenge/${id}/join`, { method: 'POST' });
}

export function claimWeeklyChallengeReward(id: string): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>(`/weekly-challenge/${id}/claim-reward`, {
    method: 'POST',
  });
}
```

- [ ] **Step 2: Write screen tests**

Create `packages/web/src/screens/WeeklyChallengeScreen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyChallengeScreen } from './WeeklyChallengeScreen.js';
import * as api from '../api/weeklyChallenge.js';

vi.mock('../api/weeklyChallenge.js');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WeeklyChallengeScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WeeklyChallengeScreen', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders empty state when no active challenge exists', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({ challenge: null });
    renderScreen();
    expect(await screen.findByText('На этой неделе активного челленджа нет')).toBeInTheDocument();
  });

  it('renders tasks and lets the user join', async () => {
    vi.mocked(api.fetchWeeklyChallenge).mockResolvedValue({
      challenge: {
        id: 'challenge-1',
        title: 'Неделя снайпера',
        description: 'Забрасывай шайбы.',
        status: 'join_open',
        joinOpenAt: '2026-06-01T09:00:00.000Z',
        startAt: '2026-06-02T09:00:00.000Z',
        endAt: '2026-06-09T09:00:00.000Z',
        joinEnabled: true,
        reward: { coins: 100, stars: 5, xp: 50 },
        participant: null,
        tasks: [{ id: 'task-1', type: 'goals_scored', title: '500 шайб', target: 500, progress: null, completed: null }],
        canJoin: true,
        canClaimReward: false,
        allTasksCompleted: false,
        serverNow: '2026-06-01T10:00:00.000Z',
      },
    });
    vi.mocked(api.joinWeeklyChallenge).mockResolvedValue({ challenge: null });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Участвовать' }));
    expect(api.joinWeeklyChallenge).toHaveBeenCalledWith('challenge-1');
  });
});
```

- [ ] **Step 3: Implement player screen**

Create `packages/web/src/screens/WeeklyChallengeScreen.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Coins, Sparkles, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  claimWeeklyChallengeReward,
  fetchWeeklyChallenge,
  joinWeeklyChallenge,
  type WeeklyChallenge,
} from '../api/weeklyChallenge.js';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function statusText(challenge: WeeklyChallenge): string {
  if (challenge.status === 'not_open') return 'Вход скоро откроется';
  if (challenge.status === 'join_open') return 'Открыт набор участников';
  if (challenge.status === 'running') return 'Челлендж идет';
  return 'Челлендж завершен';
}

export function WeeklyChallengeScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['weekly-challenge'], queryFn: fetchWeeklyChallenge });
  const challenge = query.data?.challenge ?? null;
  const join = useMutation({
    mutationFn: (id: string) => joinWeeklyChallenge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });
  const claim = useMutation({
    mutationFn: (id: string) => claimWeeklyChallengeReward(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenge'] }),
  });

  return (
    <main className="screen" style={{ padding: 'calc(16px + var(--app-safe-top)) 14px 24px', overflowY: 'auto' }}>
      <section style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/sections')} style={{ alignSelf: 'flex-start' }}>
          <ChevronLeft size={16} /> Назад
        </button>
        <div className="section-label section-label--page">Еженедельный челлендж</div>
        {query.isLoading && <div className="glass" style={{ padding: 18 }}>Загрузка...</div>}
        {!query.isLoading && !challenge && (
          <div className="glass" style={{ borderRadius: 24, padding: 22 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>На этой неделе активного челленджа нет</h1>
            <p style={{ margin: '10px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
              Когда админ откроет новый челлендж, он появится здесь.
            </p>
          </div>
        )}
        {challenge && (
          <div className="glass" style={{ borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue-accent)' }}>{statusText(challenge)}</div>
              <h1 style={{ margin: '4px 0 0', fontSize: 24, lineHeight: 1.1 }}>{challenge.title}</h1>
              {challenge.description && (
                <p style={{ margin: '8px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>{challenge.description}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, fontWeight: 800 }}>
              <span><Coins size={14} /> {numberText(challenge.reward.coins)}</span>
              <span><Star size={14} /> {numberText(challenge.reward.stars)}</span>
              <span><Sparkles size={14} /> {numberText(challenge.reward.xp)}</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {challenge.tasks.map((task) => (
                <div key={task.id} style={{ padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.56)' }}>
                  <div style={{ fontWeight: 900 }}>{task.title}</div>
                  <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 13 }}>
                    {task.progress === null ? `Цель: ${numberText(task.target)}` : `${numberText(task.progress)} / ${numberText(task.target)}`}
                  </div>
                </div>
              ))}
            </div>
            {challenge.canJoin && (
              <button type="button" className="btn btn--cta" onClick={() => join.mutate(challenge.id)} disabled={join.isPending}>
                Участвовать
              </button>
            )}
            {challenge.canClaimReward && (
              <button type="button" className="btn btn--cta" onClick={() => claim.mutate(challenge.id)} disabled={claim.isPending}>
                Получить награду
              </button>
            )}
            {challenge.participant?.rewardClaimedAt && (
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>Награда получена</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add route**

Modify `packages/web/src/app/App.tsx`:

```ts
const WeeklyChallengeScreen = lazy(() =>
  import('../screens/WeeklyChallengeScreen.js').then((module) => ({
    default: module.WeeklyChallengeScreen,
  })),
);
```

Add a private route:

```tsx
<Route
  path="/weekly-challenge"
  element={
    <PrivateRoute>
      <WeeklyChallengeScreen />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 5: Run web screen tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/screens/WeeklyChallengeScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/weeklyChallenge.ts packages/web/src/screens/WeeklyChallengeScreen.tsx packages/web/src/screens/WeeklyChallengeScreen.test.tsx packages/web/src/app/App.tsx
git commit -m "feat: add weekly challenge screen"
```

---

## Task 6: Add Section Card and Status Fetch

**Files:**
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Test: `packages/web/src/screens/SectionsScreen.test.tsx`

- [ ] **Step 1: Add section screen test**

Create or extend `packages/web/src/screens/SectionsScreen.test.tsx`:

```tsx
it('shows weekly challenge section and navigates to the challenge page', async () => {
  render(
    <MemoryRouter>
      <SectionsScreen />
    </MemoryRouter>,
  );
  const card = await screen.findByRole('button', { name: 'Еженедельный челлендж' });
  expect(card).toBeInTheDocument();
});
```

- [ ] **Step 2: Add artwork key and query**

Modify `packages/web/src/screens/SectionsScreen.tsx`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchWeeklyChallenge } from '../api/weeklyChallenge.js';
```

Extend `SECTION_ARTWORK`:

```ts
weekly: '/daily-game/start.webp',
```

Inside `SectionsScreen`:

```ts
const weeklyChallenge = useQuery({
  queryKey: ['weekly-challenge', 'section'],
  queryFn: fetchWeeklyChallenge,
});
const weeklyMeta = weeklyChallenge.data?.challenge
  ? weeklyChallenge.data.challenge.status === 'running'
    ? 'Челлендж идет'
    : weeklyChallenge.data.challenge.status === 'join_open'
      ? 'Открыт набор участников'
      : weeklyChallenge.data.challenge.status === 'finished'
        ? 'Челлендж завершен'
        : 'Вход скоро откроется'
  : 'На этой неделе нет активного челленджа';
```

Render the new card after the page label and before daily:

```tsx
<SectionCard
  title="Еженедельный челлендж"
  description="Недельные задания и награды"
  meta={weeklyChallenge.isLoading ? 'Проверяем активность' : weeklyMeta}
  tone={weeklyChallenge.data?.challenge ? 'active' : 'default'}
  artworkSrc={SECTION_ARTWORK.weekly}
  onClick={() => navigate('/weekly-challenge')}
/>
```

- [ ] **Step 3: Run section test**

Run:

```bash
pnpm --filter @hockey/web test -- src/screens/SectionsScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
git commit -m "feat: add weekly challenge section"
```

---

## Task 7: Admin Web UI

**Files:**
- Modify: `packages/web/src/admin/api.ts`
- Create: `packages/web/src/admin/WeeklyChallengesAdmin.tsx`
- Create: `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx`
- Modify: `packages/web/src/admin/AdminScreen.tsx`

- [ ] **Step 1: Add admin API types and functions**

Append to `packages/web/src/admin/api.ts`:

```ts
export type AdminWeeklyChallengeTaskType =
  | 'goals_scored'
  | 'duels_played'
  | 'duels_won'
  | 'duel_invites_sent'
  | 'trainings_completed';

export interface AdminWeeklyChallengeTask {
  id?: string;
  type: AdminWeeklyChallengeTaskType;
  title?: string | null;
  target: number;
  sortOrder: number;
}

export interface AdminWeeklyChallenge {
  id: string;
  title: string;
  description: string;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  joinEnabled: boolean;
  rewardCoins: number;
  rewardStars: number;
  rewardXp: number;
  tasks: AdminWeeklyChallengeTask[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminWeeklyChallengeInput {
  title: string;
  description: string;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  rewardCoins: number;
  rewardStars: number;
  rewardXp: number;
  tasks: Array<Omit<AdminWeeklyChallengeTask, 'id'>>;
}

export function fetchAdminWeeklyChallenges(): Promise<{ challenges: AdminWeeklyChallenge[] }> {
  return apiFetch('/admin/weekly-challenges');
}

export function createAdminWeeklyChallenge(input: AdminWeeklyChallengeInput): Promise<{ challenge: AdminWeeklyChallenge }> {
  return apiFetch('/admin/weekly-challenges', { method: 'POST', body: JSON.stringify(input) });
}

export function patchAdminWeeklyChallenge(id: string, input: AdminWeeklyChallengeInput): Promise<{ challenge: AdminWeeklyChallenge }> {
  return apiFetch(`/admin/weekly-challenges/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function activateAdminWeeklyChallenge(id: string): Promise<{ challenge: AdminWeeklyChallenge }> {
  return apiFetch(`/admin/weekly-challenges/${id}/activate`, { method: 'POST' });
}

export function deactivateAdminWeeklyChallenge(id: string): Promise<{ challenge: AdminWeeklyChallenge }> {
  return apiFetch(`/admin/weekly-challenges/${id}/deactivate`, { method: 'POST' });
}

export function setAdminWeeklyChallengeJoinEnabled(id: string, joinEnabled: boolean): Promise<{ challenge: AdminWeeklyChallenge }> {
  return apiFetch(`/admin/weekly-challenges/${id}/join-enabled`, {
    method: 'POST',
    body: JSON.stringify({ joinEnabled }),
  });
}
```

- [ ] **Step 2: Add admin component test**

Create `packages/web/src/admin/WeeklyChallengesAdmin.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WeeklyChallengesAdmin } from './WeeklyChallengesAdmin.js';
import * as api from './api.js';

vi.mock('./api.js');

it('renders existing weekly challenges', async () => {
  vi.mocked(api.fetchAdminWeeklyChallenges).mockResolvedValue({
    challenges: [{
      id: 'challenge-1',
      title: 'Неделя снайпера',
      description: '',
      joinOpenAt: '2026-06-01T09:00:00.000Z',
      startAt: '2026-06-02T09:00:00.000Z',
      endAt: '2026-06-09T09:00:00.000Z',
      isActive: true,
      joinEnabled: true,
      rewardCoins: 100,
      rewardStars: 5,
      rewardXp: 50,
      tasks: [{ id: 'task-1', type: 'goals_scored', title: '500 шайб', target: 500, sortOrder: 0 }],
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-01T09:00:00.000Z',
    }],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WeeklyChallengesAdmin />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Неделя снайпера')).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement admin UI**

Create `packages/web/src/admin/WeeklyChallengesAdmin.tsx`. Keep the first version practical: list existing challenges, create form, and actions on each row.

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateAdminWeeklyChallenge,
  createAdminWeeklyChallenge,
  deactivateAdminWeeklyChallenge,
  fetchAdminWeeklyChallenges,
  setAdminWeeklyChallengeJoinEnabled,
  type AdminWeeklyChallengeInput,
  type AdminWeeklyChallengeTaskType,
} from './api.js';

const taskTypes: Array<{ value: AdminWeeklyChallengeTaskType; label: string }> = [
  { value: 'goals_scored', label: 'Забросить шайбы' },
  { value: 'duels_played', label: 'Сыграть дуэли' },
  { value: 'duels_won', label: 'Победить в дуэлях' },
  { value: 'duel_invites_sent', label: 'Пригласить соперников' },
  { value: 'trainings_completed', label: 'Завершить тренировки' },
];

const initialForm: AdminWeeklyChallengeInput = {
  title: '',
  description: '',
  joinOpenAt: '',
  startAt: '',
  endAt: '',
  rewardCoins: 0,
  rewardStars: 0,
  rewardXp: 0,
  tasks: [{ type: 'goals_scored', title: '', target: 500, sortOrder: 0 }],
};

export function WeeklyChallengesAdmin(): JSX.Element {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'weekly-challenges'], queryFn: fetchAdminWeeklyChallenges });
  const createMutation = useMutation({
    mutationFn: createAdminWeeklyChallenge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const activateMutation = useMutation({
    mutationFn: activateAdminWeeklyChallenge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateAdminWeeklyChallenge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const joinMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setAdminWeeklyChallengeJoinEnabled(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });

  return (
    <section className="admin-panel">
      <div className="admin-section-heading">
        <h2>Еженедельные челленджи</h2>
      </div>
      <div className="admin-card">
        <button type="button" className="btn btn--cta" onClick={() => createMutation.mutate(initialForm)}>
          Создать черновик
        </button>
      </div>
      <div className="admin-list">
        {(query.data?.challenges ?? []).map((challenge) => (
          <article key={challenge.id} className="admin-card">
            <h3>{challenge.title}</h3>
            <p>{challenge.isActive ? 'Активен' : 'Не активен'} · {challenge.joinEnabled ? 'Вход открыт' : 'Вход закрыт'}</p>
            <div className="admin-actions">
              <button type="button" className="btn" onClick={() => activateMutation.mutate(challenge.id)}>Сделать активным</button>
              <button type="button" className="btn" onClick={() => deactivateMutation.mutate(challenge.id)}>Отключить</button>
              <button type="button" className="btn" onClick={() => joinMutation.mutate({ id: challenge.id, enabled: !challenge.joinEnabled })}>
                {challenge.joinEnabled ? 'Закрыть вход' : 'Открыть вход'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

During implementation, replace the draft-create button with controlled inputs before marking this task complete. The minimum fields must be title, dates, rewards, and one editable task.

- [ ] **Step 4: Mount admin tab**

Modify `packages/web/src/admin/AdminScreen.tsx`:

```ts
import { CalendarDays } from 'lucide-react';
import { WeeklyChallengesAdmin } from './WeeklyChallengesAdmin.js';
```

Extend `AdminTab`:

```ts
| 'weeklyChallenges'
```

Extend `tabs`:

```tsx
{ id: 'weeklyChallenges', label: 'Челленджи', icon: <CalendarDays size={15} /> },
```

Render:

```tsx
{tab === 'weeklyChallenges' && <WeeklyChallengesAdmin />}
```

- [ ] **Step 5: Run admin web tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/admin/WeeklyChallengesAdmin.test.tsx src/admin/AdminScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/admin/api.ts packages/web/src/admin/WeeklyChallengesAdmin.tsx packages/web/src/admin/WeeklyChallengesAdmin.test.tsx packages/web/src/admin/AdminScreen.tsx
git commit -m "feat: add weekly challenge admin ui"
```

---

## Task 8: Reward Claim Integration Tests

**Files:**
- Modify: `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`
- Modify: `packages/server/src/weeklyChallenge/service.ts`
- Modify: `packages/server/src/weeklyChallenge/progress.ts`

- [ ] **Step 1: Add end-to-end reward test**

Extend `packages/server/test/weeklyChallenge/weeklyChallenge.test.ts`:

```ts
it('claims reward once after all tasks are complete', async () => {
  const challengeId = await seedWeeklyChallenge({
    title: 'Быстрая неделя',
    joinOpenAt: '2026-06-01T09:00:00.000Z',
    startAt: '2026-06-01T09:00:00.000Z',
    endAt: '2026-06-08T09:00:00.000Z',
    rewardCoins: 10,
    rewardStars: 2,
    rewardXp: 30,
    tasks: [{ type: 'goals_scored', target: 1 }],
  });
  await pool.query(
    `insert into weekly_challenge_participants (challenge_id, user_id, joined_at)
     values ($1, $2, '2026-06-01T09:00:00.000Z')`,
    [challengeId, playerId],
  );
  await pool.query(
    `insert into shot_session
       (user_id, mode, day_pool_id, period_number, shot_index, seed, input_payload, server_result, game_core_version, created_at)
     values ($1, 'daily', $2, 1, 1, 'seed', '{}'::jsonb, 'goal', 1, '2026-06-01T10:00:00.000Z')`,
    [playerId, dayPoolId],
  );

  const claimed = await app.inject({
    method: 'POST',
    url: `/weekly-challenge/${challengeId}/claim-reward`,
    headers: auth(playerToken),
  });
  expect(claimed.statusCode).toBe(200);

  const repeated = await app.inject({
    method: 'POST',
    url: `/weekly-challenge/${challengeId}/claim-reward`,
    headers: auth(playerToken),
  });
  expect(repeated.statusCode).toBe(409);
});
```

- [ ] **Step 2: Fix seed helpers until the test uses valid FK data**

Add local helpers in the same test file:

```ts
async function seedDayPool(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into day_pool (user_id, day_date, state, daily_seed, game_core_version)
     values ($1, '2026-06-01', 'idle', 'daily-seed', 1)
     returning id`,
    [userId],
  );
  return rows[0]!.id;
}
```

- [ ] **Step 3: Run reward tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test -- test/weeklyChallenge/weeklyChallenge.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/test/weeklyChallenge/weeklyChallenge.test.ts packages/server/src/weeklyChallenge
git commit -m "test: cover weekly challenge reward claiming"
```

---

## Task 9: Full Verification

**Files:**
- All files changed by Tasks 1-8.

- [ ] **Step 1: Run focused server tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server test -- test/weeklyChallenge/weeklyChallenge.test.ts test/weeklyChallenge/admin.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused web tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/screens/WeeklyChallengeScreen.test.tsx src/screens/SectionsScreen.test.tsx src/admin/WeeklyChallengesAdmin.test.tsx src/admin/AdminScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Manual browser smoke**

Start local servers if they are not already running:

```bash
pnpm dev:server
pnpm dev:web
```

Check:
- `/sections` shows **Еженедельный челлендж**.
- `/weekly-challenge` shows empty state when no active challenge exists.
- Admin tab **Челленджи** can create and activate a challenge.
- `/weekly-challenge` then shows the active challenge, tasks, and rewards.
- Join button changes the screen into participant mode.
- Claim button appears only after seeded progress reaches all targets.

- [ ] **Step 6: Final commit if needed**

If Task 9 required verification-only fixes:

```bash
git add packages/server packages/web
git commit -m "fix: polish weekly challenge integration"
```
