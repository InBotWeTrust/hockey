import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

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

const expectedSpeedLimits = new Map<string, number>([
  ['speed-beach', 115_000],
  ['speed-ski-resort', 115_000],
  ['speed-cyberpunk-yard', 115_000],
  ['speed-abandoned-waterpark', 175_000],
  ['speed-pirate-bay', 175_000],
  ['speed-north-pole', 175_000],
  ['speed-desert', 235_000],
  ['speed-volcanic-ice', 235_000],
  ['speed-castle', 235_000],
  ['speed-space', 355_000],
]);

describe.skipIf(!hasIntegrationEnv)('migration 106 achievement and bonus economy', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
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
    const speedSlugs = [...expectedSpeedLimits.keys()];
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

    expect(rows).toHaveLength(expectedSpeedLimits.size);
    for (const row of rows) {
      expect(row.active_time_ms, row.slug).toBe(expectedSpeedLimits.get(row.slug));
      expect(row.period_time_ms, row.slug).toBe(row.active_time_ms);
    }
  });

  it('is a migration-ledger no-op when migrations are applied again', async () => {
    await expect(applyMigrations(pool, MIGRATIONS_DIR)).resolves.toBeUndefined();
  });
});
