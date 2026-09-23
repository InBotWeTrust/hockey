import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MARKSMANSHIP_V3_SCORING_RULES, parseMarksmanshipScoringRules } from '@hockey/game-core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrationsThrough } from '../helpers/migrations.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations',
);

describe.skipIf(!hasIntegrationEnv)('migration 154 marksmanship single-category scoring', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, '154_marksmanship_single_category_scoring.sql');
  });

  afterAll(async () => { await pool?.end(); });

  it('publishes ten V3 targets without changing periods or rewards', async () => {
    const { rows } = await pool.query<{
      target_goals: number;
      qualification_rules: { targetPoints: number; scoring: unknown };
      period_rules: Array<{ durationMs: number }>;
      reward_coins: number;
      reward_stars: number;
      preview_revision: number;
    }>(`select target_goals, qualification_rules, period_rules, reward_coins, reward_stars, preview_revision
          from bonus_game where skill_code = 'marksmanship' order by sort_order`);
    expect(rows.map((row) => row.target_goals)).toEqual([25, 43, 65, 88, 113, 142, 170, 201, 237, 272]);
    rows.forEach((row, index) => {
      expect(row.qualification_rules.targetPoints).toBe(row.target_goals);
      expect(parseMarksmanshipScoringRules(row.qualification_rules.scoring)).toEqual(
        DEFAULT_MARKSMANSHIP_V3_SCORING_RULES,
      );
      expect(row.period_rules[0]?.durationMs).toBe(30_000 + index * 20_000);
      expect(row.reward_coins).toBeGreaterThanOrEqual(0);
      expect(row.reward_stars).toBeGreaterThanOrEqual(0);
      expect(row.preview_revision).toBeGreaterThanOrEqual(2);
    });
  });
});
