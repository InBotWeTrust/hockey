import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('applyMigrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies pending migrations and is idempotent', async () => {
    const first = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(first.applied).toContain('001_init.sql');

    const second = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);

    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain('users');
    expect(names).toContain('day_pool');
    expect(names).toContain('training_session');
    expect(names).toContain('achievements');
    expect(names).toContain('user_achievements');
    expect(names).toContain('shot_session');
    expect(names).toContain('event_log');
    expect(names).toContain('game_settings');
    expect(names).toContain('_migrations');
  });

  it('records applied migrations in the ledger', async () => {
    const { rows } = await pool.query<{ name: string }>(
      'select name from _migrations order by name',
    );
    expect(rows.map((r) => r.name)).toEqual([
      '001_init.sql',
      '002_grip.sql',
      '003_day_pool.sql',
      '004_chat.sql',
      '005_chat_reaction_user_unique.sql',
      '006_chat_rename_system_default.sql',
      '007_chat_pinned.sql',
      '008_backfill_legacy_timezone.sql',
      '009_chat_description.sql',
      '010_vk_auth_and_display_source.sql',
      '011_training_session.sql',
      '012_achievements.sql',
      '013_refresh_profile_achievements.sql',
      '014_training_daily_locks.sql',
      '015_admin_roles_and_game_settings.sql',
    ]);
  });
});
