import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getDailyPeriodSpeedPreset } from '@hockey/game-core';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
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
const TRAINING_SHOTS_LIMIT = 500;

describe.skipIf(!hasIntegrationEnv)('/duel/training/*', () => {
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, user_wallet, user_equipment, user_sticks,
              training_session, day_pool, period_log, shot_session, event_log
              restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'training-test-1',
      displayName: 'Tester',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    accessToken = await jwt.issueAccessToken({ sub: userId });
  });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function getState() {
    const res = await app.inject({
      method: 'GET',
      url: '/duel/training/state',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function startTraining(periodNumber = 2) {
    return app.inject({
      method: 'POST',
      url: '/duel/training/start',
      headers: authHeader(),
      payload: { period_number: periodNumber },
    });
  }

  async function trainingTapTime() {
    const { rows } = await pool.query<{ started_at: Date }>(
      `select started_at
         from training_session
        where user_id = $1
        order by started_at desc
        limit 1`,
      [userId],
    );
    const startedAt = rows[0]?.started_at;
    return startedAt ? Math.max(0, Date.now() - startedAt.getTime()) : 0;
  }

  async function submitShot(shotIndex: number, claimedResult = 'goal') {
    const tapTime = await trainingTapTime();
    return app.inject({
      method: 'POST',
      url: '/duel/training/shot',
      headers: authHeader(),
      payload: {
        shot_index: shotIndex,
        input: { tapTime },
        claimed_result: claimedResult,
      },
    });
  }

  async function startDailyPeriod() {
    return app.inject({
      method: 'POST',
      url: '/duel/daily/period/start',
      headers: authHeader(),
    });
  }

  it('initial state is idle', async () => {
    const state = await getState();
    expect(state.state).toBe('idle');
    expect(state.shots_limit).toBe(TRAINING_SHOTS_LIMIT);
    expect(state.selected_period).toBeNull();
  });

  it('starts one training session for the local day', async () => {
    const res = await startTraining(3);
    expect(res.statusCode).toBe(200);
    const state = res.json();
    expect(state.state).toBe('active');
    expect(state.selected_period).toBe(3);
    expect(state.training_seed).toMatch(/^[0-9a-f]{64}$/);
    expect(state.started_at).toEqual(expect.any(String));
    expect(state.server_now).toEqual(expect.any(String));

    const second = await startTraining(1);
    expect(second.statusCode).toBe(200);
    expect(second.json().selected_period).toBe(3);
  });

  it('rejects stale training tapTime after the session has moved on', async () => {
    const training = await startTraining(2);
    expect(training.statusCode).toBe(200);
    await pool.query(
      `update training_session
          set started_at = now() - interval '1 minute'
        where user_id = $1`,
      [userId],
    );

    const shot = await app.inject({
      method: 'POST',
      url: '/duel/training/shot',
      headers: authHeader(),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(409);
  });

  it('rejects training start while a daily period is active', async () => {
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);

    const training = await startTraining(1);
    expect(training.statusCode).toBe(409);
  });

  it('rejects training start between daily periods before the third period is complete', async () => {
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);
    await pool.query(
      `update day_pool
          set state = 'idle',
              current_period = 1,
              period_started_at = null,
              break_started_at = null
        where user_id = $1`,
      [userId],
    );

    const training = await startTraining(1);
    expect(training.statusCode).toBe(409);
  });

  it('rejects training shots once the daily game starts', async () => {
    const training = await startTraining(2);
    expect(training.statusCode).toBe(200);
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);

    const shot = await submitShot(1);
    expect(shot.statusCode).toBe(409);
  });

  it('records shots without incrementing lifetime daily totals', async () => {
    await startTraining(2);
    const r = await submitShot(1);
    expect(r.statusCode).toBe(200);
    const { rows } = await pool.query(
      `select mode, period_number, shot_index, input_payload, training_session_id, day_pool_id
         from shot_session where user_id = $1`,
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].mode).toBe('training');
    expect(rows[0].period_number).toBe(2);
    expect(rows[0].shot_index).toBe(1);
    expect(rows[0].training_session_id).not.toBeNull();
    expect(rows[0].day_pool_id).toBeNull();
    const periodSpeeds = getDailyPeriodSpeedPreset(2);
    expect(rows[0].input_payload).toEqual({
      tapTime: expect.any(Number),
      puckSpeedPerMs: periodSpeeds.puckSpeedPerMs,
      shooterFrequency: periodSpeeds.shooterFrequency,
      goalieFrequency: periodSpeeds.goalieFrequency,
      goalFrequency: periodSpeeds.goalFrequency,
    });

    const userRows = await pool.query(
      'select lifetime_shots_total, lifetime_goals_total from users where id = $1',
      [userId],
    );
    expect(userRows.rows[0].lifetime_shots_total).toBe(0);
    expect(userRows.rows[0].lifetime_goals_total).toBe(0);
  });

  it('closes after the 500th shot', async () => {
    await startTraining(1);
    for (let i = 1; i <= TRAINING_SHOTS_LIMIT; i += 1) {
      const r = await submitShot(i);
      expect(r.statusCode).toBe(200);
    }
    const state = await getState();
    expect(state.state).toBe('closed');
    expect(state.shots_taken).toBe(TRAINING_SHOTS_LIMIT);

    const extra = await submitShot(TRAINING_SHOTS_LIMIT + 1);
    expect(extra.statusCode).toBe(409);
  });
});
