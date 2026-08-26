import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { mediaRoutes } from '../../src/routes/media.js';
import { errorsPlugin } from '../../src/plugins/errors.js';
import { createMediaAccessToken } from '../../src/storage/mediaAccess.js';
import type { ObjectStorageClient } from '../../src/storage/objectStorage.js';

const MEDIA_SECRET = 'test-media-secret-at-least-16-chars';
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

function buildMediaApp(body = Buffer.from('0123456789')) {
  const app = Fastify({ logger: false });
  const objectStorage: ObjectStorageClient = {
    maxUploadBytes: 25 * 1024 * 1024,
    publicUrlForKey: (key) => `https://cdn.example.test/${key}`,
    uploadObject: vi.fn(),
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
    } finally {
      await app.close();
    }
  });
});
