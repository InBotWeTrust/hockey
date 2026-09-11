import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
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
const BOT_TOKEN = '111:test-bot-token';

type RatingBody = {
  rows: Array<{
    place: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    experience: number;
  }>;
  nextCursor: string | null;
  currentUser: {
    place: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    experience: number;
  };
};

function signPayload(data: Record<string, string>): string {
  const secretKey = createHash('sha256').update(BOT_TOKEN).digest();
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe.skipIf(!hasIntegrationEnv)('GET /profile/experience-rating', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let viewerToken: string;
  let viewerId: string;

  async function login(id: string, firstName: string): Promise<{ accessToken: string; userId: string }> {
    const payload: Record<string, string> = {
      id,
      first_name: firstName,
      auth_date: String(Math.floor(Date.now() / 1000)),
    };
    payload.hash = signPayload(payload);
    const response = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { accessToken: string; user: { id: string } };
    return { accessToken: body.accessToken, userId: body.user.id };
  }

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

    const players = await Promise.all([
      login('1001', 'Alpha'),
      login('1002', 'Bravo'),
      login('1003', 'Charlie'),
      login('1004', 'Viewer'),
    ]);
    viewerToken = players[3]!.accessToken;
    viewerId = players[3]!.userId;
    await app.pg.query(
      `update users
          set experience = case id
            when $1::uuid then 900
            when $2::uuid then 700
            when $3::uuid then 700
            when $4::uuid then 100
          end,
              avatar_url = case when id = $2::uuid then null else avatar_url end
        where id = any($5::uuid[])`,
      [
        players[0]!.userId,
        players[1]!.userId,
        players[2]!.userId,
        players[3]!.userId,
        players.map((player) => player.userId),
      ],
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('orders players deterministically and returns the viewer rank outside the page', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/profile/experience-rating?limit=2',
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as RatingBody;
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((row) => row.experience)).toEqual([900, 700]);
    expect(body.rows.map((row) => row.place)).toEqual([1, 2]);
    expect(body.currentUser).toMatchObject({
      place: 4,
      userId: viewerId,
      displayName: 'Viewer',
      experience: 100,
    });
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('continues from an opaque cursor without repeating a player', async () => {
    const first = await app.inject({
      method: 'GET',
      url: '/profile/experience-rating?limit=2',
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    const firstBody = first.json() as RatingBody;
    const second = await app.inject({
      method: 'GET',
      url: `/profile/experience-rating?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor!)}`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as RatingBody;
    expect(secondBody.rows.map((row) => row.place)).toEqual([3, 4]);
    expect(secondBody.rows.map((row) => row.userId)).not.toContain(firstBody.rows[1]!.userId);
    expect(secondBody.nextCursor).toBeNull();
  });

  it('rejects invalid limits and malformed cursors', async () => {
    for (const url of [
      '/profile/experience-rating?limit=51',
      '/profile/experience-rating?cursor=not-a-cursor',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${viewerToken}` },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/profile/experience-rating' });
    expect(response.statusCode).toBe(401);
  });

  it('installs the ordered index used by experience pagination', async () => {
    const result = await app.pg.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname = 'users_experience_rating_idx'`,
    );
    expect(result.rows[0]?.indexdef).toMatch(/\(experience DESC, id\)/);
  });
});
