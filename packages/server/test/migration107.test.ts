import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GAME_SETTING_DEFINITIONS,
  getGameSettings,
  validateGameSettingValue,
} from '../src/duel/gameSettings.js';
import { applyMigrations } from '../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from './helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, '107_gameplay_cooldown_one_hour.sql');

describe('gameplay recovery defaults', () => {
  it.each([0, 30, 90, 1440])(
    'keeps the rolling hour authoritative over legacy admin value %i',
    async (value) => {
      expect(validateGameSettingValue('training.daily_cooldown_minutes', value).value).toBe(60);
      const settings = await getGameSettings({
        query: async () => ({ rows: [{ key: 'training.daily_cooldown_minutes', value }] }),
      } as unknown as Pool);
      expect(settings.training.dailyCooldownMinutes).toBe(60);
    },
  );

  it('defaults the configured training-to-daily cooldown to 60 minutes', () => {
    const definition = GAME_SETTING_DEFINITIONS.find(
      (candidate) => candidate.key === 'training.daily_cooldown_minutes',
    );

    expect(definition?.defaultValue).toBe(60);
  });
});

describe.skipIf(!hasIntegrationEnv)('migration 107 gameplay cooldown', () => {
  let pool: Pool;
  let migrationSql: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    migrationSql = await readFile(MIGRATION_PATH, 'utf8');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('inserts the one-hour value when the setting is missing', async () => {
    await pool.query("delete from game_settings where key = 'training.daily_cooldown_minutes'");

    await pool.query(migrationSql);

    const { rows } = await pool.query<{ value: number }>(
      "select value from game_settings where key = 'training.daily_cooldown_minutes'",
    );
    expect(rows).toEqual([{ value: 60 }]);
  });

  it('upgrades 30 to 60, preserves other settings, and is idempotent', async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('training.daily_cooldown_minutes', to_jsonb(30), 'old', 'old')
       on conflict (key) do update set value = excluded.value`,
    );
    const sentinel = await pool.query<{ value: unknown }>(
      "select value from game_settings where key = 'training.shots_limit'",
    );

    await pool.query(migrationSql);
    await pool.query(migrationSql);

    const upgraded = await pool.query<{ value: number }>(
      "select value from game_settings where key = 'training.daily_cooldown_minutes'",
    );
    const preserved = await pool.query<{ value: unknown }>(
      "select value from game_settings where key = 'training.shots_limit'",
    );
    expect(upgraded.rows).toEqual([{ value: 60 }]);
    expect(preserved.rows).toEqual(sentinel.rows);
  });
});
