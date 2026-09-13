import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { initializeNativeNotifications } from './nativeNotifications.js';

describe('initializeNativeNotifications', () => {
  const listeners = new Map<string, (value: unknown) => void>();
  const pushNotifications = {
    createChannel: vi.fn(async (_channel: { id: string }) => undefined),
    addListener: vi.fn(async (event: string, callback: (value: unknown) => void) => {
      listeners.set(event, callback);
      const handle = { remove: vi.fn(async () => undefined) };
      return handle;
    }),
  };
  let queryClient: QueryClient;

  beforeEach(() => {
    listeners.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('__HOCKEY_NATIVE__', { platform: 'android' });
    vi.stubGlobal('Capacitor', {
      getPlatform: () => 'android',
      Plugins: { PushNotifications: pushNotifications },
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1', displayName: 'Игрок' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invalidates chat summaries for a foreground message without mutating message cache', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['chat', 'messages', 'chat-1'], { pages: [['existing']] });
    const cleanup = await initializeNativeNotifications(vi.fn(), { queryClient });

    listeners.get('pushNotificationReceived')!({
      data: { eventType: 'chat.new_dialog_message', url: '/chat/chat-1' },
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chat', 'list'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chat', 'unread'] });
    expect(queryClient.getQueryData(['chat', 'messages', 'chat-1'])).toEqual({
      pages: [['existing']],
    });
    await cleanup();
    const registeredHandles = await Promise.all(
      pushNotifications.addListener.mock.results.map((result) => result.value),
    );
    expect(registeredHandles.every((handle) => handle.remove.mock.calls.length === 1)).toBe(true);
  });

  it('creates the stable Android notification channels', async () => {
    await initializeNativeNotifications(vi.fn(), { queryClient });

    expect(pushNotifications.createChannel.mock.calls.map(([channel]) => channel.id)).toEqual([
      'messages',
      'gameplay',
      'tournaments',
      'news',
    ]);
  });

  it('restores auth, navigates through the allowlist and records one click', async () => {
    const navigate = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await initializeNativeNotifications(navigate, { queryClient });
    const action = {
      notification: {
        data: {
          url: '/chat/11111111-1111-4111-8111-111111111111',
          deliveryId: '22222222-2222-4222-8222-222222222222',
          eventType: 'chat.new_dialog_message',
        },
      },
    };

    listeners.get('pushNotificationActionPerformed')!(action);
    listeners.get('pushNotificationActionPerformed')!(action);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/chat/11111111-1111-4111-8111-111111111111');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ultimatehockey.ru/api/push/click',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ deliveryId: '22222222-2222-4222-8222-222222222222' }),
      }),
    );
  });

  it('falls back to the home screen for an unsafe notification URL', async () => {
    const navigate = vi.fn();
    await initializeNativeNotifications(navigate, { queryClient });

    listeners.get('pushNotificationActionPerformed')!({
      notification: { data: { url: 'https://evil.example', deliveryId: 'invalid' } },
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
  });

  it('retries click reporting after a transient request failure without navigating twice', async () => {
    const navigate = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    await initializeNativeNotifications(navigate, { queryClient });
    const action = {
      notification: {
        data: {
          url: '/achievements',
          deliveryId: '33333333-3333-4333-8333-333333333333',
        },
      },
    };

    listeners.get('pushNotificationActionPerformed')!(action);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    listeners.get('pushNotificationActionPerformed')!(action);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op in the browser', async () => {
    vi.stubGlobal('__HOCKEY_NATIVE__', undefined);
    vi.stubGlobal('Capacitor', { getPlatform: () => 'web' });

    const cleanup = await initializeNativeNotifications(vi.fn(), { queryClient });
    await cleanup();
    expect(pushNotifications.addListener).not.toHaveBeenCalled();
  });
});
