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
import { waitForDailyCompletionSideEffects } from '../../src/duel/daily/completionSideEffects.js';
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
const TRAINING_SHOTS_LIMIT = 500;

describe.skipIf(!hasIntegrationEnv)('/duel/training/*', () => {
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
    await waitForDailyCompletionSideEffects();
    await app.close();
  });

  beforeEach(async () => {
    await waitForDailyCompletionSideEffects();
    await pool.query(
      `truncate users, auth_providers, user_wallet, user_equipment, user_sticks,
              training_session, day_pool, period_log, shot_session, event_log
              restart identity cascade`,
    );
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'training-test-1',
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
      url: '/duel/training/state',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function startTraining(periodNumber = 2) {
    return app.inject({
      method: 'POST',
      url: '/duel/training/start',
      headers: authHeader(),
      payload: { period_number: periodNumber },
    });
  }

  async function trainingTapTime() {
    const { rows } = await pool.query<{ started_at: Date }>(
      `select started_at
         from training_session
        where user_id = $1
        order by started_at desc
        limit 1`,
      [userId],
    );
    const startedAt = rows[0]?.started_at;
    return startedAt ? Math.max(0, Date.now() - startedAt.getTime()) : 0;
  }

  async function submitShot(
    shotIndex: number,
    claimedResult = 'goal',
    inputOverrides: Record<string, number> = {},
  ) {
    const tapTime = await trainingTapTime();
    return app.inject({
      method: 'POST',
      url: '/duel/training/shot',
      headers: authHeader(),
      payload: {
        shot_index: shotIndex,
        input: { tapTime, ...inputOverrides },
        claimed_result: claimedResult,
      },
    });
  }

  async function startDailyPeriod() {
    return app.inject({
      method: 'POST',
      url: '/duel/daily/period/start',
      headers: authHeader(),
    });
  }

  async function createPlayoffDayBlock(input: {
    firstGameStartsAt: Date;
    attemptStartsAt?: Date;
    attemptStatus?: 'pending' | 'ready_check' | 'active' | 'settled';
  }): Promise<{ attemptId: string }> {
    const opponent = await findOrCreateTelegramUser(pool, {
      providerUid: `training-opponent-${Date.now()}-${Math.random()}`,
      displayName: 'Opponent',
      timezone: 'Europe/Moscow',
    });
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Training lock cup', 'playoff', 'head_to_head', $2)
       returning id`,
      [`training-lock-${Date.now()}-${Math.random()}`, userId],
    );
    const home = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournament.rows[0]!.id, userId],
    );
    const away = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournament.rows[0]!.id, opponent.id],
    );
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status)
       values ($1, 'playoff', 1, 'open') returning id`,
      [tournament.rows[0]!.id],
    );
    const localDate = input.firstGameStartsAt.toLocaleDateString('en-CA', {
      timeZone: 'Europe/Moscow',
    });
    const gameDay = await pool.query<{ id: string }>(
      `insert into tournament_round_game_day
         (round_id, day_number, local_date, first_game_local_time, first_game_starts_at,
          max_result_bearing_games, readiness_duration, planned_start_interval, status)
       values ($1, 1, $2::date, '13:00', $3, 7, interval '10 minutes',
               interval '15 minutes', 'open') returning id`,
      [round.rows[0]!.id, localDate, input.firstGameStartsAt],
    );
    const fixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, round_id, fixture_number, home_participant_id,
          away_participant_id, scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 1, $3, $4, $5, $6, 'open') returning id`,
      [
        tournament.rows[0]!.id,
        round.rows[0]!.id,
        home.rows[0]!.id,
        away.rows[0]!.id,
        input.attemptStartsAt ?? input.firstGameStartsAt,
        new Date((input.attemptStartsAt ?? input.firstGameStartsAt).getTime() + 60 * 60_000),
      ],
    );
    const attemptStartsAt = input.attemptStartsAt ?? input.firstGameStartsAt;
    const attempt = await pool.query<{ id: string }>(
      `insert into tournament_fixture_attempt
         (fixture_id, round_game_day_id, attempt_number, kind, status,
          scheduled_starts_at, readiness_expires_at, hard_deadline_at, is_result_bearing)
       values ($1, $2, 1, 'initial', $3, $4, $5, $6, true) returning id`,
      [
        fixture.rows[0]!.id,
        gameDay.rows[0]!.id,
        input.attemptStatus ?? 'pending',
        attemptStartsAt,
        new Date(attemptStartsAt.getTime() + 10 * 60_000),
        new Date(attemptStartsAt.getTime() + 60 * 60_000),
      ],
    );
    return { attemptId: attempt.rows[0]!.id };
  }

  async function createClassicTournamentDay(startsAt: Date): Promise<void> {
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Classic training lock', 'regular', 'classic', $2)
       returning id`,
      [`classic-training-lock-${Date.now()}-${Math.random()}`, userId],
    );
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved')`,
      [tournament.rows[0]!.id, userId],
    );
    await pool.query(
      `insert into tournament_matchday
         (tournament_id, number, local_date, starts_at, ends_at, status)
       values ($1, 1, ($2::timestamptz at time zone 'Europe/Moscow')::date,
               $2, $3, 'open')`,
      [tournament.rows[0]!.id, startsAt, new Date(startsAt.getTime() + 24 * 60 * 60_000)],
    );
  }

  it('initial state is idle', async () => {
    const state = await getState();
    expect(state.state).toBe('idle');
    expect(state.shots_limit).toBe(TRAINING_SHOTS_LIMIT);
    expect(state.selected_period).toBeNull();
  });

  it('starts one training session for the local day', async () => {
    const res = await startTraining(3);
    expect(res.statusCode).toBe(200);
    const state = res.json();
    expect(state.state).toBe('active');
    expect(state.selected_period).toBe(3);
    expect(state.training_seed).toMatch(/^[0-9a-f]{64}$/);
    expect(state.started_at).toEqual(expect.any(String));
    expect(state.server_now).toEqual(expect.any(String));

    const second = await startTraining(1);
    expect(second.statusCode).toBe(200);
    const switched = second.json();
    expect(switched.selected_period).toBe(1);
    expect(switched.training_seed).toBe(state.training_seed);
    expect(switched.started_at).toBe(state.started_at);
  });

  it('handles concurrent training starts for a fresh local day', async () => {
    const responses = await Promise.all([
      startTraining(1),
      startTraining(1),
      startTraining(1),
      startTraining(1),
      startTraining(1),
    ]);

    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json().state).toBe('active');
    }

    const { rows } = await pool.query<{ sessions: string }>(
      `select count(*)::int as sessions
         from training_session
        where user_id = $1`,
      [userId],
    );
    expect(Number(rows[0]!.sessions)).toBe(1);
  });

  it('rejects stale training tapTime after the session has moved on', async () => {
    const training = await startTraining(2);
    expect(training.statusCode).toBe(200);
    await pool.query(
      `update training_session
          set started_at = now() - interval '1 minute'
        where user_id = $1`,
      [userId],
    );

    const shot = await app.inject({
      method: 'POST',
      url: '/duel/training/shot',
      headers: authHeader(),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(409);
  });

  it('rejects training start while a daily period is active', async () => {
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);

    const training = await startTraining(1);
    expect(training.statusCode).toBe(409);
  });

  it('rejects training start between daily periods before the third period is complete', async () => {
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);
    await pool.query(
      `update day_pool
          set state = 'idle',
              current_period = 1,
              period_started_at = null,
              break_started_at = null
        where user_id = $1`,
      [userId],
    );

    const training = await startTraining(1);
    expect(training.statusCode).toBe(409);
  });

  it('rejects training shots once the daily game starts', async () => {
    const training = await startTraining(2);
    expect(training.statusCode).toBe(200);
    const daily = await startDailyPeriod();
    expect(daily.statusCode).toBe(200);

    const shot = await submitShot(1);
    expect(shot.statusCode).toBe(409);
  });

  it('allows training 31 minutes before the first tournament game of the day', async () => {
    await createPlayoffDayBlock({ firstGameStartsAt: new Date(Date.now() + 31 * 60_000) });

    const training = await startTraining(1);

    expect(training.statusCode).toBe(200);
  });

  it('rejects training from 30 minutes before the tournament day block starts', async () => {
    await createPlayoffDayBlock({ firstGameStartsAt: new Date(Date.now() + 29 * 60_000) });

    const training = await startTraining(1);

    expect(training.statusCode).toBe(409);
  });

  it('keeps training locked between games in the same tournament day block', async () => {
    await createPlayoffDayBlock({
      firstGameStartsAt: new Date(Date.now() - 20 * 60_000),
      attemptStartsAt: new Date(Date.now() + 10 * 60_000),
      attemptStatus: 'pending',
    });

    const training = await startTraining(1);

    expect(training.statusCode).toBe(409);
  });

  it('allows training after the last game in the tournament day block is settled', async () => {
    const block = await createPlayoffDayBlock({
      firstGameStartsAt: new Date(Date.now() - 20 * 60_000),
      attemptStatus: 'settled',
    });
    await pool.query(
      `update tournament_fixture_attempt set settled_at = now() where id = $1`,
      [block.attemptId],
    );

    const training = await startTraining(1);

    expect(training.statusCode).toBe(200);
  });

  it('rejects training during a classic tournament game day', async () => {
    await createClassicTournamentDay(new Date(Date.now() + 20 * 60_000));

    const training = await startTraining(1);

    expect(training.statusCode).toBe(409);
  });

  it('rejects a shot from an open training during a tournament day block', async () => {
    const training = await startTraining(2);
    expect(training.statusCode).toBe(200);
    await createPlayoffDayBlock({ firstGameStartsAt: new Date(Date.now() + 20 * 60_000) });

    const shot = await submitShot(1);

    expect(shot.statusCode).toBe(409);
  });

  it('records shots without incrementing lifetime daily totals', async () => {
    await startTraining(2);
    const r = await submitShot(1);
    expect(r.statusCode).toBe(200);
    const { rows } = await pool.query(
      `select mode, period_number, shot_index, input_payload, training_session_id, day_pool_id
         from shot_session where user_id = $1`,
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].mode).toBe('training');
    expect(rows[0].period_number).toBe(2);
    expect(rows[0].shot_index).toBe(1);
    expect(rows[0].training_session_id).not.toBeNull();
    expect(rows[0].day_pool_id).toBeNull();
    const periodSpeeds = getDailyPeriodSpeedPreset(2);
    expect(rows[0].input_payload).toEqual({
      tapTime: expect.any(Number),
      puckSpeedPerMs: periodSpeeds.puckSpeedPerMs,
      shooterFrequency: periodSpeeds.shooterFrequency,
      goalieFrequency: periodSpeeds.goalieFrequency,
      goalFrequency: periodSpeeds.goalFrequency,
    });

    const userRows = await pool.query(
      'select lifetime_shots_total, lifetime_goals_total from users where id = $1',
      [userId],
    );
    expect(userRows.rows[0].lifetime_shots_total).toBe(0);
    expect(userRows.rows[0].lifetime_goals_total).toBe(0);
  });

  it('returns current daily period speed settings in training state', async () => {
    const configuredSpeeds = {
      puckSpeedPerMs: 1.91,
      shooterFrequency: 1.11,
      goalieFrequency: 1.21,
      goalFrequency: 0.81,
    };
    const entries = [
      ['daily.period_2.puck_speed_per_ms', configuredSpeeds.puckSpeedPerMs],
      ['daily.period_2.shooter_frequency', configuredSpeeds.shooterFrequency],
      ['daily.period_2.goalie_frequency', configuredSpeeds.goalieFrequency],
      ['daily.period_2.goal_frequency', configuredSpeeds.goalFrequency],
    ] as const;
    for (const [key, value] of entries) {
      await pool.query(
        `insert into game_settings (key, value, label, description)
         values ($1, to_jsonb($2::numeric), 'test', 'test')
         on conflict (key) do update set value = excluded.value`,
        [key, value],
      );
    }

    const state = await getState();
    expect(state.period_speed_presets).toEqual(
      expect.arrayContaining([{ periodNumber: 2, ...configuredSpeeds }]),
    );
  });

  it('uses current daily period settings instead of client speed overrides', async () => {
    const configuredSpeeds = {
      puckSpeedPerMs: 1.92,
      shooterFrequency: 1.12,
      goalieFrequency: 1.22,
      goalFrequency: 0.82,
    };
    const entries = [
      ['daily.period_2.puck_speed_per_ms', configuredSpeeds.puckSpeedPerMs],
      ['daily.period_2.shooter_frequency', configuredSpeeds.shooterFrequency],
      ['daily.period_2.goalie_frequency', configuredSpeeds.goalieFrequency],
      ['daily.period_2.goal_frequency', configuredSpeeds.goalFrequency],
    ] as const;
    for (const [key, value] of entries) {
      await pool.query(
        `insert into game_settings (key, value, label, description)
         values ($1, to_jsonb($2::numeric), 'test', 'test')
         on conflict (key) do update set value = excluded.value`,
        [key, value],
      );
    }

    await startTraining(2);
    const r = await submitShot(1, 'goal', {
      puckSpeedPerMs: 1.85,
      shooterFrequency: 1.15,
      goalieFrequency: 1.25,
      goalFrequency: 0.95,
    });
    expect(r.statusCode).toBe(200);

    const { rows } = await pool.query<{ input_payload: Record<string, number> }>(
      `select input_payload from shot_session where user_id = $1`,
      [userId],
    );
    expect(rows[0]?.input_payload).toMatchObject(configuredSpeeds);
  });

  it('closes after the 500th shot', async () => {
    await startTraining(1);
    for (let i = 1; i <= TRAINING_SHOTS_LIMIT; i += 1) {
      const r = await submitShot(i);
      expect(r.statusCode).toBe(200);
    }
    const state = await getState();
    expect(state.state).toBe('closed');
    expect(state.shots_taken).toBe(TRAINING_SHOTS_LIMIT);

    const extra = await submitShot(TRAINING_SHOTS_LIMIT + 1);
    expect(extra.statusCode).toBe(409);
  });
});
