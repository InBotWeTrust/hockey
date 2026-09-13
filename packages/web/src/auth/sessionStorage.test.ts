import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from './authStore.js';
import { sessionStorage } from './sessionStorage.js';

const session: AuthSession = {
  accessToken: 'access',
  refreshToken: 'refresh',
  user: { id: 'user-1', displayName: 'Игрок' },
};

describe('sessionStorage', () => {
  const nativeBridge = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('__HOCKEY_NATIVE__', { platform: 'android' });
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android', Plugins: { SecureSession: nativeBridge } });
    nativeBridge.load.mockReset();
    nativeBridge.save.mockReset().mockResolvedValue(undefined);
    nativeBridge.clear.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not persist native refresh tokens in localStorage', async () => {
    await sessionStorage.save(session);
    expect(localStorage.getItem('hockey.auth')).toBeNull();
    expect(nativeBridge.save).toHaveBeenCalledWith({ value: JSON.stringify(session) });
  });

  it('loads a protected native session', async () => {
    nativeBridge.load.mockResolvedValue({ value: JSON.stringify(session) });
    await expect(sessionStorage.load()).resolves.toEqual(session);
  });

  it('clears corrupt protected data and returns null', async () => {
    nativeBridge.load.mockResolvedValue({ value: 'not-json' });
    await expect(sessionStorage.load()).resolves.toBeNull();
    expect(nativeBridge.clear).toHaveBeenCalledOnce();
  });
});
