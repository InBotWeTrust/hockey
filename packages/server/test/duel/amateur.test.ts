import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
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

const SPEEDS = [
  {
    periodNumber: 1,
    goalFrequency: 0.55,
    goalieFrequency: 0.65,
    shooterFrequency: 0.8,
    puckSpeedPerMs: 1.3,
  },
];

describe.skipIf(!hasIntegrationEnv)('/duel/amateur/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userA: string;
  let userB: string;
  let tokenA: string;
  let tokenB: string;

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
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, user_wallet, user_equipment, user_sticks,
              user_currency_account, user_inventory_item,
              amateur_duel_template, amateur_duel_match, amateur_duel_participant,
              amateur_duel_period_log, amateur_duel_rating, currency_ledger,
              training_session, day_pool, period_log, shot_session, event_log,
              chats, chat_members, messages, message_reactions, push_delivery_log
              restart identity cascade`,
    );
    const a = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-a',
      displayName: 'Player A',
      timezone: 'Europe/Moscow',
    });
    const b = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-b',
      displayName: 'Player B',
      timezone: 'Europe/Moscow',
    });
    userA = a.id;
    userB = b.id;
    await pool.query(`update users set level = 2 where id = any($1::uuid[])`, [[userA, userB]]);
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100), ($2, 100)
       on conflict (user_id) do update set balance = excluded.balance, reserved_balance = 0`,
      [userA, userB],
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createTemplate(
    opts: { startsAt?: string; endsAt?: string; stake?: number; fee?: number } = {},
  ) {
    const startsAt = opts.startsAt ?? '2026-01-01T00:00:00.000Z';
    const endsAt = opts.endsAt ?? '2100-01-01T00:00:00.000Z';
    const { rows } = await pool.query<{ id: string }>(
      `insert into amateur_duel_template
         (title, description, starts_at, ends_at, total_periods, shots_per_period,
          period_duration_ms, break_duration_ms, goalie_id, period_speed_presets,
          stake_amount, entry_fee_amount)
       values ('Test duel', '', $1, $2, 1, 1, 1200000, 0, 'rookie', $3, $4, $5)
       returning id`,
      [startsAt, endsAt, JSON.stringify(SPEEDS), opts.stake ?? 0, opts.fee ?? 0],
    );
    return rows[0]!.id;
  }

  async function challenge(templateId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: auth(tokenA),
      payload: { template_id: templateId, opponent_user_id: userB },
    });
    return res;
  }

  it('creates a pending challenge and rejects duplicate open matches', async () => {
    const templateId = await createTemplate();
    const first = await challenge(templateId);
    expect(first.statusCode).toBe(200);
    expect(first.json().match.status).toBe('pending');

    const duplicate = await challenge(templateId);
    expect(duplicate.statusCode).toBe(409);
  });

  it('accepts before window start and reserves stake plus fee for both players', async () => {
    const templateId = await createTemplate({
      startsAt: '2099-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      stake: 10,
      fee: 2,
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.status).toBe('scheduled');

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 88, reserved_balance: 10 },
      { balance: 88, reserved_balance: 10 },
    ]);
  });

  it('declines a pending challenge without reserving stake', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const declined = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/decline`,
      headers: auth(tokenB),
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().match.status).toBe('expired');
    expect(declined.json().match.settled_reason).toBe('declined');

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);
  });

  it('settles no-show as a win for the player who completed the duel', async () => {
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);

    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
    });
    expect(started.statusCode).toBe(200);

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);

    await pool.query(
      `update amateur_duel_match set ends_at = now() - interval '1 second' where id = $1`,
      [matchId],
    );
    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/settle`,
      headers: auth(tokenA),
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.winner_user_id).toBe(userA);
    expect(settled.json().match.outcome).toBe('challenger_win');
  });
});
