import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { startOrResumeBonusAttempt } from '../../src/bonusGames/service.js';
import {
  settleBonusRecord,
  getBonusRecordResult,
  listBonusRecords,
} from '../../src/bonusGames/records.js';
import { lockBonusEconomyBalances, grantFirstClearReward } from '../../src/bonusGames/economy.js';
import type { BonusGameAttemptRow } from '../../src/bonusGames/types.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('persistent bonus records', () => {
  let pool: Pool;
  let gameId: string;
  const now = new Date('2026-10-07T10:00:00Z');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(
      pool,
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'),
    );
    gameId = (
      await pool.query(
        "select id from bonus_game where skill_code='speed' and status='active' order by sort_order limit 1",
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await pool.end();
  });
  async function user(name: string) {
    const u = await findOrCreateTelegramUser(pool, {
      providerUid: `records-${name}`,
      displayName: name,
    });
    await pool.query('update users set level=2 where id=$1', [u.id]);
    return u.id;
  }
  async function attempt(userId: string) {
    const dto = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now,
      seedSecret: 'synthetic-record-test',
    });
    return (
      await pool.query<BonusGameAttemptRow>(
        `update bonus_game_attempt set status='completed',state='closed',closed_at=$2,
      goals=5,shots_taken=10 where id=$1 returning *`,
        [dto.attempt.id, now],
      )
    ).rows[0]!;
  }
  async function settle(a: BonusGameAttemptRow, elapsed: number) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await lockBonusEconomyBalances(client, a.user_id, now);
      await grantFirstClearReward(client, {
        userId: a.user_id,
        gameId,
        attemptId: a.id,
        reward: { coins: 0, stars: 0, experience: 0 },
        now,
      });
      await settleBonusRecord(client, a, elapsed, now);
      const result = await getBonusRecordResult(client, a.id);
      await client.query('commit');
      return result!;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }
  it('blocks other-user results before completion and excludes challenges', async () => {
    const uid = await user('locked');
    await expect(listBonusRecords(pool, uid, gameId, 0)).rejects.toMatchObject({ statusCode: 403 });
    const challenge = (await pool.query("select id from bonus_game where slug='challenge-beach'"))
      .rows[0].id;
    await expect(listBonusRecords(pool, uid, challenge, 0)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it('does not reward first entries or ties; rewards both strict improvements every time', async () => {
    const uid = await user('first');
    const a = await attempt(uid);
    expect(await settle(a, 10000)).toMatchObject({
      stars: 0,
      experience: 0,
      personalImproved: false,
      globalImproved: false,
    });
    const tie = await attempt(uid);
    expect(await settle(tie, 10000)).toMatchObject({ stars: 0 });
    const better = await attempt(uid);
    expect(await settle(better, 9000)).toMatchObject({
      stars: 12,
      experience: 40,
      personalImproved: true,
      globalImproved: true,
    });
    const again = await attempt(uid);
    expect(await settle(again, 8000)).toMatchObject({ stars: 12, experience: 40 });
    const before = (await pool.query('select xp,experience from users where id=$1', [uid])).rows[0];
    await settle(again, 8000);
    expect(
      (await pool.query('select xp,experience from users where id=$1', [uid])).rows[0],
    ).toEqual(before);
    const fresh = await user('fresh');
    expect(await settle(await attempt(fresh), 7000)).toMatchObject({
      stars: 10,
      experience: 30,
      personalImproved: false,
      globalImproved: true,
    });
    expect(await settle(await attempt(uid), 7500)).toMatchObject({
      stars: 2,
      experience: 10,
      personalImproved: true,
      globalImproved: false,
    });
  });
  it('serializes concurrent winners and retries, and assigns shared places 1,1,3', async () => {
    const u1 = await user('tie-a');
    const u2 = await user('tie-b');
    const a1 = await attempt(u1);
    const a2 = await attempt(u2);
    const results = await Promise.all([settle(a1, 6000), settle(a2, 6000), settle(a1, 6000)]);
    expect(
      (
        await pool.query(
          'select sum(stars)::int n from bonus_game_record_result where attempt_id=any($1::uuid[])',
          [[a1.id, a2.id]],
        )
      ).rows[0].n,
    ).toBe(10);
    expect(results[0]).toEqual(results[2]);
    const rating = await listBonusRecords(pool, u1, gameId, 0);
    expect(rating.rows.slice(0, 3).map((r) => r.place)).toEqual([1, 1, 3]);
    expect(rating.currentUser).toMatchObject({ userId: u1, place: 1 });
  });
  it('separates changed conditions, ignores cosmetics and never records failed attempts', async () => {
    const uid = await user('versions');
    const a = await attempt(uid);
    const cosmetic = {
      ...a,
      rules_snapshot: { ...a.rules_snapshot, title: 'Other title', revision: 999 },
    };
    expect(await settle(cosmetic, 12000)).toMatchObject({ stars: 0 });
    const next = await attempt(uid);
    next.rules_snapshot = {
      ...next.rules_snapshot,
      periods: next.rules_snapshot.periods.map((p) => ({
        ...p,
        goalFrequency: p.goalFrequency + 0.1,
      })),
    };
    expect(await settle(next, 5000)).toMatchObject({
      stars: 0,
      personalImproved: false,
      globalImproved: false,
    });
    const failed = await attempt(uid);
    failed.status = 'failed';
    const client = await pool.connect();
    try {
      await settleBonusRecord(client, failed, 4000, now);
      expect(await getBonusRecordResult(client, failed.id)).toBeNull();
    } finally {
      client.release();
    }
  });
  it('pages only the top 100 and returns the user below the cutoff separately', async () => {
    for (let i = 0; i < 105; i++) {
      const uid = await user(`page-${i}`);
      await settle(await attempt(uid), 20000 + i * 100);
    }
    const uid = await user('outside-top');
    await settle(await attempt(uid), 300000);
    const ids = new Set<string>();
    for (let offset = 0; offset < 100; offset += 20) {
      const page = await listBonusRecords(pool, uid, gameId, offset);
      expect(page.rows).toHaveLength(20);
      expect(page.currentUser?.place).toBeGreaterThan(100);
      expect(page.rows.some((row) => row.userId === uid)).toBe(false);
      expect(page.nextOffset).toBe(offset === 80 ? null : offset + 20);
      page.rows.forEach((row) => ids.add(row.userId));
    }
    expect(ids.size).toBe(100);
    expect((await listBonusRecords(pool, uid, gameId, 99)).rows).toHaveLength(1);
  });
  it('settles and ranks accuracy by percentage before time, including equal fractions', async () => {
    const previousGame=gameId;
    gameId=(await pool.query("select id from bonus_game where skill_code='accuracy' and status='active' order by sort_order limit 1")).rows[0].id;
    async function counted(uid:string,goals:number,shots:number) {
      const a=await attempt(uid);
      return (await pool.query<BonusGameAttemptRow>('update bonus_game_attempt set goals=$2,shots_taken=$3 where id=$1 returning *',[a.id,goals,shots])).rows[0]!;
    }
    try {
      const a=await user('percent-a');const b=await user('percent-b');const c=await user('percent-c');const d=await user('percent-d');
      expect(await settle(await counted(a,20,20),20000)).toMatchObject({stars:0,place:1});
      expect(await settle(await counted(b,10,10),30000)).toMatchObject({stars:0,place:2});
      expect(await settle(await counted(c,9,10),10000)).toMatchObject({stars:0,place:3});
      expect(await settle(await counted(b,10,10),10000)).toMatchObject({stars:12,place:1});
      expect(await settle(await counted(d,1,1),10000)).toMatchObject({stars:0,place:1});
      const rating=await listBonusRecords(pool,c,gameId,0);
      expect(rating.rows.map(row=>row.place)).toEqual([1,1,3,4]);
      expect(rating.rows[2].userId).toBe(a);expect(rating.rows[3].userId).toBe(c);
    } finally {gameId=previousGame;}
  });

});
