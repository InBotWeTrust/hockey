import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_CORE_VERSION } from '@hockey/game-core';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { reconcileBonusAttempt } from '../../src/bonusGames/reconcile.js';
import {
  BONUS_GAME_CATALOG_LOCK_CLASS_ID,
  BONUS_GAME_CATALOG_LOCK_OBJECT_ID,
  abandonBonusAttempt,
  lockBonusGameCatalogForMutation,
  startBonusPeriod,
  startOrResumeBonusAttempt,
} from '../../src/bonusGames/service.js';
import type {
  BonusGameAttemptRow,
  BonusGamePeriodLogRow,
  BonusPeriodRule,
} from '../../src/bonusGames/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { deriveBonusAttemptSeed } from '../../src/duel/seed.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { trackPoolConnections } from '../helpers/trackPoolClientConcurrency.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const NOW = new Date('2026-08-23T12:00:00.000Z');
const SEED_SECRET = 'bonus-attempt-test-secret';

const PERIODS: BonusPeriodRule[] = [
  {
    periodNumber: 1,
    durationMs: 300_000,
    shotsLimit: 2,
    goalFrequency: 0.45,
    goalieFrequency: 0.5,
    shooterFrequency: 0.65,
    puckSpeedPerMs: 1.2,
    goaliePattern: 'linear',
    goalieAmplitude: 1,
    goalAmplitude: 220,
  },
  {
    periodNumber: 2,
    durationMs: 300_000,
    shotsLimit: 2,
    goalFrequency: 0.5,
    goalieFrequency: 0.6,
    shooterFrequency: 0.7,
    puckSpeedPerMs: 1.25,
    goaliePattern: 'sine',
    goalieAmplitude: 0.9,
    goalAmplitude: 200,
  },
];

interface TestGame {
  id: string;
  slug: string;
  arenaId: string;
}

