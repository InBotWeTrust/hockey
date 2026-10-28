import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
describe.skipIf(!hasIntegrationEnv)('pending training series repair', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, dir);
  });
  afterAll(async () => {
    await pool?.end();
  });
  it('rebuilds the best and current day series and preserves claims, replay markers and balances', async () => {
    const userId = randomUUID();
    await pool.query(
      "insert into users(id,display_name,timezone) values($1,'Series repair','UTC')",
      [userId],
    );
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at,progress)
      values($1,'stable-student',2,now()-interval '1 day','{"days":9,"minimumAccuracyPercent":80}')`,
      [userId],
    );
    let lastId = '';
    for (const [day, goals] of [
      [1, 8],
      [2, 8],
      [3, 0],
      [4, 8],
    ]) {
      const id = randomUUID();
      lastId = id;
      await pool.query(
        `insert into training_session(id,user_id,day_date,selected_period,state,game_core_version,training_seed,shots_limit,closed_at)
        values($1,$2,$3,1,'closed',1,'repair-seed',10,now())`,
        [id, userId, `2026-05-0${day}`],
      );
      await pool.query(
        `insert into shot_session(user_id,mode,training_session_id,period_number,shot_index,seed,input_payload,server_result,game_core_version)
        select $1,'training',$2,1,n,'repair-'||($2::uuid)::text||n,'{}',case when n<=$3 then 'goal' else 'miss' end,1 from generate_series(1,10) n`,
        [userId, id, goals],
      );
    }
    await pool.query(
      `insert into achievement_progress(user_id,key,state) values($1,'training_40_of_50_streak',$2)`,
      [
        userId,
        JSON.stringify({ count: 9, lastTrainingSessionId: lastId, lastDayDate: '2026-05-04' }),
      ],
    );
    const balances = (await pool.query('select xp,experience from users where id=$1', [userId]))
      .rows[0];
    const repair = await readFile(path.join(dir, '244_repair_pending_training_series.sql'), 'utf8');
    await pool.query(repair);
    const stage = (
      await pool.query(
        "select progress,completed_at,claimed_at from user_achievement_stages where user_id=$1 and achievement_id='stable-student'",
        [userId],
      )
    ).rows[0];
    expect(stage).toMatchObject({
      progress: { days: 2, minimumAccuracyPercent: 80 },
      completed_at: null,
      claimed_at: null,
    });
    expect(
      (
        await pool.query(
          "select state from achievement_progress where user_id=$1 and key='training_40_of_50_streak'",
          [userId],
        )
      ).rows[0].state,
    ).toEqual({ count: 1, lastTrainingSessionId: lastId, lastDayDate: '2026-05-04' });
    await pool.query(repair);
    expect(
      (
        await pool.query(
          "select progress,completed_at,claimed_at from user_achievement_stages where user_id=$1 and achievement_id='stable-student'",
          [userId],
        )
      ).rows[0],
    ).toEqual(stage);
    expect(
      (await pool.query('select xp,experience from users where id=$1', [userId])).rows[0],
    ).toEqual(balances);
    await pool.query(
      `update user_achievement_stages set completed_at=now(),claimed_at=now(),progress='{"days":10,"minimumAccuracyPercent":80}' where user_id=$1`,
      [userId],
    );
    const claimed = (
      await pool.query(
        'select progress,completed_at,claimed_at from user_achievement_stages where user_id=$1',
        [userId],
      )
    ).rows;
    await pool.query(repair);
    expect(
      (
        await pool.query(
          'select progress,completed_at,claimed_at from user_achievement_stages where user_id=$1',
          [userId],
        )
      ).rows,
    ).toEqual(claimed);
  });
});
