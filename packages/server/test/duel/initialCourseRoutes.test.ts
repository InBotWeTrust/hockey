import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  getDailyPeriodSpeedPreset,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtEmptyGoalShot,
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

  it('publishes completion from the seven durable exercise rows', async () => {
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

  it('unlocks game pace after the preceding exercises and uses first-period speed', async () => {
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

  it('does not advance the right-side stage for a verified goal from the center', async () => {
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS.slice(0, 3)) {
      await pool.query(
        `insert into initial_training_completion
           (user_id, exercise_key, reward_stars, reward_experience)
         values ($1, $2, 1, 1)`,
        [userId, exerciseKey],
      );
    }
    const started = await app.inject({
      method: 'POST',
      url: '/duel/training/course/moving-goal/start',
      headers: headers(),
    });
    expect(started.statusCode).toBe(200);
    const session = started.json();
    expect(session).toMatchObject({
      target_goals: 9,
      required_zone: 'right',
      scene: {
        has_goalie: false,
        speeds: { goal_frequency: getDailyPeriodSpeedPreset(1).goalFrequency },
      },
    });
    const offsets = getSessionPhaseOffsets(session.seed);
    const speeds = session.scene.speeds;
    let centerGoalTime: number | null = null;
    for (let time = 0; time < 20_000; time += 5) {
      const shooterX = simulateShooter(time + offsets.shooter, speeds.shooter_frequency).x;
      if (shooterX < 209 || shooterX >= 363) continue;
      const result = resolvePerspectiveCourtEmptyGoalShot(
        {
          tapTime: time,
          shooterTapTime: time,
          puckSpeedPerMs: speeds.puck_speed_per_ms,
          shooterFrequency: speeds.shooter_frequency,
          goalieFrequency: speeds.goalie_frequency,
          goalFrequency: speeds.goal_frequency,
        },
        session.scene.goalie_config,
        offsets,
      );
      if (result.type === 'goal') {
        centerGoalTime = time;
        break;
      }
    }
    expect(centerGoalTime).not.toBeNull();
    const shot = await app.inject({
      method: 'POST',
      url: '/duel/training/course/moving-goal/shot',
      headers: headers(),
      payload: {
        run_id: session.run_id,
        shot_index: 1,
        input: { tapTime: centerGoalTime, shooterTapTime: centerGoalTime },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);
    expect(shot.json()).toMatchObject({
      server_result: 'goal',
      credited_goal: false,
      feedback_code: 'goal_wrong_zone',
      completed: false,
      state: { shots_taken: 1, goals: 0, required_zone: 'right' },
    });

    let rightGoalTime: number | null = null;
    for (let time = 0; time < 20_000; time += 5) {
      const shooterX = simulateShooter(time + offsets.shooter, speeds.shooter_frequency).x;
      if (shooterX < 363) continue;
      const result = resolvePerspectiveCourtEmptyGoalShot(
        {
          tapTime: time,
          shooterTapTime: time,
          puckSpeedPerMs: speeds.puck_speed_per_ms,
          shooterFrequency: speeds.shooter_frequency,
          goalieFrequency: speeds.goalie_frequency,
          goalFrequency: speeds.goal_frequency,
        },
        session.scene.goalie_config,
        offsets,
      );
      if (result.type === 'goal') {
        rightGoalTime = time;
        break;
      }
    }
    expect(rightGoalTime).not.toBeNull();
    const rightShot = await app.inject({
      method: 'POST',
      url: '/duel/training/course/moving-goal/shot',
      headers: headers(),
      payload: {
        run_id: session.run_id,
        shot_index: 2,
        input: { tapTime: rightGoalTime, shooterTapTime: rightGoalTime },
        claimed_result: 'goal',
      },
    });
    expect(rightShot.statusCode).toBe(200);
    expect(rightShot.json()).toMatchObject({
      credited_goal: true,
      state: { shots_taken: 2, goals: 1, required_zone: 'right' },
    });
  });

  it('prioritizes the required zone over miss direction only when the shot starts elsewhere', async () => {
    for (const exerciseKey of INITIAL_TRAINING_EXERCISE_KEYS.slice(0, 3)) {
      await pool.query(
        `insert into initial_training_completion
           (user_id, exercise_key, reward_stars, reward_experience)
         values ($1, $2, 1, 1)`,
        [userId, exerciseKey],
      );
    }
    const started = await app.inject({
      method: 'POST',
      url: '/duel/training/course/moving-goal/start',
      headers: headers(),
    });
    expect(started.statusCode).toBe(200);
    const session = started.json();
    const offsets = getSessionPhaseOffsets(session.seed);
    const speeds = session.scene.speeds;
    const findMiss = (fromRight: boolean): number | null => {
      for (let time = 0; time < 20_000; time += 5) {
        const shooterX = simulateShooter(time + offsets.shooter, speeds.shooter_frequency).x;
        if (fromRight ? shooterX < 363 : shooterX < 209 || shooterX >= 363) continue;
        const result = resolvePerspectiveCourtEmptyGoalShot(
          {
            tapTime: time,
            shooterTapTime: time,
            puckSpeedPerMs: speeds.puck_speed_per_ms,
            shooterFrequency: speeds.shooter_frequency,
            goalieFrequency: speeds.goalie_frequency,
            goalFrequency: speeds.goal_frequency,
          },
          session.scene.goalie_config,
          offsets,
        );
        if (result.type === 'miss') return time;
      }
      return null;
    };
    const centerMissTime = findMiss(false);
    const rightMissTime = findMiss(true);
    expect(centerMissTime).not.toBeNull();
    expect(rightMissTime).not.toBeNull();
    for (const [shotIndex, tapTime, wrongZone] of [
      [1, centerMissTime, true],
      [2, rightMissTime, false],
    ] as const) {
      const shot = await app.inject({
        method: 'POST',
        url: '/duel/training/course/moving-goal/shot',
        headers: headers(),
        payload: {
          run_id: session.run_id,
          shot_index: shotIndex,
          input: { tapTime, shooterTapTime: tapTime },
          claimed_result: 'miss',
        },
      });
      expect(shot.statusCode).toBe(200);
      expect(shot.json()).toMatchObject({
        server_result: 'miss',
        credited_goal: false,
        feedback_code: wrongZone ? 'shot_wrong_zone' : expect.stringMatching(/^miss_(left|right)$/),
        state: { shots_taken: shotIndex, goals: 0, required_zone: 'right' },
      });
    }
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
