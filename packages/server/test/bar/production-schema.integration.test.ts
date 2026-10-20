import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, hasIntegrationEnv } from '../helpers/testDb.js';
import { getBarBoard, getBarLive } from '../../src/bar/service.js';

// Run only against isolated migrated storage. All synthetic writes roll back.
describe.skipIf(!hasIntegrationEnv)('bar on the production schema', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = createTestPool();
  });
  afterAll(async () => {
    await pool?.end();
  });
  it('projects both players and confirmed shots without fight migrations', async () => {
    const client = await pool.connect();
    const now = new Date();
    const users = [randomUUID(), randomUUID()];
    const matchId = randomUUID();
    try {
      await client.query('begin');
      for (const [index, id] of users.entries()) {
        await client.query(
          "insert into users(id,display_name,timezone,grip) values($1,'Synthetic bar player','UTC',$2)",
          [id, index === 0 ? 'left' : 'right'],
        );
      }
      await client.query(
        `insert into amateur_duel_match(id,challenger_user_id,opponent_user_id,status,rules_snapshot,match_seed,starts_at,ends_at,game_core_version)
        values($1,$2,$3,'active',$4,'synthetic-bar-seed',$5,$6,79)`,
        [
          matchId,
          users[0],
          users[1],
          JSON.stringify({
            goalieId: 'rookie',
            periodDurationMs: 180000,
            totalPeriods: 3,
            breakDurationMs: 10000,
          }),
          new Date(now.getTime() - 10000),
          new Date(now.getTime() + 600000),
        ],
      );
      for (const [index, id] of users.entries()) {
        await client.query(
          `insert into amateur_duel_participant(match_id,user_id,side,state,current_period,period_started_at,goals,shots_taken)
          values($1,$2,$3,'period_active',1,$4,$5,$5)`,
          [
            matchId,
            id,
            index === 0 ? 'challenger' : 'opponent',
            new Date(now.getTime() - 10000),
            index === 0 ? 1 : 0,
          ],
        );
      }
      await client.query(
        `insert into shot_session(user_id,mode,amateur_duel_match_id,period_number,shot_index,seed,input_payload,server_result,game_core_version,created_at)
        values($1,'amateur_duel',$2,1,1,'synthetic-shot',$3,'goal',79,$4)`,
        [users[0], matchId, JSON.stringify({ tapTime: 1000 }), new Date(now.getTime() - 5000)],
      );
      const source = client as unknown as Pool;
      const board = await getBarBoard(source, 0, now);
      expect(
        board.online.find((entry) => entry.id === matchId)?.players.map((player) => player.grip),
      ).toEqual(['left', 'right']);
      const live = await getBarLive(source, 'duel', matchId, now);
      expect(live.match?.players[0]).toMatchObject({
        state: 'period_active',
        goals: 1,
        shotsTaken: 1,
      });
      expect(live.shots).toHaveLength(1);
      expect(live.shots[0]?.result).toBe('goal');
      expect(JSON.stringify(live)).not.toMatch(/synthetic-bar-seed|synthetic-shot|input_payload/);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
