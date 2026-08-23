import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createMediaAccessToken } from '../../src/storage/mediaAccess.js';
import type { BonusPeriodRule } from '../../src/bonusGames/types.js';
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

const JWT_SECRET = 'bonus-admin-access-secret';
const REFRESH_SECRET = 'bonus-admin-refresh-secret';
const ADMIN_TG_ID = '432014500';

const PERIODS: BonusPeriodRule[] = [
  {
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
  },
];

interface AdminGameDto {
  id: string;
  slug: string;
  sortOrder: number;
  status: 'draft' | 'active' | 'archived';
  rewardStars: number;
  revision: number;
  arena: { id: string; artworkUrl: string; thumbnailUrl: string };
}

describe.skipIf(!hasIntegrationEnv)('/admin/bonus-games', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminHeaders: { authorization: string };
  let playerHeaders: { authorization: string };
  let playerId: string;
  let sequence = 0;
  const storageFetch = vi.fn<typeof fetch>();

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();

    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    vi.stubGlobal('fetch', storageFetch);
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
        DAILY_SEED_SECRET: 'bonus-admin-seed-secret-at-least-16',
        OBJECT_STORAGE_ENDPOINT: 'https://storage.example.test',
        OBJECT_STORAGE_REGION: 'test-region',
        OBJECT_STORAGE_BUCKET: 'hockey-test',
        OBJECT_STORAGE_TENANT_ID: 'tenant',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'access',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
        OBJECT_STORAGE_MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await pool.query('truncate users, arena_theme, media_objects restart identity cascade');
    sequence = 0;
    storageFetch.mockReset();
    storageFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: ADMIN_TG_ID,
      displayName: 'Bonus Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'bonus-admin-player',
      displayName: 'Bonus Player',
      timezone: 'Europe/Moscow',
    });
    playerId = player.id;
    await pool.query('update users set level = 10 where id = $1', [playerId]);

    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminHeaders = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: admin.id })}`,
    };
    playerHeaders = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: player.id })}`,
    };
  });

  function gamePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    sequence += 1;
    const slug = `admin-game-${sequence}`;
    return {
      slug,
      title: `Игра ${sequence}`,
      description: `Описание ${sequence}`,
      sortOrder: sequence,
      status: 'draft',
      accessType: 'free',
      unlockPriceStars: 0,
      targetGoals: 18,
      totalPeriods: 1,
      breakDurationMs: 30_000,
      periods: PERIODS,
      rewardCoins: 100,
      rewardStars: 1,
      rewardExperience: 50,
      arena: {
        slug: `${slug}-arena`,
        title: `Арена ${sequence}`,
        artworkUrl: '',
        thumbnailUrl: '',
      },
      goalkeeperReadyUrl: '',
      goalkeeperSaveUrl: '',
      ...overrides,
    };
  }

  async function createGame(overrides: Record<string, unknown> = {}): Promise<AdminGameDto> {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games',
      headers: adminHeaders,
      payload: gamePayload(overrides),
    });
    expect(response.statusCode, response.body).toBe(201);
    return (response.json() as { game: AdminGameDto }).game;
  }

  async function patchGame(
    gameId: string,
    payload: Record<string, unknown>,
  ): Promise<AdminGameDto> {
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/bonus-games/${gameId}`,
      headers: adminHeaders,
      payload,
    });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json() as { game: AdminGameDto }).game;
  }

  it('requires an admin for all six endpoints', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const requests = [
      { method: 'GET', url: '/admin/bonus-games' },
      { method: 'POST', url: '/admin/bonus-games', payload: {} },
      { method: 'PATCH', url: `/admin/bonus-games/${id}`, payload: {} },
      { method: 'DELETE', url: `/admin/bonus-games/${id}` },
      { method: 'POST', url: '/admin/bonus-games/reorder', payload: { gameIds: [] } },
      {
        method: 'POST',
        url: '/admin/bonus-games/media/arena',
        headers: { 'content-type': 'image/webp' },
        payload: Buffer.from('webp'),
      },
    ];

    for (const request of requests) {
      const anonymous = await app.inject(request);
      expect(anonymous.statusCode, `${request.method} ${request.url}`).toBe(401);

      const denied = await app.inject({
        ...request,
        headers: { ...request.headers, ...playerHeaders },
      });
      expect(denied.statusCode, `${request.method} ${request.url}`).toBe(403);
    }
  });

  it('creates and lists drafts while rejecting unknown input fields', async () => {
    const game = await createGame();
    expect(game).toMatchObject({
      slug: 'admin-game-1',
      sortOrder: 1,
      status: 'draft',
      rewardStars: 1,
      revision: 1,
      arena: { artworkUrl: '', thumbnailUrl: '' },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/admin/bonus-games',
      headers: adminHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ games: [{ id: game.id, slug: game.slug }] });

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games',
      headers: adminHeaders,
      payload: gamePayload({ unexpected: true }),
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('bad_request');
  });

  it('rejects activation with incomplete media or a non-contiguous active order', async () => {
    const incomplete = await createGame();
    const missingMedia = await app.inject({
      method: 'PATCH',
      url: `/admin/bonus-games/${incomplete.id}`,
      headers: adminHeaders,
      payload: { status: 'active' },
    });
    expect(missingMedia.statusCode).toBe(409);
    expect(missingMedia.json().error.code).toBe('bonus_game_incomplete');

    const validMedia = {
      arena: {
        artworkUrl: '/bonus-games/arenas/one.webp',
        thumbnailUrl: '/bonus-games/arenas/one-thumb.webp',
      },
      goalkeeperReadyUrl: '/bonus-games/goalkeepers/one-ready.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/one-save.webp',
    };
    await patchGame(incomplete.id, validMedia);
    await patchGame(incomplete.id, { status: 'active' });

    const gap = await createGame({
      sortOrder: 3,
      arena: {
        slug: 'gap-arena',
        title: 'Gap arena',
        artworkUrl: '/bonus-games/arenas/gap.webp',
        thumbnailUrl: '/bonus-games/arenas/gap-thumb.webp',
      },
      goalkeeperReadyUrl: '/bonus-games/goalkeepers/gap-ready.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/gap-save.webp',
    });
    const invalidOrder = await app.inject({
      method: 'PATCH',
      url: `/admin/bonus-games/${gap.id}`,
      headers: adminHeaders,
      payload: { status: 'active' },
    });
    expect(invalidOrder.statusCode).toBe(409);
    expect(invalidOrder.json().error.code).toBe('bonus_game_incomplete');
  });

  it('rejects unsafe media schemes during activation', async () => {
    const game = await createGame({
      arena: {
        slug: 'unsafe-arena',
        title: 'Unsafe arena',
        artworkUrl: '/bonus-games/arenas/safe.webp',
        thumbnailUrl: '/bonus-games/arenas/safe-thumb.webp',
      },
      goalkeeperReadyUrl: 'javascript:keeper.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/safe-save.webp',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/bonus-games/${game.id}`,
      headers: adminHeaders,
      payload: { status: 'active' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('bonus_game_incomplete');
  });

  it('increments revision without changing an active attempt snapshot', async () => {
    const game = await createGame({
      status: 'active',
      arena: {
        slug: 'snapshot-arena',
        title: 'Snapshot arena',
        artworkUrl: '/bonus-games/arenas/snapshot.webp',
        thumbnailUrl: '/bonus-games/arenas/snapshot-thumb.webp',
      },
      goalkeeperReadyUrl: '/bonus-games/goalkeepers/snapshot-ready.webp',
      goalkeeperSaveUrl: '/bonus-games/goalkeepers/snapshot-save.webp',
    });
    const start = await app.inject({
      method: 'POST',
      url: `/bonus-games/${game.id}/attempts`,
      headers: playerHeaders,
    });
    expect(start.statusCode, start.body).toBe(201);
    const attemptId = (start.json() as { attempt: { id: string } }).attempt.id;

    const updated = await patchGame(game.id, { rewardStars: 9 });
    expect(updated.revision).toBe(2);
    expect(updated.rewardStars).toBe(9);

    const attempt = await pool.query<{
      definition_revision: number;
      reward_snapshot: { stars: number };
    }>('select definition_revision, reward_snapshot from bonus_game_attempt where id = $1', [
      attemptId,
    ]);
    expect(attempt.rows[0]).toMatchObject({
      definition_revision: 1,
      reward_snapshot: { stars: 1 },
    });
  });

  it('reorders the exact active set atomically and compacts order on archive', async () => {
    const media = (name: string) => ({
      arena: {
        slug: `${name}-arena`,
        title: `${name} arena`,
        artworkUrl: `/bonus-games/arenas/${name}.webp`,
        thumbnailUrl: `/bonus-games/arenas/${name}-thumb.webp`,
      },
      goalkeeperReadyUrl: `/bonus-games/goalkeepers/${name}-ready.webp`,
      goalkeeperSaveUrl: `/bonus-games/goalkeepers/${name}-save.webp`,
    });
    const one = await createGame({ status: 'active', ...media('one') });
    const two = await createGame({ status: 'active', ...media('two') });
    const three = await createGame({ status: 'active', ...media('three') });

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/reorder',
      headers: adminHeaders,
      payload: { gameIds: [three.id, one.id] },
    });
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json().error.code).toBe('bonus_game_order_invalid');

    const unchanged = await pool.query<{ id: string; sort_order: number }>(
      `select id, sort_order from bonus_game where status = 'active' order by sort_order`,
    );
    expect(unchanged.rows.map((row) => [row.id, row.sort_order])).toEqual([
      [one.id, 1],
      [two.id, 2],
      [three.id, 3],
    ]);

    const reordered = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/reorder',
      headers: adminHeaders,
      payload: { gameIds: [three.id, one.id, two.id] },
    });
    expect(reordered.statusCode, reordered.body).toBe(200);
    expect(
      (reordered.json() as { games: AdminGameDto[] }).games
        .filter((game) => game.status === 'active')
        .map((game) => [game.id, game.sortOrder]),
    ).toEqual([
      [three.id, 1],
      [one.id, 2],
      [two.id, 3],
    ]);

    const archived = await app.inject({
      method: 'DELETE',
      url: `/admin/bonus-games/${one.id}`,
      headers: adminHeaders,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ game: { id: one.id, status: 'archived' } });

    const active = await pool.query<{ id: string; sort_order: number }>(
      `select id, sort_order from bonus_game where status = 'active' order by sort_order`,
    );
    expect(active.rows.map((row) => [row.id, row.sort_order])).toEqual([
      [three.id, 1],
      [two.id, 2],
    ]);
  });

  it('stores non-empty WebP media and returns a signed proxy URL', async () => {
    const body = Buffer.from('non-empty-webp');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/media/goalkeeper_ready',
      headers: {
        ...adminHeaders,
        'content-type': 'image/webp',
        'x-file-name': 'keeper-ready.webp',
      },
      payload: body,
    });
    expect(response.statusCode, response.body).toBe(201);
    const media = (
      response.json() as {
        media: { id: string; url: string; kind: string; contentType: string; size: number };
      }
    ).media;
    expect(media).toMatchObject({
      kind: 'goalkeeper_ready',
      contentType: 'image/webp',
      size: body.byteLength,
    });
    expect(media.url).toBe(
      `/api/media/${media.id}?t=${encodeURIComponent(createMediaAccessToken(JWT_SECRET, media.id))}`,
    );

    const stored = await pool.query<{
      purpose: string;
      object_key: string;
      content_type: string;
      size_bytes: number;
      original_name: string;
    }>('select purpose, object_key, content_type, size_bytes, original_name from media_objects');
    expect(stored.rows[0]).toMatchObject({
      purpose: 'bonus_game_media',
      content_type: 'image/webp',
      size_bytes: body.byteLength,
      original_name: 'keeper-ready.webp',
    });
    expect(stored.rows[0]?.object_key).toContain('bonus-games/goalkeeper-ready/');
  });

  it('rejects empty or non-WebP uploads and leaves no row after storage failure', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/media/arena',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: Buffer.alloc(0),
    });
    expect(empty.statusCode).toBe(400);

    const png = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/media/thumbnail',
      headers: { ...adminHeaders, 'content-type': 'image/png' },
      payload: Buffer.from('png'),
    });
    expect(png.statusCode).toBe(415);

    storageFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failed = await app.inject({
      method: 'POST',
      url: '/admin/bonus-games/media/goalkeeper_save',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: Buffer.from('webp'),
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('storage_upload_failed');

    const count = await pool.query<{ count: string }>(
      `select count(*) from media_objects where purpose = 'bonus_game_media'`,
    );
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it('deletes the uploaded object when the media row cannot be committed', async () => {
    await pool.query(`
      create function reject_bonus_media_insert() returns trigger language plpgsql as $$
      begin
        if new.purpose = 'bonus_game_media' then
          raise exception 'forced media insert failure';
        end if;
        return new;
      end
      $$;
      create trigger reject_bonus_media_insert
        before insert on media_objects
        for each row execute function reject_bonus_media_insert();
    `);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/bonus-games/media/arena',
        headers: { ...adminHeaders, 'content-type': 'image/webp' },
        payload: Buffer.from('webp'),
      });
      expect(response.statusCode).toBe(500);

      const methods = storageFetch.mock.calls.map(([, init]) => init?.method);
      expect(methods).toEqual(['PUT', 'DELETE']);
      const count = await pool.query<{ count: string }>(
        `select count(*) from media_objects where purpose = 'bonus_game_media'`,
      );
      expect(Number(count.rows[0]?.count)).toBe(0);
    } finally {
      await pool.query(`
        drop trigger if exists reject_bonus_media_insert on media_objects;
        drop function if exists reject_bonus_media_insert();
      `);
    }
  });
});
