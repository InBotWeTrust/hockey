import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_CORE_VERSION, STICK_NEUTRAL, deriveShotSeed, resolveShot } from '@hockey/game-core';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { buildBonusGoalieConfig, type BonusPeriodRule } from '../../src/bonusGames/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { deriveBonusAttemptSeed } from '../../src/duel/seed.js';
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

const JWT_SECRET = 'bonus-route-access-secret';
const REFRESH_SECRET = 'bonus-route-refresh-secret';
const BONUS_SEED_SECRET = 'bonus-route-seed-secret-at-least-16';

const PERIODS: BonusPeriodRule[] = [
  {
    periodNumber: 1,
    durationMs: 1_000,
    shotsLimit: 3,
    goalFrequency: 0.45,
    goalieFrequency: 0.5,
    shooterFrequency: 0.65,
    puckSpeedPerMs: 1.2,
    goaliePattern: 'linear',
    goalieAmplitude: 1,
    goalAmplitude: 220,
  },
];

const QUOTA_PERIOD: BonusPeriodRule = {
  ...PERIODS[0]!,
  durationMs: 10_000,
  goalFrequency: 0.1,
  goalAmplitude: 0,
};

interface TestGame {
  id: string;
  slug: string;
  arenaId: string;
}

interface PeriodRuleDto {
  period_number: number;
  duration_ms: number;
  shots_limit: number;
  goal_frequency: number;
  goalie_frequency: number;
  shooter_frequency: number;
  puck_speed_per_ms: number;
  goalie_pattern: 'linear' | 'sine' | 'dash';
  goalie_amplitude: number;
  goal_amplitude: number;
}

interface AttemptDto {
  id: string;
  game_id: string;
  game_slug: string;
  game_title: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  state: 'idle' | 'period_active' | 'break_active' | 'closed';
  current_period: number;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_started_at: string | null;
  break_ends_at: string | null;
  closed_at: string | null;
  shots_taken: number;
  current_period_shots_taken: number;
  goals: number;
  reward_granted: boolean;
  attempt_seed: string;
  game_core_version: number;
  definition_revision: number;
  server_now: string;
  rules: {
    game_id: string;
    slug: string;
    title: string;
    revision: number;
    target_goals: number;
    total_periods: number;
    break_duration_ms: number;
    periods: PeriodRuleDto[];
  };
  reward: { coins: number; stars: number; experience: number };
  arena: {
    id: string;
    slug: string;
    title: string;
    artwork_url: string;
    thumbnail_url: string;
  };
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
}

