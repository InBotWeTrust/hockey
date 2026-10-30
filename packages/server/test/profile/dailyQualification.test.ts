import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrations = fileURLToPath(new URL('../../db/migrations', import.meta.url));
describe.skipIf(!hasIntegrationEnv)('daily qualification migration and accounting', () => {
  let pool: Pool;
  beforeAll(async () => { pool = createTestPool(); await resetDatabase(pool); await applyMigrations(pool, migrations); });
  afterAll(async () => { await pool.end(); });

  it('backfills archives plus unarchived goals, preserves access, and credits only new daily goals', async () => {
    const client = await pool.connect();
    const userId = randomUUID(), dayId = randomUUID();
    try {
      await client.query('begin');
      await client.query('drop trigger shot_session_daily_qualification_goal on shot_session');
      await client.query('drop function credit_daily_qualification_goal()');
      await client.query('alter table users drop column daily_goals_total, drop column amateur_access_preserved');
      await client.query(`insert into users (id, display_name, timezone, lifetime_goals_total)
        values ($1, 'Qualification fixture', 'UTC', 1000)`, [userId]);
      await client.query(`insert into day_pool (id, user_id, day_date, state, current_period, game_core_version, daily_seed)
        values ($1, $2, '2026-10-30', 'period_active', 2, 117, 'fixture')`, [dayId, userId]);
      await client.query(`insert into period_log (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
        values ($1, 1, now()-interval '30 minutes', now()-interval '20 minutes', 30, 3, 'quota')`, [dayId]);
      const shot = async (period: number, index: number, result: string, mode = 'daily') => client.query(
        `insert into shot_session (user_id, mode, day_pool_id, period_number, story_task_id, shot_index, seed, input_payload, server_result, game_core_version)
         values ($1, $2, $3, $4, $5, $6, 'fixture', '{}', $7, 117)`,
        [userId, mode, mode === 'daily' ? dayId : null, mode === 'daily' ? period : null, mode === 'story' ? randomUUID() : null, index, result],
      );
      await shot(1, 1, 'goal'); // Already represented by the archive: do not count twice.
      await shot(2, 1, 'goal');
      await shot(2, 2, 'save');
      await shot(1, 1, 'goal', 'story');
      await client.query(await readFile(`${migrations}/246_daily_qualification.sql`, 'utf8'));
      const read = async () => (await client.query('select daily_goals_total, amateur_access_preserved from users where id = $1', [userId])).rows[0];
      expect(await read()).toEqual({ daily_goals_total: 4, amateur_access_preserved: true });
      await client.query('savepoint rejected_shot');
      await shot(2, 3, 'goal');
      await client.query('rollback to savepoint rejected_shot');
      expect(await read()).toEqual({ daily_goals_total: 4, amateur_access_preserved: true });
      await shot(2, 3, 'goal');
      await shot(2, 4, 'miss');
      await shot(1, 2, 'goal', 'story');
      expect(await read()).toEqual({ daily_goals_total: 5, amateur_access_preserved: true });
      await client.query(`insert into period_log (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
        values ($1, 2, now()-interval '20 minutes', now(), 4, 2, 'timeout')`, [dayId]);
      expect(await read()).toEqual({ daily_goals_total: 5, amateur_access_preserved: true });
    } finally { await client.query('rollback'); client.release(); }
  });
});
