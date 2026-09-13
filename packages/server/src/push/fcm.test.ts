import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken, authConstructor } = vi.hoisted(() => ({
  getAccessToken: vi.fn(async () => 'oauth-access-token'),
  authConstructor: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {
      authConstructor();
    }

    getAccessToken = getAccessToken;
  },
}));

import { sendFcm, type FcmOptions } from './fcm.js';

const options: FcmOptions = {
  projectId: 'ultimate-hockey',
  clientEmail: 'sender@example.test',
  privateKey: 'private-key',
};
const payload = {
  title: 'Новая дуэль',
  body: 'Соперник ждёт ответа',
  url: '/duels/challenge',
  deliveryId: 'delivery-id',
};
const deviceToken = 'secret-device-token';

function fcmError(status: number, reason: string): Response {
  return new Response(
    JSON.stringify({ error: { code: status, status: reason, message: `FCM ${reason}` } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

describe('sendFcm', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    getAccessToken.mockClear();
  });

  it('reports an HTTP 200 response as sent', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendFcm(deviceToken, options, { ...payload, eventType: 'duel.challenge_received' }),
    ).resolves.toMatchObject({ ok: true, invalid: false, retryable: false, status: 200 });
    const request = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(request.body as string)).toMatchObject({
      message: {
        android: {
          notification: { channel_id: 'gameplay', icon: 'ic_stat_hockey' },
        },
      },
    });
  });

  it('reuses one Google auth client across installation sends', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    const uniqueOptions = { ...options, projectId: 'cached-auth-project' };
    const constructorsBefore = authConstructor.mock.calls.length;

    await sendFcm('first-device', uniqueOptions, payload);
    await sendFcm('second-device', uniqueOptions, payload);

    expect(authConstructor.mock.calls.length - constructorsBefore).toBe(1);
  });

  it.each([[404, 'NOT_FOUND']])(
    'does not disable an installation token for generic %i %s responses',
    async (status, reason) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => fcmError(status, reason)),
      );

      await expect(sendFcm(deviceToken, options, payload)).resolves.toMatchObject({
        ok: false,
        invalid: false,
        retryable: false,
        status,
      });
    },
  );

  it('recognizes UNREGISTERED in the FCM error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 400,
                status: 'INVALID_ARGUMENT',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                    errorCode: 'UNREGISTERED',
                  },
                ],
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    await expect(sendFcm(deviceToken, options, payload)).resolves.toMatchObject({
      ok: false,
      invalid: true,
      retryable: false,
      status: 400,
      diagnostic: 'HTTP 400: UNREGISTERED',
    });
  });

  it.each([429, 500, 503])('marks HTTP %i as retryable', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fcmError(status, 'UNAVAILABLE')),
    );

    await expect(sendFcm(deviceToken, options, payload)).resolves.toMatchObject({
      ok: false,
      invalid: false,
      retryable: true,
      status,
    });
  });

  it('marks an invalid HTTP 400 payload as permanent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fcmError(400, 'INVALID_ARGUMENT')),
    );

    await expect(sendFcm(deviceToken, options, payload)).resolves.toMatchObject({
      ok: false,
      invalid: false,
      retryable: false,
      status: 400,
    });
  });

  it('marks a network failure as retryable without leaking credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('socket closed'))),
    );

    const result = await sendFcm(deviceToken, options, payload);
    expect(result).toMatchObject({ ok: false, invalid: false, retryable: true, status: 0 });
    expect(result.diagnostic).toContain('network_error');
    expect(result.diagnostic).not.toContain(deviceToken);
    expect(result.diagnostic).not.toContain('oauth-access-token');
    expect(result.diagnostic).not.toContain('Authorization');
  });

  it('returns redacted status diagnostics for an FCM rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fcmError(400, 'INVALID_ARGUMENT')),
    );

    const result = await sendFcm(deviceToken, options, payload);
    expect(result.diagnostic).toContain('HTTP 400');
    expect(result.diagnostic).toContain('INVALID_ARGUMENT');
    expect(result.diagnostic).not.toContain(deviceToken);
    expect(result.diagnostic).not.toContain('oauth-access-token');
    expect(result.diagnostic).not.toContain('Authorization');
  });
});
