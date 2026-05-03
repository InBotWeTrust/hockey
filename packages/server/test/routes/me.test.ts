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
    await app?.close();
  });

  async function loginTelegram(overrides: Partial<Record<string, string>> = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: Record<string, string> = {
      id: '42',
      first_name: 'Alice',
      auth_date: String(nowSec),
      ...overrides,
    };
    payload.hash = signPayload(payload, BOT_TOKEN);
    const login = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    return login.json() as { accessToken: string; user: { id: string; displayName: string } };
  }

  async function insertDailyShot(
    userId: string,
    dayOffset: number,
    shotIndex: number,
  ): Promise<void> {
    const pool = await app.pg.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, game_core_version, daily_seed, closed_at)
       values (
         $1,
         (now() at time zone 'UTC')::date - $2::int,
         'closed',
         0,
         1,
         $3,
         now()
       )
       returning id`,
      [userId, dayOffset, `daily-seed-${dayOffset}-${shotIndex}`],
    );
    await app.pg.query(
      `insert into shot_session
         (user_id, mode, day_pool_id, period_number, shot_index, seed, input_payload,
          server_result, game_core_version, created_at)
       values (
         $1,
         'daily',
         $2,
         1,
         $3,
         $4,
         '{}'::jsonb,
         'goal',
         1,
         (((now() at time zone 'UTC')::date - $5::int)::timestamp + interval '12 hours')
           at time zone 'UTC'
       )`,
      [userId, pool.rows[0]!.id, shotIndex, `shot-seed-${dayOffset}-${shotIndex}`, dayOffset],
    );
  }

  async function insertTrainingShot(
    userId: string,
    dayOffset: number,
    shotIndex: number,
  ): Promise<void> {
    const session = await app.pg.query<{ id: string }>(
      `insert into training_session
         (user_id, day_date, selected_period, state, game_core_version, training_seed, closed_at)
       values (
         $1,
         (now() at time zone 'UTC')::date - $2::int,
         1,
         'closed',
         1,
         $3,
         now()
       )
       returning id`,
      [userId, dayOffset, `training-seed-${dayOffset}-${shotIndex}`],
    );
    await app.pg.query(
      `insert into shot_session
         (user_id, mode, training_session_id, period_number, shot_index, seed, input_payload,
          server_result, game_core_version, created_at)
       values (
         $1,
         'training',
         $2,
         1,
         $3,
         $4,
         '{}'::jsonb,
         'save',
         1,
         (((now() at time zone 'UTC')::date - $5::int)::timestamp + interval '12 hours')
           at time zone 'UTC'
       )`,
      [
        userId,
        session.rows[0]!.id,
        shotIndex,
        `training-shot-seed-${dayOffset}-${shotIndex}`,
        dayOffset,
      ],
    );
  }

  it('returns 401 without bearer', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns current user after login', async () => {
    const { accessToken } = await loginTelegram({
      username: 'alice',
      photo_url: 'tg.png',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; displayName: string };
    expect(body.displayName).toBe('Alice');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.json()).toMatchObject({
      competitionLevel: 'beginner',
      stats: {
        shots: 0,
        goals: 0,
        accuracy: 0,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
      displaySource: 'telegram',
      linkedProviders: ['telegram'],
      tgFirstName: 'Alice',
      tgAvatarUrl: 'tg.png',
      tgUsername: 'alice',
    });
    const fullBody = res.json() as {
      achievements: Array<{ id: string; isUnlocked: boolean; photoUrl: string }>;
    };
    expect(fullBody.achievements.length).toBeGreaterThan(0);
    expect(fullBody.achievements.every((achievement) => !achievement.isUnlocked)).toBe(true);
    expect(fullBody.achievements[0]).toMatchObject({
      id: 'first-goal',
      photoUrl: '/achievements/first-goal.webp',
    });
  });

  it('unlocks stat achievements from lifetime totals', async () => {
    const { accessToken, user } = await loginTelegram({ id: '45' });
    await app.pg.query(
      `update users
          set lifetime_shots_total = 1200,
              lifetime_goals_total = 1000
        where id = $1`,
      [user.id],
    );

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      stats: {
        shots: 1200,
        goals: 1000,
        accuracy: 83,
        playStreakDays: 0,
        bestPlayStreakDays: 0,
      },
    });
    const body = res.json() as {
      achievements: Array<{ id: string; isUnlocked: boolean; unlockedAt?: string }>;
    };
    expect(
      body.achievements
        .filter((achievement) => achievement.isUnlocked)
        .map((achievement) => achievement.id),
    ).toEqual(['first-goal', 'amateur-ticket']);
    expect(
      body.achievements.find((achievement) => achievement.id === 'first-goal')?.unlockedAt,
    ).toEqual(expect.any(String));
  });

  it('counts consecutive play days from shots in any game mode', async () => {
    const { accessToken, user } = await loginTelegram({ id: '46' });

    await insertDailyShot(user.id, 0, 1);
    await insertTrainingShot(user.id, 1, 1);
    await insertDailyShot(user.id, 2, 2);
    await insertTrainingShot(user.id, 4, 3);
    await insertDailyShot(user.id, 4, 4);

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      stats: {
        playStreakDays: 3,
        bestPlayStreakDays: 3,
      },
    });
  });

  it('rejects displaySource=vk when VK is not linked', async () => {
    const { accessToken } = await loginTelegram({ id: '43' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displaySource: 'vk' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'bad_request', message: 'display_source_unavailable' },
    });
  });

  it('switches displaySource to linked VK provider', async () => {
    const { accessToken, user } = await loginTelegram({ id: '44' });
    await app.pg.query(
      `insert into auth_providers (id, user_id, provider, provider_uid)
       values (gen_random_uuid(), $1, 'vk', 'vk-44')`,
      [user.id],
    );
    await app.pg.query(
      `update users
          set vk_first_name = 'Vera',
              vk_last_name = 'Volkova',
              vk_avatar_url = 'vk.png'
        where id = $1`,
      [user.id],
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displaySource: 'vk' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      displayName: 'Vera Volkova',
      avatarUrl: 'vk.png',
      displaySource: 'vk',
      linkedProviders: ['telegram', 'vk'],
    });
  });
});
