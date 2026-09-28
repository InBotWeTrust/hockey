import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { INITIAL_TRAINING_EXERCISE_KEYS } from '../../src/duel/training/initialCourse.js';
import { OPEN_WINDOW_STEPS } from '@hockey/game-core';
import { createTestPool, createTestRedis, getTestUrls, hasIntegrationEnv,
  resetDatabase, resetRedis } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../db/migrations');
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

describe.skipIf(!hasIntegrationEnv)('open-window advanced course', () => {
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
    await pool.query('truncate users, auth_providers restart identity cascade');
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `open-window-${Date.now()}-${Math.random()}`,
      displayName: 'Open-window student', timezone: 'Europe/Moscow',
    });
    userId = user.id;
    token = await createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET })
      .issueAccessToken({ sub: userId });
    await pool.query('update users set level = 2 where id = $1', [userId]);
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

  it('shows twelve ordered steps independently of old category completion', async () => {
    await pool.query(`insert into advanced_training_v2_completion
      (user_id, exercise_key, reward_stars, reward_experience)
      values ($1, 'near_goalie', 1, 1)`, [userId]);
    const response = await app.inject({ method: 'GET',
      url: '/duel/training/advanced/open-windows/catalog', headers: headers() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ completed_count: 0, total_count: 12 });
    expect(response.json().steps[0]).toMatchObject({
      key: 'notice_frame', stage: 'notice', state: 'available',
    });
    expect(response.json().steps[1]).toMatchObject({ state: 'locked' });
    const course = await app.inject({ method: 'GET',
      url: '/duel/training/course', headers: headers() });
    expect(course.statusCode).toBe(200);
    expect(course.json().advanced_training.total_count).toBe(12);
    expect(course.json().advanced_training.exercises[0]).toMatchObject({
      key: 'notice_frame', state: 'available',
    });
    expect(course.json().exercises).toHaveLength(INITIAL_TRAINING_EXERCISE_KEYS.length);
  });

  it('starts and resumes the same first-period scene without changing old completion', async () => {
    const url = '/duel/training/advanced/open-windows/notice_frame/start';
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
    const start = await app.inject({ method: 'POST', url, headers: headers() });
    expect(start.statusCode).toBe(200);
    expect(start.json().state).toMatchObject({
      step_key: 'notice_frame', phase: 'practice', scene: { role: 'practice' },
      game_core_version: 69,
    });
    const runId = start.json().state.run_id as string;
    const state = await app.inject({ method: 'GET',
      url: `/duel/training/advanced/open-windows/notice_frame/state?run_id=${runId}`,
      headers: headers() });
    expect(state.statusCode).toBe(200);
    expect(state.json().state.attempt_token).toBe(start.json().state.attempt_token);
    expect(state.json().state.scene.id).toBe(start.json().state.scene.id);
    const attempt = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/open-windows/notice_frame/attempt/start',
      headers: headers(), payload: { run_id: runId } });
    expect(attempt.statusCode).toBe(200);
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - interval '2 seconds' where id = $1`, [runId]);
    const resumed = await app.inject({ method: 'GET',
      url: `/duel/training/advanced/open-windows/notice_frame/state?run_id=${runId}`,
      headers: headers() });
    expect(resumed.json().state.active_elapsed_ms).toBeGreaterThanOrEqual(1900);
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - interval '20 seconds' where id = $1`, [runId]);
    const expired = await app.inject({ method: 'POST', url, headers: headers() });
    expect(expired.statusCode).toBe(200);
    expect(expired.json().state.run_id).toBe(runId);
    expect(expired.json().state.attempt_started_at).toBeNull();
    expect(expired.json().state.attempt_token).not.toBe(start.json().state.attempt_token);
  });

  it('starts a timed attempt and records a shot decision once', async () => {
    const start = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/open-windows/notice_frame/start', headers: headers() });
    const state = start.json().state;
    const attempt = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/open-windows/notice_frame/attempt/start',
      headers: headers(), payload: { run_id: state.run_id } });
    expect(attempt.statusCode).toBe(200);
    expect(attempt.json().state.attempt_started_at).toBeTruthy();
    const scene = attempt.json().state.scene;
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [state.run_id, scene.targetMs - scene.startMs]);
    const decision = { run_id: state.run_id, attempt_token: state.attempt_token,
      decision_index: 1, scene_id: scene.id,
      input: { type: 'shot', tap_time_ms: scene.targetMs } };
    const result = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/open-windows/notice_frame/decision',
      headers: headers(), payload: decision });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ server_result: 'goal', evaluation: {
      opportunity: 'shot_window', onTime: true,
    } });
    const duplicate = await app.inject({ method: 'POST',
      url: '/duel/training/advanced/open-windows/notice_frame/decision',
      headers: headers(), payload: decision });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual(result.json());
    expect((await pool.query('select count(*)::int as n from open_window_training_decision')).rows[0].n).toBe(1);
  });

  it('advances through five unseen checks, ignores stale tokens, and keeps rewards one-time', async () => {
    const base = '/duel/training/advanced/open-windows/notice_frame';
    const start = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    let state = start.json().state;
    const runId = state.run_id as string;
    let finalPayload: Record<string, unknown> | null = null;
    let finalResponse: unknown = null;
    for (let decisionIndex = 1; decisionIndex <= 6; decisionIndex += 1) {
      const attempt = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
        headers: headers(), payload: { run_id: runId } });
      expect(attempt.statusCode).toBe(200);
      state = attempt.json().state;
      const oldToken = state.attempt_token;
      await pool.query(`update open_window_training_run
        set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
      [runId, state.scene.targetMs - state.scene.startMs]);
      const payload = { run_id: runId, attempt_token: oldToken, decision_index: decisionIndex,
        scene_id: state.scene.id,
        input: { type: 'shot', tap_time_ms: state.scene.targetMs } };
      const result = await app.inject({ method: 'POST', url: `${base}/decision`,
        headers: headers(), payload });
      expect(result.statusCode).toBe(200);
      state = result.json().state;
      if (decisionIndex === 6) { finalPayload = payload; finalResponse = result.json(); }
      expect(result.json().sound).toBe(true);
      if (decisionIndex === 1) {
        expect(state.phase).toBe('check');
        const stale = await app.inject({ method: 'POST', url: `${base}/decision`,
          headers: headers(), payload: { ...payload, decision_index: 2 } });
        expect(stale.statusCode).toBe(409);
      }
    }
    expect(state.scene.id).toContain('notice_frame');
    expect((await pool.query(`select state from open_window_training_run where id = $1`,
      [runId])).rows[0].state).toBe('completed');
    const duplicate = await app.inject({ method: 'POST', url: `${base}/decision`,
      headers: headers(), payload: finalPayload });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual(finalResponse);
    expect((await pool.query(`select count(*)::int as n from open_window_training_completion
      where user_id = $1`, [userId])).rows[0].n).toBe(1);
  });

  it('keeps pace-series motion continuous across shots and pauses result time', async () => {
    for (const step of OPEN_WINDOW_STEPS.slice(0, 9)) {
      await pool.query(`insert into open_window_training_completion
        (user_id, step_key, stage, reward_stars, reward_experience)
        values ($1, $2, $3, 0, 0)`, [userId, step.key, step.stage]);
    }
    const base = '/duel/training/advanced/open-windows/pace_short';
    const started = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    expect(started.statusCode).toBe(200);
    const initial = started.json().state;
    const attempt = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
      headers: headers(), payload: { run_id: initial.run_id } });
    const scene = attempt.json().state.scene;
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [initial.run_id, scene.targetMs - scene.startMs]);
    const decision = await app.inject({ method: 'POST', url: `${base}/decision`,
      headers: headers(), payload: { run_id: initial.run_id,
        attempt_token: initial.attempt_token, decision_index: 1, scene_id: scene.id,
        input: { type: 'shot', tap_time_ms: scene.targetMs } } });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().state).toMatchObject({ phase: 'practice',
      scene: { id: scene.id, sessionSeed: scene.sessionSeed, shotIndex: 2 },
      attempt_started_at: null, active_elapsed_ms: scene.targetMs - scene.startMs });
    const resumed = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
      headers: headers(), payload: { run_id: initial.run_id } });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().state.attempt_started_at).toBeTruthy();
    expect(resumed.json().state.scene.id).toBe(scene.id);
  });

  it('finishes a full three-minute run only after active time, then requires a second check run', async () => {
    for (const step of OPEN_WINDOW_STEPS.slice(0, 11)) {
      await pool.query(`insert into open_window_training_completion
        (user_id, step_key, stage, reward_stars, reward_experience)
        values ($1, $2, $3, 0, 0)`, [userId, step.key, step.stage]);
    }
    const base = '/duel/training/advanced/open-windows/pace_three_minutes';
    const started = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    let state = started.json().state;
    expect(state.scene.endMs - state.scene.startMs).toBe(180_000);
    for (let runNumber = 0; runNumber < 3; runNumber += 1) {
      const attempt = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
        headers: headers(), payload: { run_id: state.run_id } });
      expect(attempt.statusCode).toBe(200);
      state = attempt.json().state;
      const tooEarly = await app.inject({ method: 'POST', url: `${base}/finish`,
        headers: headers(), payload: { run_id: state.run_id,
          attempt_token: state.attempt_token } });
      expect(tooEarly.statusCode).toBe(409);
      await pool.query(`update open_window_training_run
        set attempt_started_at = now() - interval '180 seconds' where id = $1`,
      [state.run_id]);
      const finished = await app.inject({ method: 'POST', url: `${base}/finish`,
        headers: headers(), payload: { run_id: state.run_id,
          attempt_token: state.attempt_token } });
      expect(finished.statusCode).toBe(200);
      const duplicate = await app.inject({ method: 'POST', url: `${base}/finish`,
        headers: headers(), payload: { run_id: state.run_id,
          attempt_token: state.attempt_token } });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json()).toEqual(finished.json());
      state = finished.json().state;
      expect(state.full_runs).toBe(runNumber);
      if (runNumber === 0) expect(state.phase).toBe('check');
      if (runNumber === 2) {
        expect(finished.json().completed).toBe(true);
        expect(finished.json().reward_granted).toEqual({ stars: 1, experience: 1 });
      }
    }
  });

  it('lets the player skip one closed traversal and then shoot in the same moving scene', async () => {
    for (const step of OPEN_WINDOW_STEPS.slice(0, 7)) {
      await pool.query(`insert into open_window_training_completion
        (user_id, step_key, stage, reward_stars, reward_experience)
        values ($1, $2, $3, 0, 0)`, [userId, step.key, step.stage]);
    }
    const base = '/duel/training/advanced/open-windows/decide_skip';
    const start = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    const initial = start.json().state;
    const attempt = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
      headers: headers(), payload: { run_id: initial.run_id } });
    const scene = attempt.json().state.scene;
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [initial.run_id, scene.skipSegment.endMs - scene.startMs]);
    const skipped = await app.inject({ method: 'POST', url: `${base}/decision`,
      headers: headers(), payload: { run_id: initial.run_id,
        attempt_token: initial.attempt_token, decision_index: 1, scene_id: scene.id,
        input: { type: 'skip' } } });
    expect(skipped.statusCode).toBe(200);
    expect(skipped.json()).toMatchObject({ sound: true, state: {
      scene: { id: scene.id }, phase: 'practice', skip_recorded: true,
      attempt_index: 0,
    } });
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [initial.run_id, scene.targetMs - scene.startMs]);
    const afterSkip = skipped.json().state;
    const shot = await app.inject({ method: 'POST', url: `${base}/decision`,
      headers: headers(), payload: { run_id: initial.run_id,
        attempt_token: afterSkip.attempt_token, decision_index: 2, scene_id: scene.id,
        input: { type: 'shot', tap_time_ms: scene.targetMs } } });
    expect(shot.statusCode).toBe(200);
    expect(shot.json()).toMatchObject({ sound: true, state: {
      phase: 'check', skip_recorded: false,
    } });
  });

  it('rejects another player and restarts a run with stale simulation rules', async () => {
    const base = '/duel/training/advanced/open-windows/notice_frame';
    const started = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    const original = started.json().state;
    const otherToken = await createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET })
      .issueAccessToken({ sub: randomUUID() });
    const alien = await app.inject({ method: 'GET',
      url: `${base}/state?run_id=${original.run_id}`,
      headers: { authorization: `Bearer ${otherToken}` } });
    expect(alien.statusCode).toBe(401);
    await pool.query(`update open_window_training_run
      set game_core_version = game_core_version - 1 where id = $1`, [original.run_id]);
    const stale = await app.inject({ method: 'GET',
      url: `${base}/state?run_id=${original.run_id}`, headers: headers() });
    expect(stale.statusCode).toBe(409);
    const restarted = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    expect(restarted.statusCode).toBe(200);
    expect(restarted.json().restarted_due_to_version).toBe(true);
    expect(restarted.json().state.run_id).not.toBe(original.run_id);
    expect((await pool.query(`select state from open_window_training_run where id = $1`,
      [original.run_id])).rows[0].state).toBe('abandoned');
  });

  it('accepts a human tap when network delivery adds half a second', async () => {
    const base = '/duel/training/advanced/open-windows/notice_frame';
    const started = await app.inject({ method: 'POST', url: `${base}/start`, headers: headers() });
    const initial = started.json().state;
    const attempt = await app.inject({ method: 'POST', url: `${base}/attempt/start`,
      headers: headers(), payload: { run_id: initial.run_id } });
    const scene = attempt.json().state.scene;
    await pool.query(`update open_window_training_run
      set attempt_started_at = now() - ($2::int * interval '1 millisecond') where id = $1`,
    [initial.run_id, scene.targetMs - scene.startMs + 500]);
    const response = await app.inject({ method: 'POST', url: `${base}/decision`,
      headers: headers(), payload: { run_id: initial.run_id,
        attempt_token: initial.attempt_token, decision_index: 1, scene_id: scene.id,
        input: { type: 'shot', tap_time_ms: scene.targetMs } } });
    expect(response.statusCode).toBe(200);
    expect(response.json().evaluation.onTime).toBe(true);
  });
});
