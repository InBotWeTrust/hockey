import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrationsThrough } from '../helpers/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const MIGRATION_NAME = '106_achievement_bonus_economy.sql';
const PREVIOUS_MIGRATION_NAME = '105_training_history.sql';

const expectedBonusRewards = new Map<string, number>([
  ['speed-beach', 5],
  ['speed-ski-resort', 5],
  ['speed-cyberpunk-yard', 5],
  ['speed-abandoned-waterpark', 7],
  ['speed-pirate-bay', 7],
  ['speed-north-pole', 7],
  ['speed-desert', 10],
  ['speed-volcanic-ice', 10],
  ['speed-castle', 10],
  ['speed-space', 15],
  ['accuracy-moscow', 5],
  ['accuracy-istanbul', 5],
  ['accuracy-rome', 5],
  ['accuracy-paris', 5],
  ['accuracy-london', 10],
  ['accuracy-new-york', 10],
  ['accuracy-rio-de-janeiro', 10],
  ['accuracy-cape-town', 15],
  ['accuracy-dubai', 15],
  ['accuracy-mumbai', 15],
  ['accuracy-singapore', 6],
  ['accuracy-beijing', 6],
  ['accuracy-tokyo', 25],
]);

const speedSlugs = [
  'speed-beach',
  'speed-ski-resort',
  'speed-cyberpunk-yard',
  'speed-abandoned-waterpark',
  'speed-pirate-bay',
  'speed-north-pole',
  'speed-desert',
  'speed-volcanic-ice',
  'speed-castle',
  'speed-space',
];

describe.skipIf(!hasIntegrationEnv)('migration 106 achievement and bonus economy', () => {
  let pool: Pool;
  let speedLimitsBefore = new Map<string, number>();

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, PREVIOUS_MIGRATION_NAME);
    const before = await pool.query<{ slug: string; active_time_ms: number }>(
      `select slug, (qualification_rules->>'activeTimeMs')::int as active_time_ms
         from bonus_game
        where slug = any($1::text[])`,
      [speedSlugs],
    );
    speedLimitsBefore = new Map(before.rows.map((row) => [row.slug, row.active_time_ms]));
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, MIGRATION_NAME);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('stores all 23 free bonus games with approved equal star and experience rewards', async () => {
    const { rows } = await pool.query<{
      slug: string;
      reward_coins: number;
      reward_stars: number;
      reward_experience: number;
      access_type: string;
      unlock_price_stars: number;
    }>(
      `select slug, reward_coins, reward_stars, reward_experience,
              access_type, unlock_price_stars
         from bonus_game
        where slug = any($1::text[])
        order by slug`,
      [[...expectedBonusRewards.keys()]],
    );

    expect(rows).toHaveLength(expectedBonusRewards.size);
    for (const row of rows) {
      expect(row, row.slug).toMatchObject({
        reward_coins: 0,
        reward_stars: expectedBonusRewards.get(row.slug),
        reward_experience: expectedBonusRewards.get(row.slug),
        access_type: 'free',
        unlock_price_stars: 0,
      });
    }
  });

  it('reduces every speed limit by five seconds and keeps period totals aligned', async () => {
    const { rows } = await pool.query<{
      slug: string;
      active_time_ms: number;
      period_time_ms: number;
    }>(
      `select slug,
              (qualification_rules->>'activeTimeMs')::int as active_time_ms,
              (select sum((period->>'durationMs')::int)
                 from jsonb_array_elements(period_rules) period)::int as period_time_ms
         from bonus_game
        where slug = any($1::text[])
        order by slug`,
      [speedSlugs],
    );

    expect(rows).toHaveLength(speedSlugs.length);
    for (const row of rows) {
      expect(row.active_time_ms, row.slug).toBe(speedLimitsBefore.get(row.slug)! - 5_000);
      expect(row.period_time_ms, row.slug).toBe(row.active_time_ms);
    }
  });

  it('is a migration-ledger no-op when migrations are applied again', async () => {
    await expect(applyMigrationsThrough(pool, MIGRATIONS_DIR, MIGRATION_NAME)).resolves.toEqual({
      applied: [],
    });
  });
});
