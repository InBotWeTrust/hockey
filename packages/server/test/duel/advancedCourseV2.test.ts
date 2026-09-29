import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
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

  it('shows eight V2 categories with 0/8 progress despite a V1 completion', async () => {
    await pool.query(`insert into advanced_training_completion
      (user_id, exercise_key, assessment_successes, reward_stars, reward_experience)
      values ($1, 'counter-direction', 7, 1, 1)`, [userId]);
    const response = await app.inject({ method: 'GET', url: '/duel/training/course', headers: headers() });
    expect(response.statusCode).toBe(200);
    expect(response.json().advanced_training).toMatchObject({
      completed_count: 0, total_count: 8,
    });
    expect(response.json().advanced_training.exercises[0]).toMatchObject({
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
      scenario: { technique: 'near_goalie', side: 'left', stage: 'practice' },
    });
    const runId = start.json().state.run_id as string;
    const resume = await app.inject({ method: 'GET',
      url: `/duel/training/advanced/v2/near_goalie/state?run_id=${runId}`, headers: headers() });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().state.scenario.id).toBe(start.json().state.scenario.id);
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
});
