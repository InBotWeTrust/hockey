import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  evaluateDailyClosedAchievements,
  evaluateDailyShotAchievements,
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
    expect(hasNoPanicPattern(['save', 'miss', 'save', ...makeResults(9, 9), 'save', 'goal'])).toBe(
      false,
    );
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

  it('counts equal shot numbers in different periods for both daily series achievements', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [27, 30, 0],
      results: [...makeResults(3, 0), ...makeResults(27, 27)],
    });
    for (const [id, stage] of [
      ['daily-sniper-streak', 2],
      ['no-panic', 5],
    ] as const) {
      await pool.query(
        `insert into user_achievement_stages
        (user_id,achievement_id,stage_number,opened_at) values($1,$2,$3,now()-interval '1 day')`,
        [userId, id, stage],
      );
    }
    await evaluateDailyShotAchievements(pool, {
      userId,
      dayPoolId,
      periodNumber: 1,
      shotIndex: 30,
      result: 'goal',
    });
    await pool.query(
      `insert into shot_session
      (user_id,mode,day_pool_id,period_number,shot_index,seed,input_payload,server_result,game_core_version)
      select $1,'daily',$2,2,n,'second-period-'||n,'{}','goal',1 from generate_series(1,30) n`,
      [userId, dayPoolId],
    );
    await evaluateDailyShotAchievements(pool, {
      userId,
      dayPoolId,
      periodNumber: 2,
      shotIndex: 30,
      result: 'goal',
    });
    await expect(completedStageIds(pool, userId)).resolves.toEqual(
      expect.arrayContaining(['daily-sniper-streak', 'no-panic']),
    );
  });

  it('does not reuse the series before the next stage opened', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [30, 30, 0],
      results: makeResults(60, 60),
    });
    await pool.query(
      "update shot_session set created_at=now()-interval '1 hour' where day_pool_id=$1",
      [dayPoolId],
    );
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at)
      values($1,'daily-sniper-streak',2,now()-interval '1 minute')`,
      [userId],
    );
    await pool.query(
      `insert into shot_session(user_id,mode,day_pool_id,period_number,shot_index,seed,input_payload,server_result,game_core_version)
      values($1,'daily',$2,3,1,'new-stage-shot','{}','goal',1)`,
      [userId, dayPoolId],
    );
    await evaluateDailyShotAchievements(pool, {
      userId,
      dayPoolId,
      periodNumber: 3,
      shotIndex: 1,
      result: 'goal',
    });
    expect(
      (
        await pool.query(
          "select progress,completed_at from user_achievement_stages where user_id=$1 and achievement_id='daily-sniper-streak'",
          [userId],
        )
      ).rows[0],
    ).toMatchObject({ progress: { goalStreak: 1 }, completed_at: null });
  });

  it('repairs already saved series once without paying rewards or opening another stage', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [27, 30, 30],
      results: [...makeResults(3, 0), ...makeResults(87, 87)],
    });
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at,progress)
      values($1,'daily-sniper-streak',2,now()-interval '1 day','{"goalStreak":30}'),
      ($1,'no-panic',5,now()-interval '1 day','{"recoveryGoalStreak":27,"precedingNonGoals":3}')`,
      [userId],
    );
    const balance = (await pool.query('select xp,experience from users where id=$1', [userId]))
      .rows[0];
    const repair = await readFile(
      path.join(MIGRATIONS_DIR, '243_repair_daily_achievement_series.sql'),
      'utf8',
    );
    await pool.query(repair);
    const first = (
      await pool.query(
        'select achievement_id,stage_number,completed_at,claimed_at,progress from user_achievement_stages where user_id=$1 order by achievement_id',
        [userId],
      )
    ).rows;
    expect(first).toHaveLength(2);
    expect(first.every((row) => row.completed_at instanceof Date && row.claimed_at === null)).toBe(
      true,
    );
    expect(
      first.find((row) => row.achievement_id === 'daily-sniper-streak').progress,
    ).toMatchObject({ goalStreak: 87 });
    await pool.query(repair);
    expect(
      (
        await pool.query(
          'select achievement_id,stage_number,completed_at,claimed_at,progress from user_achievement_stages where user_id=$1 order by achievement_id',
          [userId],
        )
      ).rows,
    ).toEqual(first);
    expect(
      (await pool.query('select xp,experience from users where id=$1', [userId])).rows[0],
    ).toEqual(balance);
    expect(
      (
        await pool.query('select count(*)::int as n from shot_session where day_pool_id=$1', [
          dayPoolId,
        ])
      ).rows[0].n,
    ).toBe(90);
  });

  it('does not repair a streak across different daily games or before a stage opened', async () => {
    const userId = await createUser(pool);
    for (const dayDate of ['2026-05-30', '2026-05-31']) {
      await seedClosedDaily(pool, {
        userId,
        dayDate,
        goalsByPeriod: [30, 0, 0],
        results: makeResults(30, 30),
      });
    }
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at)
      values($1,'daily-sniper-streak',2,now()-interval '1 day'),($1,'no-panic',5,now()+interval '1 day')`,
      [userId],
    );
    const repair = await readFile(
      path.join(MIGRATIONS_DIR, '243_repair_daily_achievement_series.sql'),
      'utf8',
    );
    await pool.query(repair);
    expect(
      (
        await pool.query(
          "select progress,completed_at from user_achievement_stages where user_id=$1 and achievement_id='daily-sniper-streak'",
          [userId],
        )
      ).rows[0],
    ).toMatchObject({ progress: { goalStreak: 30 }, completed_at: null });
    expect(
      (
        await pool.query(
          "select progress,completed_at from user_achievement_stages where user_id=$1 and achievement_id='no-panic'",
          [userId],
        )
      ).rows[0],
    ).toMatchObject({ progress: {}, completed_at: null });
  });

  it('requires seven new completed days after claiming the previous accuracy-window stage', async () => {
    const userId = await createUser(pool);
    for (let day = 1; day <= 7; day++) {
      await seedClosedDaily(pool, {
        userId,
        dayDate: `2026-05-0${day}`,
        goalsByPeriod: [30, 30, 30],
        results: makeResults(90, 90),
      });
    }
    await pool.query("update day_pool set closed_at=now()-interval '1 hour' where user_id=$1", [
      userId,
    ]);
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at)
      values($1,'sniper-week',2,now()-interval '1 minute')`,
      [userId],
    );
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-08',
      goalsByPeriod: [30, 30, 30],
      results: makeResults(90, 90),
    });
    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-08',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });
    await expect(completedStageIds(pool, userId)).resolves.not.toContain('sniper-week');
  });

  it('does not treat a timed-out daily game with one goal as a perfect completed game', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [1, 0, 0],
      results: ['goal'],
    });
    await pool.query(
      "update period_log set shots_taken=case when period_number=1 then 1 else 0 end,closed_reason='timeout' where day_pool_id=$1",
      [dayPoolId],
    );
    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-31',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });
    await expect(completedStageIds(pool, userId)).resolves.not.toContain('ice-hand');
    await expect(completedIds(pool, userId)).resolves.not.toContain('first-daily-game');
  });

  it('counts seven completed games for sniper-week even when calendar days are skipped', async () => {
    const userId = await createUser(pool);
    let dayPoolId = '';
    for (const day of [1, 3, 5, 7, 9, 11, 13]) {
      dayPoolId = await seedClosedDaily(pool, {
        userId,
        dayDate: `2026-05-${String(day).padStart(2, '0')}`,
        goalsByPeriod: [30, 30, 30],
        results: makeResults(90, 90),
      });
    }
    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-13',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });
    await expect(completedStageIds(pool, userId)).resolves.toContain('sniper-week');
    await expect(completedStageIds(pool, userId)).resolves.not.toContain('keeping-fit');
  });

  it('completes current stages for daily accuracy and dry finish without removed steady-tempo', async () => {
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

    await expect(completedIds(pool, userId)).resolves.toContain('first-daily-game');
    await expect(completedStageIds(pool, userId)).resolves.toEqual(
      expect.arrayContaining(['ice-hand', 'dry-finish']),
    );
    await expect(completedIds(pool, userId)).resolves.not.toContain('steady-tempo');
  });

  it('requires third period to be strictly best', async () => {
    const userId = await createUser(pool);
    const dayPoolId = await seedClosedDaily(pool, {
      userId,
      dayDate: '2026-05-31',
      goalsByPeriod: [20, 21, 22],
      results: [...makeResults(30, 20), ...makeResults(30, 21), ...makeResults(30, 22)],
    });

    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId,
      dayDate: '2026-05-31',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });

    await expect(completedStageIds(pool, userId)).resolves.toContain('third-period-decides');
  });

  it('completes 7-day and 30-day daily accuracy windows only when every local day is completed', async () => {
    const userId = await createUser(pool);
    let latestDayPoolId = '';
    for (let day = 1; day <= 30; day += 1) {
      latestDayPoolId = await seedClosedDaily(pool, {
        userId,
        dayDate: `2026-05-${String(day).padStart(2, '0')}`,
        goalsByPeriod: [23, 23, 23],
        results: [...makeResults(30, 23), ...makeResults(30, 23), ...makeResults(30, 23)],
      });
    }

    await evaluateDailyClosedAchievements(pool, {
      userId,
      dayPoolId: latestDayPoolId,
      dayDate: '2026-05-30',
      totalPeriods: 3,
      shotsPerPeriod: 30,
    });

    await expect(completedStageIds(pool, userId)).resolves.toEqual(
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

async function completedStageIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id
       from user_achievement_stages
      where user_id = $1 and completed_at is not null
      order by achievement_id`,
    [userId],
  );
  return rows.map((row) => row.achievement_id);
}
