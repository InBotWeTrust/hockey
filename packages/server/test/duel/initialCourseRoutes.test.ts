import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  getDailyPeriodSpeedPreset,
  getSessionPhaseOffsets,
  simulateShooter,
} from '@hockey/game-core';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  INITIAL_TRAINING_EXERCISE_KEYS,
  isInitialTrainingCompleted,
} from '../../src/duel/training/initialCourse.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

describe.skipIf(!hasIntegrationEnv)('/duel/training/course/*', () => {
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
      `truncate users, auth_providers, initial_training_run,
                initial_training_completion, initial_training_open_access,
                training_session, day_pool, period_log, shot_session, event_log
         restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `initial-training-${Date.now()}-${Math.random()}`,
      displayName: 'Student',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    accessToken = await jwt.issueAccessToken({ sub: userId });
    await pool.query(
      `update game_settings
          set value = jsonb_set(
            jsonb_set(value, '{enabled}', 'true'::jsonb),
            '{targetGoals,first-shot}',
            '1'::jsonb
          )
        where key = 'training.initial_course.config'`,
    );
  });

  const headers = () => ({ authorization: `Bearer ${accessToken}` });

  it('returns seven sequential cards and locks open training', async () => {
    const catalog = await app.inject({
      method: 'GET',
      url: '/duel/training/course',
      headers: headers(),
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({
      enabled: true,
      beginner_training_completed: false,
      completed_count: 0,
      open_training_unlocked: false,
      exercises: [
        { key: 'first-shot', state: 'available' },
        { key: 'three-positions', state: 'locked' },
        { key: 'follow-the-goal', state: 'locked' },
        { key: 'moving-goal', state: 'locked' },
        { key: 'find-the-gap', state: 'locked' },
        { key: 'pressure-window', state: 'locked' },
        { key: 'game-pace', state: 'locked' },
      ],
    });

    const openTraining = await app.inject({
      method: 'POST',
      url: '/duel/training/start',
      headers: headers(),
      payload: { period_number: 1 },
    });
    expect(openTraining.statusCode).toBe(409);
    expect(openTraining.json().error.code).toBe('initial_training_required');
  });

  it('publishes completion from the five durable exercise rows', async () => {
    expect(await isInitialTrainingCompleted(pool, userId)).toBe(false);
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS) {
      await pool.query(
        `insert into initial_training_completion
           (user_id, exercise_key, reward_stars, reward_experience)
         values ($1, $2, 1, 1)`,
        [userId, exerciseKey],
      );
    }

    expect(await isInitialTrainingCompleted(pool, userId)).toBe(true);
    const catalog = await app.inject({
      method: 'GET',
      url: '/duel/training/course',
      headers: headers(),
    });
    expect(catalog.json()).toMatchObject({ beginner_training_completed: true });
  });

  it('rejects a locked exercise', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/duel/training/course/three-positions/start',
      headers: headers(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('initial_training_exercise_locked');
  });

  it('unlocks game pace after both slower goalie exercises and uses first-period speed', async () => {
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS.slice(0, 6)) {
      await pool.query(
        `insert into initial_training_completion
           (user_id, exercise_key, reward_stars, reward_experience)
         values ($1, $2, 1, 1)`,
        [userId, exerciseKey],
      );
    }

    const started = await app.inject({
      method: 'POST',
      url: '/duel/training/course/game-pace/start',
      headers: headers(),
    });

    expect(started.statusCode).toBe(200);
    expect(started.json().scene).toMatchObject({
      has_goalie: true,
      speeds: {
        shooter_frequency: getDailyPeriodSpeedPreset(1).shooterFrequency,
        goalie_frequency: getDailyPeriodSpeedPreset(1).goalieFrequency,
        goal_frequency: getDailyPeriodSpeedPreset(1).goalFrequency,
      },
    });
  });

  it('grants the first-clear reward once and unlocks the next exercise', async () => {
    await pool.query(
      `update game_settings set value = to_jsonb('wall'::text) where key = 'training.goalie_id'`,
    );
    const started = await app.inject({
      method: 'POST',
      url: '/duel/training/course/first-shot/start',
      headers: headers(),
    });
    expect(started.statusCode).toBe(200);
    const session = started.json();
    expect(session.scene.goalie_id).toBe('rookie');
    const preset = getDailyPeriodSpeedPreset(1);
    const offsets = getSessionPhaseOffsets(session.seed);
    let tapTime = 0;
    for (; tapTime < 20_000; tapTime += 5) {
      if (Math.abs(simulateShooter(tapTime + offsets.shooter, preset.shooterFrequency).x - 286) < 2) {
        break;
      }
    }

    const completed = await app.inject({
      method: 'POST',
      url: '/duel/training/course/first-shot/shot',
      headers: headers(),
      payload: {
        run_id: session.run_id,
        shot_index: 1,
        input: { tapTime, shooterTapTime: tapTime },
        claimed_result: 'goal',
      },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      server_result: 'goal',
      completed: true,
      reward_granted: { stars: 1, experience: 1 },
    });

    const replayedCompleted = await app.inject({
      method: 'POST',
      url: '/duel/training/course/first-shot/shot',
      headers: headers(),
      payload: {
        run_id: session.run_id,
        shot_index: 1,
        input: { tapTime, shooterTapTime: tapTime },
        claimed_result: 'goal',
      },
    });
    expect(replayedCompleted.statusCode).toBe(200);
    expect(replayedCompleted.json()).toEqual(completed.json());

    const repeated = await app.inject({
      method: 'POST',
      url: '/duel/training/course/first-shot/start',
      headers: headers(),
    });
    const repeatSession = repeated.json();
    const repeatShot = await app.inject({
      method: 'POST',
      url: '/duel/training/course/first-shot/shot',
      headers: headers(),
      payload: {
        run_id: repeatSession.run_id,
        shot_index: 1,
        input: { tapTime, shooterTapTime: tapTime },
        claimed_result: 'goal',
      },
    });
    expect(repeatShot.statusCode).toBe(200);
    expect(repeatShot.json().reward_granted).toBeNull();

    const { rows } = await pool.query<{ xp: number; experience: number }>(
      'select xp, experience from users where id = $1',
      [userId],
    );
    expect(rows[0]).toMatchObject({ xp: 1, experience: 1 });

    const catalog = await app.inject({
      method: 'GET',
      url: '/duel/training/course',
      headers: headers(),
    });
    expect(catalog.json().exercises.slice(0, 2)).toMatchObject([
      { state: 'completed' },
      { state: 'available' },
    ]);
  });
});
