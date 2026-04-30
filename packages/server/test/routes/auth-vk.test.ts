import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function mockVkFetch(vkUserId: number, profile = { first_name: 'Vera', last_name: 'Volkova' }) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ user_id: vkUserId, access_token: `vk_at_${vkUserId}`, expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ user: profile }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
}

const baseBody = {
  code: 'code',
  redirectUri: 'http://localhost:5173/auth/vk/callback',
  codeVerifier: 'verifier',
  deviceId: 'device',
  timezone: 'Europe/Moscow',
};

describe.skipIf(!hasIntegrationEnv)('POST /auth/vk', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.end();

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
        TELEGRAM_BOT_TOKEN: '111:test-bot-token',
        VK_APP_ID: '777',
        DAILY_SEED_SECRET: 'daily-seed-secret-at-least-16!!',
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await app.pg.query(
      'truncate users, auth_providers, user_wallet, user_equipment, user_sticks restart identity cascade',
    );
    await app.redis.flushdb();
    vi.restoreAllMocks();
  });

  it('creates a brand new VK user', async () => {
    mockVkFetch(1001, {
      first_name: 'Vera',
      last_name: 'Volkova',
      avatar: 'vk.png',
      screen_name: 'vera',
    });

    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { id: string; displayName: string }; accessToken: string };
    expect(body.user.displayName).toBe('Vera Volkova');
    expect(body.accessToken.split('.')).toHaveLength(3);

    const db = await app.pg.query(
      `select u.display_source, u.vk_first_name, u.vk_avatar_url, ap.provider_uid
         from users u
         join auth_providers ap on ap.user_id = u.id
        where u.id = $1`,
      [body.user.id],
    );
    expect(db.rows[0]).toMatchObject({
      display_source: 'vk',
      vk_first_name: 'Vera',
      vk_avatar_url: 'vk.png',
      provider_uid: '1001',
    });
  });

  it('logs in an existing VK user and refreshes VK profile fields', async () => {
    mockVkFetch(2002, { first_name: 'Old', last_name: 'Name' });
    const first = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    const firstBody = first.json() as { user: { id: string } };

    vi.restoreAllMocks();
    mockVkFetch(2002, { first_name: 'New', last_name: 'Name' });
    const second = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    const secondBody = second.json() as { user: { id: string; displayName: string } };

    expect(second.statusCode).toBe(200);
    expect(secondBody.user.id).toBe(firstBody.user.id);
    expect(secondBody.user.displayName).toBe('New Name');
  });

  it('links an unclaimed VK identity to the current Bearer user', async () => {
    const tgUser = await findOrCreateTelegramUser(app.pg, {
      providerUid: 'tg-1',
      displayName: 'Alice',
      firstName: 'Alice',
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const token = await jwt.issueAccessToken({ sub: tgUser.id });

    mockVkFetch(3003, { first_name: 'Vk', last_name: 'Person' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/vk',
      payload: baseBody,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { user: { id: string; displayName: string } }).user).toMatchObject({
      id: tgUser.id,
      displayName: 'Alice',
    });
    const linked = await app.pg.query(
      "select count(*)::int as n from auth_providers where user_id = $1 and provider = 'vk'",
      [tgUser.id],
    );
    expect(linked.rows[0].n).toBe(1);
  });

  it('moves an already-owned VK identity into the current Telegram user', async () => {
    mockVkFetch(4004, { first_name: 'Owner', avatar: 'old.png' });
    const owner = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(owner.statusCode).toBe(200);
    const ownerBody = owner.json() as { user: { id: string } };

    const other = await findOrCreateTelegramUser(app.pg, {
      providerUid: 'tg-2',
      displayName: 'Other',
      firstName: 'Other',
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const token = await jwt.issueAccessToken({ sub: other.id });

    vi.restoreAllMocks();
    mockVkFetch(4004, { first_name: 'Fresh', avatar: 'fresh.png' });
    const merged = await app.inject({
      method: 'POST',
      url: '/auth/vk',
      payload: baseBody,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(merged.statusCode).toBe(200);
    expect(merged.json()).toMatchObject({
      user: { id: other.id, displayName: 'Other' },
    });
    const targetProviders = await app.pg.query(
      'select provider from auth_providers where user_id=$1 order by provider',
      [other.id],
    );
    expect(targetProviders.rows.map((r: { provider: string }) => r.provider)).toEqual([
      'telegram',
      'vk',
    ]);
    const sourceProviders = await app.pg.query(
      'select provider from auth_providers where user_id=$1',
      [ownerBody.user.id],
    );
    expect(sourceProviders.rowCount).toBe(0);
    const row = await app.pg.query(
      'select display_source, display_name, avatar_url, vk_first_name, vk_avatar_url from users where id=$1',
      [other.id],
    );
    expect(row.rows[0]).toMatchObject({
      display_source: 'telegram',
      display_name: 'Other',
      vk_first_name: 'Fresh',
      vk_avatar_url: 'fresh.png',
    });
  });

  it('returns 409 when owned VK identity is linked from a non-Telegram current user', async () => {
    mockVkFetch(4104, { first_name: 'Owner' });
    const owner = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(owner.statusCode).toBe(200);

    vi.restoreAllMocks();
    mockVkFetch(5105, { first_name: 'Other' });
    const other = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(other.statusCode).toBe(200);
    const otherBody = other.json() as { accessToken: string };

    vi.restoreAllMocks();
    mockVkFetch(4104, { first_name: 'Owner' });
    const conflict = await app.inject({
      method: 'POST',
      url: '/auth/vk',
      payload: baseBody,
      headers: { authorization: `Bearer ${otherBody.accessToken}` },
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: 'conflict', message: 'vk_already_linked' },
    });
  });

  it('returns 401 when VK exchange fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await app.inject({ method: 'POST', url: '/auth/vk', payload: baseBody });
    expect(res.statusCode).toBe(401);
  });
});
