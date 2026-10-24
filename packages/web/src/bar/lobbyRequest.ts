import { useAuthStore } from '../auth/authStore.js';
const pending = new Map<string, Promise<unknown>>();
/** Share only in-flight reads. Never reuse a completed lobby snapshot for an action. */
export function coalesceLobbyRequest<T>(resource: 'games' | 'cards', read: () => Promise<T>): Promise<T> {
  const session = useAuthStore.getState();
  const key = JSON.stringify([session.user?.id ?? null, session.accessToken, resource]);
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const request = read().finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}
