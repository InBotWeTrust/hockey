import { describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  buildPublicObjectUrl,
  createMediaObjectKey,
  createObjectStorageClient,
  type ObjectStorageConfig,
} from '../../src/storage/objectStorage.js';

const config: ObjectStorageConfig = {
  endpoint: 'https://s3.cloud.ru',
  region: 'ru-central-1',
  bucket: 'hockey-bucket',
  tenantId: 'tenant',
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  publicBaseUrl: 'https://cdn.example/hockey',
  maxUploadBytes: 20 * 1024 * 1024,
};

const configWithoutPublicBaseUrl: ObjectStorageConfig = {
  endpoint: config.endpoint,
  region: config.region,
  bucket: config.bucket,
  accessKeyId: config.accessKeyId,
  secretAccessKey: config.secretAccessKey,
  maxUploadBytes: config.maxUploadBytes,
};

describe('object storage client', () => {
  it('builds public URLs without exposing credentials', () => {
    expect(buildPublicObjectUrl(config, 'chat/c1/file name.png')).toBe(
      'https://cdn.example/hockey/chat/c1/file%20name.png',
    );
    expect(buildPublicObjectUrl(configWithoutPublicBaseUrl, 'avatars/u1/a.webp')).toBe(
      'https://s3.cloud.ru/hockey-bucket/avatars/u1/a.webp',
    );
    expect(
      buildPublicObjectUrl(
        { ...configWithoutPublicBaseUrl, endpoint: 'https://s3.cloud.ru/hockey-bucket' },
        'avatars/u1/a.webp',
      ),
    ).toBe('https://s3.cloud.ru/hockey-bucket/avatars/u1/a.webp');
  });

  it('uploads objects with AWS SigV4 headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const client = createObjectStorageClient(config, {
      fetchImpl,
      now: () => new Date('2026-05-15T10:20:30.000Z'),
    });

    await expect(
      client.uploadObject({
        key: 'chat/c1/voice.ogg',
        body: Buffer.from('hello'),
        contentType: 'audio/ogg',
      }),
    ).resolves.toMatchObject({
      key: 'chat/c1/voice.ogg',
      url: 'https://cdn.example/hockey/chat/c1/voice.ogg',
      contentType: 'audio/ogg',
      size: 5,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://s3.cloud.ru/hockey-bucket/chat/c1/voice.ogg');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'audio/ogg',
      'x-amz-acl': 'public-read',
      'x-amz-date': '20260515T102030Z',
    });
    expect(String((init?.headers as Record<string, string>).Authorization)).toContain(
      'AWS4-HMAC-SHA256 Credential=tenant:access/20260515/ru-central-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date',
    );
  });

  it('creates media keys under a caller-owned prefix', () => {
    expect(createMediaObjectKey({ prefix: '/chat/c1/u1/', contentType: 'image/webp' })).toMatch(
      /^chat\/c1\/u1\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/,
    );
  });
});
