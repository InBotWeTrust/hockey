import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  mergeAchievementStageProgress,
  observeAchievementStage,
  openFirstAchievementStages,
} from '../../src/achievements/stageProgress.js';

describe('mergeAchievementStageProgress', () => {
  it('keeps the best numeric result when a later attempt is weaker', () => {
    expect(mergeAchievementStageProgress({ endingGoalStreak: 8 }, { endingGoalStreak: 5 })).toEqual(
      {
        endingGoalStreak: 8,
      },
    );
  });

  it('adds new progress fields while preserving stage qualifiers', () => {
    expect(
      mergeAchievementStageProgress(
        { wins: 4, role: 'host' },
        { wins: 1, role: 'host', format: 'classic' },
      ),
    ).toEqual({ wins: 4, role: 'host', format: 'classic' });
  });
});
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function createUser(pool: Pool): Promise<string> {
  const userId = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Stage Player', null, 1, 'UTC')`,
    [userId],
  );
  return userId;
}

describe.skipIf(!hasIntegrationEnv)('tiered achievement stage progress', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('computes expensive progress once for concurrent copies and skips completed stages', async () => {
    const userId = await createUser(pool);
    const occurredAt = new Date();
    let computations = 0;
    const progress = async () => { computations++; return { days: 1 }; };
    await Promise.all([1, 2].map(() => observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:one', occurredAt, progress,
    })));
    expect(computations).toBe(1);
    await observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:two', occurredAt, progress,
    });
    expect(computations).toBe(2);
    await observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:complete', occurredAt, progress: async () => ({ days: 5 }),
    });
    await observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:later', occurredAt,
      progress: async () => { throw new Error('completed stage must not scan history'); },
    });
    const rows = await pool.query("select progress from user_achievement_stages where user_id=$1 and achievement_id='career-streak'", [userId]);
    expect(rows.rows[0].progress).toEqual({ days: 5 });
  });

  it('rolls back the event receipt when progress computation fails and permits retry', async () => {
    const userId = await createUser(pool);
    const occurredAt = new Date();
    await expect(observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:retry', occurredAt,
      progress: async () => { throw new Error('history unavailable'); },
    })).rejects.toThrow('history unavailable');
    const retry = await observeAchievementStage(pool, userId, 'career-streak', {
      eventKey: 'activity-day:retry', occurredAt, progress: async () => ({ days: 2 }),
    });
    expect(retry).toEqual({ completed: false, stageNumber: 1 });
    const rows = await pool.query("select count(*)::int count from achievement_stage_events where user_id=$1 and event_key='activity-day:retry'", [userId]);
    expect(rows.rows[0].count).toBe(1);
  });

  it('accepts a perfect duel after an earlier duel exceeded the miss limit', async () => {
    const userId = await createUser(pool);
    const occurredAt = new Date();
    await observeAchievementStage(pool, userId, 'no-error-classic', {
      eventKey: 'duel:many-misses',
      occurredAt,
      progress: { format: 'classic', maximumNonGoals: 20 },
    });
    await expect(
      observeAchievementStage(pool, userId, 'no-error-classic', {
        eventKey: 'duel:perfect',
        occurredAt,
        progress: { format: 'classic', maximumNonGoals: 0 },
      }),
    ).resolves.toMatchObject({ completed: true });
  });

  it('does not combine the goals of one day with the winning third period of another', async () => {
    const userId = await createUser(pool);
    const occurredAt = new Date();
    await observeAchievementStage(pool, userId, 'third-period-decides', {
      eventKey: 'daily:high-but-tied',
      occurredAt,
      progress: { minimumFirstTwoGoals: 28, thirdPeriodStrictlyBetter: false },
    });
    await expect(
      observeAchievementStage(pool, userId, 'third-period-decides', {
        eventKey: 'daily:low-but-better',
        occurredAt,
        progress: { minimumFirstTwoGoals: 10, thirdPeriodStrictlyBetter: true },
      }),
    ).resolves.toMatchObject({ completed: false });
  });

  it('opens only stage one for a newly created user', async () => {
    const userId = await createUser(pool);
    const openedAt = new Date('2026-09-13T10:00:00.000Z');

    await openFirstAchievementStages(pool, userId, openedAt);

    const rows = await pool.query<{ stage_number: number; opened_at: Date }>(
      `select stage_number, opened_at
         from user_achievement_stages
        where user_id = $1`,
      [userId],
    );
    expect(rows.rows.length).toBeGreaterThan(20);
    expect(rows.rows.every((row) => row.stage_number === 1)).toBe(true);
    expect(rows.rows.every((row) => row.opened_at.getTime() === openedAt.getTime())).toBe(true);
  });

  it('ignores an event before the stage opened and completes at the exact threshold', async () => {
    const userId = await createUser(pool);
    const openedAt = new Date('2026-09-13T10:00:00.000Z');
    await openFirstAchievementStages(pool, userId, openedAt);

    await expect(
      observeAchievementStage(pool, userId, 'ice-hand', {
        eventKey: 'daily:old',
        occurredAt: new Date('2026-09-13T09:59:59.000Z'),
        progress: { accuracyPercent: 100 },
      }),
    ).resolves.toEqual({ completed: false, stageNumber: 1 });

    await expect(
      observeAchievementStage(pool, userId, 'ice-hand', {
        eventKey: 'daily:new',
        occurredAt: new Date('2026-09-13T10:01:00.000Z'),
        progress: { accuracyPercent: 90 },
      }),
    ).resolves.toEqual({ completed: true, stageNumber: 1 });
  });

  it('deduplicates events and never opens or completes a later stage from one result', async () => {
    const userId = await createUser(pool);
    await openFirstAchievementStages(pool, userId, new Date('2026-09-13T10:00:00.000Z'));
    const observation = {
      eventKey: 'daily:perfect',
      occurredAt: new Date('2026-09-13T10:01:00.000Z'),
      progress: { accuracyPercent: 100 },
    };

    await expect(observeAchievementStage(pool, userId, 'ice-hand', observation)).resolves.toEqual({
      completed: true,
      stageNumber: 1,
    });
    await expect(observeAchievementStage(pool, userId, 'ice-hand', observation)).resolves.toEqual({
      completed: false,
      stageNumber: 1,
    });

    const rows = await pool.query<{ stage_number: number; completed_at: Date | null }>(
      `select stage_number, completed_at
         from user_achievement_stages
        where user_id = $1 and achievement_id = 'ice-hand'
        order by stage_number`,
      [userId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ stage_number: 1, completed_at: expect.any(Date) });
  });

  it('stores unsuitable progress without completing the current stage', async () => {
    const userId = await createUser(pool);
    await openFirstAchievementStages(pool, userId, new Date('2026-09-13T10:00:00.000Z'));

    await expect(
      observeAchievementStage(pool, userId, 'career-goals', {
        eventKey: 'goal:1',
        occurredAt: new Date('2026-09-13T10:01:00.000Z'),
        progress: { total: 4_999 },
        context: { mode: 'daily' },
      }),
    ).resolves.toEqual({ completed: false, stageNumber: 1 });

    const row = await pool.query<{ progress: Record<string, number> }>(
      `select progress from user_achievement_stages
        where user_id = $1 and achievement_id = 'career-goals' and stage_number = 1`,
      [userId],
    );
    expect(row.rows[0]?.progress).toEqual({ total: 4_999 });
  });
});
