import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);
const MIGRATION_NAME = '125_align_amateur_duel_template_puck_speed.sql';

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-125-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('125 amateur duel template puck-speed alignment', () => {
  let pool: Pool;
  let migrationsBefore125Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore125Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore125Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore125Dir !== undefined) {
      await fs.rm(migrationsBefore125Dir, { recursive: true, force: true });
    }
  });

  it('aligns only the active standard duel templates to the dev puck-speed baseline', async () => {
    await pool.query(
      `update amateur_duel_template template
          set period_speed_presets = (
            select jsonb_agg(
                     jsonb_set(period, '{puckSpeedPerMs}', '1.25'::jsonb)
                     order by (period->>'periodNumber')::int
                   )
              from jsonb_array_elements(template.period_speed_presets) period
          )
        where template.deleted_at is null
          and template.duel_kind in ('classic', 'express_plus', 'express')`,
    );
    const before = await pool.query<{
      title: string;
      speeds: Array<{ puckSpeedPerMs: number }>;
    }>(
      `select title, period_speed_presets as speeds
         from amateur_duel_template
        where deleted_at is null
          and duel_kind in ('classic', 'express_plus', 'express')
        order by duel_kind`,
    );
    expect(before.rows).toHaveLength(3);
    for (const template of before.rows) {
      expect(template.speeds.map((period) => period.puckSpeedPerMs)).toEqual(
        Array(template.speeds.length).fill(1.25),
      );
    }

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(applied.applied).toContain(MIGRATION_NAME);

    const after = await pool.query<{
      title: string;
      speeds: Array<{ puckSpeedPerMs: number }>;
    }>(
      `select title, period_speed_presets as speeds
         from amateur_duel_template
        where deleted_at is null
          and duel_kind in ('classic', 'express_plus', 'express')
        order by duel_kind`,
    );
    expect(after.rows.map((template) => template.title)).toEqual([
      'Классика',
      'Экспресс',
      'Микс',
    ]);
    for (const template of after.rows) {
      expect(template.speeds.map((period) => period.puckSpeedPerMs)).toEqual(
        Array(template.speeds.length).fill(0.85),
      );
    }
  });
});
