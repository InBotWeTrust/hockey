import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const expectedAccuracyRewards = [
  ['accuracy-moscow', 5],
  ['accuracy-istanbul', 5],
  ['accuracy-rome', 5],
  ['accuracy-paris', 5],
  ['accuracy-london', 7],
  ['accuracy-new-york', 7],
  ['accuracy-rio-de-janeiro', 7],
  ['accuracy-cape-town', 10],
  ['accuracy-dubai', 10],
  ['accuracy-mumbai', 10],
  ['accuracy-singapore', 15],
  ['accuracy-beijing', 15],
  ['accuracy-tokyo', 25],
] as const;

describe.skipIf(!hasIntegrationEnv)('migration 122 bonus-game reward progression', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('stores the approved stars and experience rewards for all accuracy games', async () => {
    const { rows } = await pool.query<{
      slug: string;
      reward_coins: number;
      reward_stars: number;
      reward_experience: number;
    }>(
      `select slug, reward_coins, reward_stars, reward_experience
         from bonus_game
        where skill_code = 'accuracy'
        order by sort_order`,
    );

    expect(rows).toHaveLength(13);
    expect(
      rows.map((row) => [
        row.slug,
        row.reward_coins,
        row.reward_stars,
        row.reward_experience,
      ]),
    ).toEqual(expectedAccuracyRewards.map(([slug, reward]) => [slug, 0, reward, reward]));
  });
});
