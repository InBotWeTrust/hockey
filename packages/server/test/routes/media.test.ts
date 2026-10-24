import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { mediaRoutes } from '../../src/routes/media.js';
import { errorsPlugin } from '../../src/plugins/errors.js';
import { createMediaAccessToken } from '../../src/storage/mediaAccess.js';
import type { ObjectStorageClient } from '../../src/storage/objectStorage.js';

const MEDIA_SECRET = 'test-media-secret-at-least-16-chars';
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const OFFICIAL_ID = '33333333-3333-4333-8333-333333333333';
const CHAT_ID = '44444444-4444-4444-8444-444444444444';

function buildMediaApp(body = Buffer.from('0123456789')) {
  const app = Fastify({ logger: false });
  const objectStorage: ObjectStorageClient = {
    maxUploadBytes: 25 * 1024 * 1024,
    publicUrlForKey: (key) => `https://cdn.example.test/${key}`,
    uploadObject: vi.fn(),
    deleteObject: vi.fn(),
    getObjectStream: vi.fn(async ({range}) => ({
      body: Readable.from([range ? body.subarray(range.start, range.end + 1) : body]),
      contentType: 'audio/webm',
    })),
    getObject: vi.fn(async () => ({
      body,
      contentType: 'audio/webm',
      size: body.byteLength,
    })),
  };
  app.decorate('pg', {
    query: vi.fn(async () => ({
      rows: [
        {
          id: MEDIA_ID,
          owner_user_id: '22222222-2222-4222-8222-222222222222',
          purpose: 'chat_attachment',
          object_key: 'chat/voice.webm',
          url: 'https://cdn.example.test/chat/voice.webm',
          content_type: 'audio/webm',
          size_bytes: body.byteLength,
          original_name: 'voice.webm',
          created_at: new Date('2026-05-17T08:00:00.000Z'),
        },
      ],
    })),
  });
  app.decorate('authenticate', vi.fn());

  return { app, objectStorage };
}

function mediaUrl(): string {
  return `/media/${MEDIA_ID}?t=${createMediaAccessToken(MEDIA_SECRET, MEDIA_ID)}`;
}

