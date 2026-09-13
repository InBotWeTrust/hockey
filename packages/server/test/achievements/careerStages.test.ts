import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  fetchAchievementCatalogueForUser,
  observeCareerGoal,
} from '../../src/achievements/service.js';
import { openFirstAchievementStages } from '../../src/achievements/stageProgress.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('career achievement stages', () => {
  let pool: Pool;
  let userId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    userId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, avatar_url, level, timezone)
       values ($1, 'Career Player', null, 1, 'UTC')`,
      [userId],
    );
    await openFirstAchievementStages(pool, userId, new Date('2026-09-13T10:00:00.000Z'));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns one career card with current stage, reward and claimed history', async () => {
    await pool.query(
      `update user_achievement_stages
          set completed_at = '2026-09-13T10:01:00.000Z',
              claimed_at = '2026-09-13T10:02:00.000Z',
              reward_snapshot = '{"currency":0,"stars":25,"experience":25,"tokens":0}'
        where user_id = $1 and achievement_id = 'career-goals' and stage_number = 1`,
      [userId],
    );
    await pool.query(
      `insert into user_achievement_stages
         (user_id, achievement_id, stage_number, opened_at, progress)
       values ($1, 'career-goals', 2, '2026-09-13T10:02:00.000Z', '{"total":7500}')`,
      [userId],
    );

    const catalogue = await fetchAchievementCatalogueForUser(pool, userId);
    const cards = catalogue.filter((achievement) => achievement.id === 'career-goals');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      category: 'career',
      requirement: 'Забросить 10 000 шайб',
      rewardStars: 40,
      rewardExperience: 40,
      status: 'locked',
      stage: {
        current: 2,
        total: 8,
        progressValue: 7_500,
        targetValue: 10_000,
        history: [
          {
            stageNumber: 1,
            claimedAt: '2026-09-13T10:02:00.000Z',
            requirement: 'Забросить 5 000 шайб',
          },
        ],
      },
    });
  });

  it('reports compound event stages as one required completion instead of the qualifier value', async () => {
    await pool.query(
      `update user_achievement_stages
          set progress = '{"minimumExperienceDifference":0}'
        where user_id = $1 and achievement_id = 'underdog' and stage_number = 1`,
      [userId],
    );

    let catalogue = await fetchAchievementCatalogueForUser(pool, userId);
    expect(catalogue.find((achievement) => achievement.id === 'underdog')?.stage).toMatchObject({
      progressValue: 0,
      targetValue: 1,
    });

    await pool.query(
      `update user_achievement_stages
          set progress = '{"minimumExperienceDifference":150}',
              completed_at = '2026-09-13T12:00:00.000Z'
        where user_id = $1 and achievement_id = 'underdog' and stage_number = 1`,
      [userId],
    );

    catalogue = await fetchAchievementCatalogueForUser(pool, userId);
    expect(catalogue.find((achievement) => achievement.id === 'underdog')?.stage).toMatchObject({
      progressValue: 1,
      targetValue: 1,
    });
  });

  it('counts only eligible goal modes and deduplicates the same accepted event', async () => {
    await expect(
      observeCareerGoal(pool, userId, {
        eventKey: 'training:1',
        occurredAt: new Date('2026-09-13T11:00:00.000Z'),
        mode: 'training',
        lifetimeTotal: 10_000,
      }),
    ).resolves.toEqual({ completed: false, stageNumber: null });

    await expect(
      observeCareerGoal(pool, userId, {
        eventKey: 'daily:goal:1',
        occurredAt: new Date('2026-09-13T11:01:00.000Z'),
        mode: 'daily',
        lifetimeTotal: 10_000,
      }),
    ).resolves.toEqual({ completed: true, stageNumber: 2 });
    await expect(
      observeCareerGoal(pool, userId, {
        eventKey: 'daily:goal:1',
        occurredAt: new Date('2026-09-13T11:01:00.000Z'),
        mode: 'daily',
        lifetimeTotal: 10_001,
      }),
    ).resolves.toEqual({ completed: false, stageNumber: 2 });
  });
});
