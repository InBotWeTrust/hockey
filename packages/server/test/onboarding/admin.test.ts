import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { buildApp } from '../../src/app.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createMediaAccessToken } from '../../src/storage/mediaAccess.js';
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
const JWT_SECRET = 'onboarding-admin-access-secret';
const REFRESH_SECRET = 'onboarding-admin-refresh-secret';

type ChainKey = 'beginner' | 'amateur';

interface AdminStep {
  id: string;
  position: number;
  kind: 'informational' | 'tutorial_shot';
  title: string;
  mediaObjectId?: string;
}

interface AdminVersion {
  id: string;
  status: 'draft' | 'published';
  steps: AdminStep[];
}

interface AdminChain {
  chainKey: ChainKey;
  enforcementEnabled: boolean;
  published: AdminVersion | null;
  draft: AdminVersion | null;
  publishedVersions: Array<{ id: string; versionNumber: number; publishedAt: string }>;
}

function validWebpBytes(): Buffer {
  return Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQkTIUp/+BiOh/AAA=', 'base64');
}

async function webpBytes(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 80 },
    },
  })
    .webp({ lossless: true })
    .toBuffer();
}

const tutorialInput = {
  kind: 'tutorial_shot' as const,
  title: 'Первый бросок',
  description: 'Поймай момент и забей первую шайбу.',
  ctaLabel: 'Бросить',
  tutorial: {
    shooterFrequency: 0.5,
    goalieFrequency: 0.6,
    goalFrequency: 0.7,
  },
};

