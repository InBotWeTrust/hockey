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

describe.skipIf(!hasIntegrationEnv)('migration 153 initial training position drills', () => {
  let pool: Pool;
  const userId = '00000000-0000-4000-8000-000000000153';

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '152_marksmanship_scoring_v2.sql');
    await pool.query(`insert into users (id, display_name) values ($1, 'Migration test')`, [userId]);
    await pool.query(
      `insert into initial_training_run (user_id, exercise_key, state, seed, game_core_version)
       values ($1, 'moving-goal', 'active', 'active-seed', 1),
              ($1, 'first-shot', 'completed', 'completed-seed', 1)`,
      [userId],
    );
    await pool.query(
      `insert into initial_training_completion
         (user_id, exercise_key, reward_stars, reward_experience)
       values ($1, 'first-shot', 1, 1)`,
      [userId],
    );
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '153_initial_training_position_drills.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('updates balance, abandons an active affected run, and preserves earned progress', async () => {
    const config = await pool.query<{ value: Record<string, Record<string, number>> }>(
      `select value from game_settings where key = 'training.initial_course.config'`,
    );
    expect(config.rows[0]?.value.targetGoals).toMatchObject({
      'moving-goal': 9,
      'find-the-gap': 9,
      'pressure-window': 6,
      'game-pace': 6,
    });

    const runs = await pool.query<{ exercise_key: string; state: string }>(
      `select exercise_key, state from initial_training_run where user_id = $1 order by exercise_key`,
      [userId],
    );
    expect(runs.rows).toEqual([
      { exercise_key: 'first-shot', state: 'completed' },
      { exercise_key: 'moving-goal', state: 'abandoned' },
    ]);
    const completions = await pool.query<{ exercise_key: string; reward_stars: number; reward_experience: number }>(
      `select exercise_key, reward_stars, reward_experience
         from initial_training_completion where user_id = $1`,
      [userId],
    );
    expect(completions.rows).toEqual([
      { exercise_key: 'first-shot', reward_stars: 1, reward_experience: 1 },
    ]);
  });
});
