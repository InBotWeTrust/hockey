import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLogout } from './useLogout.js';
import { useAuthStore } from './authStore.js';

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useLogout', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
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
});