describe('media routes', () => {
  it('serves byte ranges for audio playback metadata requests', async () => {
    const { app, objectStorage } = buildMediaApp();
    await app.register(errorsPlugin);
    await app.register(mediaRoutes, { objectStorage, mediaAccessSecret: MEDIA_SECRET });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: mediaUrl(),
        headers: { range: 'bytes=2-5' },
      });

      expect(res.statusCode).toBe(206);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-range']).toBe('bytes 2-5/10');
      expect(res.headers['content-length']).toBe('4');
      expect(res.headers['content-type']).toContain('audio/webm');
      expect(res.body).toBe('2345');
      expect(objectStorage.getObject).not.toHaveBeenCalled();
      expect(objectStorage.getObjectStream).toHaveBeenCalledWith(expect.objectContaining({
        key: 'chat/voice.webm', range: {start: 2, end: 5, total: 10}, signal: expect.any(AbortSignal),
      }));
    } finally {
      await app.close();
    }
  });

  it('returns 416 for invalid byte ranges', async () => {
    const { app, objectStorage } = buildMediaApp();
    await app.register(errorsPlugin);
    await app.register(mediaRoutes, { objectStorage, mediaAccessSecret: MEDIA_SECRET });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: mediaUrl(),
        headers: { range: 'bytes=50-80' },
      });

      expect(res.statusCode).toBe(416);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-range']).toBe('bytes */10');
      expect(objectStorage.getObject).not.toHaveBeenCalled();
      expect(objectStorage.getObjectStream).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    [undefined, 200, '0123456789'],
    ['bytes=-3', 206, '789'],
    ['bytes=7-', 206, '789'],
  ])('streams full and suffix responses (%s)', async (range, status, body) => {
    const {app, objectStorage} = buildMediaApp();
    await app.register(errorsPlugin);
    await app.register(mediaRoutes, {objectStorage, mediaAccessSecret: MEDIA_SECRET});
    try {
      const res = await app.inject({method: 'GET', url: mediaUrl(), ...(range ? {headers: {range}} : {})});
      expect(res.statusCode).toBe(status);
      expect(res.body).toBe(body);
      expect(objectStorage.getObject).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('rejects an invalid token before reading storage', async () => {
    const {app, objectStorage} = buildMediaApp();
    await app.register(errorsPlugin);
    await app.register(mediaRoutes, {objectStorage, mediaAccessSecret: MEDIA_SECRET});
    try {
      const res = await app.inject({method: 'GET', url: `/media/${MEDIA_ID}?t=invalid`});
      expect(res.statusCode).toBe(403);
      expect(objectStorage.getObjectStream).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('lets an admin upload a voice attachment only for an official dialog', async () => {
    const app = Fastify({ logger: false });
    const uploadObject = vi.fn(async ({ key, body, contentType }) => ({
      key,
      url: `https://cdn.example.test/${key}`,
      contentType,
      size: body.byteLength,
    }));
    const objectStorage: ObjectStorageClient = {
      maxUploadBytes: 25 * 1024 * 1024,
      publicUrlForKey: (key) => `https://cdn.example.test/${key}`,
      uploadObject,
      deleteObject: vi.fn(),
      getObject: vi.fn(),
      getObjectStream: vi.fn(),
    };
    app.decorate('pg', {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('select role from users')) return { rows: [{ role: 'admin' }] };
        if (sql.includes('from chats c') && sql.includes('official.account_kind')) {
          return { rows: [{ id: CHAT_ID }] };
        }
        if (sql.includes('insert into media_objects')) {
          return {
            rows: [
              {
                id: MEDIA_ID,
                owner_user_id: ADMIN_ID,
                purpose: 'chat_attachment',
                object_key: 'official-dialog/voice.webm',
                url: 'https://cdn.example.test/official-dialog/voice.webm',
                content_type: 'audio/webm',
                size_bytes: 5,
                original_name: 'voice.webm',
                created_at: new Date('2026-05-17T08:00:00.000Z'),
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      }),
    });
    app.decorate('authenticate', async (req: { user?: { id: string } }) => {
      req.user = { id: ADMIN_ID };
    });
    await app.register(errorsPlugin);
    await app.register(mediaRoutes, {
      objectStorage,
      mediaAccessSecret: MEDIA_SECRET,
      systemUserId: OFFICIAL_ID,
    });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/communications/dialogs/${CHAT_ID}/uploads`,
        headers: { 'content-type': 'audio/webm', 'x-file-name': 'voice.webm' },
        payload: Buffer.from('voice'),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        media: { id: MEDIA_ID, kind: 'voice', contentType: 'audio/webm' },
      });
      expect(uploadObject).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});

it('aborts the storage request when the HTTP client disconnects', async () => {
  const {app, objectStorage} = buildMediaApp();
  let upstreamSignal: AbortSignal | undefined;
  const stream = new Readable({read() {}});
  vi.mocked(objectStorage.getObjectStream).mockImplementation(async ({signal}) => {
    upstreamSignal = signal;
    signal?.addEventListener('abort', () => stream.destroy(), {once: true});
    stream.push(Buffer.from('0'));
    return {body: stream, contentType: 'audio/webm'};
  });
  await app.register(errorsPlugin);
  await app.register(mediaRoutes, {objectStorage, mediaAccessSecret: MEDIA_SECRET});
  const base = await app.listen({host: '127.0.0.1', port: 0});
  const controller = new AbortController();
  try {
    const response = await fetch(base + mediaUrl(), {signal: controller.signal});
    const reader = response.body!.getReader();
    expect((await reader.read()).value?.byteLength).toBe(1);
    controller.abort();
    await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true));
  } finally {
    controller.abort();
    stream.destroy();
    await app.close();
  }
});

it('does not cache a temporary storage failure as a successful media response', async () => {
  const {app, objectStorage} = buildMediaApp();
  vi.mocked(objectStorage.getObjectStream).mockRejectedValue(new Error('storage unavailable'));
  await app.register(errorsPlugin);
  await app.register(mediaRoutes, {objectStorage, mediaAccessSecret: MEDIA_SECRET});
  try {
    const response = await app.inject({method: 'GET', url: mediaUrl()});
    expect(response.statusCode).toBe(502);
    expect(response.headers['cache-control']).toBeUndefined();
  } finally { await app.close(); }
});
