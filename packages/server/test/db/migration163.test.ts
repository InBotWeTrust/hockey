import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrationsThrough } from '../helpers/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations/163_easier_bonus_challenges.sql',
);
const migrationsDir = path.dirname(migrationPath);

describe('easier bonus challenge catalog migration', () => {
  it('publishes the calibrated marksmanship targets and endurance windows', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const targets = [80, 140, 220, 300, 400, 500, 610, 730, 870, 1010];
    const windows = [12000, 10000, 8000, 7000, 6000, 5000, 4000];

    for (const [index, target] of targets.entries()) {
      expect(sql).toContain(`(${index + 1}, ${target})`);
    }
    for (const [index, window] of windows.entries()) {
      expect(sql).toContain(`(${index + 1}, ${window})`);
    }
    expect(sql).toContain("'{targetPoints}'");
    expect(sql).toContain("'{goalWindowMs}'");
    expect(sql).toContain("game.skill_code = 'marksmanship'");
    expect(sql).toContain("game.skill_code = 'endurance'");
    expect(sql).not.toMatch(/\bupdate\s+bonus_game_attempt\b/i);
  });
});

describe.skipIf(!hasIntegrationEnv)('easier bonus challenge catalog database migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, migrationsDir, '163_easier_bonus_challenges.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('updates both catalog tracks without changing their rules or durations', async () => {
    const result = await pool.query<{
      slug: string;
      target_goals: number;
      qualification_rules: { targetPoints?: number; goalWindowMs?: number; activeTimeMs: number };
      period_rules: Array<{ durationMs: number }>;
    }>(`select slug, target_goals, qualification_rules, period_rules
          from bonus_game
         where skill_code in ('marksmanship', 'endurance')
         order by skill_code, sort_order`);
    const endurance = result.rows.filter((row) => row.slug.startsWith('endurance-'));
    const marksmanship = result.rows.filter((row) => row.slug.startsWith('marksmanship-'));

    expect(endurance.map((row) => row.qualification_rules.goalWindowMs))
      .toEqual([12000, 10000, 8000, 7000, 6000, 5000, 4000]);
    expect(endurance.map((row) => row.qualification_rules.activeTimeMs))
      .toEqual([180000, 190000, 200000, 210000, 220000, 230000, 240000]);
    expect(marksmanship.map((row) => row.target_goals))
      .toEqual([80, 140, 220, 300, 400, 500, 610, 730, 870, 1010]);
    expect(marksmanship.every((row) => row.target_goals === row.qualification_rules.targetPoints))
      .toBe(true);
    expect(marksmanship.map((row) => row.period_rules[0]?.durationMs))
      .toEqual([30000, 50000, 70000, 90000, 110000, 130000, 150000, 170000, 190000, 210000]);
  });
});
