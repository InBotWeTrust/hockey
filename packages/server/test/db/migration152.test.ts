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

describe.skipIf(!hasIntegrationEnv)('migration 152 marksmanship scoring V2', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '152_marksmanship_scoring_v2.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('publishes ten levels with the recalculated durations and targets', async () => {
    const { rows } = await pool.query<{
      slug: string;
      target_goals: number;
      qualification_rules: {
        targetPoints: number;
        activeTimeMs: number;
        scoring: Record<string, number>;
      };
      period_rules: Array<{ durationMs: number }>;
    }>(
      `select slug, target_goals, qualification_rules, period_rules
         from bonus_game
        where skill_code = 'marksmanship'
        order by sort_order`,
    );

    expect(
      rows.map((row) => ({
        slug: row.slug,
        durationMs: row.qualification_rules.activeTimeMs,
        targetPoints: row.qualification_rules.targetPoints,
      })),
    ).toEqual([
      { slug: 'marksmanship-1', durationMs: 30_000, targetPoints: 1_250 },
      { slug: 'marksmanship-2', durationMs: 50_000, targetPoints: 2_200 },
      { slug: 'marksmanship-3', durationMs: 70_000, targetPoints: 3_300 },
      { slug: 'marksmanship-4', durationMs: 90_000, targetPoints: 4_500 },
      { slug: 'marksmanship-5', durationMs: 110_000, targetPoints: 5_800 },
      { slug: 'marksmanship-6', durationMs: 130_000, targetPoints: 7_350 },
      { slug: 'marksmanship-7', durationMs: 150_000, targetPoints: 8_850 },
      { slug: 'marksmanship-8', durationMs: 170_000, targetPoints: 10_500 },
      { slug: 'marksmanship-9', durationMs: 190_000, targetPoints: 12_350 },
      { slug: 'marksmanship-10', durationMs: 210_000, targetPoints: 14_150 },
    ]);
    for (const row of rows) {
      expect(row.target_goals).toBe(row.qualification_rules.targetPoints);
      expect(row.period_rules).toEqual([
        expect.objectContaining({ durationMs: row.qualification_rules.activeTimeMs }),
      ]);
      expect(row.qualification_rules.scoring).toMatchObject({
        counterDirectionBonus: 20,
        closeGoalieBonus: 15,
        behindGoalieBonus: 30,
        boardNarrowBonus: 10,
        doubleMultiplier: 1.7,
        tripleMultiplier: 1.8,
      });
    }
  });

  it('allows the maximum V2 triple award while keeping non-negative points', async () => {
    const constraint = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = 'shot_session'::regclass
          and conname = 'shot_session_awarded_points_check'`,
    );
    expect(constraint.rows[0]?.definition).toContain('awarded_points <= 1000');
    expect(constraint.rows[0]?.definition).toContain('awarded_points >= 0');
  });
});
