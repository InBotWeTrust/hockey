import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore.js';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('starts empty', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('setSession stores tokens and user', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('a');
    expect(s.refreshToken).toBe('r');
    expect(s.user).toEqual({ id: 'u1', displayName: 'Alice' });
    expect(s.isAuthenticated()).toBe(true);
  });

  it('clearSession wipes everything', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    useAuthStore.getState().clearSession();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('persists to localStorage', () => {
    useAuthStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', displayName: 'Alice' },
    });
    const raw = localStorage.getItem('hockey.auth');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accessToken).toBe('a');
  });
});
