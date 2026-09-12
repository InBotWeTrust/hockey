import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('coin package catalog', () => {
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
        TELEGRAM_BOT_TOKEN: '111:test-bot-token',
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the seven seeded packages in stable catalog order', async () => {
    const response = await app.inject({ method: 'GET', url: '/bank/packages' });

    expect(response.statusCode).toBe(200);
    expect(response.json().packages).toEqual([
      expect.objectContaining({ slug: 'starter', coinAmount: 7450, priceRub: 149 }),
      expect.objectContaining({ slug: 'player', coinAmount: 16000, priceRub: 299 }),
      expect.objectContaining({ slug: 'club', coinAmount: 40000, priceRub: 699 }),
      expect.objectContaining({ slug: 'season', coinAmount: 90000, priceRub: 1490 }),
      expect.objectContaining({ slug: 'professional', coinAmount: 190000, priceRub: 2990 }),
      expect.objectContaining({ slug: 'major-league', coinAmount: 325000, priceRub: 4990 }),
      expect.objectContaining({ slug: 'maximum', coinAmount: 700000, priceRub: 9990 }),
    ]);
  });

  it('omits inactive packages without changing the remaining order', async () => {
    await app.pg.query("update coin_packages set is_active = false where slug = 'club'");

    const response = await app.inject({ method: 'GET', url: '/bank/packages' });

    expect(response.statusCode).toBe(200);
    expect(
      response.json().packages.map((coinPackage: { slug: string }) => coinPackage.slug),
    ).toEqual(['starter', 'player', 'season', 'professional', 'major-league', 'maximum']);
  });
});
