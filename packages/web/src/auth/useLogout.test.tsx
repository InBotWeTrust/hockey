import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLogout } from './useLogout.js';
import { useAuthStore } from './authStore.js';
import { queryClient } from '../app/queryClient.js';

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useLogout', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, '__HOCKEY_NATIVE__', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('calls the canonical logout endpoint inside the Android shell', async () => {
    Object.defineProperty(globalThis, '__HOCKEY_NATIVE__', {
      configurable: true,
      value: { platform: 'android' },
      writable: true,
    });
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://ultimatehockey.ru/api/auth/logout');
  });

  it('removes only this Android push installation before clearing the session', async () => {
    Object.defineProperty(globalThis, '__HOCKEY_NATIVE__', {
      configurable: true,
      value: { platform: 'android' },
      writable: true,
    });
    vi.stubGlobal('Capacitor', {
      getPlatform: () => 'android',
      Plugins: {
        PushNotifications: {},
        Preferences: {
          get: vi.fn().mockResolvedValue({
            value: '22222222-2222-4222-8222-222222222222',
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        App: {},
      },
    });
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://ultimatehockey.ru/api/push/android/installations/22222222-2222-4222-8222-222222222222',
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('calls POST /auth/logout with refresh token and clears session', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ refreshToken: 'r' });
  });

  it('clears session even when server errors', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net down'));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('clears cached user data before another account can sign in', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', displayName: 'A' },
    });
    queryClient.setQueryData(['profile'], { displayName: 'A' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });

    expect(queryClient.getQueryData(['profile'])).toBeUndefined();
  });
});
