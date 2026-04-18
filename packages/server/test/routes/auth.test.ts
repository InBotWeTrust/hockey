import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  createTestRedis,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
  getTestUrls,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const BOT_TOKEN = '111:test-bot-token';
const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

function freshTgPayload(overrides: Partial<Record<string, string>> = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const base: Record<string, string> = {
    id: '100500',
    first_name: 'Egor',
    auth_date: String(nowSec),
    ...overrides,
  };
  base.hash = signPayload(base, BOT_TOKEN);
  return base;
}

describe.skipIf(!hasIntegrationEnv)('POST /auth/telegram', () => {
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
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues tokens on valid payload and creates user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: freshTgPayload(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; displayName: string };
    };
    expect(body.user.displayName).toBe('Egor');
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken.split('.')).toHaveLength(3);
  });

  it('returns 401 on invalid hash', async () => {
    const payload = freshTgPayload();
    payload.first_name = 'Mallory';
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('returns 400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  describe('POST /auth/refresh', () => {
    async function login() {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: freshTgPayload(),
      });
      return res.json() as { accessToken: string; refreshToken: string };
    }

    it('rotates refresh and issues a new pair', async () => {
      const first = await login();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: first.refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { accessToken: string; refreshToken: string };
      expect(body.refreshToken).not.toBe(first.refreshToken);

      const reuse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: first.refreshToken },
      });
      expect(reuse.statusCode).toBe(401);
    });

    it('rejects tampered refresh as 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: 'not.a.valid.jwt' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
