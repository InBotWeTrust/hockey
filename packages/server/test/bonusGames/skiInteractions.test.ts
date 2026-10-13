import { GAME_CORE_VERSION, createSkiAttemptSampler, resolveSkiCourtShot, deriveShotSeed } from '@hockey/game-core';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { buildBonusGoalieConfig } from '../../src/bonusGames/types.js';
import {
  submitBonusShot,
  acknowledgeBonusPreview,
  startBonusPeriod,
  startOrResumeBonusAttempt,
  reconcileOwnedBonusAttempt,
} from '../../src/bonusGames/service.js';
const NOW = new Date('2026-10-03T12:00:00Z');
describe.skipIf(!hasIntegrationEnv)('server-authoritative ski attempts', () => {
  let pool: Pool, userId: string, attemptId: string, gameId: string;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(
      pool,
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'),
    );
    gameId = (await pool.query("select id from bonus_game where slug='challenge-ski-resort'"))
      .rows[0].id;
  });
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `ski-test-${randomUUID()}`,
      displayName: 'Synthetic ski test',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    await pool.query('update users set level=2 where id=$1', [userId]);
    const beachId = (await pool.query("select id from bonus_game where slug='challenge-beach'"))
      .rows[0].id;
    const beach = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: beachId,
      now: NOW,
      seedSecret: 'local-ski-test',
    });
    await pool.query(
      "update bonus_game_attempt set status='completed',state='closed',closed_at=$2 where id=$1",
      [beach.attempt.id, NOW],
    );
    await pool.query(
      "insert into user_bonus_game_completion(user_id,bonus_game_id,attempt_id,reward_snapshot) values($1,$2,$3,'{}'::jsonb)",
      [userId, beachId, beach.attempt.id],
    );
    await pool.query(`insert into user_bonus_game_level_completion
      (user_id,bonus_game_id,level,reward_snapshot,completed_at,source)
      select $1,$2,level,'{}'::jsonb,$3,'legacy_credit' from generate_series(1,2) levels(level)`, [userId,gameId,NOW]);
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      level: 3,
      now: NOW,
      seedSecret: 'local-ski-test',
    });
    attemptId = created.attempt.id;
    await acknowledgeBonusPreview(pool, { userId, attemptId, now: NOW });
    await startBonusPeriod(pool, { userId, attemptId, selection: {}, now: NOW });
  });
  const current = () => reconcileOwnedBonusAttempt(pool, { userId, attemptId, now: NOW });
  it('creates a three-minute snapshot, 26 of 35 and balanced frequent slips', async () => {
    const a = await current(),
      rule = a.rules.periods[0]!;
    expect(rule.durationMs).toBe(180000);
    expect(rule.shotsLimit).toBe(35);
    expect(a.rules.qualificationRules).toMatchObject({ targetGoals: 26, shotsLimit: 35 });
    expect(a.gameCoreVersion).toBe(GAME_CORE_VERSION);
    const env = a.rules.challengeEnvironment!.ski!;
    expect(env.seed).toBe(a.attemptSeed);
    const sampler = createSkiAttemptSampler(env, {
      goal: rule.goalFrequency,
      goalie: rule.goalieFrequency,
      player: rule.shooterFrequency,
    });
    const events = sampler.events([]);
    expect(events).toHaveLength(22);
    expect(
      ['goal', 'goalie', 'player'].map((t) => events.filter((e) => e.target === t).length).sort(),
    ).toEqual([7, 7, 8]);
  });
  it('matches client predictions, handles duplicate shots and preserves the immutable snapshot', async () => {
    const a = await current(),
      rule = a.rules.periods[0]!,
      env = a.rules.challengeEnvironment!.ski!;
    const before = (
      await pool.query('select rules_snapshot from bonus_game_attempt where id=$1', [attemptId])
    ).rows[0];
    const input = {
      tapTime: 2500,
      shooterTapTime: 2500,
      shooterFrequency: rule.shooterFrequency,
      goalFrequency: rule.goalFrequency,
      goalieFrequency: rule.goalieFrequency,
      puckSpeedPerMs: rule.puckSpeedPerMs,
    };
    const result = resolveSkiCourtShot(
      input,
      buildBonusGoalieConfig(a.rules.slug, a.rules.title, rule),
      deriveShotSeed(a.attemptSeed, 1, 1),
      1,
      env,
      [],
    );
    const body = {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input,
      claimedResult: result.type,
      now: new Date(NOW.getTime() + 2500),
    };
    const response = await submitBonusShot(pool, body);
    expect(response.serverResult).toBe(result.type);
    expect(response.attempt.shotsTaken).toBe(1);
    await expect(submitBonusShot(pool, body)).rejects.toMatchObject({
      code: 'bonus_shot_index_mismatch',
    });
    expect((await current()).shotsTaken).toBe(1);
    expect(
      (await pool.query('select rules_snapshot from bonus_game_attempt where id=$1', [attemptId]))
        .rows[0],
    ).toEqual(before);
  });
  it('rejects shooting during a player slip and rejects another owner or future time', async () => {
    const a = await current(),
      r = a.rules.periods[0]!,
      sampler = createSkiAttemptSampler(a.rules.challengeEnvironment!.ski!, {
        goal: r.goalFrequency,
        goalie: r.goalieFrequency,
        player: r.shooterFrequency,
      });
    const t = sampler.events([]).find((e) => e.target === 'player')!.startMs + 1;
    const body = {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: { tapTime: t, shooterTapTime: t },
      claimedResult: 'miss' as const,
      now: new Date(NOW.getTime() + t),
    };
    await expect(submitBonusShot(pool, body)).rejects.toMatchObject({
      code: 'bonus_shot_time_invalid',
    });
    await expect(submitBonusShot(pool, { ...body, userId: randomUUID() })).rejects.toBeDefined();
    await expect(
      submitBonusShot(pool, {
        ...body,
        input: { tapTime: 50000, shooterTapTime: 50000 },
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_stale' });
    expect((await current()).shotsTaken).toBe(0);
  });
  it('rejects shots during rest and closes an expired three-minute attempt', async () => {
    const a = await current(),
      r = a.rules.periods[0]!;
    const sampler = createSkiAttemptSampler(a.rules.challengeEnvironment!.ski!, {
      goal: r.goalFrequency,
      goalie: r.goalieFrequency,
      player: r.shooterFrequency,
    });
    let restingTime = 0;
    for (let t = 0; t < 180000; t += 100) {
      if (sampler.player(t, []).fatigue.level === 'resting') {
        restingTime = t;
        break;
      }
    }
    expect(restingTime).toBeGreaterThan(0);
    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: { tapTime: restingTime, shooterTapTime: restingTime },
        claimedResult: 'miss',
        now: new Date(NOW.getTime() + restingTime),
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_invalid' });
    const expired = await reconcileOwnedBonusAttempt(pool, {
      userId,
      attemptId,
      now: new Date(NOW.getTime() + 180001),
    });
    expect(expired.status).toBe('failed');
    expect(expired.shotsTaken).toBe(0);
  });
});
