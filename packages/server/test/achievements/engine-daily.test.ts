import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  evaluateDailyClosedAchievements,
  hasGoalStreak,
  hasNoPanicPattern,
  lastNAllGoals,
} from '../../src/achievements/engine.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

type ShotResult = 'goal' | 'save' | 'miss';

describe('daily achievement result helpers', () => {
  it('detects goal streaks and last-N perfect finishes', () => {
    expect(hasGoalStreak(['goal', 'goal', 'save', 'goal', 'goal', 'goal'], 3)).toBe(true);
    expect(hasGoalStreak(['goal', 'goal', 'save', 'goal'], 3)).toBe(false);
    expect(lastNAllGoals(['save', 'goal', 'goal'], 2)).toBe(true);
    expect(lastNAllGoals(['save', 'goal'], 3)).toBe(false);
  });

  it('detects three non-goals followed by ten goals', () => {
    expect(hasNoPanicPattern([...makeResults(3, 0), ...makeResults(10, 10)])).toBe(true);
    expect(
      hasNoPanicPattern([
        'save',
        'miss',
        'save',
        ...makeResults(9, 9),
        'save',
        'goal',
      ]),
    ).toBe(false);
  });
});

describe.skipIf(!hasIntegrationEnv)('daily achievement evaluator', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('completes daily close achievements for 95 percent, equal periods, dry finish, and first daily', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [29, 29, 29],
      results: [...makeResults(3, 0), ...makeResults(87, 87)],
    });

    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-31',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });

    await expect(completedIds(pool, userId)).resolves.toEqual(
      expect.arrayContaining([
        'first-daily-game',
        'ice-hand',
        'steady-tempo',
        'dry-finish',
      ]),
    );
  });

  it('requires third period to be strictly best', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [20, 21, 22],
      results: [
        ...makeResults(30, 20),
        ...makeResults(30, 21),
        ...makeResults(30, 22),
      ],
    });

    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-31',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });

    await expect(completedIds(pool, userId)).resolves.toContain('third-period-decides');
  });

  it('completes 7-day and 30-day daily accuracy windows only when every local day is completed', async () => {
    const userId = await createUser(pool);
    let latestDayPoolId = '';
    for (let day = 1; day <= 30; day += 1) {
      latestDayPoolId = await seedClosedDaily(pool, {
        userId,
        dayDate: `2026-05-${String(day).padStart(2, '0')}`,
        goalsByPeriod: [23, 23, 23],
        results: [
          ...makeResults(30, 23),
          ...makeResults(30, 23),
          ...makeResults(30, 23),
        ],
      });
    }

    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId: latestDayPoolId,
      dayDate: '2026-05-30',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });

    await expect(completedIds(pool, userId)).resolves.toEqual(
      expect.arrayContaining(['keeping-fit', 'sniper-week', 'sniper-month']),
    );
  });
});

function makeResults(total: number, goals: number): ShotResult[] {
  return Array.from({ length: total }, (_, index) => (index < goals ? 'goal' : 'save'));
}

async function createUser(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Daily Achiever', null, 1, 'UTC')`,
    [id],
  );
  return id;
}

async function seedClosedDaily(
  pool: Pool,
  input: {
    userId: string;
    dayDate: string;
    goalsByPeriod: [number, number, number];
    results: ShotResult[];
  },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into day_pool
       (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
     values ($1, $2, 'closed', 3, now(), 1, $3)
     returning id`,
    [input.userId, input.dayDate, `daily-${input.dayDate}-${randomUUID()}`],
  );
  const dayPoolId = rows[0]!.id;

  for (let period = 1; period <= 3; period += 1) {
    await pool.query(
      `insert into period_log
         (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
       values ($1, $2, now() - interval '30 minutes', now(), 30, $3, 'quota')`,
      [dayPoolId, period, input.goalsByPeriod[period - 1]],
    );
  }

  await pool.query(
    `insert into shot_session
       (user_id, mode, day_pool_id, period_number, shot_index, seed,
        input_payload, server_result, game_core_version)
     select $1::uuid,
            'daily',
            $2::uuid,
            ceil(n / 30.0)::int,
            ((n - 1) % 30) + 1,
            'daily-shot-' || $2::text || '-' || n::text,
            '{}'::jsonb,
            result,
            1
       from unnest($3::text[]) with ordinality as shot(result, n)`,
    [input.userId, dayPoolId, input.results],
  );

  return dayPoolId;
}

async function completedIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id
       from user_achievements
      where user_id = $1
      order by achievement_id asc`,
    [userId],
  );
  return rows.map((row) => row.achievement_id);
}
