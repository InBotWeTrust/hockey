import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { startOrResumeBonusAttempt } from '../../src/bonusGames/service.js';
import { listBonusGameCards } from '../../src/bonusGames/catalog.js';
import { grantFirstClearReward, lockBonusEconomyBalances } from '../../src/bonusGames/economy.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('challenge level progress and economy', () => {
  let pool: Pool;
  const now = new Date('2026-10-07T10:00:00Z');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'));
  });
  afterAll(async () => { await pool.end(); });
  it('blocks unopened levels and snapshots level-one wind without fatigue or puddles', async () => {
    const user = await findOrCreateTelegramUser(pool, { providerUid: 'levels-lock-test', displayName: 'Lock Test' });
    await pool.query('update users set level = 2 where id = $1', [user.id]);
    const game = (await pool.query<{ id: string }>("select id from bonus_game where slug = 'challenge-beach'")).rows[0]!;
    const input = { userId: user.id, gameId: game.id, now, seedSecret: 'synthetic-level-test' };
    await expect(startOrResumeBonusAttempt(pool, { ...input, level: 2 })).rejects.toMatchObject({ code: 'bonus_previous_level_required' });
    const first = await startOrResumeBonusAttempt(pool, { ...input, level: 1 });
    expect(first.attempt.rules.challengeLevel).toBe(1);
    expect(first.attempt.rules.challengeEnvironment?.beach?.puddles).toEqual([]);
    expect(first.attempt.rules.challengeEnvironment?.fatigue).toBeUndefined();
    expect(first.attempt.rules.challengeEnvironment?.beach?.interactive?.wind.length).toBe(10);
    const resumed = await startOrResumeBonusAttempt(pool, { ...input, level: 3 });
    expect(resumed.created).toBe(false);
    expect(resumed.attempt.id).toBe(first.attempt.id);
    expect(resumed.attempt.rules).toEqual(first.attempt.rules);
  });
  it('stores three independent first-clear credits and never pays a repeated level', async () => {
    const user = await findOrCreateTelegramUser(pool, { providerUid: 'levels-test', displayName: 'Levels Test' });
    await pool.query('update users set level = 2 where id = $1', [user.id]);
    const game = (await pool.query<{ id: string }>("select id from bonus_game where slug = 'challenge-beach'")).rows[0]!;
    const attempt = await startOrResumeBonusAttempt(pool, { userId: user.id, gameId: game.id, now,
      seedSecret: 'synthetic-level-test', level: 1 });
    const client = await pool.connect();
    try {
      await client.query('begin');
      await lockBonusEconomyBalances(client, user.id, now);
      for (const level of [1, 2, 3] as const) {
        const input = { userId: user.id, gameId: game.id, attemptId: attempt.attempt.id,
          reward: { coins: 0, stars: level * 10, experience: level * 20 }, now, challengeLevel: level };
        expect((await grantFirstClearReward(client, input)).granted).toBe(true);
        expect((await grantFirstClearReward(client, input)).granted).toBe(false);
      }
      const credits = await client.query('select level from user_bonus_game_level_completion where user_id = $1 order by level', [user.id]);
      expect(credits.rows.map((row) => row.level)).toEqual([1, 2, 3]);
      const rewards = await client.query('select sum(stars_delta)::int as stars, sum(experience_delta)::int as experience from bonus_game_economy_event where user_id = $1', [user.id]);
      expect(rewards.rows[0]).toMatchObject({ stars: 60, experience: 120 });
      await client.query('commit');
      const cards = await listBonusGameCards(pool, user.id);
      const beach = cards.find((card) => card.id === game.id)!;
      expect(beach.levels?.map((level) => level.is_completed)).toEqual([true, true, true]);
      expect(beach.levels?.map((level) => level.reward.stars)).toEqual([beach.levels![0]!.reward.stars,
        beach.levels![0]!.reward.stars * 2, beach.levels![0]!.reward.stars * 3]);
      const ski = cards.find((card) => card.slug === 'challenge-ski-resort')!;
      expect(ski.levels?.[0]?.is_unlocked).toBe(true);
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  });
  it('serializes concurrent reward requests and keeps a legacy attempt resumable', async () => {
    const user = await findOrCreateTelegramUser(pool, { providerUid: 'levels-concurrent-test', displayName: 'Concurrent Test' });
    await pool.query('update users set level = 2 where id = $1', [user.id]);
    const game = (await pool.query<{ id: string }>("select id from bonus_game where slug = 'challenge-beach'")).rows[0]!;
    const input = { userId: user.id, gameId: game.id, now, seedSecret: 'synthetic-level-test' };
    const first = await startOrResumeBonusAttempt(pool, input);
    await pool.query(`update bonus_game_attempt set challenge_level=null, game_core_version=77,
      rules_snapshot=rules_snapshot-'challengeLevel' where id=$1`, [first.attempt.id]);
    const legacy = await startOrResumeBonusAttempt(pool, { ...input, level: 3 });
    expect(legacy.created).toBe(false);
    expect(legacy.attempt.gameCoreVersion).toBe(77);
    expect(legacy.attempt.rules.challengeLevel).toBeUndefined();
    const grant = async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await lockBonusEconomyBalances(client, user.id, now);
        const result = await grantFirstClearReward(client, { userId: user.id, gameId: game.id,
          attemptId: first.attempt.id, reward: first.attempt.reward, now });
        await client.query('commit');
        return result.granted;
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    };
    expect((await Promise.all([grant(), grant()])).sort()).toEqual([false, true]);
    const cards = await listBonusGameCards(pool, user.id);
    expect(cards.find((card) => card.id === game.id)?.levels?.map((level) => level.is_completed)).toEqual([true, true, true]);
    const rewards = (await pool.query('select count(*)::int n from bonus_game_economy_event where user_id=$1',[user.id])).rows[0];
    expect(rewards.n).toBe(1);
  });
});
