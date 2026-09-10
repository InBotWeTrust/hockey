import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from './helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, '../db/migrations/109_drop_legacy_user_wallet.sql');

describe('migration 109 legacy user wallet cleanup', () => {
  it('drops the obsolete wallet table without rewriting migration history', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(/drop table if exists user_wallet/i);
    expect(sql).not.toMatch(/delete from/i);
  });
});

describe.skipIf(!hasIntegrationEnv)('migration 109 database contract', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, path.dirname(migrationPath));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('removes only the legacy wallet table', async () => {
    const { rows } = await pool.query<{ wallet: string | null; currency: string | null }>(
      `select to_regclass('public.user_wallet')::text as wallet,
              to_regclass('public.user_currency_account')::text as currency`,
    );

    expect(rows).toEqual([{ wallet: null, currency: 'user_currency_account' }]);
  });
});
