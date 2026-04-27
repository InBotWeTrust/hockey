import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import fs from 'node:fs';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const BACKFILL_FILE = path.join(MIGRATIONS_DIR, '008_backfill_legacy_timezone.sql');

const OWNER_TG_UID = '432014500';

async function insertUser(
  pool: Pool,
  opts: { id?: string; tgUid?: string; tz?: string } = {},
): Promise<string> {
  const id = opts.id ?? randomUUID();
  await pool.query(
    'insert into users (id, display_name, timezone) values ($1, $2, $3)',
    [id, 'Test', opts.tz ?? 'UTC'],
  );
  if (opts.tgUid) {
    await pool.query(
      `insert into auth_providers (id, user_id, provider, provider_uid)
       values ($1, $2, 'telegram', $3)`,
      [randomUUID(), id, opts.tgUid],
    );
  }
  return id;
}

describe.skipIf(!hasIntegrationEnv)('migration 008_backfill_legacy_timezone', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    // Apply only migrations 001..006 by default; 007 is run by tests
    // explicitly to control the order around fixture inserts.
    await pool.query(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const earlier = ['001_init.sql', '002_grip.sql', '003_day_pool.sql', '004_chat.sql', '005_chat_reaction_user_unique.sql', '006_chat_rename_system_default.sql', '007_chat_pinned.sql'];
    for (const name of earlier) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      await pool.query(sql);
      await pool.query('insert into _migrations (name) values ($1) on conflict do nothing', [name]);
    }
  });

  async function runBackfill(): Promise<void> {
    const sql = fs.readFileSync(BACKFILL_FILE, 'utf8');
    await pool.query(sql);
  }

  it('updates timezone for the owner account from UTC to Europe/Moscow', async () => {
    const ownerId = await insertUser(pool, { tgUid: OWNER_TG_UID, tz: 'UTC' });
    await runBackfill();
    const { rows } = await pool.query<{ timezone: string }>(
      'select timezone from users where id=$1',
      [ownerId],
    );
    expect(rows[0]!.timezone).toBe('Europe/Moscow');
  });

  it('does not touch other users with UTC', async () => {
    const otherId = await insertUser(pool, { tgUid: '999000111', tz: 'UTC' });
    await runBackfill();
    const { rows } = await pool.query<{ timezone: string }>(
      'select timezone from users where id=$1',
      [otherId],
    );
    expect(rows[0]!.timezone).toBe('UTC');
  });

  it('does not overwrite owner when timezone was already set explicitly', async () => {
    const ownerId = await insertUser(pool, { tgUid: OWNER_TG_UID, tz: 'America/New_York' });
    await runBackfill();
    const { rows } = await pool.query<{ timezone: string }>(
      'select timezone from users where id=$1',
      [ownerId],
    );
    expect(rows[0]!.timezone).toBe('America/New_York');
  });

  it('is idempotent on re-application', async () => {
    const ownerId = await insertUser(pool, { tgUid: OWNER_TG_UID, tz: 'UTC' });
    await runBackfill();
    await runBackfill();
    const { rows } = await pool.query<{ timezone: string }>(
      'select timezone from users where id=$1',
      [ownerId],
    );
    expect(rows[0]!.timezone).toBe('Europe/Moscow');
  });
});
