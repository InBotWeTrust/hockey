import { createECDH, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendWebPush, type ResolvedPushVapidOptions } from '../../src/push/service.js';

function createP256KeyPair(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys().toString('base64url');
  const privateBytes = ecdh.getPrivateKey();
  if (privateBytes.length > 32) {
    throw new Error('unexpected P-256 private key length');
  }
  const normalizedPrivateKey =
    privateBytes.length === 32
      ? privateBytes
      : Buffer.concat([Buffer.alloc(32 - privateBytes.length), privateBytes]);
  const privateKey = normalizedPrivateKey.toString('base64url');
  return { publicKey, privateKey };
}

describe('sendWebPush', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends encrypted payload with a click target url', async () => {
    const vapid: ResolvedPushVapidOptions = {
      ...createP256KeyPair(),
      subject: 'mailto:test@example.com',
    };
    const subscriptionKeys = createP256KeyPair();
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWebPush(
      {
        endpoint: 'https://push.example.test/send/1',
        p256dh: subscriptionKeys.publicKey,
        auth: randomBytes(16).toString('base64url'),
      },
      vapid,
      {
        title: 'Ultimate Hockey',
        body: 'Проверка уведомлений',
        url: '/profile',
        tag: 'test',
      },
    );

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1] as
      | (RequestInit & { headers?: Record<string, string>; body?: unknown })
      | undefined;
    expect(init?.headers).toMatchObject({
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    });
    expect(init?.headers?.Authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(Buffer.isBuffer(init?.body)).toBe(true);
    expect((init?.body as Buffer).length).toBeGreaterThan(86);
  });
});
