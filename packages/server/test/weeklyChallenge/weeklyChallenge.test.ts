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
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';

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
      `truncate users, auth_providers, user_equipment, user_sticks,
              user_currency_account, currency_ledger,
              training_session, day_pool, period_log, shot_session, event_log,
              weekly_challenges, weekly_challenge_tasks, weekly_challenge_participants,
              weekly_challenge_reward_claims, weekly_challenge_declines
              restart identity cascade`,
    );
    await pool.query(`update weekly_challenge_settings set enabled = true where id = true`);
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

  async function createWeeklyUser(providerUid: string, displayName: string) {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid,
      displayName,
      timezone: 'Europe/Moscow',
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    return {
      id: user.id,
      accessToken: await jwt.issueAccessToken({ sub: user.id }),
    };
  }

  async function createChallenge({
    title = 'Неделя снайпера',
    isActive = true,
    joinOpenOffset = '1 day',
    startOffset = '1 hour',
    endOffset = '-7 days',
    isAutomatic = true,
    isLaunched = true,
  }: {
    title?: string;
    isActive?: boolean;
    joinOpenOffset?: string;
    startOffset?: string;
    endOffset?: string;
    isAutomatic?: boolean;
    isLaunched?: boolean;
  } = {}): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into weekly_challenges
         (title, description, join_open_at, start_at, end_at, is_active, is_automatic, join_enabled,
          reward_coins, reward_stars, reward_experience, launched_at)
       values (
         $1,
         'Забрось одну тестовую шайбу.',
         now() - ($2::text)::interval,
         now() - ($3::text)::interval,
         now() - ($4::text)::interval,
         $5,
         $6,
         true,
         10,
         2,
         3,
         case when $7 and $6 then now() - ($3::text)::interval else null end
       )
       returning id`,
      [title, joinOpenOffset, startOffset, endOffset, isActive, isAutomatic, isLaunched],
    );
    const challengeId = rows[0]!.id;
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values ($1, 'goals_scored', 'Забросить шайбу', 1, 0)`,
      [challengeId],
    );
    return challengeId;
  }

  async function createActiveChallenge(): Promise<string> {
    return createChallenge({ endOffset: '-7 days' });
  }

  async function insertGoal(createdAtSql = 'now()', forUserId = userId): Promise<void> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into day_pool
         (user_id, day_date, state, current_period, game_core_version, daily_seed)
       values ($1, current_date, 'closed', 1, 1, 'weekly-seed')
       returning id`,
      [forUserId],
    );
    await pool.query(
      `insert into shot_session
         (user_id, mode, day_pool_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version, created_at)
       values ($1, 'daily', $2, 1, 1, 'shot-seed', '{}'::jsonb, 'goal', 1, ${createdAtSql})`,
      [forUserId, rows[0]!.id],
    );
  }

  it('returns null when there is no active challenge', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ challenge: null, pendingRewards: [] });
  });

  it('automatically counts progress and lets the player claim a completed reward once', async () => {
    const challengeId = await createActiveChallenge();
    await insertGoal();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().challenge).toMatchObject({
      id: challengeId,
      status: 'running',
      hasProgress: true,
      allTasksCompleted: true,
      canClaimReward: true,
      rewardClaimedAt: null,
      reward: { coins: 10, stars: 2, experience: 3, tokens: 5 },
      tasks: [expect.objectContaining({ progress: 1, completed: true })],
    });
    expect(current.json().challenge).not.toHaveProperty('participant');
    expect(current.json().challenge).not.toHaveProperty('declinedAt');
    expect(current.json().challenge).not.toHaveProperty('canJoin');

    const join = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/join`,
      headers: authHeader(),
    });
    const decline = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/decline`,
      headers: authHeader(),
    });
    expect(join.statusCode).toBe(404);
    expect(decline.statusCode).toBe(404);

    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().challenge).toMatchObject({
      canClaimReward: false,
      rewardClaimedAt: expect.any(String),
    });

    const balances = await pool.query<{
      balance: number;
      stars: number;
      experience: number;
      ledger_rows: string;
    }>(
      `select uca.balance,
              u.xp as stars,
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
    const profile = await app.inject({ method: 'GET', url: '/me', headers: authHeader() });
    expect(profile.json().starBalance).toBe(2);

    const tokenBalance = await pool.query<{ balance: number }>(
      `select balance from user_reward_token_account where user_id = $1`,
      [userId],
    );
    expect(tokenBalance.rows[0]).toMatchObject({ balance: 5 });
    const balancesBeforeDuplicate = {
      coins: balances.rows[0]!.balance,
      stars: balances.rows[0]!.stars,
      experience: balances.rows[0]!.experience,
      tokens: tokenBalance.rows[0]!.balance,
    };
    const tokenSnapshot = await pool.query<{ tokens: number }>(
      `select tokens from weekly_challenge_reward_claims where challenge_id = $1 and user_id = $2`,
      [challengeId, userId],
    );
    expect(tokenSnapshot.rows[0]).toMatchObject({ tokens: 5 });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(duplicate.statusCode).toBe(409);
    const balancesAfterDuplicate = await pool.query<{
      balance: number;
      stars: number;
      experience: number;
      ledger_rows: string;
    }>(
      `select uca.balance,
              u.xp as stars,
              u.experience,
              (select count(*) from currency_ledger where user_id = u.id)::text as ledger_rows
         from users u
         join user_currency_account uca on uca.user_id = u.id
        where u.id = $1`,
      [userId],
    );
    expect(balancesAfterDuplicate.rows[0]?.ledger_rows).toBe('1');
    const tokenBalanceAfterDuplicate = await pool.query<{ balance: number }>(
      `select balance from user_reward_token_account where user_id = $1`,
      [userId],
    );
    expect({
      coins: balancesAfterDuplicate.rows[0]!.balance,
      stars: balancesAfterDuplicate.rows[0]!.stars,
      experience: balancesAfterDuplicate.rows[0]!.experience,
      tokens: tokenBalanceAfterDuplicate.rows[0]!.balance,
    }).toEqual(balancesBeforeDuplicate);
  });

  it('counts progress in the half-open challenge window', async () => {
    const challengeId = await createActiveChallenge();
    const challengeWindow = await pool.query<{ start_at: Date; end_at: Date }>(
      `select start_at, end_at from weekly_challenges where id = $1`,
      [challengeId],
    );
    const { start_at: startAt, end_at: endAt } = challengeWindow.rows[0]!;

    await insertGoal(`'${startAt.toISOString()}'`);
    await insertGoal(`'${new Date(endAt.getTime() - 1).toISOString()}'`);
    await insertGoal(`'${endAt.toISOString()}'`);

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().challenge).toMatchObject({
      id: challengeId,
      hasProgress: true,
      tasks: [expect.objectContaining({ progress: 2, completed: true })],
    });
  });

  it('does not treat activity outside a challenge task as challenge progress', async () => {
    const challengeId = await createActiveChallenge();
    await pool.query(
      `update weekly_challenge_tasks set type = 'duels_played' where challenge_id = $1`,
      [challengeId],
    );
    await insertGoal();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().challenge).toMatchObject({
      id: challengeId,
      hasProgress: false,
      tasks: [expect.objectContaining({ type: 'duels_played', progress: 0 })],
    });
  });

  it('keeps a due automatic challenge invisible and unclaimable when disabled before start', async () => {
    const challengeId = await createChallenge({
      isActive: false,
      isAutomatic: true,
      isLaunched: false,
    });
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);
    await insertGoal();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    const catalog = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/catalog',
      headers: authHeader(),
    });
    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });

    expect(current.json().challenge).toBeNull();
    expect(catalog.json().active).toEqual([]);
    expect(claim.statusCode).toBe(409);
    const row = await pool.query<{ is_active: boolean }>(
      `select is_active from weekly_challenges where id = $1`,
      [challengeId],
    );
    expect(row.rows).toEqual([{ is_active: false }]);
  });

  it('never starts an inactive legacy draft', async () => {
    const challengeId = await createChallenge({ isActive: false, isAutomatic: false });
    await insertGoal();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    const catalog = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/catalog',
      headers: authHeader(),
    });
    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });

    expect(current.json().challenge).toBeNull();
    expect(catalog.json().active).toEqual([]);
    expect(claim.statusCode).toBe(409);
  });

  it.each([1, 2])(
    'never exposes an ended manual draft without participation (target %i)',
    async (target) => {
      const id = await createChallenge({
        isActive: false,
        isAutomatic: false,
        startOffset: '14 days',
        joinOpenOffset: '15 days',
        endOffset: '7 days',
      });
      await pool.query(`update weekly_challenge_tasks set target = $2 where challenge_id = $1`, [
        id,
        target,
      ]);
      await insertGoal(`now() - interval '10 days'`);
      const other = await createWeeklyUser('legacy-other', 'Other participant');
      await pool.query(
        `insert into weekly_challenge_participants (challenge_id, user_id) values ($1, $2)`,
        [id, other.id],
      );
      const current = await app.inject({
        method: 'GET',
        url: '/weekly-challenge/current',
        headers: authHeader(),
      });
      const catalog = await app.inject({
        method: 'GET',
        url: '/weekly-challenge/catalog',
        headers: authHeader(),
      });
      const failure = await app.inject({
        method: 'GET',
        url: '/weekly-challenge/failures/pending',
        headers: authHeader(),
      });
      const claim = await app.inject({
        method: 'POST',
        url: `/weekly-challenge/${id}/claim-reward`,
        headers: authHeader(),
      });
      const ack = await app.inject({
        method: 'POST',
        url: `/weekly-challenge/failures/${id}/acknowledge`,
        headers: authHeader(),
      });
      expect(current.json()).toEqual({ challenge: null, pendingRewards: [] });
      expect(catalog.json().completed).toEqual([]);
      expect(failure.json()).toEqual({ challenge: null });
      expect(claim.statusCode).toBe(409);
      expect(ack.statusCode).toBe(409);
      expect(
        (
          await pool.query(
            `select count(*)::int as count from weekly_challenge_reward_claims where challenge_id = $1`,
            [id],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    },
  );

  it('preserves completed legacy participants and issued claims without granting other users eligibility', async () => {
    const id = await createChallenge({
      isActive: false,
      isAutomatic: false,
      startOffset: '14 days',
      joinOpenOffset: '15 days',
      endOffset: '7 days',
    });
    await pool.query(
      `insert into weekly_challenge_participants (challenge_id, user_id) values ($1, $2)`,
      [id, userId],
    );
    await insertGoal(`now() - interval '10 days'`);
    const catalog = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/catalog',
      headers: authHeader(),
    });
    expect(catalog.json().completed).toEqual([
      expect.objectContaining({ id, canClaimReward: true }),
    ]);
    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${id}/claim-reward`,
      headers: authHeader(),
    });
    expect(claim.statusCode).toBe(200);
    await pool.query(`delete from weekly_challenge_participants where challenge_id = $1`, [id]);
    // Historical reward evidence survives even if old gameplay is no longer present.
    await pool.query(`delete from shot_session where user_id = $1`, [userId]);
    const claimed = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/catalog',
      headers: authHeader(),
    });
    expect(claimed.json().completed).toEqual([
      expect.objectContaining({ id, canClaimReward: false, rewardClaimedAt: expect.any(String) }),
    ]);
    const duplicate = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${id}/claim-reward`,
      headers: authHeader(),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.message).toMatch(/already claimed/);
    expect(
      (
        await pool.query(
          `select count(*)::int as count from weekly_challenge_reward_claims where challenge_id = $1`,
          [id],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it('keeps the legacy failure result available only for its historical participant', async () => {
    const id = await createChallenge({
      isActive: false,
      isAutomatic: false,
      startOffset: '14 days',
      joinOpenOffset: '15 days',
      endOffset: '7 days',
    });
    await pool.query(`update weekly_challenge_tasks set target = 2 where challenge_id = $1`, [id]);
    await pool.query(
      `insert into weekly_challenge_participants (challenge_id, user_id) values ($1, $2)`,
      [id, userId],
    );
    await insertGoal(`now() - interval '10 days'`);
    const failure = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/failures/pending',
      headers: authHeader(),
    });
    expect(failure.json().challenge).toMatchObject({
      id,
      hasProgress: true,
      allTasksCompleted: false,
    });
    const ack = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/failures/${id}/acknowledge`,
      headers: authHeader(),
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json()).toEqual({ challenge: null });
  });

  it('waits for the users row before taking a currency-account write lock', async () => {
    const challengeId = await createActiveChallenge();
    await insertGoal();

    const blocker = await pool.connect();
    try {
      await blocker.query('begin');
      const blockerBackend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from users where id = $1 for update', [userId]);

      const claimPromise = app.inject({
        method: 'POST',
        url: `/weekly-challenge/${challengeId}/claim-reward`,
        headers: authHeader(),
      });
      const blocked = await waitForBlockedWriter(pool, blockerBackend.rows[0]!.pid, /set xp = xp/i);

      await blocker.query('commit');
      const claim = await claimPromise;
      expect(claim.statusCode).toBe(200);
      expect(blocked.accountWriteLockHeld).toBe(false);
      expect(blocked.query).toMatch(/users/i);
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
    }
  });

  it('keeps an unclaimed reward available after a new active challenge is created', async () => {
    const previousChallengeId = await createChallenge({
      title: 'Прошлая неделя',
      isActive: false,
      joinOpenOffset: '15 days',
      startOffset: '14 days',
      endOffset: '7 days',
    });
    await insertGoal(`now() - interval '10 days'`);

    const currentChallengeId = await createActiveChallenge();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().challenge).toMatchObject({
      id: currentChallengeId,
      title: 'Неделя снайпера',
    });
    expect(current.json().pendingRewards).toHaveLength(1);
    expect(current.json().pendingRewards[0]).toMatchObject({
      id: previousChallengeId,
      title: 'Прошлая неделя',
      canClaimReward: true,
      allTasksCompleted: true,
    });

    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${previousChallengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().pendingRewards).toEqual([]);
    expect(claim.json().challenge).toMatchObject({ id: currentChallengeId });
  });

  it('keeps an older completed reward available after ten newer incomplete challenges', async () => {
    const olderChallengeId = await createChallenge({
      title: 'Старая завершённая неделя',
      isActive: false,
      joinOpenOffset: '31 days',
      startOffset: '30 days',
      endOffset: '23 days',
    });
    await insertGoal(`now() - interval '29 days'`);
    for (let offset = 20; offset >= 11; offset -= 1) {
      await createChallenge({
        title: `Новая незавершённая неделя ${offset}`,
        isActive: false,
        joinOpenOffset: `${offset + 1} days`,
        startOffset: `${offset} days`,
        endOffset: `${offset - 1} days`,
      });
    }

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().pendingRewards).toEqual([
      expect.objectContaining({ id: olderChallengeId, canClaimReward: true }),
    ]);
  });

  it('returns only visible future, actually active, and successfully completed challenges', async () => {
    const futureChallengeId = await createChallenge({
      title: 'Будущая неделя',
      isActive: false,
      joinOpenOffset: '-1 day',
      startOffset: '-2 days',
      endOffset: '-9 days',
    });
    await pool.query(
      `update weekly_challenges set visible_from = now() - interval '1 hour' where id = $1`,
      [futureChallengeId],
    );
    const activeChallengeId = await createActiveChallenge();
    const completedChallengeId = await createChallenge({
      title: 'Пройденная неделя',
      isActive: false,
      joinOpenOffset: '15 days',
      startOffset: '14 days',
      endOffset: '7 days',
    });
    await insertGoal(`now() - interval '10 days'`);
    await createChallenge({
      title: 'Чужой действующий челлендж',
      isActive: false,
      endOffset: '-7 days',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/catalog',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      future: [{ id: futureChallengeId, title: 'Будущая неделя' }],
      active: [{ id: activeChallengeId, title: 'Неделя снайпера' }],
      completed: [
        {
          id: completedChallengeId,
          title: 'Пройденная неделя',
          allTasksCompleted: true,
        },
      ],
    });
  });

  it('treats reward claim rows as claimed without a participant row', async () => {
    const challengeId = await createActiveChallenge();
    await pool.query(
      `insert into weekly_challenge_reward_claims (challenge_id, user_id, coins, stars, experience)
       values ($1, $2, 10, 2, 3)`,
      [challengeId, userId],
    );
    await insertGoal();

    const current = await app.inject({
      method: 'GET',
      url: '/weekly-challenge/current',
      headers: authHeader(),
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().challenge).toMatchObject({
      id: challengeId,
      allTasksCompleted: true,
      canClaimReward: false,
      rewardClaimedAt: expect.any(String),
    });

    const claim = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/${challengeId}/claim-reward`,
      headers: authHeader(),
    });
    expect(claim.statusCode).toBe(409);
  });

  it('returns failure only for users with partial progress and acknowledges it once', async () => {
    const partialUser = await createWeeklyUser('weekly-player-partial', 'Partial Player');
    const completedUser = await createWeeklyUser('weekly-player-completed', 'Completed Player');
    const finished = { isActive: false, joinOpenOffset: '7 days' };
    const noProgressChallengeId = await createChallenge({
      ...finished,
      title: 'Без прогресса',
      startOffset: '6 days',
      endOffset: '5 days',
    });
    const partialChallengeId = await createChallenge({
      ...finished,
      title: 'Частичный прогресс',
      startOffset: '4 days',
      endOffset: '3 days',
    });
    await createChallenge({
      ...finished,
      title: 'Полностью пройдено',
      startOffset: '2 days',
      endOffset: '1 hour',
    });
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values ($1, 'goals_scored', 'Забросить ещё одну шайбу', 2, 1)`,
      [partialChallengeId],
    );
    await insertGoal("now() - interval '3 days 1 hour'", partialUser.id);
    await insertGoal("now() - interval '2 hours'", completedUser.id);

    async function pendingFailureFor(token: string) {
      const pending = await app.inject({
        method: 'GET',
        url: '/weekly-challenge/failures/pending',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(pending.statusCode).toBe(200);
      return pending.json() as {
        challenge: { id: string; hasProgress: boolean; allTasksCompleted: boolean } | null;
      };
    }

    expect(await pendingFailureFor(accessToken)).toEqual({ challenge: null });
    expect(await pendingFailureFor(partialUser.accessToken)).toMatchObject({
      challenge: { id: partialChallengeId, hasProgress: true, allTasksCompleted: false },
    });
    expect(await pendingFailureFor(completedUser.accessToken)).toEqual({ challenge: null });

    const noProgressAcknowledged = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/failures/${noProgressChallengeId}/acknowledge`,
      headers: authHeader(),
    });
    expect(noProgressAcknowledged.statusCode).toBe(409);

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/weekly-challenge/failures/${partialChallengeId}/acknowledge`,
      headers: { authorization: `Bearer ${partialUser.accessToken}` },
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json()).toEqual({ challenge: null });
    expect(await pendingFailureFor(partialUser.accessToken)).toEqual({ challenge: null });
  });
});
