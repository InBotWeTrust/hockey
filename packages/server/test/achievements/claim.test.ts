import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createJwt } from '../../src/auth/jwt.js';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

async function createUser(app: FastifyInstance): Promise<string> {
  const id = randomUUID();
  await app.pg.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Achievement Player', null, 1, 'UTC')`,
    [id],
  );
  return id;
}

async function issueAccessToken(userId: string): Promise<string> {
  const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
  return jwt.issueAccessToken({ sub: userId });
}

describe.skipIf(!hasIntegrationEnv)('achievement claim routes', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();

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
        TELEGRAM_BOT_TOKEN: '111:test-bot-token',
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('claims a completed achievement once and grants configured rewards', async () => {
    const userId = await createUser(app);
    const token = await issueAccessToken(userId);
    await app.pg.query(
      `update achievements
          set reward_currency = 12, reward_stars = 3, reward_experience = 40
        where id = 'first-goal'`,
    );
    await app.pg.query(
      `insert into user_achievements (user_id, achievement_id, completed_at)
       values ($1, 'first-goal', now())`,
      [userId],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/achievements/first-goal/claim',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      achievement: { id: 'first-goal', status: 'claimed' },
      balances: { currencyBalance: 12, starBalance: 3, experienceBalance: 40 },
      rewards: { currency: 12, stars: 3, experience: 40 },
    });

    const again = await app.inject({
      method: 'POST',
      url: '/achievements/first-goal/claim',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(again.statusCode).toBe(409);

    const userRows = await app.pg.query<{ xp: number; experience: number }>(
      `select xp, experience from users where id = $1`,
      [userId],
    );
    expect(userRows.rows[0]).toMatchObject({ xp: 3, experience: 40 });
  });

  it('waits for the users row before taking a currency-account write lock', async () => {
    const userId = await createUser(app);
    const token = await issueAccessToken(userId);
    await app.pg.query(
      `insert into user_achievements (user_id, achievement_id, completed_at)
       values ($1, 'first-goal', now())`,
      [userId],
    );

    const blocker = await app.pg.connect();
    try {
      await blocker.query('begin');
      const blockerBackend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from users where id = $1 for update', [userId]);

      const claimPromise = app.inject({
        method: 'POST',
        url: '/achievements/first-goal/claim',
        headers: { authorization: `Bearer ${token}` },
      });
      const blocked = await waitForBlockedWriter(
        app.pg,
        blockerBackend.rows[0]!.pid,
        /select id\s+from users/i,
      );

      await blocker.query('commit');
      const claim = await claimPromise;
      expect(claim.statusCode).toBe(200);
      expect(blocked.accountWriteLockHeld).toBe(false);
      expect(blocked.query).toMatch(/users/i);
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
    }
  });

  it('lists active and future achievements with status and unclaimed count', async () => {
    const userId = await createUser(app);
    const token = await issueAccessToken(userId);
    await app.pg.query(
      `insert into user_achievements (user_id, achievement_id, completed_at)
       values ($1, 'first-goal', now())`,
      [userId],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/achievements',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      unclaimedCount: number;
      achievements: Array<{
        id: string;
        availability: string;
        futureTag: string | null;
        status: string;
        isClaimable: boolean;
      }>;
    };
    expect(body.unclaimedCount).toBe(1);
    expect(body.achievements.find((achievement) => achievement.id === 'first-goal')).toMatchObject({
      status: 'completed_unclaimed',
      isClaimable: true,
    });
    expect(body.achievements.find((achievement) => achievement.id === 'pro-ticket')).toMatchObject({
      availability: 'future',
      futureTag: 'future/pro',
      status: 'locked',
    });
  });
});
