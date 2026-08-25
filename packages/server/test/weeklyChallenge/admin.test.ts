import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
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

describe.skipIf(!hasIntegrationEnv)('/admin/weekly-challenges/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminToken: string;
  let playerToken: string;

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
              weekly_challenges, weekly_challenge_tasks, weekly_challenge_participants,
              weekly_challenge_reward_claims
              restart identity cascade`,
    );
    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: 'weekly-admin-1',
      displayName: 'Weekly Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'weekly-regular-1',
      displayName: 'Regular Player',
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set role = 'admin' where id = $1`, [admin.id]);

    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: admin.id });
    playerToken = await jwt.issueAccessToken({ sub: player.id });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function payload(title: string) {
    return {
      title,
      description: 'Тестовый челлендж',
      joinOpenAt: '2026-06-01T06:00:00.000Z',
      startAt: '2026-06-03T06:00:00.000Z',
      endAt: '2026-06-10T06:00:00.000Z',
      rewardCoins: 100,
      rewardStars: 5,
      rewardExperience: 50,
      tasks: [{ type: 'goals_scored', title: '500 шайб', target: 500, sortOrder: 0 }],
    };
  }

  it('requires admin role for weekly challenge management', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/weekly-challenges',
      headers: auth(playerToken),
    });

    expect(res.statusCode).toBe(403);
  });

  it('creates challenges and keeps only one active challenge', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/admin/weekly-challenges',
      headers: auth(adminToken),
      payload: payload('Первая неделя'),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().challenge).toMatchObject({
      title: 'Первая неделя',
      isActive: false,
      joinEnabled: true,
      rewardCoins: 100,
      rewardStars: 5,
      rewardExperience: 50,
      tasks: [expect.objectContaining({ type: 'goals_scored', target: 500 })],
    });

    const second = await app.inject({
      method: 'POST',
      url: '/admin/weekly-challenges',
      headers: auth(adminToken),
      payload: payload('Вторая неделя'),
    });
    expect(second.statusCode).toBe(200);

    const firstId = first.json().challenge.id;
    const secondId = second.json().challenge.id;

    const activateFirst = await app.inject({
      method: 'POST',
      url: `/admin/weekly-challenges/${firstId}/activate`,
      headers: auth(adminToken),
    });
    expect(activateFirst.statusCode).toBe(200);
    expect(activateFirst.json().challenge.isActive).toBe(true);

    const activateSecond = await app.inject({
      method: 'POST',
      url: `/admin/weekly-challenges/${secondId}/activate`,
      headers: auth(adminToken),
    });
    expect(activateSecond.statusCode).toBe(200);
    expect(activateSecond.json().challenge.isActive).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/admin/weekly-challenges',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    const activeChallenges = list.json().challenges.filter((challenge: { isActive: boolean }) => challenge.isActive);
    expect(activeChallenges).toHaveLength(1);
    expect(activeChallenges[0]).toMatchObject({ id: secondId, title: 'Вторая неделя' });
  });
});
