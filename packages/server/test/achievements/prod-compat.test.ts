import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const REPAIR_MIGRATION = '073_backfill_first_daily_game.sql';

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

describe.skipIf(!hasIntegrationEnv)('production achievement compatibility', () => {
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
    await initPool.query(
      `alter table user_achievements rename column unlocked_at to completed_at;
       alter table user_achievements
         add column claimed_at timestamptz,
         add column completion_context jsonb not null default '{}'::jsonb;
       delete from user_achievements where achievement_id = 'first-game';
       delete from achievements where id = 'first-game';
       insert into achievements (id, photo_url, title, description, requirement, sort_order)
       values (
         'first-daily-game',
         '/achievements/first-daily-game.webp',
         'С почином',
         'Первый полный игровой день позади.',
         'Завершить первую ежедневную игру.',
         30
       )
       on conflict (id) do nothing;`,
    );
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
              training_session, day_pool, period_log, shot_session, event_log
              restart identity cascade`,
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values
         ('daily.shots_per_period', to_jsonb(1::int), 'Test shots', 'Test shots'),
         ('daily.break_duration_minutes', to_jsonb(0::int), 'Test break', 'Test break')
       on conflict (key) do update set value = excluded.value`,
    );

    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'prod-achievement-user',
      displayName: 'Production Achievement User',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    accessToken = await jwt.issueAccessToken({ sub: userId });
  });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function startPeriod() {
    return app.inject({
      method: 'POST',
      url: '/duel/daily/period/start',
      headers: authHeader(),
    });
  }

  async function submitOnlyShot() {
    return app.inject({
      method: 'POST',
      url: '/duel/daily/shot',
      headers: authHeader(),
      payload: {
        shot_index: 1,
        input: { tapTime: 1050 },
        claimed_result: 'goal',
      },
    });
  }

  it('completes first-daily-game when a new player finishes the third daily period', async () => {
    for (let period = 1; period <= 3; period += 1) {
      const start = await startPeriod();
      expect(start.statusCode).toBe(200);
      expect(start.json().current_period).toBe(period);

      const shot = await submitOnlyShot();
      expect(shot.statusCode).toBe(200);
      expect(shot.json().state.state).toBe(period === 3 ? 'closed' : 'break_active');

      if (period < 3) {
        const reconciled = await app.inject({
          method: 'GET',
          url: '/duel/daily/state',
          headers: authHeader(),
        });
        expect(reconciled.statusCode).toBe(200);
        expect(reconciled.json().state).toBe('idle');
      }
    }

    const completed = await pool.query<{ completed_at: Date }>(
      `select completed_at
         from user_achievements
        where user_id = $1 and achievement_id = 'first-daily-game'`,
      [userId],
    );
    expect(completed.rows).toHaveLength(1);
    expect(completed.rows[0]!.completed_at).toBeInstanceOf(Date);
  });

  it('completes first-daily-game when reconciliation times out the third period', async () => {
    await pool.query(
      `insert into day_pool
         (user_id, day_date, state, current_period, period_started_at, game_core_version, daily_seed)
       values (
         $1,
         (now() at time zone 'Europe/Moscow')::date,
         'period_active',
         3,
         now() - interval '21 minutes',
         46,
         'timeout-third-period-seed'
       )`,
      [userId],
    );

    const reconciled = await app.inject({
      method: 'GET',
      url: '/duel/daily/state',
      headers: authHeader(),
    });
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().state).toBe('closed');

    const completed = await pool.query(
      `select 1
         from user_achievements
        where user_id = $1 and achievement_id = 'first-daily-game'`,
      [userId],
    );
    expect(completed.rows).toHaveLength(1);
  });

  it('backfills only players who already finished all three daily periods', async () => {
    const partialUser = await findOrCreateTelegramUser(pool, {
      providerUid: 'prod-achievement-partial-user',
      displayName: 'Partial Daily User',
      timezone: 'Europe/Moscow',
    });
    const interruptedThirdPeriodUser = await findOrCreateTelegramUser(pool, {
      providerUid: 'prod-achievement-interrupted-user',
      displayName: 'Interrupted Daily User',
      timezone: 'Europe/Moscow',
    });
    const completedAt = new Date('2026-08-28T12:34:56.000Z');
    const completedPool = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
       values ($1, '2026-08-28', 'closed', 3, $2, 46, 'completed-daily-seed')
       returning id`,
      [userId, completedAt],
    );
    const interruptedPool = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, closed_at, game_core_version, daily_seed)
       values
         ($1, '2026-08-28', 'closed', 2, $3, 46, 'partial-daily-seed'),
         ($2, '2026-08-28', 'closed', 3, $3, 46, 'interrupted-daily-seed')
       returning id`,
      [partialUser.id, interruptedThirdPeriodUser.id, completedAt],
    );
    await pool.query(
      `insert into period_log
         (day_pool_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
       values
         ($1, 1, $3::timestamptz - interval '1 hour', $3::timestamptz - interval '50 minutes', 1, 1, 'quota'),
         ($1, 2, $3::timestamptz - interval '40 minutes', $3::timestamptz - interval '30 minutes', 1, 1, 'quota'),
         ($1, 3, $3::timestamptz - interval '20 minutes', $3::timestamptz, 1, 1, 'quota'),
         ($2, 1, $3::timestamptz - interval '1 hour', $3::timestamptz - interval '50 minutes', 1, 1, 'quota'),
         ($2, 2, $3::timestamptz - interval '40 minutes', $3::timestamptz - interval '30 minutes', 1, 1, 'quota'),
         ($2, 3, $3::timestamptz - interval '20 minutes', $3::timestamptz, 1, 0, 'day_end')`,
      [completedPool.rows[0]!.id, interruptedPool.rows[1]!.id, completedAt],
    );
    await pool.query('delete from _migrations where name = $1', [REPAIR_MIGRATION]);

    const firstRun = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(firstRun.applied).toContain(REPAIR_MIGRATION);

    const rows = await pool.query<{
      user_id: string;
      completed_at: Date;
      claimed_at: Date | null;
      completion_context: Record<string, unknown>;
    }>(
      `select user_id, completed_at, claimed_at, completion_context
         from user_achievements
        where achievement_id = 'first-daily-game'
        order by user_id`,
    );
    expect(rows.rows).toEqual([
      {
        user_id: userId,
        completed_at: completedAt,
        claimed_at: null,
        completion_context: { source: 'prod_compat_backfill' },
      },
    ]);

    const secondRun = await applyMigrations(pool, MIGRATIONS_DIR);
    expect(secondRun.applied).toEqual([]);
    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from user_achievements
        where achievement_id = 'first-daily-game'`,
    );
    expect(count.rows[0]!.count).toBe(1);
  });
});
