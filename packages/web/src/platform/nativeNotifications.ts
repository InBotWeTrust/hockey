import type { QueryClient } from '@tanstack/react-query';
import { queryClient as defaultQueryClient } from '../app/queryClient.js';
import { apiFetch } from '../api/apiFetch.js';
import { initializeAuthSession } from '../auth/authStore.js';
import { chatKeys } from '../lib/queryKeys.js';
import { resolveInternalDestination } from './deepLinks.js';
import { isNativeAndroid } from './runtime.js';

interface ListenerHandle {
  remove(): Promise<void>;
}

interface NotificationData {
  url?: unknown;
  deliveryId?: unknown;
  eventType?: unknown;
  title?: unknown;
  body?: unknown;
}

interface NativeNotification {
  data?: NotificationData;
}

interface NativePushPlugins {
  PushNotifications: {
    createChannel(channel: {
      id: string;
      name: string;
      description: string;
      importance: number;
      visibility: number;
    }): Promise<void>;
    addListener(
      event: 'pushNotificationReceived',
      callback: (notification: NativeNotification) => void,
    ): Promise<ListenerHandle>;
    addListener(
      event: 'pushNotificationActionPerformed',
      callback: (action: { notification?: NativeNotification }) => void,
    ): Promise<ListenerHandle>;
  };
}

interface InitializeNativeNotificationOptions {
  queryClient?: QueryClient;
}

const handledDeliveryIds = new Set<string>();
const reportedDeliveryIds = new Set<string>();
const clickRequests = new Map<string, Promise<void>>();
const DELIVERY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTIFICATION_CHANNELS = [
  { id: 'messages', name: 'Сообщения', description: 'Новые сообщения в чатах' },
  { id: 'gameplay', name: 'Игровые события', description: 'Игры, тренировки и дуэли' },
  { id: 'tournaments', name: 'Турниры', description: 'Расписание и результаты турниров' },
  { id: 'news', name: 'Новости', description: 'Новости Ultimate Hockey' },
] as const;

function plugins(): NativePushPlugins {
  const value = (
    globalThis as typeof globalThis & {
      Capacitor?: { Plugins?: Partial<NativePushPlugins> };
    }
  ).Capacitor?.Plugins;
  if (!value?.PushNotifications) throw new Error('Native notification bridge is unavailable');
  return value as NativePushPlugins;
}

function invalidateForEvent(queryClient: QueryClient, eventType: unknown): void {
  if (typeof eventType !== 'string') return;
  if (eventType.startsWith('chat.')) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
  } else if (eventType.startsWith('duel.')) {
    void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
  } else if (eventType.startsWith('tournament.')) {
    void queryClient.invalidateQueries({ queryKey: ['tournament'] });
  } else if (eventType.startsWith('daily.') || eventType.startsWith('training.')) {
    void queryClient.invalidateQueries({ queryKey: ['daily'] });
    void queryClient.invalidateQueries({ queryKey: ['training'] });
  } else if (eventType.startsWith('news.')) {
    void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
  }
}

async function recordClickOnce(deliveryId: unknown): Promise<void> {
  if (typeof deliveryId !== 'string' || !DELIVERY_ID_PATTERN.test(deliveryId)) return;
  if (reportedDeliveryIds.has(deliveryId)) return;
  const existing = clickRequests.get(deliveryId);
  if (existing !== undefined) return existing;
  const request = apiFetch('/push/click', {
    method: 'POST',
    body: JSON.stringify({ deliveryId }),
  })
    .then(() => {
      reportedDeliveryIds.add(deliveryId);
    })
    .catch(() => undefined)
    .finally(() => {
      clickRequests.delete(deliveryId);
    });
  clickRequests.set(deliveryId, request);
  await request;
}

export async function initializeNativeNotifications(
  navigate: (destination: string) => void,
  options: InitializeNativeNotificationOptions = {},
): Promise<() => Promise<void>> {
  if (!isNativeAndroid()) return async () => undefined;
  const queryClient = options.queryClient ?? defaultQueryClient;
  const push = plugins().PushNotifications;
  await Promise.all(
    NOTIFICATION_CHANNELS.map((channel) =>
      push.createChannel({ ...channel, importance: 4, visibility: 0 }),
    ),
  );
  const received = await push.addListener('pushNotificationReceived', (notification) => {
    invalidateForEvent(queryClient, notification.data?.eventType);
  });
  const action = await push.addListener('pushNotificationActionPerformed', (performed) => {
    const data = performed.notification?.data;
    const deliveryId = data?.deliveryId;
    const normalizedDeliveryId =
      typeof deliveryId === 'string' && DELIVERY_ID_PATTERN.test(deliveryId) ? deliveryId : null;
    const shouldNavigate =
      normalizedDeliveryId === null || !handledDeliveryIds.has(normalizedDeliveryId);
    if (normalizedDeliveryId !== null) {
      handledDeliveryIds.add(normalizedDeliveryId);
    }
    void (async () => {
      if (shouldNavigate) {
        await initializeAuthSession();
        const destination = resolveInternalDestination(
          typeof data?.url === 'string' ? data.url : '/',
        );
        navigate(destination);
      }
      await recordClickOnce(deliveryId);
    })();
  });

  return async () => {
    await Promise.all([received.remove(), action.remove()]);
  };
}
