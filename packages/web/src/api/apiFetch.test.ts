import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiFetch, ApiError, __resetRefreshStateForTests, refreshAccessToken } from './apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import type { AuthUser } from '../auth/authStore.js';

function mockJson(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    __resetRefreshStateForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Authorization header when token present', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJson({ ok: 1 }));
    const data = await apiFetch<{ ok: number }>('/me');
    expect(data).toEqual({ ok: 1 });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/me');
    const headers = new Headers(init!.headers);
    expect(headers.get('Authorization')).toBe('Bearer acc');
  });

  it('skips Authorization header when no token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJson({ ok: 1 }));
    await apiFetch('/anything');
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init!.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('throws ApiError on non-2xx without refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson({ error: 'bad_request', message: 'nope' }, { status: 400 }),
    );
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it.each(['telegram_already_linked', 'vk_already_linked'])(
    'localizes auth conflict message %s',
    async (serverMessage) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJson({ error: { code: 'conflict', message: serverMessage } }, { status: 409 }),
      );

      await expect(apiFetch('/auth/telegram')).rejects.toMatchObject({
        status: 409,
        code: 'conflict',
        message: 'Аккаунт уже занят',
      });
    },
  );

  it('retries original request once after successful refresh', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const authHeader = new Headers(init?.headers ?? {}).get('Authorization');
      if (url.endsWith('/auth/refresh')) {
        return mockJson({ accessToken: 'fresh', refreshToken: 'ref2' });
      }
      if (authHeader === 'Bearer fresh') {
        return mockJson({ ok: true });
      }
      return mockJson({ error: 'unauthenticated' }, { status: 401 });
    });

    const data = await apiFetch<{ ok: boolean }>('/me');
    expect(data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('fresh');
    expect(useAuthStore.getState().refreshToken).toBe('ref2');
    const calls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['/api/me', '/api/auth/refresh', '/api/me']);
  });

  it('clears session and throws if refresh fails', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale',
      refreshToken: 'ref',
      user: { id: 'u', displayName: 'A' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/auth/refresh')) {
        return mockJson({ error: 'unauthenticated' }, { status: 401 });
      }
      return mockJson({ error: 'unauthenticated' }, { status: 401 });
    });

    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not retry when refreshToken absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson({ error: 'unauthenticated' }, { status: 401 }),
    );
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshAccessToken reuses the in-flight refresh promise (no parallel /auth/refresh calls)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ accessToken: 'AT2', refreshToken: 'RT2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const user: AuthUser = { id: 'u1', displayName: 'U' };
    useAuthStore.setState({ accessToken: 'AT1', refreshToken: 'RT1', user });

    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);
    expect(a).toBe('AT2');
    expect(b).toBe('AT2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('AT2');
  });
});
