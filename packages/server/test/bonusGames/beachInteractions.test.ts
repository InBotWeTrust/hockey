import { GAME_CORE_VERSION, beachWindMotion, getBonusChallengeCondition, getBeachPuckSpeed, getSessionPhaseOffsets } from '@hockey/game-core';
import { deriveShotSeed } from '../../src/duel/seed.js';
import { buildBonusGoalieConfig } from '../../src/bonusGames/types.js';
import { resolveVersionedBeachShot } from '../../src/bonusGames/beachShot.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { submitBonusShot, acknowledgeBonusPreview, cleanupBeachPuddle, reconcileOwnedBonusAttempt, startBonusPeriod, startOrResumeBonusAttempt } from '../../src/bonusGames/service.js';
const NOW = new Date('2026-10-02T12:00:00Z');
describe.skipIf(!hasIntegrationEnv)('server-authoritative beach interactions', () => {
  let pool: Pool; let userId: string; let attemptId: string; let gameId: string;
  beforeAll(async () => {
    pool = createTestPool(); await resetDatabase(pool);
    await applyMigrations(pool, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'));
    gameId = (await pool.query("select id from bonus_game where slug='challenge-beach'")).rows[0].id;
  });
  afterAll(async () => { await pool?.end(); });
  beforeEach(async () => {
    const user = await findOrCreateTelegramUser(pool, {providerUid: `beach-test-${randomUUID()}`, displayName: 'Synthetic beach test', timezone: 'Europe/Moscow'});
    userId = user.id; await pool.query('update users set level=2 where id=$1', [userId]);
    const created = await startOrResumeBonusAttempt(pool, {userId, gameId, now: NOW, seedSecret: 'local-test-beach-secret'});
    attemptId = created.attempt.id;
    await acknowledgeBonusPreview(pool, {userId, attemptId, dismissFuture: false, now: NOW});
    await startBonusPeriod(pool, {userId, attemptId, now: NOW, dailyAttemptLimit: 100});
  });
  const request = (changes = {}) => ({userId, attemptId, eventId: randomUUID(), period: 1, puddleId: 'left', tapTime: 4000,
    expectedShots: 0, expectedCleanups: 0, now: new Date(NOW.getTime()+4000), ...changes});
  it('stores a seeded immutable 10-gust snapshot and seven zones', async () => {
    const attempt = await reconcileOwnedBonusAttempt(pool, {userId, attemptId, now: NOW});
    expect(attempt.rules.challengeEnvironment!.beach!.interactive!.wind).toHaveLength(10);
    expect(attempt.rules.challengeEnvironment!.beach!.puddles).toHaveLength(7);
    expect(attempt.gameCoreVersion).toBe(GAME_CORE_VERSION);
  });
  it('serializes duplicate and concurrent cleanup and preserves the original snapshot', async () => {
    const before = await pool.query('select rules_snapshot from bonus_game_attempt where id=$1', [attemptId]);
    const body = request();
    const results = await Promise.all([cleanupBeachPuddle(pool, body), cleanupBeachPuddle(pool, body)]);
    expect(results.every(result => result.currentPeriodCleanupEvents!.length === 1)).toBe(true);
    expect((await pool.query('select rules_snapshot from bonus_game_attempt where id=$1', [attemptId])).rows[0]).toEqual(before.rows[0]);
    await expect(cleanupBeachPuddle(pool, request({tapTime: 4100, expectedCleanups: 1}))).rejects.toMatchObject({code:'bonus_shot_time_stale'});
    await expect(cleanupBeachPuddle(pool, request({tapTime: 4300, expectedCleanups: 0}))).rejects.toMatchObject({code:'bonus_shot_index_mismatch'});
  });
  it('rejects a different owner, inactive water, future clocks and expired periods', async () => {
    await expect(cleanupBeachPuddle(pool, request({userId: randomUUID()}))).rejects.toBeDefined();
    await expect(cleanupBeachPuddle(pool, request({puddleId:'right'}))).rejects.toMatchObject({code:'bonus_shot_time_invalid'});
    await expect(cleanupBeachPuddle(pool, request({tapTime:50000}))).rejects.toMatchObject({code:'bonus_shot_time_stale'});
    await expect(cleanupBeachPuddle(pool, request({now:new Date(NOW.getTime()+151000)}))).rejects.toMatchObject({code:'bonus_period_not_ready'});
    expect((await pool.query('select count(*)::int n from bonus_beach_cleanup_event where attempt_id=$1',[attemptId])).rows[0].n).toBe(0);
  });
  it('reconstructs cleanup and wind during an authoritative shot, and rejects reordered shots', async () => {
    const cleaned = await cleanupBeachPuddle(pool, request());
    const environment = cleaned.rules.challengeEnvironment!;
    const rule = cleaned.rules.periods[0]!;
    const tapTime = 6500;
    const condition = getBonusChallengeCondition(environment, tapTime);
    const shotInput = {tapTime, shooterTapTime: tapTime,
      shooterMotionTime: beachWindMotion(environment, tapTime, rule.shooterFrequency, [], environment.beach!.interactive!.wind),
      shooterFrequency: rule.shooterFrequency, goalieFrequency: rule.goalieFrequency, goalFrequency: rule.goalFrequency,
      puckSpeedPerMs: getBeachPuckSpeed(rule.puckSpeedPerMs, condition.puckSpeedMultiplier)};
    const predicted = resolveVersionedBeachShot({input: shotInput,
      goalie: buildBonusGoalieConfig(cleaned.rules.slug, cleaned.rules.title, rule),
      seed: deriveShotSeed(cleaned.attemptSeed, 1, 1), shotIndex:1, environment,
      slug: cleaned.rules.slug, coreVersion: cleaned.gameCoreVersion,
      phaseOffsets: getSessionPhaseOffsets(cleaned.attemptSeed), cleanupEvents: cleaned.currentPeriodCleanupEvents! })!;
    await expect(submitBonusShot(pool, {userId, attemptId, claimedShotIndex:1, input:{tapTime:3900, shooterTapTime:3900},
      claimedResult:'miss', now:new Date(NOW.getTime()+6500)})).rejects.toMatchObject({code:'bonus_shot_time_stale'});
    const response = await submitBonusShot(pool, {userId, attemptId, claimedShotIndex:1, input:shotInput,
      claimedResult:predicted.result.type, now:new Date(NOW.getTime()+6500)});
    expect(response.serverResult).toBe(predicted.result.type);
    expect(response.attempt.shotsTaken).toBe(1);
    expect(response.attempt.currentPeriodCleanupEvents).toHaveLength(1);
    expect(response.attempt.currentPeriodShotPauses![0]!.flightMs).toBeCloseTo(predicted.flight.durationMs);
  });

  it.each([25000,31000])('allows cleanup at blocked shooting time %i without enabling shots', async tapTime => {
    const now = new Date(NOW.getTime()+tapTime);
    const before = await reconcileOwnedBonusAttempt(pool, {userId,attemptId,now});
    expect(getBonusChallengeCondition(before.rules.challengeEnvironment!,tapTime).canShoot).toBe(false);
    const result = await cleanupBeachPuddle(pool,request({tapTime,now}));
    expect(result.currentPeriodCleanupEvents).toHaveLength(1);
    await expect(submitBonusShot(pool,{userId,attemptId,claimedShotIndex:1,
      input:{tapTime,shooterTapTime:tapTime},claimedResult:'miss',now})).rejects.toMatchObject({code:'bonus_shot_time_invalid'});
  });

});
