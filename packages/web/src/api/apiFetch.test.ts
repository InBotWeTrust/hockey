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

  it.each(['bad_request', 'unexpected_internal_code'])(
    'keeps unknown server code %s but never exposes its internal message',
    async (code) => {
      // This catches using server-provided diagnostics as player-facing UI copy.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockJson(
          { error: { code, message: 'constraint users_private_secret violated' } },
          { status: 400 },
        ),
      );

      await expect(apiFetch('/x')).rejects.toMatchObject({
        code,
        message: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
      });
    },
  );

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

  it('localizes unsupported media type errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson(
        { error: { code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', message: 'Unsupported Media Type' } },
        { status: 415 },
      ),
    );

    await expect(apiFetch('/chat/c/uploads')).rejects.toMatchObject({
      status: 415,
      code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      message: 'Формат файла не поддерживается. Загрузите JPG, PNG, WebP или GIF.',
    });
  });

  it.each([
    ['bonus_level_locked', 'Бонус-игры доступны после открытия любительского уровня.'],
    ['bonus_previous_game_required', 'Сначала завершите предыдущую бонус-игру.'],
    ['bonus_purchase_required', 'Сначала откройте эту бонус-игру.'],
    ['bonus_insufficient_stars', 'Недостаточно звёзд для открытия бонус-игры.'],
    ['bonus_game_inactive', 'Эта бонус-игра сейчас недоступна.'],
    ['bonus_attempt_already_active', 'У вас уже есть незавершённая бонус-попытка.'],
    ['bonus_attempt_not_active', 'Эта бонус-попытка больше не активна.'],
    ['bonus_period_not_ready', 'Сейчас нельзя начать или продолжить этот период.'],
    ['bonus_shot_index_mismatch', 'Бросок уже обработан. Обновляем состояние попытки.'],
    ['bonus_shot_result_mismatch', 'Результат броска уточнён сервером.'],
    ['bonus_game_core_version_mismatch', 'Версия игры изменилась. Обновите попытку.'],
    ['bonus_shot_time_invalid', 'Время броска указано неверно.'],
    ['bonus_shot_time_stale', 'Время броска устарело. Обновляем состояние попытки.'],
    ['arena_not_owned', 'Эта домашняя площадка ещё не открыта.'],
    ['arena_not_selectable', 'Эту домашнюю площадку сейчас нельзя выбрать.'],
    ['arena_unavailable', 'Домашняя площадка временно недоступна.'],
  ])('localizes the stable player error %s without replacing its code', async (code, message) => {
    // This catches leaking server copy into player UI while preserving a stable branchable code.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockJson({ error: { code, message: 'internal server copy' } }, { status: 409 }),
    );

    await expect(apiFetch('/bonus-games')).rejects.toMatchObject({ code, message });
  });

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
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockJson({ error: 'unauthenticated' }, { status: 401 }));
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshAccessToken reuses the in-flight refresh promise (no parallel /auth/refresh calls)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
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
