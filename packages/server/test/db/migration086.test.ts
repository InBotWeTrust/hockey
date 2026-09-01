import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const MIGRATION_NAME = '086_repair_event_log_sequence.sql';

async function createMigrationsDirBefore(cutoff: string): Promise<string> {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-before-086-'));
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file.localeCompare(cutoff) < 0)
    .sort((left, right) => left.localeCompare(right));
  await Promise.all(
    files.map((file) => fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(targetDir, file))),
  );
  return targetDir;
}

describe.skipIf(!hasIntegrationEnv)('086 event log sequence repair', () => {
  let pool: Pool;
  let migrationsBefore086Dir: string | undefined;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    migrationsBefore086Dir = await createMigrationsDirBefore(MIGRATION_NAME);
    await applyMigrations(pool, migrationsBefore086Dir);
  });

  afterAll(async () => {
    await pool.end();
    if (migrationsBefore086Dir !== undefined) {
      await fs.rm(migrationsBefore086Dir, { recursive: true, force: true });
    }
  });

  it('advances the event log sequence past explicitly restored ids', async () => {
    const userId = '00000000-0000-4000-8000-000000000861';
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Sequence Repair Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into event_log (id, user_id, type, payload)
       values (2905, $1, 'amateur_duel_challenge_created', '{}'::jsonb)`,
      [userId],
    );
    await pool.query(`select setval(pg_get_serial_sequence('event_log', 'id'), 2904, true)`);

    const applied = await applyMigrations(pool, MIGRATIONS_DIR);
    const inserted = await pool.query<{ id: string }>(
      `insert into event_log (user_id, type, payload)
       values ($1, 'amateur_duel_challenge_created', '{}'::jsonb)
       returning id::text`,
      [userId],
    );

    expect(applied.applied).toContain(MIGRATION_NAME);
    expect(inserted.rows[0]?.id).toBe('2906');
  });

  it('does not move an already-ahead event log sequence backwards', async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, migrationsBefore086Dir!);

    const userId = '00000000-0000-4000-8000-000000000862';
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Ahead Sequence Player', 'Europe/Moscow')`,
      [userId],
    );
    await pool.query(
      `insert into event_log (id, user_id, type, payload)
       values (2905, $1, 'amateur_duel_challenge_created', '{}'::jsonb)`,
      [userId],
    );
    await pool.query(`select setval(pg_get_serial_sequence('event_log', 'id'), 4000, true)`);

    await applyMigrations(pool, MIGRATIONS_DIR);
    const inserted = await pool.query<{ id: string }>(
      `insert into event_log (user_id, type, payload)
       values ($1, 'amateur_duel_challenge_created', '{}'::jsonb)
       returning id::text`,
      [userId],
    );

    expect(inserted.rows[0]?.id).toBe('4002');
  });
});
