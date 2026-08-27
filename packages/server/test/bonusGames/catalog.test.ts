import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { listBonusGameCards } from '../../src/bonusGames/catalog.js';
import { purchaseBonusGame } from '../../src/bonusGames/economy.js';
import type { BonusPeriodRule } from '../../src/bonusGames/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { trackPoolConnections } from '../helpers/trackPoolClientConcurrency.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const NOW = new Date('2026-08-23T12:00:00.000Z');

const PERIOD_RULE: BonusPeriodRule = {
  periodNumber: 1,
  durationMs: 240_000,
  shotsLimit: 30,
  goalFrequency: 0.45,
  goalieFrequency: 0.5,
  shooterFrequency: 0.65,
  puckSpeedPerMs: 1.2,
  goaliePattern: 'linear',
  goalieAmplitude: 1,
  goalAmplitude: 220,
};

interface TestGame {
  id: string;
  slug: string;
  sortOrder: number;
}

describe.skipIf(!hasIntegrationEnv)('bonus game catalog and paid unlocks', () => {
  let pool: Pool;
  let arenaId: string;
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
    arenaId = arena.rows[0]!.id;
  });

  async function createUser({
    level = 2,
    lifetimeGoals = 0,
    stars = 0,
  }: {
    level?: number;
    lifetimeGoals?: number;
    stars?: number;
  } = {}): Promise<string> {
    userSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `bonus-catalog-${userSequence}`,
      displayName: `Bonus Player ${userSequence}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query(
      `update users
          set level = $2, lifetime_goals_total = $3, xp = $4
        where id = $1`,
      [user.id, level, lifetimeGoals, stars],
    );
    return user.id;
  }

  async function createGame({
    sortOrder,
    accessType = 'free',
    price = accessType === 'paid' ? 1 : 0,
    status = 'active',
    skillCode = 'accuracy',
  }: {
    sortOrder: number;
    accessType?: 'free' | 'paid';
    price?: number;
    status?: 'draft' | 'active' | 'archived';
    skillCode?: 'speed' | 'accuracy';
  }): Promise<TestGame> {
    gameSequence += 1;
    const slug = `bonus-${gameSequence}`;
    const periodRule = skillCode === 'speed' ? { ...PERIOD_RULE, shotsLimit: null } : PERIOD_RULE;
    const qualificationRules =
      skillCode === 'speed'
        ? { type: 'goals_in_time', targetGoals: 18, activeTimeMs: PERIOD_RULE.durationMs }
        : { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 };
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, skill_code, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, qualification_rules, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               18, $9::jsonb, 1, 0, $10::jsonb,
               100, 1, 50, $11, $12, $13)
       returning id`,
      [
        slug,
        `Игра ${gameSequence}`,
        skillCode,
        `Описание ${gameSequence}`,
        sortOrder,
        status,
        accessType,
        price,
        JSON.stringify(qualificationRules),
        JSON.stringify([periodRule]),
        arenaId,
        `/goalies/${slug}-ready.webp`,
        `/goalies/${slug}-save.webp`,
      ],
    );
    return { id: game.rows[0]!.id, slug, sortOrder };
  }

  async function createAttempt(
    userId: string,
    game: TestGame,
    status: 'active' | 'completed' = 'active',
  ): Promise<string> {
    const arena = {
      id: arenaId,
      slug: 'default',
      title: 'Стандартная',
      artworkUrl: '/arenas/default.webp',
      thumbnailUrl: '/arenas/default-thumb.webp',
    };
    const rules = {
      gameId: game.id,
      slug: game.slug,
      title: `Игра ${game.slug}`,
      skillCode: 'accuracy',
      revision: 1,
      targetGoals: 18,
      qualificationRules: { type: 'goals_from_shots', targetGoals: 18, shotsLimit: 30 },
      totalPeriods: 1,
      breakDurationMs: 0,
      useInventory: false,
      previewTitle: 'Старое превью',
      previewStory: 'Старая история',
      previewArtworkUrl: '/previews/old.webp',
      previewRevision: 1,
      periods: [PERIOD_RULE],
      goalkeeperReadyUrl: `/goalies/${game.slug}-ready.webp`,
      goalkeeperSaveUrl: `/goalies/${game.slug}-save.webp`,
      arena,
    };
    const attempt = await pool.query<{ id: string }>(
      `insert into bonus_game_attempt
         (user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, $3, $4, $5, $6,
               $7, 1, 1, $8::jsonb,
               $9::jsonb, $10, $11::jsonb, $12, $13)
       returning id`,
      [
        userId,
        game.id,
        status,
        status === 'active' ? 'idle' : 'closed',
        status === 'active' ? 0 : 1,
        status === 'active' ? null : NOW,
        `seed-${userId}-${game.id}`,
        JSON.stringify(rules),
        JSON.stringify({ coins: 100, stars: 1, experience: 50 }),
        arenaId,
        JSON.stringify(arena),
        rules.goalkeeperReadyUrl,
        rules.goalkeeperSaveUrl,
      ],
    );
    return attempt.rows[0]!.id;
  }

  async function completeGame(userId: string, game: TestGame): Promise<void> {
    const attemptId = await createAttempt(userId, game, 'completed');
    await pool.query(
      `insert into user_bonus_game_completion
         (user_id, bonus_game_id, attempt_id, reward_snapshot, completed_at)
       values ($1, $2, $3, $4::jsonb, $5)`,
      [userId, game.id, attemptId, JSON.stringify({ coins: 100, stars: 1, experience: 50 }), NOW],
    );
  }

  it('does not offer payment before the nearest active predecessor is complete', async () => {
    const userId = await createUser();
    const first = await createGame({ sortOrder: 1 });
    const ignoredDraft = await createGame({ sortOrder: 2, status: 'draft' });
    const ignoredArchived = await createGame({ sortOrder: 3, status: 'archived' });
    const paid = await createGame({ sortOrder: 4, accessType: 'paid', price: 2 });

    const cards = await listBonusGameCards(pool, userId);

    expect(cards.map((card) => [card.id, card.state])).toEqual([
      [first.id, 'available'],
      [paid.id, 'sequence_locked'],
    ]);
    expect(cards).toMatchObject([
      { id: first.id, prerequisite: null },
      { id: paid.id, prerequisite: { game_id: first.id, title: 'Игра 1' } },
    ]);
    expect(cards.map((card) => card.id)).not.toContain(ignoredDraft.id);
    expect(cards.map((card) => card.id)).not.toContain(ignoredArchived.id);

    await expect(
      purchaseBonusGame(pool, { userId, gameId: paid.id, expectedPriceStars: 2, now: NOW }),
    ).rejects.toMatchObject({ code: 'bonus_previous_game_required' });
    const events = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from bonus_game_economy_event
        where user_id = $1`,
      [userId],
    );
    expect(events.rows[0]?.count).toBe(0);
  });

  it('opens and sells the speed and accuracy chains independently', async () => {
    const userId = await createUser({ stars: 10 });
    const accuracyFirst = await createGame({ sortOrder: 1, skillCode: 'accuracy' });
    const accuracyPaid = await createGame({
      sortOrder: 2,
      skillCode: 'accuracy',
      accessType: 'paid',
      price: 2,
    });
    const speedFirst = await createGame({ sortOrder: 1, skillCode: 'speed' });
    const speedPaid = await createGame({
      sortOrder: 2,
      skillCode: 'speed',
      accessType: 'paid',
      price: 3,
    });
    await completeGame(userId, speedFirst);

    let cards = await listBonusGameCards(pool, userId);
    expect(Object.fromEntries(cards.map((card) => [card.id, card.state]))).toEqual({
      [accuracyFirst.id]: 'available',
      [accuracyPaid.id]: 'sequence_locked',
      [speedFirst.id]: 'completed',
      [speedPaid.id]: 'purchase_required',
    });

    await purchaseBonusGame(pool, {
      userId,
      gameId: speedPaid.id,
      expectedPriceStars: 3,
      now: NOW,
    });
    await completeGame(userId, accuracyFirst);
    cards = await listBonusGameCards(pool, userId);
    expect(Object.fromEntries(cards.map((card) => [card.id, card.state]))).toEqual({
      [accuracyFirst.id]: 'completed',
      [accuracyPaid.id]: 'purchase_required',
      [speedFirst.id]: 'completed',
      [speedPaid.id]: 'available',
    });
  });

  it('derives paid, available, active, and completed states on the server', async () => {
    const userId = await createUser({ stars: 5 });
    const first = await createGame({ sortOrder: 1 });
    const paid = await createGame({ sortOrder: 2, accessType: 'paid', price: 2 });
    const third = await createGame({ sortOrder: 3 });
    await completeGame(userId, first);

    let cards = await listBonusGameCards(pool, userId);
    expect(cards.map((card) => card.state)).toEqual([
      'completed',
      'purchase_required',
      'sequence_locked',
    ]);

    await purchaseBonusGame(pool, {
      userId,
      gameId: paid.id,
      expectedPriceStars: 2,
      now: NOW,
    });
    cards = await listBonusGameCards(pool, userId);
    expect(cards[1]?.state).toBe('available');

    const attemptId = await createAttempt(userId, paid);
    cards = await listBonusGameCards(pool, userId);
    expect(cards[1]).toMatchObject({
      state: 'in_progress',
      active_attempt: { id: attemptId, game_id: paid.id },
    });
    expect(cards[2]?.id).toBe(third.id);
  });

  it('does not charge or create a paid unlock when a free active attempt becomes paid', async () => {
    const userId = await createUser({ stars: 10 });
    const game = await createGame({ sortOrder: 1 });
    const attemptId = await createAttempt(userId, game);
    await pool.query(
      `update bonus_game
          set access_type = 'paid', unlock_price_stars = 4
        where id = $1`,
      [game.id],
    );

    expect((await listBonusGameCards(pool, userId))[0]).toMatchObject({
      state: 'in_progress',
      active_attempt: { id: attemptId },
    });
    expect(
      await purchaseBonusGame(pool, {
        userId,
        gameId: game.id,
        expectedPriceStars: 4,
        now: NOW,
      }),
    ).toEqual({
      unlocked: true,
      starBalance: 10,
    });

    const sideEffects = await pool.query<{ xp: number; unlocks: number; events: number }>(
      `select u.xp::int as xp,
              (select count(*)::int from user_bonus_game_unlock
                where user_id = u.id and bonus_game_id = $2) as unlocks,
              (select count(*)::int from bonus_game_economy_event
                where user_id = u.id and bonus_game_id = $2) as events
         from users u
        where u.id = $1`,
      [userId, game.id],
    );
    expect(sideEffects.rows[0]).toEqual({ xp: 10, unlocks: 0, events: 0 });
  });

  it('keeps an active attempt card consistent with its immutable snapshot', async () => {
    const userId = await createUser();
    const game = await createGame({ sortOrder: 1 });
    const attemptId = await createAttempt(userId, game);
    await pool.query(
      `update bonus_game
          set slug = 'accuracy-moscow', title = 'Москва', target_goals = 25,
              qualification_rules = '{"type":"goals_from_shots","targetGoals":25,"shotsLimit":40}'::jsonb,
              preview_title = 'Новое превью', preview_story = 'Новая история',
              preview_artwork_url = '/world-tour/moscow-preview.webp', preview_revision = 2,
              goalkeeper_ready_url = '/world-tour/moscow-ready.webp',
              goalkeeper_save_url = '/world-tour/moscow-save.webp'
        where id = $1`,
      [game.id],
    );
    await pool.query(
      `update arena_theme
          set slug = 'accuracy-world-tour-moscow', title = 'Москва',
              artwork_url = '/world-tour/moscow.webp',
              thumbnail_url = '/world-tour/moscow-preview.webp'
        where id = $1`,
      [arenaId],
    );

    const card = (await listBonusGameCards(pool, userId))[0]!;

    expect(card).toMatchObject({
      slug: game.slug,
      title: `Игра ${game.slug}`,
      target_goals: 18,
      preview_title: 'Старое превью',
      preview_story: 'Старая история',
      preview_artwork_url: '/previews/old.webp',
      preview_revision: 1,
      goalkeeper_ready_url: `/goalies/${game.slug}-ready.webp`,
      goalkeeper_save_url: `/goalies/${game.slug}-save.webp`,
      arena: {
        slug: 'default',
        title: 'Стандартная',
        artwork_url: '/arenas/default.webp',
        thumbnail_url: '/arenas/default-thumb.webp',
      },
      state: 'in_progress',
      active_attempt: { id: attemptId },
    });
  });

  it('does not charge or create a paid unlock when a completed free game becomes paid', async () => {
    const userId = await createUser({ stars: 10 });
    const game = await createGame({ sortOrder: 1 });
    await completeGame(userId, game);
    await pool.query(
      `update bonus_game
          set access_type = 'paid', unlock_price_stars = 4
        where id = $1`,
      [game.id],
    );

    expect((await listBonusGameCards(pool, userId))[0]?.state).toBe('completed');
    expect(
      await purchaseBonusGame(pool, {
        userId,
        gameId: game.id,
        expectedPriceStars: 4,
        now: NOW,
      }),
    ).toEqual({
      unlocked: true,
      starBalance: 10,
    });

    const sideEffects = await pool.query<{ xp: number; unlocks: number; events: number }>(
      `select u.xp::int as xp,
              (select count(*)::int from user_bonus_game_unlock
                where user_id = u.id and bonus_game_id = $2) as unlocks,
              (select count(*)::int from bonus_game_economy_event
                where user_id = u.id and bonus_game_id = $2) as events
         from users u
        where u.id = $1`,
      [userId, game.id],
    );
    expect(sideEffects.rows[0]).toEqual({ xp: 10, unlocks: 0, events: 0 });
  });

  it('marks every active card level locked until the amateur access rule is met', async () => {
    const beginnerId = await createUser({ level: 1, lifetimeGoals: 0 });
    const goalsQualifiedId = await createUser({ level: 1, lifetimeGoals: 300, stars: 1 });
    const game = await createGame({ sortOrder: 1, accessType: 'paid', price: 1 });

    expect((await listBonusGameCards(pool, beginnerId))[0]?.state).toBe('level_locked');
    expect((await listBonusGameCards(pool, goalsQualifiedId))[0]?.state).toBe('purchase_required');
    await expect(
      purchaseBonusGame(pool, {
        userId: beginnerId,
        gameId: game.id,
        expectedPriceStars: 1,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'bonus_level_locked' });
  });

  it('keeps a completion completed after reorder and uses the new active predecessor', async () => {
    const userId = await createUser();
    const completed = await createGame({ sortOrder: 1 });
    const incomplete = await createGame({ sortOrder: 2 });
    await completeGame(userId, completed);

    await pool.query('update bonus_game set sort_order = 99 where id = $1', [completed.id]);
    await pool.query('update bonus_game set sort_order = 1 where id = $1', [incomplete.id]);
    await pool.query('update bonus_game set sort_order = 2 where id = $1', [completed.id]);

    const cards = await listBonusGameCards(pool, userId);

    expect(cards.map((card) => [card.id, card.state])).toEqual([
      [incomplete.id, 'available'],
      [completed.id, 'completed'],
    ]);
  });

  it('surfaces an archived definition only for its snapshotted active attempt', async () => {
    const userId = await createUser();
    const archived = await createGame({ sortOrder: 1 });
    const attemptId = await createAttempt(userId, archived);
    await pool.query(`update bonus_game set status = 'archived', archived_at = $2 where id = $1`, [
      archived.id,
      NOW,
    ]);

    const cards = await listBonusGameCards(pool, userId);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: archived.id,
      state: 'archived',
      active_attempt: { id: attemptId, game_id: archived.id },
    });

    await pool.query(
      `update bonus_game_attempt
          set status = 'abandoned', state = 'closed', closed_at = $2
        where id = $1`,
      [attemptId, NOW],
    );
    expect(await listBonusGameCards(pool, userId)).toEqual([]);
  });

  it('does not write anything when the user cannot afford the unlock', async () => {
    const userId = await createUser({ stars: 1 });
    const paid = await createGame({ sortOrder: 1, accessType: 'paid', price: 2 });

    await expect(
      purchaseBonusGame(pool, { userId, gameId: paid.id, expectedPriceStars: 2, now: NOW }),
    ).rejects.toMatchObject({ code: 'bonus_insufficient_stars' });

    const result = await pool.query<{
      xp: number;
      unlocks: number;
      events: number;
    }>(
      `select u.xp::int as xp,
              (select count(*)::int from user_bonus_game_unlock
                where user_id = u.id) as unlocks,
              (select count(*)::int from bonus_game_economy_event
                where user_id = u.id) as events
         from users u
        where u.id = $1`,
      [userId],
    );
    expect(result.rows[0]).toEqual({ xp: 1, unlocks: 0, events: 0 });
  });

  it('rejects a changed locked price before debit or unlock writes', async () => {
    const userId = await createUser({ stars: 10 });
    const paid = await createGame({ sortOrder: 1, accessType: 'paid', price: 2 });
    const staleConfirmation = {
      userId,
      gameId: paid.id,
      expectedPriceStars: 2,
      now: NOW,
    };
    await pool.query('update bonus_game set unlock_price_stars = 5 where id = $1', [paid.id]);

    await expect(purchaseBonusGame(pool, staleConfirmation)).rejects.toMatchObject({
      code: 'bonus_price_changed',
      statusCode: 409,
    });

    const result = await pool.query<{ xp: number; unlocks: number; events: number }>(
      `select u.xp::int as xp,
              (select count(*)::int from user_bonus_game_unlock
                where user_id = u.id) as unlocks,
              (select count(*)::int from bonus_game_economy_event
                where user_id = u.id) as events
         from users u
        where u.id = $1`,
      [userId],
    );
    expect(result.rows[0]).toEqual({ xp: 10, unlocks: 0, events: 0 });
  });

  it('runs purchase transaction queries sequentially on its PoolClient', async () => {
    const userId = await createUser({ stars: 10 });
    const paid = await createGame({ sortOrder: 1, accessType: 'paid', price: 2 });
    const tracked = trackPoolConnections(pool);

    await purchaseBonusGame(tracked.pool, {
      userId,
      gameId: paid.id,
      expectedPriceStars: 2,
      now: NOW,
    });

    expect(tracked.tracker.maxConcurrentQueries).toBe(1);
  });

  it('debits a paid unlock once under concurrent requests and returns the committed balance', async () => {
    const userId = await createUser({ stars: 10 });
    const paid = await createGame({ sortOrder: 1, accessType: 'paid', price: 1 });

    const results = await Promise.all([
      purchaseBonusGame(pool, { userId, gameId: paid.id, expectedPriceStars: 1, now: NOW }),
      purchaseBonusGame(pool, { userId, gameId: paid.id, expectedPriceStars: 1, now: NOW }),
    ]);

    expect(results).toEqual([
      { unlocked: true, starBalance: 9 },
      { unlocked: true, starBalance: 9 },
    ]);
    const result = await pool.query<{
      xp: number;
      unlocks: number;
      events: number;
      paid_price_stars: number;
      stars_delta: number;
    }>(
      `select u.xp::int as xp,
              count(distinct unlock.id)::int as unlocks,
              count(distinct event.id)::int as events,
              min(unlock.paid_price_stars)::int as paid_price_stars,
              min(event.stars_delta)::int as stars_delta
         from users u
         left join user_bonus_game_unlock unlock on unlock.user_id = u.id
         left join bonus_game_economy_event event on event.user_id = u.id
        where u.id = $1
        group by u.id`,
      [userId],
    );
    expect(result.rows[0]).toEqual({
      xp: 9,
      unlocks: 1,
      events: 1,
      paid_price_stars: 1,
      stars_delta: -1,
    });
  });

  it('keeps a paid unlock idempotent after the catalog price changes', async () => {
    const userId = await createUser({ stars: 10 });
    const paid = await createGame({ sortOrder: 1, accessType: 'paid', price: 2 });

    expect(
      await purchaseBonusGame(pool, {
        userId,
        gameId: paid.id,
        expectedPriceStars: 2,
        now: NOW,
      }),
    ).toEqual({
      unlocked: true,
      starBalance: 8,
    });
    await pool.query('update bonus_game set unlock_price_stars = 7 where id = $1', [paid.id]);
    expect(
      await purchaseBonusGame(pool, {
        userId,
        gameId: paid.id,
        expectedPriceStars: 2,
        now: NOW,
      }),
    ).toEqual({
      unlocked: true,
      starBalance: 8,
    });
  });
});
