import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { AdvancedTrainingEpisodeProfile } from '@hockey/game-core';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { INITIAL_TRAINING_EXERCISE_KEYS } from '../../src/duel/training/initialCourse.js';
import { createTestPool, createTestRedis, getTestUrls, hasIntegrationEnv,
  resetDatabase, resetRedis } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../db/migrations');
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

describe.skipIf(!hasIntegrationEnv)('advanced training V2 lifecycle', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv ? getTestUrls() : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();
    app = await buildApp({ config: {
      NODE_ENV: 'test', HOST: '0.0.0.0', PORT: 3000, LOG_LEVEL: 'warn',
      DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, JWT_SECRET, REFRESH_SECRET,
      TELEGRAM_BOT_TOKEN: 'test-bot-token', DAILY_SEED_SECRET,
    } });
    pool = app.pg;
  });

  afterAll(async () => app?.close());

  beforeEach(async () => {
    await pool.query(`truncate users, auth_providers, advanced_training_shot, advanced_training_run,
      advanced_training_completion, initial_training_run, initial_training_completion,
      initial_training_open_access, training_session, day_pool, period_log,
      shot_session, event_log restart identity cascade`);
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `advanced-v2-${Date.now()}-${Math.random()}`,
      displayName: 'V2 student', timezone: 'Europe/Moscow',
    });
    userId = user.id;
    token = await createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET })
      .issueAccessToken({ sub: userId });
    await pool.query(`update users set level = 2 where id = $1`, [userId]);
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS) {
      await pool.query(`insert into initial_training_completion
        (user_id, exercise_key, reward_stars, reward_experience) values ($1, $2, 1, 1)`,
      [userId, exerciseKey]);
    }
    await pool.query(`insert into game_settings (key, value, label, description)
      values ('training.advanced_course.config',
        '{"enabled":true,"practiceSituations":5,"assessmentSituations":10,"requiredSuccesses":7,"rewardStars":1,"rewardExperience":1}'::jsonb,
        'Продвинутое обучение', 'Test config')
      on conflict (key) do update set value = excluded.value`);
  });

  const headers = () => ({ authorization: `Bearer ${token}` });
  const nextGoalTap = (state: { episode: AdvancedTrainingEpisodeProfile }): number =>
    state.episode.intervalStartMs + 250;
  const prepareEpisode = async (state: { run_id: string; movement_id: string }, tapTime: number) => {
    const started = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/episode/start', headers: headers(),
      payload: { run_id: state.run_id, movement_id: state.movement_id } });
    expect(started.statusCode).toBe(200);
    await pool.query(`update advanced_training_v2_run
      set episode_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [state.run_id, tapTime + 50]);
    return started.json().state;
  };

  it('shows eight V2 categories with 0/8 progress despite a V1 completion', async () => {
    await pool.query(`insert into advanced_training_completion
      (user_id, exercise_key, assessment_successes, reward_stars, reward_experience)
      values ($1, 'counter-direction', 7, 1, 1)`, [userId]);
    const response = await app.inject({ method: 'GET', url: '/duel/training/course', headers: headers() });
    expect(response.statusCode).toBe(200);
    expect(response.json().legacy_advanced_training).toMatchObject({
      completed_count: 0, total_count: 8,
    });
    expect(response.json().legacy_advanced_training.exercises[0]).toMatchObject({
      key: 'near_goalie', title: 'Вратарь рядом', state: 'available',
    });
  });

  it('starts on the left, resumes the same scene, and abandons an active V1 run without deleting it', async () => {
    const oldRun = await pool.query<{ id: string }>(`insert into advanced_training_run
      (user_id, exercise_key, state, stage, seed, scenario_order, game_core_version)
      values ($1, 'board-side', 'active', 'practice', 'old-seed', '["board-side-left-1"]', 66)
      returning id`, [userId]);
    const start = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/start', headers: headers() });
    expect(start.statusCode).toBe(200);
    expect(start.json().state).toMatchObject({
      stage: 'practice', side: 'left', side_successes: { left: 0, right: 0 },
      episode: { technique: 'near_goalie', side: 'left' }, resume_scene_ms: 0,
    });
    const runId = start.json().state.run_id as string;
    const resume = await app.inject({ method: 'GET',
      url: `/duel/training/advanced/v2/near_goalie/state?run_id=${runId}`, headers: headers() });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().state.movement_id).toBe(start.json().state.movement_id);
    const oldState = await pool.query<{ state: string }>(`select state from advanced_training_run where id = $1`,
      [oldRun.rows[0]!.id]);
    expect(oldState.rows[0]?.state).toBe('abandoned');
  });

  it('rejects unauthenticated and beginner-locked starts', async () => {
    const url = '/duel/training/advanced/v2/near_goalie/start';
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
    await pool.query(`delete from initial_training_completion where user_id = $1`, [userId]);
    expect((await app.inject({ method: 'POST', url, headers: headers() })).statusCode).toBe(403);
  });

  it('counts only authoritative goals on each side and grants the reward once', async () => {
    await pool.query(`update game_settings set value = jsonb_set(
      jsonb_set(value, '{rewardStars}', '4'::jsonb),
      '{rewardExperience}', '3'::jsonb)
      where key = 'training.advanced_course.config'`);
    const start = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/start', headers: headers() });
    let state = start.json().state;
    const runId = state.run_id as string;
    const shot = async (claimedResult = 'miss') => {
      state = await prepareEpisode(state, nextGoalTap(state));
      const response = await app.inject({ method: 'POST',
        url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
        payload: { run_id: runId, shot_index: state.shot_index + 1,
          movement_id: state.movement_id,
          input: { tapTime: nextGoalTap(state) },
          claimed_result: claimedResult } });
      expect(response.statusCode).toBe(200);
      state = response.json().state;
      return response.json();
    };
    const first = await shot();
    expect(first).toMatchObject({ server_result: 'goal', success: true,
      actual_technique: 'near_goalie', actual_side: 'left',
      state: { side: 'right', side_successes: { left: 1, right: 0 } } });
    const duplicate = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
      payload: { run_id: runId, shot_index: 1, movement_id: first.movement_id,
        input: { tapTime: first.tap_time }, claimed_result: 'goal' } });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual(first);
    await shot();
    expect(state).toMatchObject({ stage: 'practice', side_successes: { left: 1, right: 1 } });
    const assessment = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/assessment/start', headers: headers(),
      payload: { run_id: runId } });
    expect(assessment.statusCode).toBe(200);
    state = assessment.json().state;
    expect(state).toMatchObject({ stage: 'assessment', side: 'left',
      side_successes: { left: 0, right: 0 } });
    await shot(); await shot(); await shot();
    const final = await shot();
    expect(final).toMatchObject({ completed: true, reward_granted: { stars: 1, experience: 1 } });
    const user = await pool.query<{ xp: number; experience: number }>(
      `select xp, experience from users where id = $1`, [userId]);
    expect(user.rows[0]).toMatchObject({ xp: 1, experience: 1 });
    const replay = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
      payload: { run_id: runId, shot_index: 6, movement_id: final.movement_id,
        input: { tapTime: final.tap_time }, claimed_result: 'goal' } });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(final);
  });

  it('does not allow assessment before both practice sides succeed', async () => {
    const start = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/start', headers: headers() });
    const response = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/assessment/start', headers: headers(),
      payload: { run_id: start.json().state.run_id } });
    expect(response.statusCode).toBe(409);
  });

  it('rejects a stale attempt and permits repeated episode-local time', async () => {
    const started = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/start', headers: headers() });
    let state = started.json().state;
    const submit = async (tapTime: number, movementId = state.movement_id) => app.inject({
      method: 'POST', url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
      payload: { run_id: state.run_id, shot_index: state.shot_index + 1,
        movement_id: movementId, input: { tapTime }, claimed_result: 'goal' },
    });
    const target = nextGoalTap(state);
    // The authored trajectory also scores at target - 1000; use a verified
    // closed moment to exercise the stale/repeated-time contract.
    state = await prepareEpisode(state, target - 1500);
    await pool.query(`update advanced_training_v2_run set episode_started_at = now()
      where id = $1`, [state.run_id]);
    expect((await submit(target)).statusCode).toBe(409);
    await pool.query(`update advanced_training_v2_run
      set episode_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [state.run_id, target + 6000]);
    expect((await submit(target)).statusCode).toBe(409);
    await pool.query(`update advanced_training_v2_run
      set episode_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [state.run_id, target - 1500 + 50]);
    expect((await submit(target, 'stale-movement')).statusCode).toBe(409);
    const wrong = await submit(target - 1500);
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json()).toMatchObject({ success: false,
      state: { side: 'left', side_successes: { left: 0, right: 0 } } });
    state = wrong.json().state;
    state = await prepareEpisode(state, target - 1500);
    const repeatedTime = await submit(target - 1500);
    expect(repeatedTime.statusCode).toBe(200);
    state = repeatedTime.json().state;
    state = await prepareEpisode(state, nextGoalTap(state));
    const correct = await submit(nextGoalTap(state));
    expect(correct.json()).toMatchObject({ success: true, actual_technique: 'near_goalie',
      state: { side: 'right', side_successes: { left: 1, right: 0 } } });
  });

  it('serializes concurrent copies of one shot without double progress', async () => {
    const started = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/start', headers: headers() });
    const state = await prepareEpisode(started.json().state,
      nextGoalTap(started.json().state));
    const request = () => app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
      payload: { run_id: state.run_id, shot_index: 1, movement_id: state.movement_id,
        input: { tapTime: nextGoalTap(state) }, claimed_result: 'goal' } });
    const [a, b] = await Promise.all([request(), request()]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json()).toEqual(b.json());
    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from advanced_training_v2_shot where run_id = $1`, [state.run_id]);
    expect(count.rows[0]?.count).toBe(1);
  });

  it('resumes the same progressed run after another start request', async () => {
    const url = '/duel/training/advanced/v2/near_goalie/start';
    const started = await app.inject({ method: 'POST', url, headers: headers() });
    const initial = await prepareEpisode(started.json().state,
      nextGoalTap(started.json().state));
    const shot = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/v2/near_goalie/shot', headers: headers(),
      payload: { run_id: initial.run_id, shot_index: 1, movement_id: initial.movement_id,
        input: { tapTime: nextGoalTap(initial) }, claimed_result: 'goal' } });
    expect(shot.statusCode).toBe(200);
    const resumed = await app.inject({ method: 'POST', url, headers: headers() });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().state).toMatchObject({ run_id: initial.run_id,
      shot_index: 1, side: 'right', side_successes: { left: 1, right: 0 } });
    expect(resumed.json().state.resume_scene_ms).toBe(0);
  });
});
