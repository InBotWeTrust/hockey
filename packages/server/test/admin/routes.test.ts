import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
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
const ADMIN_TG_ID = '432014500';

describe.skipIf(!hasIntegrationEnv)('/admin/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminToken: string;
  let playerToken: string;
  let adminId: string;
  let playerId: string;

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
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
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

    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: ADMIN_TG_ID,
      displayName: 'Egor Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'player-1',
      displayName: 'Regular Player',
      timezone: 'Europe/Moscow',
    });
    adminId = admin.id;
    playerId = player.id;

    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: adminId });
    playerToken = await jwt.issueAccessToken({ sub: playerId });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  it('gates admin routes by global user role', async () => {
    const playerRes = await app.inject({
      method: 'GET',
      url: '/admin/summary',
      headers: auth(playerToken),
    });
    expect(playerRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: 'GET',
      url: '/admin/summary',
      headers: auth(adminToken),
    });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json()).toMatchObject({
      users: { total: 2, admins: 1 },
      gameCoreVersion: expect.any(Number),
    });
  });

  it('lists and updates users', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/admin/users?q=Regular',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      users: [
        {
          id: playerId,
          displayName: 'Regular Player',
          role: 'player',
          wallet: { pucks: 0 },
        },
      ],
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${playerId}`,
      headers: auth(adminToken),
      payload: {
        role: 'admin',
        wallet: { pucks: 250, goldPucks: 5 },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      user: {
        id: playerId,
        role: 'admin',
        wallet: { pucks: 250, goldPucks: 5 },
      },
    });

    const selfDemote = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${adminId}`,
      headers: auth(adminToken),
      payload: { role: 'player' },
    });
    expect(selfDemote.statusCode).toBe(409);
  });

  it('updates game settings', async () => {
    const update = await app.inject({
      method: 'PATCH',
      url: '/admin/game-settings/training.shots_limit',
      headers: auth(adminToken),
      payload: { value: 120 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      key: 'training.shots_limit',
      value: 120,
      updatedBy: adminId,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/admin/game-settings',
      headers: auth(adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'training.shots_limit', value: 120 }),
      ]),
    );
  });
});
