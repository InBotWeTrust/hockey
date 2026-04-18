import { describe, it, expect } from 'vitest';
import {
  createTestPool,
  createTestRedis,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from './testDb.js';

describe.skipIf(!hasIntegrationEnv)('test infra bootstrap', () => {
  it('connects to postgres and resets public schema', async () => {
    const pool = createTestPool();
    try {
      await pool.query('create table if not exists _sanity (id int)');
      await resetDatabase(pool);
      const { rows } = await pool.query<{ count: string }>(
        "select count(*)::text as count from information_schema.tables where table_schema = 'public'",
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });

  it('connects to redis and flushes db', async () => {
    const redis = createTestRedis();
    try {
      await redis.set('bootstrap-key', 'x');
      await resetRedis(redis);
      const v = await redis.get('bootstrap-key');
      expect(v).toBeNull();
    } finally {
      redis.disconnect();
    }
  });
});
