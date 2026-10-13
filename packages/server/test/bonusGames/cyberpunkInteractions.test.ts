import {deriveShotSeed} from '../../src/duel/seed.js';
import {createCyberpunkSchedule,cyberpunkShooterMotion,cyberpunkCrossings,resolveCyberpunkCourtShot,getSessionPhaseOffsets,classifyMarksmanshipShot} from '@hockey/game-core';
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
  tapCyberpunkPanel,
  acknowledgeBonusPreview,
  startBonusPeriod,
  startOrResumeBonusAttempt,
  reconcileOwnedBonusAttempt,
} from '../../src/bonusGames/service.js';
const NOW = new Date('2026-10-03T12:00:00Z');
describe.skipIf(!hasIntegrationEnv)('server-authoritative cyberpunk attempts', () => {
  let pool: Pool, userId: string, attemptId: string, gameId: string;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(
      pool,
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'),
    );
    gameId = (await pool.query("select id from bonus_game where slug='challenge-cyberpunk-yard'"))
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
    const skiId = (await pool.query("select id from bonus_game where slug='challenge-ski-resort'")).rows[0].id;
    await pool.query("insert into user_bonus_game_completion(user_id,bonus_game_id,attempt_id,reward_snapshot) values($1,$2,$3,'{}'::jsonb)",[userId,skiId,beach.attempt.id]);
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now: NOW,
      seedSecret: 'local-ski-test',
    });
    attemptId = created.attempt.id;
    await acknowledgeBonusPreview(pool, { userId, attemptId, now: NOW });
    await startBonusPeriod(pool, { userId, attemptId, selection: {}, now: NOW });
  });

  const current = () => reconcileOwnedBonusAttempt(pool,{userId,attemptId,now:NOW});
  it('starts new rules with a full-width linear goalkeeper and existing objective',async()=>{
    const a=await current();
    expect(a.rules.periods[0]).toMatchObject({durationMs:150000,goaliePattern:'linear',goalieAmplitude:1});
    expect(a.rules.challengeEnvironment?.cyberpunk?.seed).toBe(a.attemptSeed);
  });
  it('accepts three taps, deduplicates retries, and rejects altered payload and wrong ownership',async()=>{
    const a=await current(); const event=createCyberpunkSchedule(a.rules.challengeEnvironment!.cyberpunk!).find(e=>e.kind==='strip')!;
    const time=event.startMs+1100;
    const body={userId,attemptId,eventId:randomUUID(),stripEventId:event.id,period:1,tapTime:time,expectedShots:0,expectedPanels:0,now:new Date(NOW.getTime()+time)};
    const [one,retry]=await Promise.all([tapCyberpunkPanel(pool,body),tapCyberpunkPanel(pool,body)]);
    expect(one.currentPeriodPanelEvents).toHaveLength(1); expect(retry.currentPeriodPanelEvents).toHaveLength(1);
    await expect(tapCyberpunkPanel(pool,{...body,expectedShots:1})).rejects.toMatchObject({code:'bad_request'});
    await expect(tapCyberpunkPanel(pool,{...body,expectedPanels:1})).rejects.toMatchObject({code:'bad_request'});
    await expect(tapCyberpunkPanel(pool,{...body,tapTime:time+1})).rejects.toMatchObject({code:'bad_request'});
    await expect(tapCyberpunkPanel(pool,{...body,userId:randomUUID()})).rejects.toBeDefined();
    for(let n=1;n<3;n++) await tapCyberpunkPanel(pool,{...body,eventId:randomUUID(),tapTime:time+n*200,now:new Date(NOW.getTime()+time+n*200),expectedPanels:n});
    await expect(tapCyberpunkPanel(pool,{...body,eventId:randomUUID(),tapTime:time+600,now:new Date(NOW.getTime()+time+600),expectedPanels:3})).rejects.toMatchObject({code:'bonus_shot_time_invalid'});
  });
  it('accepts the shared delayed shot result and preserves the actual flight pause',async()=>{
    const a=await current(),rule=a.rules.periods[0]!,env=a.rules.challengeEnvironment!;
    const time=6500;
    const input={tapTime:time,shooterTapTime:time,shooterMotionTime:cyberpunkShooterMotion(env,time,rule.shooterFrequency,[]),shooterFrequency:rule.shooterFrequency,goalieFrequency:rule.goalieFrequency*1.26,goalFrequency:rule.goalFrequency*1.2,puckSpeedPerMs:rule.puckSpeedPerMs*1.05};
    const offsets=getSessionPhaseOffsets(a.attemptSeed),seed=deriveShotSeed(a.attemptSeed,1,1),goalie=buildBonusGoalieConfig(a.rules.slug,a.rules.title,rule);
    const predicted=resolveCyberpunkCourtShot(input,goalie,seed,1,env.cyberpunk!,[],offsets);
    const response=await submitBonusShot(pool,{userId,attemptId,claimedShotIndex:1,input,claimedResult:predicted.result.type,now:new Date(NOW.getTime()+time)});
    expect(response.serverResult).toBe(predicted.result.type);
    expect(response.attempt.currentPeriodShotPauses![0]!.flightMs).toBeCloseTo(predicted.flight.durationMs);
  });
});
