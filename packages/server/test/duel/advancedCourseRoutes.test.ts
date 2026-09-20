import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { INITIAL_TRAINING_EXERCISE_KEYS } from '../../src/duel/training/initialCourse.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../db/migrations');
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

describe.skipIf(!hasIntegrationEnv)('/duel/training/advanced/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        DAILY_SEED_SECRET,
      },
    });
    pool = app.pg;
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, advanced_training_shot, advanced_training_run,
                advanced_training_completion, initial_training_run, initial_training_completion,
                initial_training_open_access, training_session, day_pool, period_log,
                shot_session, event_log restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `advanced-training-${Date.now()}-${Math.random()}`,
      displayName: 'Advanced student',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    accessToken = await createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET })
      .issueAccessToken({ sub: userId });
    await pool.query(`update users set level = 2 where id = $1`, [userId]);
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS) {
      await pool.query(
        `insert into initial_training_completion
           (user_id, exercise_key, reward_stars, reward_experience)
         values ($1, $2, 1, 1)`,
        [userId, exerciseKey],
      );
    }
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values (
         'training.advanced_course.config',
         '{"enabled":true,"practiceSituations":5,"assessmentSituations":10,"requiredSuccesses":7,"rewardStars":1,"rewardExperience":1}'::jsonb,
         'Продвинутое обучение',
         'Test config'
       )
       on conflict (key) do update set value = excluded.value`,
    );
  });

  const headers = () => ({ authorization: `Bearer ${accessToken}` });

  it('rejects starting without the completed beginner course', async () => {
    await pool.query(`delete from initial_training_completion where user_id = $1`, [userId]);
    const response = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/board-side/start',
      headers: headers(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('initial_training_required');
  });

  it('starts idempotently, rejects a locked exercise, and accepts the first verified shot', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/board-side/start',
      headers: headers(),
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      demonstrations: [{ exerciseKey: 'board-side' }, { exerciseKey: 'board-side' }],
      state: {
        exercise_key: 'board-side',
        stage: 'practice',
        situation_index: 0,
        total_situations: 5,
        shots_taken: 0,
      },
    });

    const repeated = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/board-side/start',
      headers: headers(),
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().state.run_id).toBe(first.json().state.run_id);

    const locked = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/open-net/start',
      headers: headers(),
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('advanced_training_exercise_locked');

    const state = first.json().state;
    const shot = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/board-side/shot',
      headers: headers(),
      payload: {
        run_id: state.run_id,
        shot_index: 1,
        input: {
          tapTime: state.scenario.targetTapTimeMs,
          shooterTapTime: state.scenario.targetTapTimeMs,
        },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);
    expect(shot.json()).toMatchObject({
      situation_complete: true,
      state: { shots_taken: 1 },
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/duel/training/advanced/board-side/shot',
      headers: headers(),
      payload: {
        run_id: state.run_id,
        shot_index: 1,
        input: {
          tapTime: state.scenario.targetTapTimeMs,
          shooterTapTime: state.scenario.targetTapTimeMs,
        },
        claimed_result: 'goal',
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(shot.json());
  });
});
