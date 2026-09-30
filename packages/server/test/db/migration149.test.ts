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

describe.skipIf(!hasIntegrationEnv)('migration 149 endurance copy', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '149_update_bonus_endurance_copy.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('updates both catalogue and preview copy for every endurance game', async () => {
    const games = await pool.query<{ description: string; preview_story: string }>(
      `select description, preview_story
         from bonus_game
        where skill_code = 'endurance'
        order by sort_order`,
    );

    expect(games.rows).toHaveLength(7);
    expect(new Set(games.rows.map((game) => game.description))).toEqual(
      new Set([
        'Продержитесь до конца периода, забивая хотя бы 1 шайбу в каждом временном окне.',
      ]),
    );
    expect(new Set(games.rows.map((game) => game.preview_story))).toEqual(
      new Set([
        'Продержитесь до конца периода, забивая хотя бы 1 шайбу в каждом временном окне.',
      ]),
    );
  });
});
