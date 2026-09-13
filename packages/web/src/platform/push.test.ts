import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { nativePush } from './push.js';

describe('nativePush', () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const pushNotifications = {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(async (event: string, callback: (value: unknown) => void) => {
      listeners.set(event, callback);
      return { remove: vi.fn() };
    }),
  };
  const preferences = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  const app = { getInfo: vi.fn() };

  beforeEach(() => {
    listeners.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('__HOCKEY_NATIVE__', { platform: 'android' });
    vi.stubGlobal('Capacitor', {
      getPlatform: () => 'android',
      Plugins: { PushNotifications: pushNotifications, Preferences: preferences, App: app },
    });
    pushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    pushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' });
    pushNotifications.register.mockResolvedValue(undefined);
    preferences.get.mockResolvedValue({ value: '22222222-2222-4222-8222-222222222222' });
    preferences.set.mockResolvedValue(undefined);
    preferences.remove.mockResolvedValue(undefined);
    app.getInfo.mockResolvedValue({ build: '7' });
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1', displayName: 'Игрок' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests permission and saves the FCM token for this installation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const subscribed = nativePush.subscribe();
    await vi.waitFor(() => expect(listeners.has('registration')).toBe(true));
    listeners.get('registration')!({ value: 'fcm-token' });
    await expect(subscribed).resolves.toEqual({ status: 'granted' });

    expect(pushNotifications.requestPermissions).toHaveBeenCalledOnce();
    expect(pushNotifications.register).toHaveBeenCalledOnce();
    const registrationHandle = await pushNotifications.addListener.mock.results[0]!.value;
    const errorHandle = await pushNotifications.addListener.mock.results[1]!.value;
    expect(registrationHandle.remove).toHaveBeenCalledOnce();
    expect(errorHandle.remove).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ultimatehockey.ru/api/push/android/installations/22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ token: 'fcm-token', appVersionCode: 7 }),
      }),
    );
  });

  it('re-registers an enabled installation at startup so refreshed tokens are saved', async () => {
    preferences.get.mockImplementation(async ({ key }: { key: string }) => ({
      value: key === 'android_push_enabled' ? 'true' : '22222222-2222-4222-8222-222222222222',
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await nativePush.addTokenRefreshListener();

    expect(pushNotifications.register).toHaveBeenCalledOnce();
    listeners.get('registration')!({ value: 'refreshed-token' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('clears the local opt-in even when server unregistration fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(nativePush.unsubscribe()).rejects.toThrow();

    expect(preferences.set).toHaveBeenCalledWith({
      key: 'android_push_enabled',
      value: 'false',
    });
  });

  it('clears the local opt-in before a server request can hang', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));

    void nativePush.unsubscribe();

    await vi.waitFor(() =>
      expect(preferences.set).toHaveBeenCalledWith({
        key: 'android_push_enabled',
        value: 'false',
      }),
    );
  });

  it('times out registration and removes temporary native listeners', async () => {
    vi.useFakeTimers();
    try {
      const subscription = nativePush.subscribe();
      const rejection = expect(subscription).rejects.toThrow('FCM registration timed out');
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);

      await rejection;
      const registrationHandle = await pushNotifications.addListener.mock.results[0]!.value;
      const errorHandle = await pushNotifications.addListener.mock.results[1]!.value;
      expect(registrationHandle.remove).toHaveBeenCalledOnce();
      expect(errorHandle.remove).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not register when Android permission is denied', async () => {
    pushNotifications.requestPermissions.mockResolvedValue({ receive: 'denied' });

    await expect(nativePush.subscribe()).resolves.toEqual({ status: 'denied' });
    expect(pushNotifications.register).not.toHaveBeenCalled();
  });

  it('does not treat OS permission as an active subscription before registration', async () => {
    pushNotifications.checkPermissions.mockResolvedValue({ receive: 'granted' });
    preferences.get.mockImplementation(async ({ key }: { key: string }) => ({
      value:
        key === 'android_push_installation_id' ? '22222222-2222-4222-8222-222222222222' : 'false',
    }));

    await expect(nativePush.getStatus()).resolves.toEqual({ status: 'prompt' });
  });
});
