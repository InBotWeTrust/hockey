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

function signPayload(data: Record<string, string>, botToken: string): string {
  const secretKey = createHash('sha256').update(botToken).digest();
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe.skipIf(!hasIntegrationEnv)('GET /me', () => {
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
        JWT_SECRET: 'access-secret-at-least-16-chars',
        REFRESH_SECRET: 'refresh-secret-at-least-16-chars',
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without bearer', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns current user after login', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: Record<string, string> = {
      id: '42',
      first_name: 'Alice',
      auth_date: String(nowSec),
    };
    payload.hash = signPayload(payload, BOT_TOKEN);
    const login = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    const { accessToken } = login.json() as { accessToken: string };

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; displayName: string };
    expect(body.displayName).toBe('Alice');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
