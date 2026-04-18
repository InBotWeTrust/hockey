import { Pool } from 'pg';
import { Redis } from 'ioredis';

export function getTestUrls(): { databaseUrl: string; redisUrl: string } {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    throw new Error(
      'TEST_DATABASE_URL and TEST_REDIS_URL must be set (copy from .env.example)',
    );
  }
  return { databaseUrl, redisUrl };
}

export const hasIntegrationEnv =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_REDIS_URL;

export function createTestPool(): Pool {
  return new Pool({ connectionString: getTestUrls().databaseUrl });
}

export function createTestRedis(): Redis {
  return new Redis(getTestUrls().redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });
}

export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
}

export async function resetRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
