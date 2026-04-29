import { describe, expect, it, vi } from 'vitest';
import { exchangeVkCode, fetchVkProfile } from '../../src/auth/vk.js';

function mockJsonFetch(payload: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('exchangeVkCode', () => {
  it('posts form-urlencoded body to VK ID and returns user_id', async () => {
    let captured: { url?: string; body?: string; method?: string; headers?: Headers } = {};
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      captured = {
        url,
        body: init.body as string,
        method: init.method,
        headers: new Headers(init.headers),
      };
      return new Response(
        JSON.stringify({ user_id: 12345, access_token: 'vk_at', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const result = await exchangeVkCode({
      code: 'C',
      redirectUri: 'http://localhost:5173/auth/vk/callback',
      codeVerifier: 'V',
      deviceId: 'D',
      appId: '777',
      fetchImpl,
    });

    expect(result).toEqual({ vkUserId: 12345, accessToken: 'vk_at', expiresIn: 3600 });
    expect(captured.url).toBe('https://id.vk.com/oauth2/auth');
    expect(captured.method).toBe('POST');
    expect(captured.headers?.get('content-type')).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(captured.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('C');
    expect(params.get('client_id')).toBe('777');
    expect(params.get('redirect_uri')).toBe('http://localhost:5173/auth/vk/callback');
    expect(params.get('code_verifier')).toBe('V');
    expect(params.get('device_id')).toBe('D');
  });

  it('throws when VK returns error', async () => {
    const fetchImpl = mockJsonFetch({ error: 'invalid_grant', error_description: 'bad code' });
    await expect(
      exchangeVkCode({
        code: 'C',
        redirectUri: 'r',
        codeVerifier: 'v',
        deviceId: 'd',
        appId: '1',
        fetchImpl,
      }),
    ).rejects.toThrow(/bad code/);
  });

  it('throws on missing user_id', async () => {
    const fetchImpl = mockJsonFetch({ access_token: 'x' });
    await expect(
      exchangeVkCode({
        code: 'C',
        redirectUri: 'r',
        codeVerifier: 'v',
        deviceId: 'd',
        appId: '1',
        fetchImpl,
      }),
    ).rejects.toThrow(/vk_invalid_user_id/);
  });
});

describe('fetchVkProfile', () => {
  it('parses user_info response', async () => {
    const fetchImpl = mockJsonFetch({
      user: {
        first_name: 'Иван',
        last_name: 'Иванов',
        avatar: 'https://avatar',
        screen_name: 'ivan',
      },
    });

    await expect(fetchVkProfile({ accessToken: 'at', appId: '1', fetchImpl })).resolves.toEqual({
      firstName: 'Иван',
      lastName: 'Иванов',
      avatarUrl: 'https://avatar',
      screenName: 'ivan',
    });
  });

  it('returns empty profile on malformed response', async () => {
    const fetchImpl = mockJsonFetch({});
    await expect(fetchVkProfile({ accessToken: 'at', appId: '1', fetchImpl })).resolves.toEqual({});
  });
});
