import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateMonthlyRatingSettledAchievements } from '../../src/achievements/engine.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe('monthly rating achievement evaluator boundaries', () => {
  it.each([0, -1, 1.5])('does not evaluate an invalid ranking place of %s', async (place) => {
    const db = {
      query: async (): Promise<never> => {
        throw new Error('invalid ranking place must not write an achievement');
      },
    } as unknown as Pool;

    await expect(
      evaluateMonthlyRatingSettledAchievements(db, {
        type: 'monthly_duel_rating_settled',
        seasonKey: '2026-08',
        userId: randomUUID(),
        place,
      }),
    ).resolves.toBeUndefined();
  });
});

describe.skipIf(!hasIntegrationEnv)('monthly rating achievement evaluator', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('completes both career achievements for first place only once', async () => {
    const userId = await createUser(pool);
    const firstSettlement = {
      type: 'monthly_duel_rating_settled' as const,
      seasonKey: '2026-08',
      userId,
      place: 1,
    };

    await evaluateMonthlyRatingSettledAchievements(pool, firstSettlement);
    await evaluateMonthlyRatingSettledAchievements(pool, {
      ...firstSettlement,
      seasonKey: '2026-09',
    });

    await expect(completedIds(pool, userId)).resolves.toEqual(['monthly-top-1', 'monthly-top-3']);
  });

  it.each([2, 3])('completes only the top-three achievement for place %s', async (place) => {
    const userId = await createUser(pool);

    await evaluateMonthlyRatingSettledAchievements(pool, {
      type: 'monthly_duel_rating_settled',
      seasonKey: '2026-08',
      userId,
      place,
    });

    await expect(completedIds(pool, userId)).resolves.toEqual(['monthly-top-3']);
  });
});

async function createUser(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Rating Achiever', null, 1, 'UTC')`,
    [id],
  );
  return id;
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
