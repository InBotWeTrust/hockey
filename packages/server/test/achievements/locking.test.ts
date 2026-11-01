import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Pool } from 'pg';
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { openFirstAchievementStages } from '../../src/achievements/stageProgress.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
describe.skipIf(!hasIntegrationEnv)('achievement lock ordering', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, path.resolve(import.meta.dirname, '../../db/migrations'));
  });
  afterAll(async () => {
    await pool?.end();
  });
  it('does not deadlock a reward claim against background stage initialization', async () => {
    const id = randomUUID();
    await pool.query(
      "insert into users(id,display_name,timezone) values($1,'Lock fixture','UTC')",
      [id],
    );
    const claim = await pool.connect(),
      background = await pool.connect();
    try {
      await claim.query('begin');
      await background.query('begin');
      await claim.query('select id from users where id=$1 for update', [id]);
      const pid = (await background.query('select pg_backend_pid() as id')).rows[0].id;
      const queued = openFirstAchievementStages(background, id, new Date()).then(
        () => null,
        (error) => error,
      );
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (await pool.query('select cardinality(pg_blocking_pids($1))>0 as blocked', [pid]))
          .rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(blocked).toBe(true);
      await openFirstAchievementStages(claim, id, new Date());
      await claim.query('commit');
      const error = await queued;
      await background.query('commit');
      expect(error).toBeNull();
      expect(
        Number(
          (await pool.query('select count(*) from user_achievement_stages where user_id=$1', [id]))
            .rows[0].count,
        ),
      ).toBeGreaterThan(0);
    } finally {
      await claim.query('rollback');
      await background.query('rollback');
      claim.release();
      background.release();
    }
  });
});
