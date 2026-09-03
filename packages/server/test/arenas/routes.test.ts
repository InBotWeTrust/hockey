import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { resolveDuelVenue } from '../../src/arenas/service.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';
import { trackPoolClientQueries } from '../helpers/trackPoolClientConcurrency.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';

interface ArenaOptionDTO {
  id: string;
  selection_id: string | null;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}

interface ArenaListResponse {
  arenas: ArenaOptionDTO[];
  selected_arena: ArenaOptionDTO;
}

describe.skipIf(!hasIntegrationEnv)('/me/home-arena*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userId: string;
  let headers: { authorization: string };
  let defaultArenaId: string;
  let arenaSequence: number;

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
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query('truncate arena_theme, users restart identity cascade');
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: 'arena-player-1',
      displayName: 'Arena Player',
      timezone: 'Europe/Moscow',
    });
    userId = user.id;
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    headers = { authorization: `Bearer ${await jwt.issueAccessToken({ sub: userId })}` };
    arenaSequence = 0;
    defaultArenaId = await createArena({ slug: 'default', title: 'По умолчанию' });
  });

  async function createArena({
    slug,
    title,
    status = 'active',
    isSelectable = true,
  }: {
    slug: string;
    title: string;
    status?: 'active' | 'archived';
    isSelectable?: boolean;
  }): Promise<string> {
    const sequence = arenaSequence++;
    const { rows } = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable, created_at, archived_at)
       values ($1, $2, $3, $4, $5, $6,
               timestamptz '2026-01-01 00:00:00+00' + ($7::int * interval '1 second'),
               case when $5 = 'archived' then now() else null end)
       returning id`,
      [
        slug,
        title,
        `/arenas/${slug}.webp`,
        `/arenas/${slug}-thumb.webp`,
        status,
        isSelectable,
        sequence,
      ],
    );
    return rows[0]!.id;
  }

  async function unlockArena(
    arenaThemeId: string,
    slug: string,
    ownerUserId = userId,
  ): Promise<void> {
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, skill_code, description, sort_order, status, access_type,
          unlock_price_stars, target_goals, qualification_rules,
          total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, 'accuracy', '', 1, 'draft', 'free', 0, 1,
               '{"type":"goals_from_shots","targetGoals":1,"shotsLimit":1}'::jsonb,
               1, 0, '[]'::jsonb,
               0, 0, 0, $3, '/goalies/ready.webp', '/goalies/save.webp')
       returning id`,
      [`game-${slug}`, `Game ${slug}`, arenaThemeId],
    );
    const arena = await pool.query<{
      id: string;
      slug: string;
      title: string;
      artwork_url: string;
      thumbnail_url: string;
    }>('select id, slug, title, artwork_url, thumbnail_url from arena_theme where id = $1', [
      arenaThemeId,
    ]);
    const snapshot = {
      id: arena.rows[0]!.id,
      slug: arena.rows[0]!.slug,
      title: arena.rows[0]!.title,
      artworkUrl: arena.rows[0]!.artwork_url,
      thumbnailUrl: arena.rows[0]!.thumbnail_url,
    };
    const attempt = await pool.query<{ id: string }>(
      `insert into bonus_game_attempt
         (user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, 'completed', 'closed', 1, now(), $3, 1, 1, $4, $5, $6, $7,
               '/goalies/ready.webp', '/goalies/save.webp')
       returning id`,
      [
        ownerUserId,
        game.rows[0]!.id,
        `attempt-${slug}`,
        JSON.stringify({
          gameId: game.rows[0]!.id,
          slug: `game-${slug}`,
          title: `Game ${slug}`,
          revision: 1,
          targetGoals: 1,
          totalPeriods: 1,
          breakDurationMs: 0,
          periods: [],
          goalkeeperReadyUrl: '/goalies/ready.webp',
          goalkeeperSaveUrl: '/goalies/save.webp',
          arena: snapshot,
        }),
        JSON.stringify({ coins: 0, stars: 0, experience: 0 }),
        arenaThemeId,
        JSON.stringify(snapshot),
      ],
    );
    const completion = await pool.query<{ id: string }>(
      `insert into user_bonus_game_completion
         (user_id, bonus_game_id, attempt_id, reward_snapshot)
       values ($1, $2, $3, $4)
       returning id`,
      [
        ownerUserId,
        game.rows[0]!.id,
        attempt.rows[0]!.id,
        JSON.stringify({ coins: 0, stars: 0, experience: 0 }),
      ],
    );
    await pool.query(
      `insert into user_arena_unlock
         (user_id, arena_theme_id, source_bonus_game_id, source_completion_id)
       values ($1, $2, $3, $4)`,
      [ownerUserId, arenaThemeId, game.rows[0]!.id, completion.rows[0]!.id],
    );
  }

  async function createOpponent(): Promise<string> {
    const opponent = await findOrCreateTelegramUser(pool, {
      providerUid: 'arena-player-2',
      displayName: 'Arena Opponent',
      timezone: 'Europe/Moscow',
    });
    return opponent.id;
  }

  async function setOwnedSelection(
    ownerUserId: string,
    arenaThemeId: string,
    slug: string,
  ): Promise<void> {
    await unlockArena(arenaThemeId, slug, ownerUserId);
    await pool.query('update users set home_arena_theme_id = $1 where id = $2', [
      arenaThemeId,
      ownerUserId,
    ]);
  }

  async function resolveVenue(
    input: Parameters<typeof resolveDuelVenue>[1],
  ): ReturnType<typeof resolveDuelVenue> {
    const client = await pool.connect();
    try {
      return await resolveDuelVenue(client, input);
    } finally {
      client.release();
    }
  }

  it('requires authentication for listing and selection', async () => {
    const list = await app.inject({ method: 'GET', url: '/me/home-arenas' });
    const select = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      payload: { arena_theme_id: null },
    });

    expect(list.statusCode).toBe(401);
    expect(select.statusCode).toBe(401);
  });

  it('lists default plus earned arenas and rejects an unowned selection', async () => {
    const beachArenaId = await createArena({ slug: 'beach', title: 'Пляж' });
    const unownedArenaId = await createArena({ slug: 'space', title: 'Космос' });
    await unlockArena(beachArenaId, 'beach');

    const list = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });
    expect(list.statusCode).toBe(200);
    const body = list.json() as ArenaListResponse;
    expect(body.arenas.map((arena) => arena.slug)).toEqual(['default', 'beach']);
    expect(body.arenas[0]).toEqual({
      id: defaultArenaId,
      selection_id: null,
      slug: 'default',
      title: 'По умолчанию',
      artwork_url: '/arenas/default.webp',
      thumbnail_url: '/arenas/default-thumb.webp',
    });
    expect(body.arenas[1]!.selection_id).toBe(beachArenaId);
    expect(body.selected_arena.selection_id).toBeNull();

    const denied = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: unownedArenaId },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('arena_not_owned');

    const selected = await pool.query<{ home_arena_theme_id: string | null }>(
      'select home_arena_theme_id from users where id = $1',
      [userId],
    );
    expect(selected.rows[0]!.home_arena_theme_id).toBeNull();
  });

  it('selects an owned arena and resets null to the stable standard arena', async () => {
    const beachArenaId = await createArena({ slug: 'beach', title: 'Пляж' });
    await unlockArena(beachArenaId, 'beach');

    const selected = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: beachArenaId },
    });
    expect(selected.statusCode).toBe(200);
    expect((selected.json() as ArenaListResponse).selected_arena).toMatchObject({
      id: beachArenaId,
      selection_id: beachArenaId,
      slug: 'beach',
    });

    const listed = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });
    expect((listed.json() as ArenaListResponse).selected_arena.slug).toBe('beach');

    const reset = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: null },
    });
    expect(reset.statusCode).toBe(200);
    expect((reset.json() as ArenaListResponse).selected_arena).toMatchObject({
      id: defaultArenaId,
      selection_id: null,
      slug: 'default',
    });
  });

  it('keeps an archived but selectable earned arena available', async () => {
    const retroArenaId = await createArena({
      slug: 'retro',
      title: 'Ретро',
      status: 'archived',
    });
    await unlockArena(retroArenaId, 'retro');

    const selected = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: retroArenaId },
    });
    expect(selected.statusCode).toBe(200);
    expect((selected.json() as ArenaListResponse).selected_arena.slug).toBe('retro');

    const listed = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });
    expect((listed.json() as ArenaListResponse).arenas.map((arena) => arena.slug)).toEqual([
      'default',
      'retro',
    ]);
  });

  it('rejects and hides a disabled earned arena without changing selection', async () => {
    const disabledArenaId = await createArena({
      slug: 'unsafe',
      title: 'Недоступная',
      isSelectable: false,
    });
    await unlockArena(disabledArenaId, 'unsafe');

    const denied = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: disabledArenaId },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json().error.code).toBe('arena_not_selectable');

    const listed = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });
    const body = listed.json() as ArenaListResponse;
    expect(body.arenas.map((arena) => arena.slug)).toEqual(['default']);
    expect(body.selected_arena.slug).toBe('default');
    const stored = await pool.query<{ home_arena_theme_id: string | null }>(
      'select home_arena_theme_id from users where id = $1',
      [userId],
    );
    expect(stored.rows[0]!.home_arena_theme_id).toBeNull();
  });

  it('rejects malformed selection input with a stable safe error', async () => {
    const denied = await app.inject({
      method: 'PATCH',
      url: '/me/home-arena',
      headers,
      payload: { arena_theme_id: 'not-a-uuid' },
    });

    expect(denied.statusCode).toBe(400);
    expect(denied.json().error.code).toBe('bad_request');
  });

  it('reports a safe unavailable error instead of inventing a missing default arena', async () => {
    await pool.query("delete from arena_theme where slug = 'default'");

    const response = await app.inject({ method: 'GET', url: '/me/home-arenas', headers });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('arena_unavailable');
    const catalog = await pool.query<{ count: string }>('select count(*) from arena_theme');
    expect(catalog.rows[0]!.count).toBe('0');
  });

  it('uses the challenger effective home arena for a direct challenge', async () => {
    const opponentUserId = await createOpponent();
    const beachArenaId = await createArena({ slug: 'beach', title: 'Пляж' });
    await setOwnedSelection(userId, beachArenaId, 'beach');

    const venue = await resolveVenue({
      source: 'challenge',
      policy: 'random_unselected',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.99,
    });

    expect(venue).toMatchObject({
      policy: 'direct_challenge',
      homeUserId: userId,
      arenaThemeId: beachArenaId,
      arena: { slug: 'beach' },
    });
  });

  it('uses the stable standard arena for neutral matchmaking', async () => {
    const opponentUserId = await createOpponent();

    const venue = await resolveVenue({
      source: 'matchmaking',
      policy: 'neutral_default',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.5,
    });

    expect(venue).toMatchObject({
      policy: 'neutral_default',
      homeUserId: null,
      arenaThemeId: defaultArenaId,
      arena: { slug: 'default' },
    });
  });

  it('uses the effective arena of the server-chosen matchmaking participant', async () => {
    const opponentUserId = await createOpponent();
    const beachArenaId = await createArena({ slug: 'beach', title: 'Пляж' });
    const iceArenaId = await createArena({ slug: 'ice', title: 'Лёд' });
    await setOwnedSelection(userId, beachArenaId, 'beach');
    await setOwnedSelection(opponentUserId, iceArenaId, 'ice');

    const venue = await resolveVenue({
      source: 'matchmaking',
      policy: 'random_participant_home',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.99,
    });

    expect(venue).toMatchObject({
      policy: 'random_participant_home',
      homeUserId: opponentUserId,
      arenaThemeId: iceArenaId,
      arena: { slug: 'ice' },
    });
  });

  it('chooses only active arenas unselected by both matchmaking participants', async () => {
    const opponentUserId = await createOpponent();
    const beachArenaId = await createArena({ slug: 'beach', title: 'Пляж' });
    const iceArenaId = await createArena({ slug: 'ice', title: 'Лёд' });
    const neutralArenaId = await createArena({ slug: 'neutral', title: 'Нейтральная' });
    await createArena({ slug: 'archived-neutral', title: 'Архив', status: 'archived' });
    await setOwnedSelection(userId, beachArenaId, 'beach');
    await setOwnedSelection(opponentUserId, iceArenaId, 'ice');

    const venue = await resolveVenue({
      source: 'matchmaking',
      policy: 'random_unselected',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.5,
    });

    expect(venue).toMatchObject({
      policy: 'random_unselected',
      homeUserId: null,
      arenaThemeId: neutralArenaId,
      arena: { slug: 'neutral' },
    });
  });

  it('resolves both participant arenas sequentially on one PoolClient', async () => {
    const opponentUserId = await createOpponent();
    const client = await pool.connect();
    const tracked = trackPoolClientQueries(client);
    try {
      await resolveDuelVenue(tracked.client, {
        source: 'matchmaking',
        policy: 'random_unselected',
        challengerUserId: userId,
        opponentUserId,
        randomUnit: 0.5,
      });
    } finally {
      tracked.client.release();
    }

    expect(tracked.tracker.maxConcurrentQueries).toBe(1);
  });

  it('excludes archived themes from random-unselected matchmaking', async () => {
    const opponentUserId = await createOpponent();
    const neutralArenaId = await createArena({ slug: 'neutral', title: 'Нейтральная' });
    await createArena({ slug: 'archived-neutral', title: 'Архив', status: 'archived' });

    const venue = await resolveVenue({
      source: 'matchmaking',
      policy: 'random_unselected',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.99,
    });

    expect(venue).toMatchObject({
      policy: 'random_unselected',
      homeUserId: null,
      arenaThemeId: neutralArenaId,
      arena: { slug: 'neutral' },
    });
  });

  it('falls back to the standard arena when random-unselected has no candidates', async () => {
    const opponentUserId = await createOpponent();

    const venue = await resolveVenue({
      source: 'matchmaking',
      policy: 'random_unselected',
      challengerUserId: userId,
      opponentUserId,
      randomUnit: 0.42,
    });

    expect(venue).toMatchObject({
      policy: 'random_unselected',
      homeUserId: null,
      arenaThemeId: defaultArenaId,
      arena: { slug: 'default' },
    });
  });
});
