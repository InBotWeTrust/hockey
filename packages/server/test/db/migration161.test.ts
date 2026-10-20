import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MARKSMANSHIP_V5_SCORING_RULES, parseMarksmanshipScoringRules } from '@hockey/game-core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrationsThrough } from '../helpers/migrations.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations',
);
const FILE = '161_marksmanship_scoring_v5.sql';
const TARGETS = [90, 170, 250, 340, 440, 550, 670, 790, 930, 1070];

describe.skipIf(!hasIntegrationEnv)('migration 161 marksmanship V5', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, MIGRATIONS_DIR, FILE);
  });

  afterAll(async () => { await pool?.end(); });

  it('publishes ten V5 target snapshots without changing the period durations', async () => {
    const { rows } = await pool.query<{
      target_goals: number;
      qualification_rules: { targetPoints: number; scoring: unknown };
      period_rules: Array<{ durationMs: number }>;
    }>(`select target_goals, qualification_rules, period_rules
          from bonus_game where skill_code = 'marksmanship' order by sort_order`);
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.target_goals)).toEqual(TARGETS);
    rows.forEach((row, index) => {
      expect(row.qualification_rules.targetPoints).toBe(TARGETS[index]);
      expect(parseMarksmanshipScoringRules(row.qualification_rules.scoring)).toEqual(
        DEFAULT_MARKSMANSHIP_V5_SCORING_RULES,
      );
      expect(row.period_rules[0]?.durationMs).toBe(30_000 + index * 20_000);
    });
  });

  it('does not overwrite a catalog entry whose scoring version is newer than V4', async () => {
    const id = '00000000-0000-4000-8000-000000000701';
    await pool.query(`update bonus_game
                         set qualification_rules = jsonb_set(qualification_rules, '{scoring,version}', '99'::jsonb)
                       where id = $1`, [id]);
    await pool.query(readFileSync(path.join(MIGRATIONS_DIR, FILE), 'utf8'));
    const { rows } = await pool.query<{ target_goals: number; version: string }>(
      `select target_goals, qualification_rules #>> '{scoring,version}' as version
         from bonus_game where id = $1`, [id],
    );
    expect(rows[0]).toEqual({ target_goals: 90, version: '99' });
  });
});