describe.skipIf(!hasIntegrationEnv)('/admin/onboarding', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let adminId: string;
  let adminHeaders: { authorization: string };
  let playerHeaders: { authorization: string };
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
        DAILY_SEED_SECRET: 'onboarding-admin-seed-at-least-16',
        OBJECT_STORAGE_ENDPOINT: 'https://storage.example.test',
        OBJECT_STORAGE_REGION: 'test-region',
        OBJECT_STORAGE_BUCKET: 'hockey-test',
        OBJECT_STORAGE_TENANT_ID: 'tenant',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'access',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
        OBJECT_STORAGE_MAX_UPLOAD_BYTES: 256,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  afterAll(async () => {
    if (app !== undefined) await app.close();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await pool.query('truncate onboarding_chain, users, media_objects restart identity cascade');
    await pool.query(
      `insert into onboarding_chain (key, enforcement_enabled)
       values ('beginner', false), ('amateur', false)`,
    );
    storageFetch.mockReset();
    storageFetch.mockImplementation(async (_input, init) => {
      if (init?.method === 'GET') {
        return new Response(validWebpBytes(), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        });
      }
      return new Response(null, { status: 200 });
    });

    const admin = await findOrCreateTelegramUser(pool, {
      providerUid: 'onboarding-admin',
      displayName: 'Onboarding Admin',
      timezone: 'Europe/Moscow',
    });
    const player = await findOrCreateTelegramUser(pool, {
      providerUid: 'onboarding-player',
      displayName: 'Onboarding Player',
      timezone: 'Europe/Moscow',
    });
    adminId = admin.id;
    await pool.query(`update users set role = 'admin' where id = $1`, [admin.id]);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    adminHeaders = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: admin.id })}`,
    };
    playerHeaders = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: player.id })}`,
    };
  });

  async function insertMedia(
    purpose: 'onboarding_image' | 'bonus_game_media' = 'onboarding_image',
    overrides: { contentType?: string; size?: number; objectKey?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into media_objects
         (id, owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
       values ($1, $2, $3, $4, $5, $6, $7, 'onboarding.webp')`,
      [
        id,
        adminId,
        purpose,
        overrides.objectKey ?? `onboarding/${id}.webp`,
        `/onboarding/${id}.webp`,
        overrides.contentType ?? 'image/webp',
        overrides.size ?? validWebpBytes().byteLength,
      ],
    );
    return id;
  }

  async function insertVersion(
    chainKey: ChainKey,
    status: 'draft' | 'published',
    steps: Array<
      | { kind: 'informational'; position: number; mediaObjectId: string; title?: string }
      | {
          kind: 'tutorial_shot';
          position: number;
          title?: string;
          tutorial?: Record<string, number>;
        }
    >,
  ): Promise<{ versionId: string; stepIds: string[] }> {
    const version = await pool.query<{ id: string }>(
      `insert into onboarding_version (chain_key, status, created_by, published_at)
       values ($1, $2, $3, case when $2 = 'published' then now() end)
       returning id`,
      [chainKey, status, adminId],
    );
    const versionId = version.rows[0]!.id;
    const stepIds: string[] = [];
    for (const step of steps) {
      const inserted =
        step.kind === 'informational'
          ? await pool.query<{ id: string }>(
              `insert into onboarding_step
                 (version_id, position, kind, title, description, cta_label, media_object_id)
               values ($1, $2, 'informational', $3, 'Описание', 'Продолжить', $4)
               returning id`,
              [versionId, step.position, step.title ?? `Инфо ${step.position}`, step.mediaObjectId],
            )
          : await pool.query<{ id: string }>(
              `insert into onboarding_step
                 (version_id, position, kind, title, description, cta_label, tutorial_config)
               values ($1, $2, 'tutorial_shot', $3, 'Описание', 'Бросить', $4::jsonb)
               returning id`,
              [
                versionId,
                step.position,
                step.title ?? `Туториал ${step.position}`,
                JSON.stringify(step.tutorial ?? tutorialInput.tutorial),
              ],
            );
      stepIds.push(inserted.rows[0]!.id);
    }
    if (status === 'published') {
      await pool.query(
        `update onboarding_chain
            set current_published_version_id = $2
          where key = $1`,
        [chainKey, versionId],
      );
    }
    return { versionId, stepIds };
  }

  function informationInput(mediaObjectId: string, title = 'Добро пожаловать') {
    return {
      kind: 'informational' as const,
      title,
      description: 'Здесь начинается твоя хоккейная история.',
      ctaLabel: 'Продолжить',
      mediaObjectId,
    };
  }

  async function readChain(chainKey: ChainKey): Promise<AdminChain> {
    const response = await app.inject({
      method: 'GET',
      url: `/admin/onboarding/chains/${chainKey}`,
      headers: adminHeaders,
    });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json() as { chain: AdminChain }).chain;
  }

  async function createStep(chainKey: ChainKey, payload: object): Promise<AdminChain> {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/onboarding/chains/${chainKey}/steps`,
      headers: adminHeaders,
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return (response.json() as { chain: AdminChain }).chain;
  }

  it('preserves unauthenticated, non-admin, blocked-user, and admin authorization behavior', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/admin/onboarding/chains/beginner',
    });
    expect(anonymous.statusCode).toBe(401);

    const player = await app.inject({
      method: 'GET',
      url: '/admin/onboarding/chains/beginner',
      headers: playerHeaders,
    });
    expect(player.statusCode).toBe(403);
    expect(player.json().error.code).toBe('forbidden');

    await pool.query('update users set blocked_at = now() where id = $1', [adminId]);
    const blocked = await app.inject({
      method: 'GET',
      url: '/admin/onboarding/chains/beginner',
      headers: adminHeaders,
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.message).toBe('user is blocked');
    await pool.query('update users set blocked_at = null where id = $1', [adminId]);

    expect(await readChain('beginner')).toMatchObject({
      chainKey: 'beginner',
      enforcementEnabled: false,
      published: null,
      draft: null,
    });
  });

  it('lazily clones published content on first edit and never mutates published rows', async () => {
    const mediaObjectId = await insertMedia();
    const published = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId, title: 'Старый заголовок' },
      { kind: 'tutorial_shot', position: 2 },
    ]);
    expect((await readChain('beginner')).draft).toBeNull();

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/onboarding/chains/beginner/steps/${published.stepIds[0]}`,
      headers: adminHeaders,
      payload: informationInput(mediaObjectId, 'Новый заголовок'),
    });
    expect(response.statusCode, response.body).toBe(200);
    const chain = (response.json() as { chain: AdminChain }).chain;
    expect(chain.published).toMatchObject({
      id: published.versionId,
      steps: [{ title: 'Старый заголовок' }, { kind: 'tutorial_shot' }],
    });
    expect(chain.draft).toMatchObject({
      status: 'draft',
      steps: [{ title: 'Новый заголовок' }, { kind: 'tutorial_shot' }],
    });
    expect(chain.draft?.id).not.toBe(published.versionId);
    expect(chain.draft?.steps[0]?.id).not.toBe(published.stepIds[0]);

    const stalePublishedEdit = await app.inject({
      method: 'PATCH',
      url: `/admin/onboarding/chains/beginner/steps/${published.stepIds[0]}`,
      headers: adminHeaders,
      payload: informationInput(mediaObjectId, 'Нельзя изменить'),
    });
    expect(stalePublishedEdit.statusCode).toBe(404);
    const stored = await pool.query<{ title: string }>(
      'select title from onboarding_step where id = $1',
      [published.stepIds[0]],
    );
    expect(stored.rows[0]?.title).toBe('Старый заголовок');
  });

  it('returns every published version newest-first with stable version numbers and current included', async () => {
    const mediaObjectId = await insertMedia();
    const first = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId },
    ]);
    const second = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId },
    ]);
    const third = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId },
    ]);
    await pool.query(
      `update onboarding_version
          set created_at = case id when $1 then '2026-09-01T00:00:00Z'::timestamptz
                                   when $2 then '2026-09-02T00:00:00Z'::timestamptz
                                   when $3 then '2026-09-03T00:00:00Z'::timestamptz end,
              published_at = case id when $1 then '2026-09-01T01:00:00Z'::timestamptz
                                     when $2 then '2026-09-02T01:00:00Z'::timestamptz
                                     when $3 then '2026-09-03T01:00:00Z'::timestamptz end
        where id in ($1, $2, $3)`,
      [first.versionId, second.versionId, third.versionId],
    );

    const chain = await readChain('beginner');
    expect(chain.published?.id).toBe(third.versionId);
    expect(chain.publishedVersions).toEqual([
      { id: third.versionId, versionNumber: 3, publishedAt: '2026-09-03T01:00:00.000Z' },
      { id: second.versionId, versionNumber: 2, publishedAt: '2026-09-02T01:00:00.000Z' },
      { id: first.versionId, versionNumber: 1, publishedAt: '2026-09-01T01:00:00.000Z' },
    ]);
  });

  it('creates, validates, duplicates, updates, and deletes draft steps with full read-back', async () => {
    const mediaObjectId = await insertMedia();
    let chain = await createStep('beginner', informationInput(mediaObjectId));
    chain = await createStep('beginner', tutorialInput);
    expect(chain.draft?.steps).toMatchObject([
      { position: 1, kind: 'informational' },
      { position: 2, kind: 'tutorial_shot' },
    ]);

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/beginner/steps',
      headers: adminHeaders,
      payload: {
        ...tutorialInput,
        tutorial: { ...tutorialInput.tutorial, goalieFrequency: 2.01 },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect((await readChain('beginner')).draft?.steps).toHaveLength(2);

    const informationId = chain.draft!.steps[0]!.id;
    const duplicate = await app.inject({
      method: 'POST',
      url: `/admin/onboarding/chains/beginner/steps/${informationId}/duplicate`,
      headers: adminHeaders,
    });
    expect(duplicate.statusCode, duplicate.body).toBe(201);
    chain = (duplicate.json() as { chain: AdminChain }).chain;
    expect(chain.draft?.steps.map((step) => [step.position, step.kind])).toEqual([
      [1, 'informational'],
      [2, 'informational'],
      [3, 'tutorial_shot'],
    ]);

    const duplicateId = chain.draft!.steps[1]!.id;
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/admin/onboarding/chains/beginner/steps/${duplicateId}`,
      headers: adminHeaders,
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect((deleted.json() as { chain: AdminChain }).chain.draft?.steps).toMatchObject([
      { position: 1, kind: 'informational' },
      { position: 2, kind: 'tutorial_shot' },
    ]);
  });

  it('reorders every current draft step exactly once and rejects stale or duplicate lists', async () => {
    const media = await insertMedia();
    let chain = await createStep('amateur', informationInput(media, 'Один'));
    chain = await createStep('amateur', informationInput(media, 'Два'));
    chain = await createStep('amateur', informationInput(media, 'Три'));
    const ids = chain.draft!.steps.map((step) => step.id);

    const reordered = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/amateur/reorder',
      headers: adminHeaders,
      payload: { stepIds: [ids[2], ids[0], ids[1]] },
    });
    expect(reordered.statusCode, reordered.body).toBe(200);
    expect(
      (reordered.json() as { chain: AdminChain }).chain.draft?.steps.map((step) => [
        step.position,
        step.title,
      ]),
    ).toEqual([
      [1, 'Три'],
      [2, 'Один'],
      [3, 'Два'],
    ]);

    for (const stepIds of [ids.slice(0, 2), [ids[0], ids[0], ids[2]]]) {
      const invalid = await app.inject({
        method: 'POST',
        url: '/admin/onboarding/chains/amateur/reorder',
        headers: adminHeaders,
        payload: { stepIds },
      });
      expect(invalid.statusCode).toBe(409);
      expect(invalid.json().error.code).toBe('onboarding_order_invalid');
    }
  });

  it('lazily clones and reorders published step ids when reorder is the first edit', async () => {
    const media = await insertMedia();
    const published = await insertVersion('amateur', 'published', [
      { kind: 'informational', position: 1, mediaObjectId: media, title: 'Один' },
      { kind: 'informational', position: 2, mediaObjectId: media, title: 'Два' },
      { kind: 'informational', position: 3, mediaObjectId: media, title: 'Три' },
    ]);

    const reordered = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/amateur/reorder',
      headers: adminHeaders,
      payload: {
        stepIds: [published.stepIds[2], published.stepIds[0], published.stepIds[1]],
      },
    });

    expect(reordered.statusCode, reordered.body).toBe(200);
    const chain = (reordered.json() as { chain: AdminChain }).chain;
    expect(chain.published?.steps.map((step) => step.title)).toEqual(['Один', 'Два', 'Три']);
    expect(chain.draft?.steps.map((step) => step.title)).toEqual(['Три', 'Один', 'Два']);
  });

  it('accepts valid 2:3 onboarding image dimensions and persists the protected proxy URL', async () => {
    const body = await webpBytes(800, 1200);
    const uploaded = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: {
        ...adminHeaders,
        'content-type': 'image/webp',
        'x-file-name': 'welcome.webp',
      },
      payload: body,
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const media = (
      uploaded.json() as {
        media: { id: string; url: string; contentType: string; size: number };
      }
    ).media;
    expect(media).toMatchObject({ contentType: 'image/webp', size: body.byteLength });
    expect(media.url).toBe(
      `/api/media/${media.id}?t=${encodeURIComponent(createMediaAccessToken(JWT_SECRET, media.id))}`,
    );
    const stored = await pool.query<{
      purpose: string;
      object_key: string;
      original_name: string;
    }>('select purpose, object_key, original_name from media_objects where id = $1', [media.id]);
    expect(stored.rows[0]).toMatchObject({
      purpose: 'onboarding_image',
      original_name: 'welcome.webp',
    });
    expect(stored.rows[0]?.object_key).toMatch(/^onboarding\//);

    const empty = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: Buffer.alloc(0),
    });
    expect(empty.statusCode).toBe(400);
    const wrongType = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/png' },
      payload: body,
    });
    expect(wrongType.statusCode).toBe(415);
    const oversized = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: Buffer.alloc(257),
    });
    expect(oversized.statusCode).toBe(413);
  });

  it('rejects WebP uploads below the minimum onboarding image dimensions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: await webpBytes(1, 1),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toEqual({
      code: 'invalid_image_dimensions',
      message: 'onboarding image must be portrait 2:3 and at least 800x1200 pixels',
    });
  });

  it('rejects onboarding image dimensions with the wrong aspect ratio', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: await webpBytes(1200, 1200),
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toEqual({
      code: 'invalid_image_dimensions',
      message: 'onboarding image must be portrait 2:3 and at least 800x1200 pixels',
    });
  });

  it('leaves no media row when object storage rejects an upload', async () => {
    storageFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const response = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/media',
      headers: { ...adminHeaders, 'content-type': 'image/webp' },
      payload: await webpBytes(800, 1200),
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('storage_upload_failed');
    const count = await pool.query<{ count: string }>(
      `select count(*) from media_objects where purpose = 'onboarding_image'`,
    );
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it('returns a public-shaped preview and runs tutorial shots with preview source only', async () => {
    const media = await insertMedia();
    let chain = await createStep('beginner', informationInput(media));
    chain = await createStep('beginner', tutorialInput);

    const preview = await app.inject({
      method: 'GET',
      url: '/admin/onboarding/chains/beginner/preview',
      headers: adminHeaders,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({
      preview: true,
      chain: 'beginner',
      versionId: chain.draft!.id,
      steps: [
        { kind: 'informational', imageUrl: expect.stringMatching(/^\/api\/media\//) },
        { kind: 'tutorial_shot', tutorial: tutorialInput.tutorial },
      ],
    });
    expect(preview.json().steps[0]).not.toHaveProperty('mediaObjectId');

    const started = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/beginner/preview/tutorial/start',
      headers: adminHeaders,
    });
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({
      runId: expect.any(String),
      shotIndex: 1,
      goalieId: 'rookie',
      speeds: tutorialInput.tutorial,
    });
    const runId = started.json().runId as string;
    const shot = await app.inject({
      method: 'POST',
      url: `/admin/onboarding/preview/runs/${runId}/tutorial/shot`,
      headers: adminHeaders,
      payload: {
        shotIndex: 1,
        input: { tapTime: 0, shooterTapTime: 0 },
        claimedResult: 'goal',
      },
    });
    expect(shot.statusCode, shot.body).toBe(200);
    expect(shot.json()).toMatchObject({
      serverResult: expect.stringMatching(/^(goal|save|miss)$/),
      nextShotIndex: 2,
      goalConfirmed: expect.any(Boolean),
    });
    const resumed = await app.inject({
      method: 'POST',
      url: `/admin/onboarding/preview/runs/${runId}/tutorial/resume`,
      headers: adminHeaders,
    });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json()).toMatchObject({
      shotIndex: 2,
      goalieId: 'rookie',
      speeds: tutorialInput.tutorial,
    });
    const previewRuns = await pool.query<{ count: string }>(
      `select count(*) from onboarding_run where id = $1 and source = 'preview'`,
      [runId],
    );
    expect(Number(previewRuns.rows[0]?.count)).toBe(1);
    const otherAdmin = await findOrCreateTelegramUser(pool, {
      providerUid: 'onboarding-other-admin',
      displayName: 'Other Admin',
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set role = 'admin' where id = $1`, [otherAdmin.id]);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const foreignResume = await app.inject({
      method: 'POST',
      url: `/admin/onboarding/preview/runs/${runId}/tutorial/resume`,
      headers: {
        authorization: `Bearer ${await jwt.issueAccessToken({ sub: otherAdmin.id })}`,
      },
    });
    expect(foreignResume.statusCode).toBe(404);
    const stored = await pool.query<{
      source: string;
      version_id: string;
      beginner_onboarding_completed: boolean;
      amateur_onboarding_completed: boolean;
    }>(
      `select run.source, run.version_id,
              users.beginner_onboarding_completed, users.amateur_onboarding_completed
         from onboarding_run run
         join users on users.id = run.user_id
        where run.id = $1`,
      [runId],
    );
    expect(stored.rows[0]).toEqual({
      source: 'preview',
      version_id: chain.draft!.id,
      beginner_onboarding_completed: false,
      amateur_onboarding_completed: false,
    });
  });

  it('returns safe step-specific publication issues for every invalid media reference', async () => {
    const wrongPurpose = await insertMedia('bonus_game_media');
    const wrongType = await insertMedia('onboarding_image', { contentType: 'image/png' });
    const draft = await insertVersion('beginner', 'draft', [
      { kind: 'informational', position: 1, mediaObjectId: wrongPurpose, title: 'Первый' },
      { kind: 'informational', position: 2, mediaObjectId: wrongType, title: 'Второй' },
      { kind: 'tutorial_shot', position: 3 },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/beginner/publish',
      headers: adminHeaders,
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json().error).toMatchObject({
      code: 'onboarding_publish_invalid',
      details: {
        issues: [
          {
            stepId: draft.stepIds[0],
            field: 'mediaObjectId',
            code: 'invalid_media',
          },
          {
            stepId: draft.stepIds[1],
            field: 'mediaObjectId',
            code: 'invalid_media',
          },
        ],
      },
    });
  });

  it('rejects empty, tutorial-invalid, speed-invalid, and media-invalid drafts', async () => {
    const validMedia = await insertMedia();
    const wrongPurposeMedia = await insertMedia('bonus_game_media');
    const cases: Array<{
      chain: ChainKey;
      steps: Parameters<typeof insertVersion>[2];
      mutate?: (versionId: string) => Promise<void>;
    }> = [
      { chain: 'beginner', steps: [] },
      {
        chain: 'beginner',
        steps: [{ kind: 'informational', position: 1, mediaObjectId: validMedia }],
      },
      {
        chain: 'beginner',
        steps: [
          { kind: 'tutorial_shot', position: 1 },
          { kind: 'tutorial_shot', position: 2 },
        ],
      },
      { chain: 'amateur', steps: [{ kind: 'tutorial_shot', position: 1 }] },
      {
        chain: 'beginner',
        steps: [{ kind: 'tutorial_shot', position: 1 }],
        mutate: async (versionId) => {
          await pool.query(
            `update onboarding_step
                set tutorial_config = '{"shooterFrequency":3,"goalieFrequency":0.6,"goalFrequency":0.7}'
              where version_id = $1`,
            [versionId],
          );
        },
      },
      {
        chain: 'beginner',
        steps: [
          { kind: 'informational', position: 1, mediaObjectId: wrongPurposeMedia },
          { kind: 'tutorial_shot', position: 2 },
        ],
      },
      {
        chain: 'beginner',
        steps: [
          { kind: 'informational', position: 1, mediaObjectId: validMedia },
          { kind: 'tutorial_shot', position: 2 },
        ],
        mutate: async (versionId) => {
          await pool.query(
            'update onboarding_step set position = 3 where position = 2 and version_id = $1',
            [versionId],
          );
        },
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      await pool.query("delete from onboarding_version where status = 'draft'");
      const { versionId } = await insertVersion(testCase.chain, 'draft', testCase.steps);
      await testCase.mutate?.(versionId);
      const response = await app.inject({
        method: 'POST',
        url: `/admin/onboarding/chains/${testCase.chain}/publish`,
        headers: adminHeaders,
      });
      expect(response.statusCode, `${testCase.chain} ${JSON.stringify(testCase.steps)}`).toBe(
        index === 4 || index === 5 ? 422 : 409,
      );
      expect(response.json().error.code).toBe('onboarding_publish_invalid');
    }
  });

  it('rejects structurally missing images and duplicate positions before publication', async () => {
    await pool.query('alter table onboarding_step drop constraint onboarding_step_check');
    let missingImageVersionId: string | undefined;
    try {
      const draft = await insertVersion('beginner', 'draft', [
        { kind: 'tutorial_shot', position: 2 },
      ]);
      missingImageVersionId = draft.versionId;
      await pool.query(
        `insert into onboarding_step
           (version_id, position, kind, title, description, cta_label, media_object_id)
         values ($1, 1, 'informational', 'Без картинки', 'Описание', 'Продолжить', null)`,
        [draft.versionId],
      );
      const missingImage = await app.inject({
        method: 'POST',
        url: '/admin/onboarding/chains/beginner/publish',
        headers: adminHeaders,
      });
      expect(missingImage.statusCode).toBe(422);
      expect(missingImage.json().error.code).toBe('onboarding_publish_invalid');
    } finally {
      if (missingImageVersionId !== undefined) {
        await pool.query('delete from onboarding_version where id = $1', [missingImageVersionId]);
      }
      await pool.query(`alter table onboarding_step add constraint onboarding_step_check check (
        (kind = 'informational' and media_object_id is not null and tutorial_config is null)
        or (kind = 'tutorial_shot' and media_object_id is null and tutorial_config is not null
            and jsonb_typeof(tutorial_config) = 'object')
      )`);
    }

    const media = await insertMedia();
    await pool.query(
      'alter table onboarding_step drop constraint onboarding_step_version_id_position_key',
    );
    let duplicateVersionId: string | undefined;
    try {
      const draft = await insertVersion('beginner', 'draft', [
        { kind: 'informational', position: 1, mediaObjectId: media },
        { kind: 'tutorial_shot', position: 2 },
      ]);
      duplicateVersionId = draft.versionId;
      await pool.query(
        'update onboarding_step set position = 1 where position = 2 and version_id = $1',
        [draft.versionId],
      );
      const duplicate = await app.inject({
        method: 'POST',
        url: '/admin/onboarding/chains/beginner/publish',
        headers: adminHeaders,
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('onboarding_publish_invalid');
    } finally {
      if (duplicateVersionId !== undefined) {
        await pool.query('delete from onboarding_version where id = $1', [duplicateVersionId]);
      }
      await pool.query(
        'alter table onboarding_step add constraint onboarding_step_version_id_position_key unique (version_id, position)',
      );
    }
  });

  it('keeps the old pointer on failed media checks and atomically publishes a valid draft', async () => {
    const oldMedia = await insertMedia();
    const old = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId: oldMedia },
      { kind: 'tutorial_shot', position: 2 },
    ]);
    const missingObjectMedia = await insertMedia('onboarding_image', {
      objectKey: 'onboarding/missing.webp',
    });
    const invalid = await insertVersion('beginner', 'draft', [
      { kind: 'informational', position: 1, mediaObjectId: missingObjectMedia },
      { kind: 'tutorial_shot', position: 2 },
    ]);
    storageFetch.mockImplementation(async (_input, init) =>
      init?.method === 'GET'
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 200 }),
    );
    const failed = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/beginner/publish',
      headers: adminHeaders,
    });
    expect(failed.statusCode).toBe(422);
    const afterFailure = await pool.query<{
      current_published_version_id: string;
      enforcement_enabled: boolean;
      draft_status: string;
    }>(
      `select chain.current_published_version_id, chain.enforcement_enabled,
              version.status as draft_status
         from onboarding_chain chain
         join onboarding_version version on version.id = $1
        where chain.key = 'beginner'`,
      [invalid.versionId],
    );
    expect(afterFailure.rows[0]).toEqual({
      current_published_version_id: old.versionId,
      enforcement_enabled: false,
      draft_status: 'draft',
    });

    await pool.query('delete from onboarding_version where id = $1', [invalid.versionId]);
    const newMedia = await insertMedia();
    const valid = await insertVersion('beginner', 'draft', [
      { kind: 'informational', position: 1, mediaObjectId: newMedia },
      { kind: 'tutorial_shot', position: 2 },
    ]);
    storageFetch.mockImplementation(async (_input, init) =>
      init?.method === 'GET'
        ? new Response(validWebpBytes(), {
            status: 200,
            headers: { 'content-type': 'image/webp' },
          })
        : new Response(null, { status: 200 }),
    );
    const published = await app.inject({
      method: 'POST',
      url: '/admin/onboarding/chains/beginner/publish',
      headers: adminHeaders,
    });
    expect(published.statusCode, published.body).toBe(200);
    expect((published.json() as { chain: AdminChain }).chain).toMatchObject({
      enforcementEnabled: true,
      published: { id: valid.versionId, status: 'published' },
      draft: null,
    });
    const stored = await pool.query<{
      current_published_version_id: string;
      enforcement_enabled: boolean;
      draft_count: number;
      old_status: string;
    }>(
      `select chain.current_published_version_id, chain.enforcement_enabled,
              (select count(*)::int from onboarding_version
                where chain_key = 'beginner' and status = 'draft') as draft_count,
              old.status as old_status
         from onboarding_chain chain
         join onboarding_version old on old.id = $1
        where chain.key = 'beginner'`,
      [old.versionId],
    );
    expect(stored.rows[0]).toEqual({
      current_published_version_id: valid.versionId,
      enforcement_enabled: true,
      draft_count: 0,
      old_status: 'published',
    });
  });

  it('reports natural onboarding conversion, repeats, tutorial attempts, steps, and 30-minute drop-offs', async () => {
    const media = await insertMedia();
    const version = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId: media, title: 'Старт' },
      { kind: 'tutorial_shot', position: 2, title: 'Бросок' },
      { kind: 'informational', position: 3, mediaObjectId: media, title: 'Финиш' },
    ]);
    const users: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const user = await findOrCreateTelegramUser(pool, {
        providerUid: `stats-player-${index}`,
        displayName: `Stats Player ${index}`,
        timezone: 'Europe/Moscow',
      });
      users.push(user.id);
    }
    const insertRun = async (
      userId: string,
      source: 'natural' | 'admin_reset' | 'preview',
      startedAgo: string,
      completedAfterMinutes: number | null,
      viewedPositions: number[],
      attemptsToGoal: number | null,
    ) => {
      const run = await pool.query<{ id: string }>(
        `insert into onboarding_run
           (user_id, chain_key, version_id, client_session_id, source, started_at, completed_at)
         values ($1, 'beginner', $2, $3, $4, now() - $5::interval,
                 case when $6::int is null then null
                      else now() - $5::interval + ($6::int * interval '1 minute') end)
         returning id`,
        [userId, version.versionId, randomUUID(), source, startedAgo, completedAfterMinutes],
      );
      for (const position of viewedPositions) {
        await pool.query(
          `insert into onboarding_event
             (run_id, user_id, chain_key, version_id, step_id, kind, created_at)
           values ($1, $2, 'beginner', $3, $4, 'step_viewed', now() - interval '1 hour')`,
          [run.rows[0]!.id, userId, version.versionId, version.stepIds[position - 1]],
        );
      }
      if (attemptsToGoal !== null) {
        for (let attempt = 1; attempt <= attemptsToGoal; attempt += 1) {
          await pool.query(
            `insert into onboarding_event
               (run_id, user_id, chain_key, version_id, step_id, kind, result,
                attempt_number, created_at)
             values ($1, $2, 'beginner', $3, $4, 'tutorial_attempt',
                     case when $5::int = $6::int then 'goal' else 'save' end, $5::int,
                     now() - interval '1 hour')`,
            [
              run.rows[0]!.id,
              userId,
              version.versionId,
              version.stepIds[1],
              attempt,
              attemptsToGoal,
            ],
          );
        }
        await pool.query(
          `insert into onboarding_event
             (run_id, user_id, chain_key, version_id, step_id, kind, result,
              attempt_number, created_at)
           values ($1, $2, 'beginner', $3, $4, 'tutorial_goal', 'goal', $5,
                   now() - interval '1 hour')`,
          [run.rows[0]!.id, userId, version.versionId, version.stepIds[1], attemptsToGoal],
        );
      }
      return run.rows[0]!.id;
    };

    await insertRun(users[0]!, 'natural', '120 minutes', 10, [1, 2, 3], 1);
    await insertRun(users[0]!, 'natural', '31 minutes', null, [1, 2], null);
    await insertRun(users[1]!, 'natural', '120 minutes', 20, [1, 2, 3], 2);
    await insertRun(users[2]!, 'natural', '30 minutes', null, [1], null);
    await insertRun(users[3]!, 'natural', '29 minutes', null, [1, 2], null);
    await insertRun(users[2]!, 'preview', '180 minutes', 1, [1, 2, 3], 1);
    await insertRun(users[3]!, 'admin_reset', '180 minutes', 1, [1, 2, 3], 1);

    const response = await app.inject({
      method: 'GET',
      url: `/admin/onboarding/stats?chain=beginner&versionId=${version.versionId}`,
      headers: adminHeaders,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      startedUsers: 4,
      completedUsers: 2,
      completionRate: 50,
      averageCompletionSeconds: 900,
      repeatStarts: 1,
      tutorial: {
        averageAttemptsToGoal: 1.5,
        firstAttemptGoalRate: 50,
        maxAttempts: 2,
      },
      steps: [
        {
          stepId: version.stepIds[0],
          position: 1,
          title: 'Старт',
          reachedUsers: 4,
          dropOffUsers: 1,
        },
        {
          stepId: version.stepIds[1],
          position: 2,
          title: 'Бросок',
          reachedUsers: 3,
          dropOffUsers: 1,
        },
        {
          stepId: version.stepIds[2],
          position: 3,
          title: 'Финиш',
          reachedUsers: 2,
          dropOffUsers: 0,
        },
      ],
    });

    const versionNoise = await insertVersion('beginner', 'published', [
      { kind: 'informational', position: 1, mediaObjectId: media, title: 'Другая версия' },
    ]);
    const amateurNoise = await insertVersion('amateur', 'published', [
      { kind: 'informational', position: 1, mediaObjectId: media, title: 'Любитель' },
    ]);
    const insertFilterFixture = async (
      chain: ChainKey,
      fixtureVersion: { versionId: string; stepIds: string[] },
      providerUid: string,
      startedAt: string,
      attemptsToGoal: number | null,
    ) => {
      const user = await findOrCreateTelegramUser(pool, {
        providerUid,
        displayName: providerUid,
        timezone: 'Europe/Moscow',
      });
      const run = await pool.query<{ id: string }>(
        `insert into onboarding_run
           (user_id, chain_key, version_id, client_session_id, source, started_at, completed_at)
         values ($1, $2, $3, $4, 'natural', $5::timestamptz,
                 $5::timestamptz + interval '1 minute')
         returning id`,
        [user.id, chain, fixtureVersion.versionId, randomUUID(), startedAt],
      );
      await pool.query(
        `insert into onboarding_event
           (run_id, user_id, chain_key, version_id, step_id, kind, created_at)
         values ($1, $2, $3, $4, $5, 'step_viewed', $6::timestamptz)`,
        [
          run.rows[0]!.id,
          user.id,
          chain,
          fixtureVersion.versionId,
          fixtureVersion.stepIds[0],
          startedAt,
        ],
      );
      if (attemptsToGoal !== null) {
        await pool.query(
          `insert into onboarding_event
             (run_id, user_id, chain_key, version_id, step_id, kind, result,
              attempt_number, created_at)
           values ($1, $2, $3, $4, $5, 'tutorial_goal', 'goal', $6, $7::timestamptz)`,
          [
            run.rows[0]!.id,
            user.id,
            chain,
            fixtureVersion.versionId,
            fixtureVersion.stepIds[0],
            attemptsToGoal,
            startedAt,
          ],
        );
      }
    };
    await insertFilterFixture(
      'beginner',
      versionNoise,
      'filter-version',
      '2098-01-02T00:00:00.000Z',
      3,
    );
    await insertFilterFixture(
      'amateur',
      amateurNoise,
      'filter-chain',
      '2098-01-02T00:00:01.000Z',
      null,
    );
    await insertFilterFixture(
      'beginner',
      versionNoise,
      'filter-from-boundary',
      '2098-02-01T00:00:00.000Z',
      4,
    );
    await insertFilterFixture(
      'beginner',
      versionNoise,
      'filter-after-boundary',
      '2098-02-01T00:00:01.000Z',
      5,
    );
    await insertFilterFixture(
      'beginner',
      versionNoise,
      'filter-before-to',
      '2019-12-31T23:59:59.000Z',
      6,
    );
    await insertFilterFixture(
      'beginner',
      versionNoise,
      'filter-to-boundary',
      '2020-01-01T00:00:00.000Z',
      7,
    );

    const assertFiltered = async (
      query: string,
      expected: {
        startedUsers: number;
        averageAttempts: number | null;
        maxAttempts: number | null;
        stepIds: string[];
      },
    ) => {
      const filtered = await app.inject({
        method: 'GET',
        url: `/admin/onboarding/stats?${query}`,
        headers: adminHeaders,
      });
      expect(filtered.statusCode, filtered.body).toBe(200);
      expect(filtered.json()).toMatchObject({
        startedUsers: expected.startedUsers,
        completedUsers: expected.startedUsers,
        completionRate: expected.startedUsers === 0 ? 0 : 100,
        averageCompletionSeconds: expected.startedUsers === 0 ? null : 60,
        repeatStarts: 0,
        tutorial: {
          averageAttemptsToGoal: expected.averageAttempts,
          firstAttemptGoalRate: expected.averageAttempts === null ? null : 0,
          maxAttempts: expected.maxAttempts,
        },
      });
      expect(filtered.json().steps.map((step: { stepId: string }) => step.stepId)).toEqual(
        expected.stepIds,
      );
      expect(
        filtered
          .json()
          .steps.every(
            (step: { reachedUsers: number; dropOffUsers: number }) =>
              step.reachedUsers === expected.startedUsers && step.dropOffUsers === 0,
          ),
      ).toBe(true);
    };
    await assertFiltered('chain=amateur', {
      startedUsers: 1,
      averageAttempts: null,
      maxAttempts: null,
      stepIds: amateurNoise.stepIds,
    });
    await assertFiltered(`versionId=${versionNoise.versionId}`, {
      startedUsers: 5,
      averageAttempts: 5,
      maxAttempts: 7,
      stepIds: versionNoise.stepIds,
    });
    await assertFiltered('from=2098-02-01T00%3A00%3A00.000Z', {
      startedUsers: 2,
      averageAttempts: 4.5,
      maxAttempts: 5,
      stepIds: versionNoise.stepIds,
    });
    await assertFiltered('to=2020-01-01T00%3A00%3A00.000Z', {
      startedUsers: 2,
      averageAttempts: 6.5,
      maxAttempts: 7,
      stepIds: versionNoise.stepIds,
    });

    const empty = await app.inject({
      method: 'GET',
      url: `/admin/onboarding/stats?chain=amateur&from=2099-01-01T00:00:00.000Z&to=2099-01-02T00:00:00.000Z`,
      headers: adminHeaders,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      startedUsers: 0,
      completedUsers: 0,
      completionRate: 0,
      averageCompletionSeconds: null,
      repeatStarts: 0,
      tutorial: {
        averageAttemptsToGoal: null,
        firstAttemptGoalRate: null,
        maxAttempts: null,
      },
    });
  });
});
