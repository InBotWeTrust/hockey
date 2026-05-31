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

describe.skipIf(!hasIntegrationEnv)('/weekly-challenge/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userId: string;
  let accessToken: string;

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
              user_currency_account, currency_ledger,
              training_session, day_pool, period_log, shot_session, event_log,
              weekly_challenges, weekly_challenge_tasks, weekly_challenge_participants,
              weekly_challenge_reward_claims
              restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'weekly-player-1',
      displayName: 'Weekly Player',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    accessToken = await jwt.issueAccessToken({ sub: userId });
  });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function createActiveChallenge(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into weekly_challenges
         (title, description, join_open_at, start_at, end_at, is_active, join_enabled,
          reward_coins, reward_stars, reward_experience)
       values (
         'Неделя снайпера',
         'Забрось одну тестовую шайбу.',
         now() - interval '1 day',
         now() - interval '1 hour',
         now() + interval '7 days',
         true,
         true,
         10,
         2,
         3
       )
       returning id`,
    );
    const challengeId = rows[0]!.id;
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values ($1, 'goals_scored', 'Забросить шайбу', 1, 0)`,
      [challengeId],
    );
    return challengeId;
  }

  async function insertGoal(): Promise<void> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, game_core_version, daily_seed)
       values ($1, current_date, 'closed', 1, 1, 'weekly-seed')
       returning id`,
      [userId],
    );
    await pool.query(
      `insert into shot_session
         (user_id, mode, day_pool_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values ($1, 'daily', $2, 1, 1, 'shot-seed', '{}'::jsonb, 'goal', 1)`,
      [userId, rows[0]!.id],
    );
  }

  it('returns null when there is no active challenge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ challenge: null });
  });

  it('lets a participant join, counts progress since challenge start, and claim rewards once', async () => {
    const challengeId = await createActiveChallenge();
    await insertGoal();

    const beforeJoin = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    expect(beforeJoin.statusCode).toBe(200);
    expect(beforeJoin.json().challenge).toMatchObject({
      id: challengeId,
      status: 'running',
      canJoin: true,
      canClaimReward: false,
      participant: null,
    });

    const join = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/join`,
      headers: authHeader(),
    });
    expect(join.statusCode).toBe(200);
    expect(join.json().challenge).toMatchObject({
      canJoin: false,
      canClaimReward: true,
      participant: { joinedAt: expect.any(String), rewardClaimedAt: null },
    });

    const ready = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().challenge).toMatchObject({
      allTasksCompleted: true,
      canClaimReward: true,
      tasks: [expect.objectContaining({ progress: 1, completed: true })],
    });

    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().challenge).toMatchObject({
      canClaimReward: false,
      participant: { rewardClaimedAt: expect.any(String) },
    });

    const balances = await pool.query<{
      balance: number;
      stars: number;
      experience: number;
      ledger_rows: string;
    }>(
      `select uca.balance,
              u.stars,
              u.experience,
              (select count(*) from currency_ledger where user_id = u.id)::text as ledger_rows
         from users u
         join user_currency_account uca on uca.user_id = u.id
        where u.id = $1`,
      [userId],
    );
    expect(balances.rows[0]).toMatchObject({
      balance: 10,
      stars: 2,
      experience: 3,
      ledger_rows: '1',
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(duplicate.statusCode).toBe(409);
  });
});
