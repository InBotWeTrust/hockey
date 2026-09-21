import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrationsThrough } from '../helpers/migrations.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

describe.skipIf(!hasIntegrationEnv)('migration 151 endurance amateur goalkeeper', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '151_endurance_amateur_goalkeeper.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('uses the standard amateur goalkeeper for every endurance definition', async () => {
    const games = await pool.query<{
      goalkeeper_ready_url: string;
      goalkeeper_save_url: string;
    }>(
      `select goalkeeper_ready_url, goalkeeper_save_url
         from bonus_game
        where skill_code = 'endurance'
        order by sort_order`,
    );

    expect(games.rows).toHaveLength(7);
    expect(new Set(games.rows.map((game) => game.goalkeeper_ready_url))).toEqual(
      new Set(['/sprites/test-goalie-black.webp']),
    );
    expect(new Set(games.rows.map((game) => game.goalkeeper_save_url))).toEqual(
      new Set(['/sprites/test-goalie-black-save.webp']),
    );
  });
});
