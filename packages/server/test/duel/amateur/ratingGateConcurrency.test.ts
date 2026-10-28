import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv } from '../../helpers/testDb.js';
import { lockRatingLifecycle } from '../../../src/duel/amateur/ratingLock.js';

describe.skipIf(!hasIntegrationEnv)('rating gate concurrency', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = createTestPool();
  });
  afterAll(() => pool?.end());

  it('lets independent gameplay transactions participate together, but excludes month closure', async () => {
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    const [first, second, closing] = clients;
    try {
      for (const client of clients) await client.query('begin');
      await lockRatingLifecycle(first!);
      const shared = await second!.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) as acquired',
        ['monthly_duel_rating:lifecycle'],
      );
      expect(shared.rows[0]!.acquired).toBe(true);
      const exclusive = await closing!.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired',
        ['monthly_duel_rating:lifecycle'],
      );
      expect(exclusive.rows[0]!.acquired).toBe(false);
    } finally {
      for (const client of clients) {
        await client.query('rollback');
        client.release();
      }
    }
  });
  it('keeps month closure exclusive until its transaction finishes', async () => {
    const closing = await pool.connect();
    const gameplay = await pool.connect();
    try {
      await closing.query('begin');
      await gameplay.query('begin');
      await lockRatingLifecycle(closing, 'exclusive');
      const blocked = await gameplay.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) as acquired',
        ['monthly_duel_rating:lifecycle'],
      );
      expect(blocked.rows[0]!.acquired).toBe(false);
      await closing.query('commit');
      const released = await gameplay.query<{ acquired: boolean }>(
        'select pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) as acquired',
        ['monthly_duel_rating:lifecycle'],
      );
      expect(released.rows[0]!.acquired).toBe(true);
    } finally {
      await closing.query('rollback');
      await gameplay.query('rollback');
      closing.release();
      gameplay.release();
    }
  });
});
