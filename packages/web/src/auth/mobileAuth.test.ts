import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore.js';
import { handleMobileAuthDeepLink, startMobileAuth } from './mobileAuth.js';

describe('Android mobile authentication', () => {
  const secureSession = { save: vi.fn(), load: vi.fn(), clear: vi.fn() };
  const browser = { open: vi.fn(), close: vi.fn() };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().clearSession();
    vi.stubGlobal('__HOCKEY_NATIVE__', { platform: 'android' });
    vi.stubGlobal('Capacitor', {
      getPlatform: () => 'android',
      Plugins: { SecureSession: secureSession, Browser: browser },
    });
    secureSession.save.mockReset().mockResolvedValue(undefined);
    secureSession.load.mockReset();
    secureSession.clear.mockReset().mockResolvedValue(undefined);
    browser.open.mockReset().mockResolvedValue(undefined);
    browser.close.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a PKCE attempt and opens Telegram in the system browser', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ attemptId: 'attempt-1', expiresAt: '2026-09-13T10:00:00Z' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await startMobileAuth('telegram');

    const request = vi.mocked(fetch).mock.calls[0]!;
    expect(request[0]).toBe('https://ultimatehockey.ru/api/mobile/auth/attempt');
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({
      provider: 'telegram',
      codeChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(secureSession.save).toHaveBeenCalledWith({
      slot: 'pendingAuth',
      value: expect.stringContaining('codeVerifier'),
    });
    expect(browser.open).toHaveBeenCalledWith({
      url: 'https://ultimatehockey.ru/mobile-auth/telegram?attempt=attempt-1',
    });
  });

  it('ignores links outside the exact verified completion path', async () => {
    await expect(
      handleMobileAuthDeepLink('https://attacker.example/mobile/auth/complete?code=stolen'),
    ).resolves.toBe(false);
    expect(secureSession.load).not.toHaveBeenCalled();
  });

  it('consumes a valid handoff and stores the normal auth session', async () => {
    const navigateHome = vi.fn();
    secureSession.load.mockResolvedValue({
      value: JSON.stringify({ codeVerifier: 'v'.repeat(64) }),
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { id: 'user-1', displayName: 'Игрок' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      handleMobileAuthDeepLink(
        `https://ultimatehockey.ru/mobile/auth/complete?code=${'c'.repeat(43)}`,
        navigateHome,
      ),
    ).resolves.toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1' },
    });
    expect(browser.close).toHaveBeenCalledOnce();
    expect(secureSession.clear).toHaveBeenCalledWith({ slot: 'pendingAuth' });
    expect(navigateHome).toHaveBeenCalledOnce();
  });
});
