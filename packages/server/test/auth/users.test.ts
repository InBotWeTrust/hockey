import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('findOrCreateTelegramUser', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade',
    );
  });

  it('creates user + wallet + equipment + starter stick + auth_providers row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    const wallet = await pool.query('select * from user_wallet where user_id=$1', [user.id]);
    expect(wallet.rowCount).toBe(1);
    expect(wallet.rows[0].shots_current).toBe(25);
    expect(wallet.rows[0].shots_max).toBe(25);
    const eq = await pool.query('select * from user_equipment where user_id=$1', [user.id]);
    expect(eq.rows[0].equipped_stick).toBe('training');
    const sticks = await pool.query('select stick_id from user_sticks where user_id=$1', [user.id]);
    expect(sticks.rows.map((r) => r.stick_id)).toEqual(['training']);
    const prov = await pool.query(
      "select provider, provider_uid from auth_providers where user_id=$1",
      [user.id],
    );
    expect(prov.rows[0]).toEqual({ provider: 'telegram', provider_uid: '100500' });
  });

  it('is idempotent: second call with same provider_uid returns existing user', async () => {
    const first = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor',
    });
    const second = await findOrCreateTelegramUser(pool, {
      providerUid: '100500',
      displayName: 'Egor (renamed)',
    });
    expect(second.id).toBe(first.id);
    const count = await pool.query('select count(*)::int as n from users');
    expect(count.rows[0].n).toBe(1);
  });

  it('optional avatarUrl persists on users row', async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: '200',
      displayName: 'Test',
      avatarUrl: 'https://t.me/i/pic.jpg',
    });
    const row = await pool.query('select avatar_url from users where id=$1', [user.id]);
    expect(row.rows[0].avatar_url).toBe('https://t.me/i/pic.jpg');
  });
});