describe.skipIf(!hasIntegrationEnv)('bonus game attempt lifecycle', () => {
  let pool: Pool;
  let defaultArenaId: string;
  let userSequence = 0;
  let gameSequence = 0;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users, arena_theme restart identity cascade');
    userSequence = 0;
    gameSequence = 0;
    const arena = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ('default', 'Стандартная', '/arenas/default.webp',
               '/arenas/default-thumb.webp', 'active', true)
       returning id`,
    );
    defaultArenaId = arena.rows[0]!.id;
  });

  async function createUser({ level = 2 }: { level?: number } = {}): Promise<string> {
    userSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `bonus-attempt-${userSequence}`,
      displayName: `Bonus Player ${userSequence}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query('update users set level = $2 where id = $1', [user.id, level]);
    return user.id;
  }

  async function createGame({
    sortOrder,
    status = 'active',
    accessType = 'free',
    price = accessType === 'paid' ? 1 : 0,
    targetGoals = 4,
    periods = PERIODS,
    breakDurationMs = 30_000,
    arenaId = defaultArenaId,
  }: {
    sortOrder: number;
    status?: 'draft' | 'active' | 'archived';
    accessType?: 'free' | 'paid';
    price?: number;
    targetGoals?: number;
    periods?: BonusPeriodRule[];
    breakDurationMs?: number;
    arenaId?: string;
  }): Promise<TestGame> {
    gameSequence += 1;
    const slug = `attempt-game-${gameSequence}`;
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11::jsonb,
               100, 1, 50, $12, $13, $14, 3)
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
        arenaId,
        `/goalies/${slug}-ready.webp`,
        `/goalies/${slug}-save.webp`,
      ],
    );
    return { id: game.rows[0]!.id, slug, arenaId };
  }

  async function fetchAttempt(attemptId: string): Promise<BonusGameAttemptRow> {
    const { rows } = await pool.query<BonusGameAttemptRow>(
      'select * from bonus_game_attempt where id = $1',
      [attemptId],
    );
    return rows[0]!;
  }

  async function reconcile(attemptId: string, now: Date): Promise<BonusGameAttemptRow> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const next = await reconcileBonusAttempt(client, await fetchAttempt(attemptId), now);
      await client.query('commit');
      return next;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function insertShot(
    client: Pool | PoolClient,
    input: {
      userId: string;
      attemptId: string;
      periodNumber: number;
      shotIndex: number;
      result: 'goal' | 'save' | 'miss';
      createdAt: Date;
    },
  ): Promise<void> {
    await client.query(
      `insert into shot_session
         (user_id, mode, bonus_game_attempt_id, period_number, shot_index,
          seed, input_payload, server_result, game_core_version, created_at)
       values ($1, 'bonus', $2, $3, $4, $5, '{}'::jsonb, $6, $7, $8)`,
      [
        input.userId,
        input.attemptId,
        input.periodNumber,
        input.shotIndex,
        `shot-${input.shotIndex}`,
        input.result,
        GAME_CORE_VERSION,
        input.createdAt,
      ],
    );
    await client.query(
      `update bonus_game_attempt
          set shots_taken = shots_taken + 1,
              goals = goals + $2
        where id = $1`,
      [input.attemptId, input.result === 'goal' ? 1 : 0],
    );
  }

  async function periodLogs(attemptId: string): Promise<BonusGamePeriodLogRow[]> {
    const { rows } = await pool.query<BonusGamePeriodLogRow>(
      `select * from bonus_game_period_log
        where attempt_id = $1
        order by period_number`,
      [attemptId],
    );
    return rows;
  }

  async function waitForBlockedCatalogReader(): Promise<void> {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const { rows } = await pool.query<{ waiting: boolean }>(
        `select exists (
           select 1
             from pg_locks
            where locktype = 'advisory'
              and classid = $1::int::oid
              and objid = $2::int::oid
              and mode = 'ShareLock'
              and not granted
         ) as waiting`,
        [BONUS_GAME_CATALOG_LOCK_CLASS_ID, BONUS_GAME_CATALOG_LOCK_OBJECT_ID],
      );
      if (rows[0]?.waiting === true) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('start did not wait for the shared bonus catalog lock');
  }

  it('returns the same active attempt for the same game', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const input = { userId, gameId: game.id, now: NOW, seedSecret: SEED_SECRET };

    const first = await startOrResumeBonusAttempt(pool, input);
    const second = await startOrResumeBonusAttempt(pool, input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.attempt.id).toBe(first.attempt.id);
  });

  it('runs attempt-start transaction queries sequentially on its PoolClient', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const tracked = trackPoolConnections(pool);

    await startOrResumeBonusAttempt(tracked.pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });

    expect(tracked.tracker.maxConcurrentQueries).toBe(1);
  });

  it('closes an expired period and waits for the next explicit start', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });

    const next = await reconcile(created.attempt.id, new Date('2026-08-23T12:05:00Z'));
    expect(next.state).toBe('break_active');
    expect(next.break_started_at).toEqual(new Date('2026-08-23T12:05:00Z'));
    const afterBreak = await reconcile(created.attempt.id, new Date('2026-08-23T12:05:31Z'));
    expect(afterBreak.state).toBe('idle');
    expect(afterBreak.current_period).toBe(1);
    expect(await periodLogs(created.attempt.id)).toMatchObject([
      {
        period_number: 1,
        ended_at: new Date('2026-08-23T12:05:00Z'),
        duration_ms: 300_000,
        closed_reason: 'timeout',
      },
    ]);
  });

  it('serializes concurrent same-game starts into one active attempt', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const input = { userId, gameId: game.id, now: NOW, seedSecret: SEED_SECRET };

    const results = await Promise.all([
      startOrResumeBonusAttempt(pool, input),
      startOrResumeBonusAttempt(pool, input),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => result.attempt.id)).size).toBe(1);
    const active = await pool.query<{ count: number }>(
      `select count(*)::int as count from bonus_game_attempt
        where user_id = $1 and status = 'active'`,
      [userId],
    );
    expect(active.rows[0]?.count).toBe(1);
  });

  it('conflicts safely when another game owns the active attempt', async () => {
    const userId = await createUser();
    const firstGame = await createGame({ sortOrder: 1 });
    const secondGame = await createGame({ sortOrder: 2 });
    const active = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: firstGame.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });

    await expect(
      startOrResumeBonusAttempt(pool, {
        userId,
        gameId: secondGame.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({
      code: 'bonus_attempt_already_active',
      activeAttempt: {
        id: active.attempt.id,
        gameId: firstGame.id,
      },
    });
  });

  it('checks level, active progression, and paid access when creating', async () => {
    const beginnerId = await createUser({ level: 1 });
    const amateurId = await createUser();
    const first = await createGame({ sortOrder: 1 });
    const paid = await createGame({ sortOrder: 2, accessType: 'paid', price: 2 });

    await expect(
      startOrResumeBonusAttempt(pool, {
        userId: beginnerId,
        gameId: first.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({ code: 'bonus_level_locked' });
    await expect(
      startOrResumeBonusAttempt(pool, {
        userId: amateurId,
        gameId: paid.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({ code: 'bonus_previous_game_required' });

    const completedAttempt = await pool.query<{ id: string }>(
      `insert into bonus_game_attempt
         (user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       select $1, game.id, 'completed', 'closed', game.total_periods, $3,
              'completed-seed', $4, game.revision,
              jsonb_build_object(
                'gameId', game.id, 'slug', game.slug, 'title', game.title,
                'revision', game.revision, 'targetGoals', game.target_goals,
                'totalPeriods', game.total_periods,
                'breakDurationMs', game.break_duration_ms,
                'periods', game.period_rules,
                'goalkeeperReadyUrl', game.goalkeeper_ready_url,
                'goalkeeperSaveUrl', game.goalkeeper_save_url,
                'arena', jsonb_build_object(
                  'id', arena.id, 'slug', arena.slug, 'title', arena.title,
                  'artworkUrl', arena.artwork_url,
                  'thumbnailUrl', arena.thumbnail_url
                )
              ),
              jsonb_build_object('coins', 100, 'stars', 1, 'experience', 50),
              arena.id,
              jsonb_build_object(
                'id', arena.id, 'slug', arena.slug, 'title', arena.title,
                'artworkUrl', arena.artwork_url,
                'thumbnailUrl', arena.thumbnail_url
              ),
              game.goalkeeper_ready_url, game.goalkeeper_save_url
         from bonus_game game
         join arena_theme arena on arena.id = game.arena_theme_id
        where game.id = $2
       returning id`,
      [amateurId, first.id, NOW, GAME_CORE_VERSION],
    );
    await pool.query(
      `insert into user_bonus_game_completion
         (user_id, bonus_game_id, attempt_id, reward_snapshot, completed_at)
       values ($1, $2, $3, $4::jsonb, $5)`,
      [
        amateurId,
        first.id,
        completedAttempt.rows[0]!.id,
        JSON.stringify({ coins: 100, stars: 1, experience: 50 }),
        NOW,
      ],
    );
    await expect(
      startOrResumeBonusAttempt(pool, {
        userId: amateurId,
        gameId: paid.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({ code: 'bonus_purchase_required' });

    await pool
      .query(
        `insert into bonus_game_economy_event
         (user_id, bonus_game_id, kind, stars_delta,
          coins_after, stars_after, experience_after, snapshot, created_at)
       values ($1, $2, 'unlock_purchase', -2, 0, 0, 0, $3::jsonb, $4)
       returning id`,
        [amateurId, paid.id, JSON.stringify({ priceStars: 2 }), NOW],
      )
      .then(async ({ rows }) => {
        await pool.query(
          `insert into user_bonus_game_unlock
           (user_id, bonus_game_id, paid_price_stars, economy_event_id, unlocked_at)
         values ($1, $2, 2, $3, $4)`,
          [amateurId, paid.id, rows[0]!.id, NOW],
        );
      });
    await expect(
      startOrResumeBonusAttempt(pool, {
        userId: amateurId,
        gameId: paid.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ).resolves.toMatchObject({ created: true, attempt: { gameId: paid.id } });
  });

  it('snapshots rules, reward, arena, media, revision, core version, and secret seed', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });

    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const persisted = await fetchAttempt(created.attempt.id);
    const resumed = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: new Date('2026-08-23T12:00:01Z'),
      seedSecret: SEED_SECRET,
    });

    expect(persisted).toMatchObject({
      definition_revision: 3,
      game_core_version: GAME_CORE_VERSION,
      arena_theme_id_snapshot: defaultArenaId,
      goalkeeper_ready_url: `/goalies/${game.slug}-ready.webp`,
      goalkeeper_save_url: `/goalies/${game.slug}-save.webp`,
      reward_snapshot: { coins: 100, stars: 1, experience: 50 },
      arena_snapshot: {
        id: defaultArenaId,
        slug: 'default',
        title: 'Стандартная',
        artworkUrl: '/arenas/default.webp',
        thumbnailUrl: '/arenas/default-thumb.webp',
      },
      rules_snapshot: {
        gameId: game.id,
        slug: game.slug,
        revision: 3,
        targetGoals: 4,
        totalPeriods: 2,
        breakDurationMs: 30_000,
        periods: PERIODS,
        goalkeeperReadyUrl: `/goalies/${game.slug}-ready.webp`,
        goalkeeperSaveUrl: `/goalies/${game.slug}-save.webp`,
      },
    });
    expect(persisted.attempt_seed).toBe(
      deriveBonusAttemptSeed(created.attempt.id, userId, game.id, SEED_SECRET),
    );
    expect(created.attempt.attemptSeed).toBe(persisted.attempt_seed);
    expect(resumed).toMatchObject({
      created: false,
      attempt: { id: created.attempt.id, attemptSeed: persisted.attempt_seed },
    });
  });

  it('continues an archived active attempt from its stable snapshot but blocks a new one', async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await pool.query(
      `update bonus_game
          set status = 'archived', archived_at = $2, title = 'Новое имя',
              target_goals = 1, reward_stars = 9, revision = revision + 1,
              goalkeeper_ready_url = '/goalies/new-ready.webp'
        where id = $1`,
      [game.id, new Date('2026-08-23T12:01:00Z')],
    );

    const resumed = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: new Date('2026-08-23T12:02:00Z'),
      seedSecret: SEED_SECRET,
    });
    expect(resumed).toMatchObject({
      created: false,
      attempt: {
        id: created.attempt.id,
        rules: {
          title: 'Игра 1',
          targetGoals: 4,
          revision: 3,
          goalkeeperReadyUrl: `/goalies/${game.slug}-ready.webp`,
        },
        reward: { stars: 1 },
      },
    });
    await expect(
      startOrResumeBonusAttempt(pool, {
        userId: otherUserId,
        gameId: game.id,
        now: new Date('2026-08-23T12:02:00Z'),
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({ code: 'bonus_game_inactive' });
  });

  it('commits final timeout reconciliation before returning an archived-game error', async () => {
    const userId = await createUser();
    const game = await createGame({
      sortOrder: 1,
      targetGoals: 1,
      periods: [PERIODS[0]!],
    });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
    await pool.query(
      `update bonus_game
          set status = 'archived', archived_at = $2
        where id = $1`,
      [game.id, new Date('2026-08-23T12:01:00Z')],
    );

    await expect(
      startOrResumeBonusAttempt(pool, {
        userId,
        gameId: game.id,
        now: new Date('2026-08-23T12:05:00Z'),
        seedSecret: SEED_SECRET,
      }),
    ).rejects.toMatchObject({ code: 'bonus_game_inactive' });

    expect(await fetchAttempt(created.attempt.id)).toMatchObject({
      status: 'failed',
      state: 'closed',
      current_period: 1,
      period_started_at: null,
      closed_at: new Date('2026-08-23T12:05:00Z'),
    });
    expect(await periodLogs(created.attempt.id)).toMatchObject([
      {
        period_number: 1,
        ended_at: new Date('2026-08-23T12:05:00Z'),
        duration_ms: 300_000,
        closed_reason: 'timeout',
      },
    ]);
  });

  it('does not create from a definition archived concurrently with start', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const admin = await pool.connect();
    let starting: ReturnType<typeof startOrResumeBonusAttempt> | null = null;
    try {
      await admin.query('begin');
      await lockBonusGameCatalogForMutation(admin);
      await admin.query(
        `update bonus_game
            set status = 'archived', archived_at = $2
          where id = $1`,
        [game.id, NOW],
      );

      starting = startOrResumeBonusAttempt(pool, {
        userId,
        gameId: game.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      });
      void starting.catch(() => undefined);
      await waitForBlockedCatalogReader();
      await admin.query('commit');

      await expect(starting).rejects.toMatchObject({ code: 'bonus_game_inactive' });
      const attempts = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from bonus_game_attempt
          where user_id = $1`,
        [userId],
      );
      expect(attempts.rows[0]?.count).toBe(0);
    } catch (error) {
      await admin.query('rollback').catch(() => undefined);
      await starting?.catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });

  it('revalidates the active predecessor chain after a concurrent catalog mutation', async () => {
    const userId = await createUser();
    const predecessor = await createGame({ sortOrder: 1, status: 'archived' });
    const target = await createGame({ sortOrder: 2 });
    const admin = await pool.connect();
    let starting: ReturnType<typeof startOrResumeBonusAttempt> | null = null;
    try {
      await admin.query('begin');
      await lockBonusGameCatalogForMutation(admin);
      await admin.query(
        `update bonus_game
            set status = 'active', archived_at = null
          where id = $1`,
        [predecessor.id],
      );

      starting = startOrResumeBonusAttempt(pool, {
        userId,
        gameId: target.id,
        now: NOW,
        seedSecret: SEED_SECRET,
      });
      void starting.catch(() => undefined);
      await waitForBlockedCatalogReader();
      await admin.query('commit');

      await expect(starting).rejects.toMatchObject({
        code: 'bonus_previous_game_required',
      });
      const attempts = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from bonus_game_attempt
          where user_id = $1`,
        [userId],
      );
      expect(attempts.rows[0]?.count).toBe(0);
    } catch (error) {
      await admin.query('rollback').catch(() => undefined);
      await starting?.catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });

  it('starts periods only by explicit action', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });

    expect(created.attempt).toMatchObject({ state: 'idle', currentPeriod: 0 });
    expect(await reconcile(created.attempt.id, new Date('2026-08-23T12:01:00Z'))).toMatchObject({
      state: 'idle',
      current_period: 0,
      period_started_at: null,
    });
    const started = await startBonusPeriod(pool, {
      userId,
      attemptId: created.attempt.id,
      now: new Date('2026-08-23T12:01:00Z'),
    });
    expect(started).toMatchObject({
      state: 'period_active',
      currentPeriod: 1,
      periodStartedAt: '2026-08-23T12:01:00.000Z',
    });
  });

  it('closes a shot quota once and enters intermission', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
    await insertShot(pool, {
      userId,
      attemptId: created.attempt.id,
      periodNumber: 1,
      shotIndex: 1,
      result: 'goal',
      createdAt: new Date('2026-08-23T12:00:01Z'),
    });
    await insertShot(pool, {
      userId,
      attemptId: created.attempt.id,
      periodNumber: 1,
      shotIndex: 2,
      result: 'save',
      createdAt: new Date('2026-08-23T12:00:02Z'),
    });

    const closed = await reconcile(created.attempt.id, new Date('2026-08-23T12:00:03Z'));
    const again = await reconcile(created.attempt.id, new Date('2026-08-23T12:00:04Z'));

    expect(closed).toMatchObject({ state: 'break_active', current_period: 1 });
    expect(again).toMatchObject({ state: 'break_active', current_period: 1 });
    expect(await periodLogs(created.attempt.id)).toMatchObject([
      { period_number: 1, shots_taken: 2, goals: 1, closed_reason: 'quota' },
    ]);
  });

  it('fails after the exhausted final period without target completion', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
    await reconcile(created.attempt.id, new Date('2026-08-23T12:05:00Z'));
    await reconcile(created.attempt.id, new Date('2026-08-23T12:05:31Z'));
    await startBonusPeriod(pool, {
      userId,
      attemptId: created.attempt.id,
      now: new Date('2026-08-23T12:06:00Z'),
    });

    const failed = await reconcile(created.attempt.id, new Date('2026-08-23T12:11:00Z'));

    expect(failed).toMatchObject({ status: 'failed', state: 'closed', current_period: 2 });
    expect(failed.closed_at).toEqual(new Date('2026-08-23T12:11:00Z'));
    expect((await periodLogs(created.attempt.id)).map((log) => log.closed_reason)).toEqual([
      'timeout',
      'timeout',
    ]);
  });

  it('logs the active period before abandoning and allows a fresh attempt', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
    await insertShot(pool, {
      userId,
      attemptId: created.attempt.id,
      periodNumber: 1,
      shotIndex: 1,
      result: 'goal',
      createdAt: new Date('2026-08-23T12:00:01Z'),
    });

    const abandoned = await abandonBonusAttempt(pool, {
      userId,
      attemptId: created.attempt.id,
      now: new Date('2026-08-23T12:00:10Z'),
    });

    expect(abandoned).toMatchObject({
      status: 'abandoned',
      state: 'closed',
      closedAt: '2026-08-23T12:00:10.000Z',
    });
    expect(await periodLogs(created.attempt.id)).toMatchObject([
      {
        period_number: 1,
        shots_taken: 1,
        goals: 1,
        duration_ms: 10_000,
        closed_reason: 'attempt_abandoned',
      },
    ]);
    await expect(
      startOrResumeBonusAttempt(pool, {
        userId,
        gameId: game.id,
        now: new Date('2026-08-23T12:01:00Z'),
        seedSecret: SEED_SECRET,
      }),
    ).resolves.toMatchObject({ created: true });
  });
});
