import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getDailyPeriodSpeedPreset } from '@hockey/game-core';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createJwt } from '../../src/auth/jwt.js';
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

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

interface ShotInputBody {
  tapTime: number;
}

const SAMPLE_INPUT: ShotInputBody = { tapTime: 1500 };

describe.skipIf(!hasIntegrationEnv)('/duel/daily/*', () => {
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
              training_session, day_pool, period_log, shot_session, event_log
              restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'duel-test-1',
      displayName: 'Tester',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    accessToken = await jwt.issueAccessToken({ sub: userId });
  });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function getState() {
    const res = await app.inject({
      method: 'GET',
      url: '/duel/daily/state',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function startPeriod() {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/daily/period/start',
      headers: authHeader(),
    });
    return res;
  }

  async function submitShot(shotIndex: number, claimedResult = 'goal') {
    return app.inject({
      method: 'POST',
      url: '/duel/daily/shot',
      headers: authHeader(),
      payload: {
        shot_index: shotIndex,
        input: { tapTime: 1000 + shotIndex * 50 },
        claimed_result: claimedResult,
      },
    });
  }

  async function startTraining(periodNumber = 1) {
    return app.inject({
      method: 'POST',
      url: '/duel/training/start',
      headers: authHeader(),
      payload: { period_number: periodNumber },
    });
  }

  async function submitTrainingShot(shotIndex: number, claimedResult = 'goal') {
    return app.inject({
      method: 'POST',
      url: '/duel/training/shot',
      headers: authHeader(),
      payload: {
        shot_index: shotIndex,
        input: { tapTime: 1000 + shotIndex * 50 },
        claimed_result: claimedResult,
      },
    });
  }

  it('initial state is idle with no day_pool', async () => {
    const s = await getState();
    expect(s.state).toBe('idle');
    expect(s.current_period).toBe(0);
    expect(s.shots_per_period).toBe(30);
    expect(s.total_periods).toBe(3);
    expect(s.previous_game).toBeNull();
    expect(s.training_cooldown_ends_at).toBeNull();

    const { rows } = await pool.query('select count(*)::int as n from day_pool');
    expect(rows[0].n).toBe(0);
  });

  it('locks daily start for 2 hours after a training shot', async () => {
    const training = await startTraining(1);
    expect(training.statusCode).toBe(200);
    const shot = await submitTrainingShot(1);
    expect(shot.statusCode).toBe(200);

    const lockedState = await getState();
    expect(lockedState.training_cooldown_ends_at).not.toBeNull();

    const lockedStart = await startPeriod();
    expect(lockedStart.statusCode).toBe(409);

    await pool.query(
      `update shot_session
          set created_at = now() - interval '121 minutes'
        where user_id = $1 and mode = 'training'`,
      [userId],
    );
    const unlockedState = await getState();
    expect(unlockedState.training_cooldown_ends_at).toBeNull();

    const start = await startPeriod();
    expect(start.statusCode).toBe(200);
    expect(start.json().state).toBe('period_active');
  });

  it('start first period creates a day_pool with daily_seed and period_active', async () => {
    const res = await startPeriod();
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.state).toBe('period_active');
    expect(s.current_period).toBe(1);
    expect(s.period_ends_at).not.toBeNull();
    expect(s.current_period_shots).toBe(0);

    const { rows } = await pool.query(
      'select * from day_pool where user_id=$1',
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('period_active');
    expect(rows[0].current_period).toBe(1);
    expect(rows[0].daily_seed).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].game_core_version).toBeGreaterThan(0);
  });

  it('rejects starting period when state is period_active', async () => {
    const first = await startPeriod();
    expect(first.statusCode).toBe(200);
    expect(first.json().state).toBe('period_active');
    const res = await startPeriod();
    expect(res.statusCode).toBe(409);
  });

  it('shot index must equal expected (server count + 1)', async () => {
    await startPeriod();
    const wrong = await submitShot(2);
    expect(wrong.statusCode).toBe(409);

    const ok = await submitShot(1);
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(['goal', 'save', 'miss']).toContain(body.server_result);
    expect(body.state.current_period_shots).toBe(1);
  });

  it('30th shot transitions to break_active and writes period_log with closed_reason=quota', async () => {
    await startPeriod();
    let last;
    for (let i = 1; i <= 30; i += 1) {
      const r = await submitShot(i);
      expect(r.statusCode).toBe(200);
      last = r.json();
    }
    expect(last.state.state).toBe('break_active');
    expect(last.state.current_period).toBe(1);
    expect(last.state.break_ends_at).not.toBeNull();

    const { rows } = await pool.query(
      `select shots_taken, goals, closed_reason
         from period_log where day_pool_id = (select id from day_pool where user_id=$1)`,
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].shots_taken).toBe(30);
    expect(rows[0].closed_reason).toBe('quota');
  });

  it('rejects 31st shot (state is break_active after quota)', async () => {
    await startPeriod();
    for (let i = 1; i <= 30; i += 1) {
      await submitShot(i);
    }
    const r = await submitShot(31);
    expect(r.statusCode).toBe(409);
  });

  it('break_active times out after 15m → state idle, can start period 2', async () => {
    await startPeriod();
    for (let i = 1; i <= 30; i += 1) await submitShot(i);

    // Backdate break_started_at by 16 minutes to simulate timer expiry.
    await pool.query(
      `update day_pool set break_started_at = now() - interval '16 minutes' where user_id=$1`,
      [userId],
    );
    const s = await getState();
    expect(s.state).toBe('idle');
    expect(s.current_period).toBe(1);

    const start2 = await startPeriod();
    expect(start2.statusCode).toBe(200);
    expect(start2.json().current_period).toBe(2);
  });

  it('period timeout (20m) closes period with closed_reason=timeout and partial shots', async () => {
    await startPeriod();
    await submitShot(1);
    await submitShot(2);
    await pool.query(
      `update day_pool set period_started_at = now() - interval '21 minutes' where user_id=$1`,
      [userId],
    );
    const s = await getState();
    expect(s.state).toBe('break_active');
    expect(s.recent_periods[0].duration_ms).toBe(20 * 60 * 1000);

    const { rows } = await pool.query(
      `select shots_taken, closed_reason from period_log
        where day_pool_id = (select id from day_pool where user_id=$1)`,
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].shots_taken).toBe(2);
    expect(rows[0].closed_reason).toBe('timeout');
  });

  it('day boundary: pool dated yesterday gets closed and state returns idle/period=0', async () => {
    await startPeriod();
    await submitShot(1);
    // Force pool's day_date to yesterday in user's timezone.
    await pool.query(
      `update day_pool set day_date = (now() at time zone 'Europe/Moscow')::date - 1
         where user_id=$1`,
      [userId],
    );
    const s = await getState();
    expect(s.state).toBe('idle');
    expect(s.current_period).toBe(0);
    expect(s.previous_game).not.toBeNull();
    expect(s.previous_game.day_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.previous_game.total_shots).toBe(1);
    expect(s.previous_game.periods).toHaveLength(1);
    expect(s.previous_game.periods[0].period_number).toBe(1);
    expect(s.previous_game.periods[0].closed_reason).toBe('day_end');
    expect(s.previous_game.periods[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(s.previous_game.total_duration_ms).toBe(s.previous_game.periods[0].duration_ms);

    const { rows } = await pool.query(
      `select state, closed_reason
         from day_pool dp
         left join period_log pl on pl.day_pool_id = dp.id
        where dp.user_id=$1
        order by dp.created_at desc`,
      [userId],
    );
    expect(rows[0].state).toBe('closed');
    expect(rows[0].closed_reason).toBe('day_end');
  });

  it('runs 3 periods with 2 breaks, then stays closed until the next local day', async () => {
    for (let p = 1; p <= 3; p += 1) {
      const start = await startPeriod();
      expect(start.statusCode).toBe(200);
      expect(start.json().current_period).toBe(p);
      for (let i = 1; i <= 30; i += 1) {
        const r = await submitShot(i);
        expect(r.statusCode).toBe(200);
        if (i === 30) {
          expect(r.json().state.state).toBe(p === 3 ? 'closed' : 'break_active');
          expect(r.json().state.current_period).toBe(p);
        }
      }

      if (p < 3) {
        const breakState = await getState();
        expect(breakState.state).toBe('break_active');
        expect(breakState.break_ends_at).not.toBeNull();
        await pool.query(
          `update day_pool set break_started_at = now() - interval '16 minutes' where user_id=$1`,
          [userId],
        );
        const idleState = await getState();
        expect(idleState.state).toBe('idle');
        expect(idleState.current_period).toBe(p);
      }
    }

    const s = await getState();
    expect(s.state).toBe('closed');
    expect(s.current_period).toBe(3);
    expect(s.daily_total_shots).toBe(90);
    expect(s.recent_periods).toHaveLength(3);
    expect(s.recent_periods.map((p: { period_number: number }) => p.period_number)).toEqual([
      1, 2, 3,
    ]);
    expect(s.previous_game).not.toBeNull();
    expect(s.previous_game.total_shots).toBe(90);
    expect(s.previous_game.total_goals).toBe(s.daily_total_goals);
    expect(s.previous_game.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(s.previous_game.periods.map((p: { period_number: number }) => p.period_number)).toEqual([
      1, 2, 3,
    ]);
    expect(
      s.previous_game.periods.every((p: { duration_ms: number }) => p.duration_ms >= 0),
    ).toBe(true);

    const start4 = await startPeriod();
    expect(start4.statusCode).toBe(409);

    await pool.query(
      `update day_pool set day_date = (now() at time zone 'Europe/Moscow')::date - 1
         where user_id=$1`,
      [userId],
    );
    const nextDay = await getState();
    expect(nextDay.state).toBe('idle');
    expect(nextDay.current_period).toBe(0);
    expect(nextDay.previous_game).not.toBeNull();
    expect(nextDay.previous_game.total_shots).toBe(90);
    expect(nextDay.previous_game.total_goals).toBe(s.daily_total_goals);
    expect(nextDay.previous_game.total_duration_ms).toBe(s.previous_game.total_duration_ms);

    const newDayStart = await startPeriod();
    expect(newDayStart.statusCode).toBe(200);
    expect(newDayStart.json().current_period).toBe(1);
  });

  it('claimed_result mismatch with server_result writes shot_mismatch event', async () => {
    await startPeriod();
    // Force a claimed_result that almost certainly differs (claim 'goal' for shot #1)
    // This may or may not match the server result; we test that IF it differs,
    // event_log captures it. So we run two attempts to maximize variation.
    const r = await submitShot(1, 'goal');
    expect(r.statusCode).toBe(200);
    const serverResult = r.json().server_result;
    if (serverResult !== 'goal') {
      const { rows } = await pool.query(
        `select payload from event_log
          where user_id=$1 and type='shot_mismatch'
          order by created_at desc`,
        [userId],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].payload.claimed).toBe('goal');
      expect(rows[0].payload.server).toBe(serverResult);
    } else {
      // If it happened to match, no mismatch row is written.
      const { rows } = await pool.query(
        `select count(*)::int as n from event_log where user_id=$1 and type='shot_mismatch'`,
        [userId],
      );
      expect(rows[0].n).toBe(0);
    }
  });

  it('shot is rejected without bearer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/daily/shot',
      payload: { shot_index: 1, input: SAMPLE_INPUT, claimed_result: 'goal' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('lifetime totals accumulate to users when periods close', async () => {
    let s = await getState();
    expect(s.lifetime_total_shots).toBe(0);
    expect(s.lifetime_total_goals).toBe(0);

    await startPeriod();
    for (let i = 1; i <= 30; i += 1) {
      const r = await submitShot(i);
      expect(r.statusCode).toBe(200);
    }

    s = await getState();
    expect(s.lifetime_total_shots).toBe(30);
    // Goals depend on RNG but daily_total_goals must equal lifetime_total_goals
    // because we only have one closed period.
    expect(s.lifetime_total_goals).toBe(s.daily_total_goals);

    const { rows } = await pool.query(
      'select lifetime_shots_total, lifetime_goals_total from users where id=$1',
      [userId],
    );
    expect(rows[0].lifetime_shots_total).toBe(30);
    expect(rows[0].lifetime_goals_total).toBe(s.daily_total_goals);
  });

  it('records shot_session row with correct shape', async () => {
    await startPeriod();
    const r = await submitShot(1);
    expect(r.statusCode).toBe(200);
    const { rows } = await pool.query(
      `select mode, period_number, shot_index, server_result, game_core_version,
              input_payload, day_pool_id, story_task_id
         from shot_session where user_id=$1`,
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].mode).toBe('daily');
    expect(rows[0].period_number).toBe(1);
    expect(rows[0].shot_index).toBe(1);
    expect(['goal', 'save', 'miss']).toContain(rows[0].server_result);
    expect(rows[0].day_pool_id).not.toBeNull();
    expect(rows[0].story_task_id).toBeNull();
    const periodSpeeds = getDailyPeriodSpeedPreset(1);
    expect(rows[0].input_payload).toEqual({
      tapTime: 1050,
      puckSpeedPerMs: periodSpeeds.puckSpeedPerMs,
      shooterFrequency: periodSpeeds.shooterFrequency,
      goalieFrequency: periodSpeeds.goalieFrequency,
      goalFrequency: periodSpeeds.goalFrequency,
    });
  });
});