describe.skipIf(!hasIntegrationEnv)('/bonus-games player routes', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userId: string;
  let headers: { authorization: string };
  let defaultArenaId: string;
  let gameSequence: number;
  let userSequence: number;

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
        DAILY_SEED_SECRET: BONUS_SEED_SECRET,
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
    await pool.query('truncate users, arena_theme restart identity cascade');
    gameSequence = 0;
    userSequence = 0;
    const arena = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ('default', 'Стандартная', '/arenas/default.webp',
               '/arenas/default-thumb.webp', 'active', true)
       returning id`,
    );
    defaultArenaId = arena.rows[0]!.id;
    ({ userId, headers } = await createUser());
  });

  async function createUser(level = 2): Promise<{
    userId: string;
    headers: { authorization: string };
  }> {
    userSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `bonus-route-player-${userSequence}`,
      displayName: `Bonus Route Player ${userSequence}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query('update users set level = $2 where id = $1', [user.id, level]);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    return {
      userId: user.id,
      headers: { authorization: `Bearer ${await jwt.issueAccessToken({ sub: user.id })}` },
    };
  }

  async function createGame({
    sortOrder = gameSequence + 1,
    status = 'active',
    accessType = 'free',
    price = accessType === 'paid' ? 1 : 0,
    periods = PERIODS,
    targetGoals = periods.reduce((sum, period) => sum + period.shotsLimit, 0),
    breakDurationMs = 30_000,
  }: {
    sortOrder?: number;
    status?: 'draft' | 'active' | 'archived';
    accessType?: 'free' | 'paid';
    price?: number;
    periods?: BonusPeriodRule[];
    targetGoals?: number;
    breakDurationMs?: number;
  } = {}): Promise<TestGame> {
    gameSequence += 1;
    const slug = `bonus-route-game-${gameSequence}`;
    const arena = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ($1, $2, $3, $4, 'active', true)
       returning id`,
      [
        `${slug}-arena`,
        `Арена ${gameSequence}`,
        `/arenas/${slug}.webp`,
        `/arenas/${slug}-thumb.webp`,
      ],
    );
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11::jsonb,
               100, 2, 50, $12, $13, $14, 7)
       returning id`,
      [
        slug,
        `Игра ${gameSequence}`,
        `Описание ${gameSequence}`,
        sortOrder,
        status,
        accessType,
        price,
        targetGoals,
        periods.length,
        breakDurationMs,
        JSON.stringify(periods),
        arena.rows[0]!.id,
        `/goalies/${slug}-ready.webp`,
        `/goalies/${slug}-save.webp`,
      ],
    );
    return { id: game.rows[0]!.id, slug, arenaId: arena.rows[0]!.id };
  }

  async function startAttempt(gameId: string): Promise<AttemptDto> {
    const response = await app.inject({
      method: 'POST',
      url: `/bonus-games/${gameId}/attempts`,
      headers,
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { attempt: AttemptDto }).attempt;
  }

  async function startPeriod(attemptId: string): Promise<AttemptDto> {
    const response = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attemptId}/period/start`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { attempt: AttemptDto }).attempt;
  }

  async function shotMutationSnapshot(attemptId: string) {
    const { rows } = await pool.query<{
      status: string;
      state: string;
      shots_taken: number;
      goals: number;
      shots: number;
      period_logs: number;
      completions: number;
      economy_events: number;
    }>(
      `select attempt.status, attempt.state, attempt.shots_taken::int, attempt.goals::int,
              (select count(*)::int from shot_session
                where bonus_game_attempt_id = attempt.id) as shots,
              (select count(*)::int from bonus_game_period_log
                where attempt_id = attempt.id) as period_logs,
              (select count(*)::int from user_bonus_game_completion
                where attempt_id = attempt.id) as completions,
              (select count(*)::int from bonus_game_economy_event
                where attempt_id = attempt.id) as economy_events
         from bonus_game_attempt attempt
        where attempt.id = $1`,
      [attemptId],
    );
    return rows[0]!;
  }

  function expectedShot(
    attempt: AttemptDto,
    tapTime = 125,
    shooterTapTime = tapTime,
    shotIndex = 1,
  ): 'goal' | 'save' | 'miss' {
    const rule = attempt.rules.periods[attempt.current_period - 1]!;
    const shotInput = {
      tapTime,
      shooterTapTime,
      puckSpeedPerMs: rule.puck_speed_per_ms,
      shooterFrequency: rule.shooter_frequency,
      goalieFrequency: rule.goalie_frequency,
      goalFrequency: rule.goal_frequency,
    };
    const goalie = buildBonusGoalieConfig(attempt.game_slug, attempt.game_title, {
      periodNumber: rule.period_number,
      durationMs: rule.duration_ms,
      shotsLimit: rule.shots_limit,
      goalFrequency: rule.goal_frequency,
      goalieFrequency: rule.goalie_frequency,
      shooterFrequency: rule.shooter_frequency,
      puckSpeedPerMs: rule.puck_speed_per_ms,
      goaliePattern: rule.goalie_pattern,
      goalieAmplitude: rule.goalie_amplitude,
      goalAmplitude: rule.goal_amplitude,
    });
    return resolveShot(
      shotInput,
      goalie,
      deriveShotSeed(attempt.attempt_seed, attempt.current_period, shotIndex),
      shotIndex,
      STICK_NEUTRAL,
    ).type;
  }

  async function submitTimedRouteShot(
    attempt: AttemptDto,
    input: {
      shotIndex: number;
      tapTime: number;
      shooterTapTime: number;
      wallElapsedMs: number;
    },
  ) {
    await pool.query(
      `update bonus_game_attempt
          set period_started_at = clock_timestamp() - ($2::double precision * interval '1 millisecond')
        where id = $1`,
      [attempt.id, input.wallElapsedMs],
    );
    const payload = {
      claimed_shot_index: input.shotIndex,
      input: { tapTime: input.tapTime, shooterTapTime: input.shooterTapTime },
      claimed_result: expectedShot(attempt, input.tapTime, input.shooterTapTime, input.shotIndex),
    };
    const response = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload,
    });
    return { response, payload };
  }

  it('requires authentication on exactly all eight player endpoints', async () => {
    const id = randomUUID();
    const requests = [
      { method: 'GET', url: '/bonus-games' },
      { method: 'GET', url: '/bonus-games/attempts/current' },
      { method: 'POST', url: `/bonus-games/${id}/unlock` },
      { method: 'POST', url: `/bonus-games/${id}/attempts` },
      { method: 'GET', url: `/bonus-games/attempts/${id}` },
      { method: 'POST', url: `/bonus-games/attempts/${id}/period/start` },
      { method: 'POST', url: `/bonus-games/attempts/${id}/shot` },
      { method: 'POST', url: `/bonus-games/attempts/${id}/abandon` },
    ] as const;

    for (const request of requests) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
      expect(response.json().error.code).toBe('unauthenticated');
    }
  });

  it('exposes catalog, purchase, create/resume, state, shot, and abandon contracts', async () => {
    const game = await createGame();
    const catalog = await app.inject({ method: 'GET', url: '/bonus-games', headers });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({
      active_attempt: null,
      games: [
        {
          id: game.id,
          period_rules: [
            {
              period_number: 1,
              duration_ms: 1_000,
              shots_limit: 3,
              goalie_pattern: 'linear',
            },
          ],
          reward: { coins: 100, stars: 2, experience: 50 },
          arena: {
            id: game.arenaId,
            artwork_url: `/arenas/${game.slug}.webp`,
          },
          state: 'available',
          prerequisite: null,
        },
      ],
    });

    const unlock = await app.inject({
      method: 'POST',
      url: `/bonus-games/${game.id}/unlock`,
      headers,
    });
    expect(unlock.statusCode).toBe(200);
    expect(unlock.json()).toEqual({ unlocked: true, star_balance: 0 });

    const start = await app.inject({
      method: 'POST',
      url: `/bonus-games/${game.id}/attempts`,
      headers,
    });
    expect(start.statusCode).toBe(201);
    const attempt = (start.json() as { attempt: AttemptDto }).attempt;
    expect(attempt).toMatchObject({
      game_id: game.id,
      game_slug: game.slug,
      game_title: 'Игра 1',
      status: 'active',
      state: 'idle',
      current_period: 0,
      period_started_at: null,
      period_ends_at: null,
      break_started_at: null,
      break_ends_at: null,
      closed_at: null,
      shots_taken: 0,
      current_period_shots_taken: 0,
      goals: 0,
      reward_granted: false,
      game_core_version: GAME_CORE_VERSION,
      definition_revision: 7,
      rules: {
        game_id: game.id,
        slug: game.slug,
        title: 'Игра 1',
        revision: 7,
        target_goals: 3,
        total_periods: 1,
        break_duration_ms: 30_000,
        periods: [
          {
            period_number: 1,
            duration_ms: 1_000,
            shots_limit: 3,
            goal_frequency: 0.45,
            goalie_frequency: 0.5,
            shooter_frequency: 0.65,
            puck_speed_per_ms: 1.2,
            goalie_pattern: 'linear',
            goalie_amplitude: 1,
            goal_amplitude: 220,
          },
        ],
      },
      reward: { coins: 100, stars: 2, experience: 50 },
      arena: {
        id: game.arenaId,
        slug: `${game.slug}-arena`,
        title: 'Арена 1',
        artwork_url: `/arenas/${game.slug}.webp`,
        thumbnail_url: `/arenas/${game.slug}-thumb.webp`,
      },
      goalkeeper_ready_url: `/goalies/${game.slug}-ready.webp`,
      goalkeeper_save_url: `/goalies/${game.slug}-save.webp`,
    });
    expect(attempt.attempt_seed).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.attempt_seed).toBe(
      deriveBonusAttemptSeed(attempt.id, userId, game.id, BONUS_SEED_SECRET),
    );
    expect(attempt.server_now).toEqual(expect.any(String));

    const resume = await app.inject({
      method: 'POST',
      url: `/bonus-games/${game.id}/attempts`,
      headers,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().attempt.id).toBe(attempt.id);
    expect(resume.json().attempt.attempt_seed).toBe(attempt.attempt_seed);

    const current = await app.inject({
      method: 'GET',
      url: '/bonus-games/attempts/current',
      headers,
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().attempt.id).toBe(attempt.id);

    const detail = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().attempt).toMatchObject({
      id: attempt.id,
      attempt_seed: attempt.attempt_seed,
      current_period_shots_taken: 0,
      reward_granted: false,
    });

    const active = await startPeriod(attempt.id);
    expect(active).toMatchObject({ state: 'period_active', current_period: 1 });
    expect(active.period_started_at).toEqual(expect.any(String));
    expect(active.period_ends_at).toEqual(expect.any(String));
    expect(
      new Date(active.period_ends_at!).getTime() - new Date(active.period_started_at!).getTime(),
    ).toBe(1_000);

    const serverResult = expectedShot(active);
    const shot = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 125, shooterTapTime: 125 },
        claimed_result: serverResult,
      },
    });
    expect(shot.statusCode).toBe(200);
    expect(shot.json()).toMatchObject({
      server_result: serverResult,
      reward_granted: false,
      balances: { coins: 0, stars: 0, experience: 0 },
      attempt: {
        id: attempt.id,
        shots_taken: 1,
        current_period_shots_taken: 1,
        reward_granted: false,
      },
    });

    const currentAfterShot = await app.inject({
      method: 'GET',
      url: '/bonus-games/attempts/current',
      headers,
    });
    const detailAfterShot = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });
    expect(currentAfterShot.json().attempt).toMatchObject({
      current_period_shots_taken: 1,
      reward_granted: false,
    });
    expect(detailAfterShot.json().attempt).toMatchObject({
      current_period_shots_taken: 1,
      reward_granted: false,
    });

    const abandon = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/abandon`,
      headers,
    });
    expect(abandon.statusCode).toBe(200);
    expect(abandon.json().attempt).toMatchObject({ status: 'abandoned', state: 'closed' });
  });

  it('reports current-period shots separately from prior-period totals', async () => {
    const secondPeriod: BonusPeriodRule = { ...PERIODS[0]!, periodNumber: 2 };
    const game = await createGame({
      periods: [PERIODS[0]!, secondPeriod],
      targetGoals: 6,
    });
    const attempt = await startAttempt(game.id);
    await pool.query(
      `insert into shot_session
         (user_id, mode, bonus_game_attempt_id, period_number, shot_index,
          seed, input_payload, server_result, game_core_version, created_at)
       values
         ($1, 'bonus', $2, 1, 1, 'period-1-shot-1', '{}'::jsonb, 'save', $3, now()),
         ($1, 'bonus', $2, 1, 2, 'period-1-shot-2', '{}'::jsonb, 'miss', $3, now()),
         ($1, 'bonus', $2, 2, 1, 'period-2-shot-1', '{}'::jsonb, 'save', $3, now())`,
      [userId, attempt.id, GAME_CORE_VERSION],
    );
    await pool.query(
      `update bonus_game_attempt
          set state = 'period_active', current_period = 2,
              period_started_at = now(), shots_taken = 3
        where id = $1`,
      [attempt.id],
    );

    const detail = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().attempt).toMatchObject({
      current_period: 2,
      shots_taken: 3,
      current_period_shots_taken: 1,
    });
  });

  it('keeps first-clear reward truth durable across duplicate shot, detail, and replay', async () => {
    const goalPeriod: BonusPeriodRule = {
      ...PERIODS[0]!,
      durationMs: 10_000,
      goalFrequency: 0.1,
      goalAmplitude: 0,
    };
    const game = await createGame({ periods: [goalPeriod], targetGoals: 1 });
    const firstAttempt = await startAttempt(game.id);
    const firstActive = await startPeriod(firstAttempt.id);
    const tapTime = 385;
    expect(expectedShot(firstActive, tapTime)).toBe('goal');
    await pool.query(
      `update bonus_game_attempt
          set period_started_at = clock_timestamp() - interval '385 milliseconds'
        where id = $1`,
      [firstAttempt.id],
    );
    const shotRequest = {
      method: 'POST' as const,
      url: `/bonus-games/attempts/${firstAttempt.id}/shot`,
      headers,
      payload: {
        claimed_shot_index: 1,
        input: { tapTime, shooterTapTime: tapTime },
        claimed_result: 'goal',
      },
    };

    const firstClear = await app.inject(shotRequest);
    expect(firstClear.statusCode).toBe(200);
    expect(firstClear.json()).toMatchObject({
      reward_granted: true,
      attempt: {
        status: 'completed',
        current_period_shots_taken: 1,
        reward_granted: true,
      },
    });

    const duplicate = await app.inject(shotRequest);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      reward_granted: true,
      attempt: { status: 'completed', reward_granted: true },
    });

    const firstDetail = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${firstAttempt.id}`,
      headers,
    });
    expect(firstDetail.statusCode).toBe(200);
    expect(firstDetail.json().attempt).toMatchObject({
      status: 'completed',
      reward_granted: true,
    });

    const replayAttempt = await startAttempt(game.id);
    const replayActive = await startPeriod(replayAttempt.id);
    expect(expectedShot(replayActive, tapTime)).toBe('goal');
    await pool.query(
      `update bonus_game_attempt
          set period_started_at = clock_timestamp() - interval '385 milliseconds'
        where id = $1`,
      [replayAttempt.id],
    );
    const replay = await app.inject({
      ...shotRequest,
      url: `/bonus-games/attempts/${replayAttempt.id}/shot`,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      reward_granted: false,
      attempt: { status: 'completed', reward_granted: false },
    });

    const replayDetail = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${replayAttempt.id}`,
      headers,
    });
    expect(replayDetail.statusCode).toBe(200);
    expect(replayDetail.json().attempt).toMatchObject({
      status: 'completed',
      reward_granted: false,
    });
  });

  it('returns break state on the accepted nonfinal quota shot and keeps its duplicate idempotent', async () => {
    const secondPeriod: BonusPeriodRule = { ...QUOTA_PERIOD, periodNumber: 2 };
    const game = await createGame({
      periods: [QUOTA_PERIOD, secondPeriod],
      targetGoals: 6,
    });
    const attempt = await startAttempt(game.id);
    const active = await startPeriod(attempt.id);
    await submitTimedRouteShot(active, {
      shotIndex: 1,
      tapTime: 100,
      shooterTapTime: 100,
      wallElapsedMs: 100,
    });
    await submitTimedRouteShot(active, {
      shotIndex: 2,
      tapTime: 500,
      shooterTapTime: 66.666_666_666_666_69,
      wallElapsedMs: 1_500,
    });
    const final = await submitTimedRouteShot(active, {
      shotIndex: 3,
      tapTime: 1_242,
      shooterTapTime: 375.333_333_333_333_37,
      wallElapsedMs: 3_242,
    });

    expect(final.response.statusCode).toBe(200);
    expect(final.response.json()).toMatchObject({
      reward_granted: false,
      attempt: {
        status: 'active',
        state: 'break_active',
        current_period: 1,
        period_started_at: null,
        break_started_at: expect.any(String),
        shots_taken: 3,
        current_period_shots_taken: 3,
      },
    });
    const beforeDuplicate = await shotMutationSnapshot(attempt.id);
    expect(beforeDuplicate).toMatchObject({ period_logs: 1, economy_events: 0 });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload: final.payload,
    });

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().attempt).toMatchObject({
      status: 'active',
      state: 'break_active',
      current_period_shots_taken: 3,
    });
    expect(await shotMutationSnapshot(attempt.id)).toEqual(beforeDuplicate);
  });

  it('returns failed state on the accepted final quota shot and keeps its duplicate idempotent', async () => {
    const game = await createGame({ periods: [QUOTA_PERIOD], targetGoals: 6 });
    const attempt = await startAttempt(game.id);
    const active = await startPeriod(attempt.id);
    await submitTimedRouteShot(active, {
      shotIndex: 1,
      tapTime: 100,
      shooterTapTime: 100,
      wallElapsedMs: 100,
    });
    await submitTimedRouteShot(active, {
      shotIndex: 2,
      tapTime: 500,
      shooterTapTime: 66.666_666_666_666_69,
      wallElapsedMs: 1_500,
    });
    const final = await submitTimedRouteShot(active, {
      shotIndex: 3,
      tapTime: 1_242,
      shooterTapTime: 375.333_333_333_333_37,
      wallElapsedMs: 3_242,
    });

    expect(final.response.statusCode).toBe(200);
    expect(final.response.json()).toMatchObject({
      reward_granted: false,
      attempt: {
        status: 'failed',
        state: 'closed',
        current_period: 1,
        period_started_at: null,
        break_started_at: null,
        closed_at: expect.any(String),
        shots_taken: 3,
        current_period_shots_taken: 3,
      },
    });
    const beforeDuplicate = await shotMutationSnapshot(attempt.id);
    expect(beforeDuplicate).toMatchObject({ period_logs: 1, economy_events: 0 });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload: final.payload,
    });

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().attempt).toMatchObject({
      status: 'failed',
      state: 'closed',
      current_period_shots_taken: 3,
    });
    expect(await shotMutationSnapshot(attempt.id)).toEqual(beforeDuplicate);
  });

  it('returns completed rather than failed when target is reached on the quota-edge shot', async () => {
    const game = await createGame({ periods: [QUOTA_PERIOD], targetGoals: 1 });
    const attempt = await startAttempt(game.id);
    const active = await startPeriod(attempt.id);
    const first = await submitTimedRouteShot(active, {
      shotIndex: 1,
      tapTime: 100,
      shooterTapTime: 100,
      wallElapsedMs: 100,
    });
    const second = await submitTimedRouteShot(active, {
      shotIndex: 2,
      tapTime: 500,
      shooterTapTime: 66.666_666_666_666_69,
      wallElapsedMs: 1_500,
    });
    expect(first.response.json().server_result).not.toBe('goal');
    expect(second.response.json().server_result).not.toBe('goal');
    const final = await submitTimedRouteShot(active, {
      shotIndex: 3,
      tapTime: 1_242,
      shooterTapTime: 375.333_333_333_333_37,
      wallElapsedMs: 3_242,
    });

    expect(final.response.statusCode).toBe(200);
    expect(final.response.json()).toMatchObject({
      server_result: 'goal',
      reward_granted: true,
      attempt: {
        status: 'completed',
        state: 'closed',
        shots_taken: 3,
        current_period_shots_taken: 3,
        goals: 1,
        reward_granted: true,
      },
    });
    const period = await pool.query<{ closed_reason: string }>(
      'select closed_reason from bonus_game_period_log where attempt_id = $1',
      [attempt.id],
    );
    expect(period.rows).toEqual([{ closed_reason: 'target_reached' }]);
    const beforeDuplicate = await shotMutationSnapshot(attempt.id);
    expect(beforeDuplicate).toMatchObject({ period_logs: 1, economy_events: 1 });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload: final.payload,
    });

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      reward_granted: true,
      attempt: { status: 'completed', state: 'closed', reward_granted: true },
    });
    expect(await shotMutationSnapshot(attempt.id)).toEqual(beforeDuplicate);
  });

  it('uses UUID and strict Zod request schemas', async () => {
    const invalidGame = await app.inject({
      method: 'POST',
      url: '/bonus-games/not-a-uuid/attempts',
      headers,
    });
    expect(invalidGame.statusCode).toBe(400);
    expect(invalidGame.json()).toEqual({
      error: { code: 'bad_request', message: 'invalid bonus game request' },
    });

    const game = await createGame();
    const attempt = await startAttempt(game.id);
    await startPeriod(attempt.id);
    const invalidShot = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers,
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 0, shooterTapTime: 0, unexpected: true },
        claimed_result: 'save',
      },
    });
    expect(invalidShot.statusCode).toBe(400);
    expect(invalidShot.json()).toEqual({
      error: { code: 'bad_request', message: 'invalid bonus game request' },
    });
  });

  it.each([
    {
      name: 'JSON overflow tapTime',
      payload:
        '{"claimed_shot_index":1,"input":{"tapTime":1e309,"shooterTapTime":0},"claimed_result":"goal"}',
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'JSON overflow shooterTapTime',
      payload:
        '{"claimed_shot_index":1,"input":{"tapTime":0,"shooterTapTime":1e309},"claimed_result":"goal"}',
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'negative tapTime',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: -1, shooterTapTime: 0 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'negative shooterTapTime',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 0, shooterTapTime: -1 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'omitted shooterTapTime',
      payload: { claimed_shot_index: 1, input: { tapTime: 0 }, claimed_result: 'goal' },
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'stale tapTime',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 0, shooterTapTime: 0 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_stale',
      expectedStatus: 409,
      periodAgeSeconds: 20,
    },
    {
      name: 'future tapTime',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 100_000, shooterTapTime: 100_000 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_stale',
      expectedStatus: 409,
    },
    {
      name: 'independently forged shooterTapTime',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 200, shooterTapTime: 0 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_invalid',
      expectedStatus: 400,
    },
    {
      name: 'jointly forged first-shot clocks',
      payload: {
        claimed_shot_index: 1,
        input: { tapTime: 730, shooterTapTime: 730 },
        claimed_result: 'goal',
      },
      expectedCode: 'bonus_shot_time_stale',
      expectedStatus: 409,
      periodAgeSeconds: 10,
    },
  ])('rejects $name without shot, aggregate, or reward writes', async (testCase) => {
    const longPeriod = { ...PERIODS[0]!, durationMs: 300_000 };
    const game = await createGame({ periods: [longPeriod], targetGoals: 1 });
    const attempt = await startAttempt(game.id);
    await startPeriod(attempt.id);
    if (testCase.periodAgeSeconds !== undefined) {
      await pool.query(
        `update bonus_game_attempt
            set period_started_at = now() - ($2::int * interval '1 second')
          where id = $1`,
        [attempt.id, testCase.periodAgeSeconds],
      );
    }
    const before = await shotMutationSnapshot(attempt.id);

    const response = await app.inject({
      method: 'POST',
      url: `/bonus-games/attempts/${attempt.id}/shot`,
      headers: {
        ...headers,
        ...(typeof testCase.payload === 'string' ? { 'content-type': 'application/json' } : {}),
      },
      payload: testCase.payload,
    });

    expect(response.statusCode).toBe(testCase.expectedStatus);
    expect(response.json()).toEqual({
      error: {
        code: testCase.expectedCode,
        message:
          testCase.expectedCode === 'bonus_shot_time_stale'
            ? 'bonus shot timing is stale'
            : 'bonus shot timing is invalid',
      },
    });
    expect(await shotMutationSnapshot(attempt.id)).toEqual(before);
  });

  it('lazily reconciles GET current and persists the terminal state before returning null', async () => {
    const game = await createGame();
    const attempt = await startAttempt(game.id);
    await startPeriod(attempt.id);
    await pool.query(
      `update bonus_game_attempt
          set period_started_at = now() - interval '10 seconds'
        where id = $1`,
      [attempt.id],
    );

    const current = await app.inject({
      method: 'GET',
      url: '/bonus-games/attempts/current',
      headers,
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({ attempt: null });

    const persisted = await pool.query<{ status: string; state: string }>(
      'select status, state from bonus_game_attempt where id = $1',
      [attempt.id],
    );
    expect(persisted.rows[0]).toEqual({ status: 'failed', state: 'closed' });

    const detail = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().attempt).toMatchObject({ status: 'failed', state: 'closed' });
  });

  it('lazily reconciles GET attempt through intermission and exposes authoritative timers', async () => {
    const secondPeriod: BonusPeriodRule = { ...PERIODS[0]!, periodNumber: 2 };
    const game = await createGame({
      periods: [PERIODS[0]!, secondPeriod],
      targetGoals: 6,
      breakDurationMs: 30_000,
    });
    const attempt = await startAttempt(game.id);
    await startPeriod(attempt.id);
    await pool.query(
      `update bonus_game_attempt
          set period_started_at = now() - interval '2 seconds'
        where id = $1`,
      [attempt.id],
    );

    const intermission = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });
    expect(intermission.statusCode).toBe(200);
    expect(intermission.json().attempt).toMatchObject({
      status: 'active',
      state: 'break_active',
      current_period: 1,
      period_started_at: null,
      period_ends_at: null,
      break_started_at: expect.any(String),
      break_ends_at: expect.any(String),
    });

    await pool.query(
      `update bonus_game_attempt
          set break_started_at = now() - interval '60 seconds'
        where id = $1`,
      [attempt.id],
    );
    const ready = await app.inject({
      method: 'GET',
      url: `/bonus-games/attempts/${attempt.id}`,
      headers,
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().attempt).toMatchObject({
      status: 'active',
      state: 'idle',
      current_period: 1,
      break_started_at: null,
      break_ends_at: null,
    });
  });

  it('returns a safe active-attempt conflict payload without leaking service exception text', async () => {
    const first = await createGame({ sortOrder: 1 });
    const second = await createGame({ sortOrder: 2 });
    const active = await startAttempt(first.id);

    const response = await app.inject({
      method: 'POST',
      url: `/bonus-games/${second.id}/attempts`,
      headers,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'bonus_attempt_already_active',
        message: 'another bonus attempt is already active',
      },
      active_attempt: { id: active.id, game_id: first.id },
    });
    expect(response.json().error.message).not.toContain(active.id);
  });

  it.each([
    ['bonus_level_locked', 403],
    ['bonus_previous_game_required', 409],
    ['bonus_purchase_required', 409],
    ['bonus_insufficient_stars', 409],
    ['bonus_game_inactive', 409],
    ['bonus_attempt_not_active', 409],
    ['bonus_period_not_ready', 409],
    ['bonus_shot_index_mismatch', 409],
    ['bonus_shot_result_mismatch', 409],
    ['bonus_game_core_version_mismatch', 409],
  ] as const)('exposes stable %s errors with safe messages', async (code, statusCode) => {
    let response;
    if (code === 'bonus_level_locked') {
      const beginner = await createUser(1);
      const game = await createGame();
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/${game.id}/attempts`,
        headers: beginner.headers,
      });
    } else if (code === 'bonus_previous_game_required') {
      await createGame({ sortOrder: 1 });
      const game = await createGame({ sortOrder: 2 });
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/${game.id}/attempts`,
        headers,
      });
    } else if (code === 'bonus_purchase_required') {
      const game = await createGame({ accessType: 'paid', price: 1 });
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/${game.id}/attempts`,
        headers,
      });
    } else if (code === 'bonus_insufficient_stars') {
      const game = await createGame({ accessType: 'paid', price: 1 });
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/${game.id}/unlock`,
        headers,
      });
    } else if (code === 'bonus_game_inactive') {
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/${randomUUID()}/attempts`,
        headers,
      });
    } else if (code === 'bonus_attempt_not_active') {
      response = await app.inject({
        method: 'POST',
        url: `/bonus-games/attempts/${randomUUID()}/abandon`,
        headers,
      });
    } else {
      const game = await createGame();
      const attempt = await startAttempt(game.id);
      if (code === 'bonus_period_not_ready') {
        response = await app.inject({
          method: 'POST',
          url: `/bonus-games/attempts/${attempt.id}/shot`,
          headers,
          payload: {
            claimed_shot_index: 1,
            input: { tapTime: 125, shooterTapTime: 125 },
            claimed_result: 'save',
          },
        });
      } else {
        const active = await startPeriod(attempt.id);
        if (code === 'bonus_game_core_version_mismatch') {
          await pool.query('update bonus_game_attempt set game_core_version = $2 where id = $1', [
            attempt.id,
            GAME_CORE_VERSION + 1,
          ]);
        }
        const actual = expectedShot(active);
        response = await app.inject({
          method: 'POST',
          url: `/bonus-games/attempts/${attempt.id}/shot`,
          headers,
          payload: {
            claimed_shot_index: code === 'bonus_shot_index_mismatch' ? 2 : 1,
            input: { tapTime: 125, shooterTapTime: 125 },
            claimed_result:
              code === 'bonus_shot_result_mismatch'
                ? actual === 'goal'
                  ? 'save'
                  : 'goal'
                : actual,
          },
        });
      }
    }

    expect(response.statusCode).toBe(statusCode);
    expect(response.json().error.code).toBe(code);
    expect(response.json().error.message).toEqual(expect.any(String));
    expect(response.json().error.message).not.toMatch(
      /active bonus attempt:|Error:|select |bonus_game_/i,
    );
  });
});
