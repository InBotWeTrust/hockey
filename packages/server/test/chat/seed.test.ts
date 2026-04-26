import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { hasIntegrationEnv, createTestPool, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { seedSystemChannel } from '../../src/chat/seed.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('seedSystemChannel', () => {
  let pool: Pool;
  let systemUserId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    const r = await pool.query(
      `insert into users (id, display_name, timezone)
       values (gen_random_uuid(), $1, 'UTC') returning id`,
      ['System'],
    );
    systemUserId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`delete from chats`);
  });

  it('creates a new system chat with type=system and is_active=true', async () => {
    const result = await seedSystemChannel(pool, {
      name: 'Общий чат лиги',
      createdBy: systemUserId,
    });
    expect(result.created).toBe(true);
    expect(result.chat.type).toBe('system');
    expect(result.chat.name).toBe('Общий чат лиги');
    expect(result.chat.is_active).toBe(true);

    const rows = await pool.query(`select * from chats where type = 'system'`);
    expect(rows.rowCount).toBe(1);
  });

  it('is idempotent — calling twice with the same name yields the same chat', async () => {
    const r1 = await seedSystemChannel(pool, { name: 'X', createdBy: systemUserId });
    const r2 = await seedSystemChannel(pool, { name: 'X', createdBy: systemUserId });
    expect(r1.chat.id).toBe(r2.chat.id);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
  });

  it('does NOT create chat_members rows (members are lazy)', async () => {
    await seedSystemChannel(pool, { name: 'Y', createdBy: systemUserId });
    const m = await pool.query(`select count(*)::int as c from chat_members`);
    expect(m.rows[0].c).toBe(0);
  });

  it('rejects empty name', async () => {
    await expect(
      seedSystemChannel(pool, { name: '', createdBy: systemUserId }),
    ).rejects.toThrow(/name/i);
  });
});
