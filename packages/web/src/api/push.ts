import { apiFetch } from './apiFetch.js';

export interface PushConfig {
  supported: boolean;
  publicKey: string | null;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface TestPushResult {
  total: number;
  sent: number;
  failed: number;
}

export interface PushPreferences {
  chatNewDialogMessage: boolean;
  dailyGame: boolean;
  trainingAvailable: boolean;
  gameNews: boolean;
}

export type PushPreferencesPatch = Partial<PushPreferences>;

export function fetchPushConfig(): Promise<PushConfig> {
  return apiFetch<PushConfig>('/push/config');
}

export function fetchPushPreferences(): Promise<PushPreferences> {
  return apiFetch<PushPreferences>('/push/preferences');
}

export function updatePushPreferences(patch: PushPreferencesPatch): Promise<PushPreferences> {
  return apiFetch<PushPreferences>('/push/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function savePushSubscription(subscription: PushSubscriptionPayload): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export function deletePushSubscription(endpoint: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}

export function sendTestPush(): Promise<TestPushResult> {
  return apiFetch<TestPushResult>('/push/test', { method: 'POST' });
}
