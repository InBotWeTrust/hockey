import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { applyMigrations } from '../src/db/migrations.js';
import { createPool } from '../src/db/pool.js';
import { getTestUrls, hasIntegrationEnv, resetDatabase } from './helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

describe.skipIf(!hasIntegrationEnv)('GET /health', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };

  beforeAll(async () => {
    const pool = createPool(databaseUrl);
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();
  });

  it('returns 200 when db and redis are up', async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        ok: boolean;
        gameCoreVersion: number;
        checks: { db: boolean; redis: boolean };
      };
      expect(body.ok).toBe(true);
      expect(body.checks).toEqual({ db: true, redis: true });
      expect(typeof body.gameCoreVersion).toBe('number');
    } finally {
      await app.close();
    }
  });

  it('returns 503 when redis is unreachable', async () => {
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: 'redis://127.0.0.1:1',
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      const body = res.json() as { checks: { redis: boolean } };
      expect(body.checks.redis).toBe(false);
    } finally {
      await app.close();
    }
  });
});
