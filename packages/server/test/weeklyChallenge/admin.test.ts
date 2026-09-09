import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

describe.skipIf(!hasIntegrationEnv)('/admin/weekly-challenges/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminToken: string;
  let playerToken: string;
  let playerId: string;
  let adminId: string;

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
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-09T09:00:00Z'));
    await pool.query(`update weekly_challenge_settings set enabled = true`);
    await pool.query(
      `truncate users, auth_providers, user_equipment, user_sticks,
              weekly_challenges, weekly_challenge_tasks, weekly_challenge_participants,
              weekly_challenge_reward_claims
              restart identity cascade`,
    );
    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: 'weekly-admin-1',
      displayName: 'Weekly Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'weekly-regular-1',
      displayName: 'Regular Player',
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set role = 'admin' where id = $1`, [admin.id]);
    playerId = player.id;
    adminId = admin.id;

    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminToken = await jwt.issueAccessToken({ sub: admin.id });
    playerToken = await jwt.issueAccessToken({ sub: player.id });
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  function payload(title: string) {
    return {
      title,
      description: 'Тестовый челлендж',
      rewardCoins: 100,
      rewardStars: 5,
      rewardExperience: 50,
      tasks: [{ type: 'goals_scored', title: '500 шайб', target: 500, sortOrder: 0 }],
    };
  }

  it('requires admin role for weekly challenge management', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/weekly-challenges',
      headers: auth(playerToken),
    });

    expect(res.statusCode).toBe(403);
    for (const route of ['settings', 'next']) {
      const write = await app.inject({
        method: 'PATCH',
        url: `/admin/weekly-challenges/${route}`,
        headers: auth(playerToken),
        payload: route === 'settings' ? { enabled: false } : payload('Forbidden'),
      });
      expect(write.statusCode).toBe(403);
    }
  });

  async function seed(
    startAt = '2026-09-06T21:00:00Z',
    endAt = '2026-09-13T09:00:00Z',
    active = true,
  ) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into weekly_challenges (title, join_open_at, start_at, end_at, is_active, is_automatic)
       values ('Следующая неделя', $1, $1, $2, $3, true) returning id`,
      [startAt, endAt, active],
    );
    const id = rows[0]!.id;
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, target) values ($1, 'goals_scored', 1)`,
      [id],
    );
    return id;
  }

  function dashboard() {
    return app.inject({
      method: 'GET',
      url: '/admin/weekly-challenges',
      headers: auth(adminToken),
    });
  }

  function settings(enabled: boolean) {
    return app.inject({
      method: 'PATCH',
      url: '/admin/weekly-challenges/settings',
      headers: auth(adminToken),
      payload: { enabled },
    });
  }

  it('groups current, server-scheduled next and read-only history', async () => {
    const historicalId = await seed('2026-08-30T21:00:00Z', '2026-09-06T09:00:00Z', false);
    const res = await dashboard();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      enabled: true,
      current: null,
      next: {
        title: 'Следующая неделя',
        startAt: '2026-09-13T21:00:00.000Z',
        endAt: '2026-09-20T09:00:00.000Z',
      },
      history: [{ id: historicalId }],
    });
  });

  it('updates only next content, rewards and tasks and rejects caller-owned dates or IDs', async () => {
    const currentId = await seed();
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/weekly-challenges/next',
      headers: auth(adminToken),
      payload: payload('Обновлено'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      current: { id: currentId, title: 'Следующая неделя' },
      next: {
        ...payload('Обновлено'),
        startAt: '2026-09-13T21:00:00.000Z',
        endAt: '2026-09-20T09:00:00.000Z',
      },
    });
    for (const extra of [{ startAt: '2026-09-09T10:00:00Z' }, { id: currentId }]) {
      const invalid = await app.inject({
        method: 'PATCH',
        url: '/admin/weekly-challenges/next',
        headers: auth(adminToken),
        payload: { ...payload('Bad'), ...extra },
      });
      expect(invalid.statusCode).toBe(400);
    }
    const oldEdit = await app.inject({
      method: 'PATCH',
      url: `/admin/weekly-challenges/${currentId}`,
      headers: auth(adminToken),
      payload: payload('Bad'),
    });
    expect(oldEdit.statusCode).toBe(404);
    for (const suffix of [
      '',
      `/${currentId}/activate`,
      `/${currentId}/deactivate`,
      `/${currentId}/join-enabled`,
    ]) {
      const removed = await app.inject({
        method: 'POST',
        url: `/admin/weekly-challenges${suffix}`,
        headers: auth(adminToken),
        payload: payload('Bad'),
      });
      expect(removed.statusCode).toBe(404);
    }
  });

  it('disabling keeps the current challenge running and hides next until re-enabled', async () => {
    const id = await seed();
    await dashboard();
    const disabled = await settings(false);
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({
      enabled: false,
      current: { id, isActive: true },
      next: null,
    });
    const enabled = await settings(true);
    expect(enabled.json()).toMatchObject({
      enabled: true,
      current: { id },
      next: { startAt: '2026-09-13T21:00:00.000Z' },
    });
  });

  it('enabling midweek never starts a missed draft, including on subsequent reads', async () => {
    await seed(undefined, undefined, false);
    await pool.query(`update weekly_challenge_settings set enabled = false`);
    const enabled = await settings(true);
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({
      enabled: true,
      current: null,
      next: { startAt: '2026-09-13T21:00:00.000Z' },
    });
    expect((await dashboard()).json().current).toBeNull();
  });

  it('returns a conflict when there is no editable next week', async () => {
    expect((await dashboard()).json()).toEqual({
      enabled: true,
      current: null,
      next: null,
      history: [],
    });
    const missing = await app.inject({
      method: 'PATCH',
      url: '/admin/weekly-challenges/next',
      headers: auth(adminToken),
      payload: payload('Missing'),
    });
    expect(missing.statusCode).toBe(409);
    await seed();
    await settings(false);
    const disabled = await app.inject({
      method: 'PATCH',
      url: '/admin/weekly-challenges/next',
      headers: auth(adminToken),
      payload: payload('Disabled'),
    });
    expect(disabled.statusCode).toBe(409);
    expect((await dashboard()).json().current.title).toBe('Следующая неделя');
  });

  it('counts accepted invitations, settled duels and closed trainings with distinct players and partial progress', async () => {
    const challengeId = await seed('2026-08-30T21:00:00Z', '2026-09-06T09:00:00Z', false);
    await pool.query(`delete from weekly_challenge_tasks where challenge_id = $1`, [challengeId]);
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, target, sort_order) values
      ($1, 'duels_played', 1, 0), ($1, 'duels_won', 1, 1),
      ($1, 'duel_invites_sent', 2, 2), ($1, 'trainings_completed', 1, 3)`,
      [challengeId],
    );
    for (const [index, when] of ['2026-08-30T21:00:00Z', '2026-09-06T09:00:00Z'].entries()) {
      const duel = await pool.query<{ id: string }>(
        `insert into amateur_duel_match
        (challenger_user_id, opponent_user_id, status, rules_snapshot, match_seed, starts_at, ends_at, winner_user_id, game_core_version, settled_at)
        values ($1, $2, 'settled', '{}', 'seed', '2026-08-29', '2026-09-07', $1, 1, $3) returning id`,
        [playerId, adminId, when],
      );
      await pool.query(
        `insert into amateur_duel_participant (match_id, user_id, side, state) values
        ($1, $2, 'challenger', 'completed'), ($1, $3, 'opponent', 'forfeit')`,
        [duel.rows[0]!.id, playerId, adminId],
      );
      await pool.query(
        `insert into event_log (user_id, type, payload, created_at) values ($3, 'amateur_duel_challenge_accepted', $1, $2)`,
        [JSON.stringify({ challenger_user_id: playerId }), when, adminId],
      );
      await pool.query(
        `insert into training_session (user_id, day_date, selected_period, state, game_core_version, training_seed, started_at, closed_at)
        values ($1, $2, 1, 'closed', 1, 'seed', '2026-08-29', $3)`,
        [playerId, `2026-09-0${index + 1}`, when],
      );
    }
    const result = (await dashboard()).json().history[0];
    expect(result.stats).toEqual({
      participantsCount: 1,
      completedCount: 0,
      rewardClaimedCount: 0,
    });
    expect(result.tasks.map((task: { completedCount: number }) => task.completedCount)).toEqual([
      1, 1, 0, 1,
    ]);
    expect(result.players).toEqual([
      expect.objectContaining({
        userId: playerId,
        tasksCompleted: 3,
        tasksTotal: 4,
        progressPercent: 80,
      }),
    ]);
  });

  it('counts only positive configured progress in the half-open interval, without legacy joins', async () => {
    const challengeId = await seed('2026-08-30T21:00:00Z', '2026-09-06T09:00:00Z', false);
    await pool.query(
      `insert into weekly_challenge_participants (challenge_id, user_id, reward_claimed_at) values ($1, $2, now())`,
      [challengeId, adminId],
    );
    const day = await pool.query<{ id: string }>(
      `insert into day_pool (user_id, day_date, state, current_period, game_core_version, daily_seed) values ($1, current_date, 'closed', 1, 1, 'seed') returning id`,
      [playerId],
    );
    for (const [index, when, userId] of [
      [1, '2026-08-30T21:00:00Z', playerId],
      [2, '2026-09-06T09:00:00Z', adminId],
    ] as const) {
      await pool.query(
        `insert into shot_session (user_id, mode, day_pool_id, period_number, shot_index, seed, input_payload, server_result, game_core_version, created_at) values ($1, 'daily', $2, 1, $3, 'seed', '{}', 'goal', 1, $4)`,
        [userId, day.rows[0]!.id, index, when],
      );
    }
    await pool.query(
      `insert into weekly_challenge_reward_claims (challenge_id, user_id, coins, stars, experience) values ($1, $2, 0, 0, 0)`,
      [challengeId, playerId],
    );
    const result = (await dashboard()).json();
    expect(result.history[0].stats).toEqual({
      participantsCount: 1,
      completedCount: 1,
      rewardClaimedCount: 1,
    });
    expect(result.history[0].players).toEqual([
      expect.objectContaining({
        userId: playerId,
        tasksCompleted: 1,
        tasksTotal: 1,
        progressPercent: 100,
        rewardClaimedAt: expect.any(String),
      }),
    ]);
    expect(result.history[0].tasks[0].completedCount).toBe(1);

    await pool.query(
      `update weekly_challenge_tasks set type = 'trainings_completed' where challenge_id = $1`,
      [challengeId],
    );
    expect((await dashboard()).json().history[0].stats.participantsCount).toBe(0);
  });
});
