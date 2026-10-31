import { useEffect } from 'react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
type Event =
  | 'city_first_seen'
  | 'novice_course_opened'
  | 'push_prompt_shown'
  | 'push_permission_outcome'
  | 'app_session_started'
  | 'app_active';
type Outcome = 'granted' | 'denied' | 'default' | 'snoozed' | 'install_instructions' | 'error';
const sessions = new Map<string, { id: string; last: number }>();
const sent = new Set<string>();
function sessionFor(owner: string) {
  let session = sessions.get(owner);
  try {
    if (!session)
      session =
        JSON.parse(sessionStorage.getItem(`novice-session:${owner}`) ?? 'null') ?? undefined;
  } catch {
    /* Optional storage. */
  }
  const now = Date.now();
  if (
    !session ||
    typeof session.id !== 'string' ||
    !Number.isFinite(session.last) ||
    now - session.last > 30 * 60 * 1000
  ) {
    session = { id: crypto.randomUUID(), last: now };
    sent.clear();
  }
  session.last = now;
  sessions.set(owner, session);
  try {
    sessionStorage.setItem(`novice-session:${owner}`, JSON.stringify(session));
  } catch {
    /* Optional storage. */
  }
  return session.id;
}
export function trackNovice(event: Event, outcome?: Outcome): void {
  const auth = useAuthStore.getState();
  if (!auth.user?.id || !auth.accessToken || document.visibilityState === 'hidden') return;
  const sessionId = sessionFor(auth.user.id);
  const key = `${auth.user.id}:${sessionId}:${event}:${outcome ?? ''}:${new Date().toISOString().slice(0, 10)}`;
  if (sent.has(key)) return;
  sent.add(key);
  void apiFetch('/analytics/novice', {
    method: 'POST',
    body: JSON.stringify({ event, sessionId, ...(outcome ? { outcome } : {}) }),
  }).catch(() => sent.delete(key));
}
export function useFunnelObservation(event: Event, enabled = true) {
  const owner = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    if (!enabled || !owner) return;
    const visible = () => {
      if (document.visibilityState !== 'hidden') trackNovice(event);
    };
    visible();
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [event, enabled, owner]);
}
export function useFunnelActivity(enabled: boolean) {
  const owner = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    if (!enabled || !owner) return;
    const active = () => {
      trackNovice('app_session_started');
      trackNovice('app_active');
    };
    active();
    window.addEventListener('focus', active);
    document.addEventListener('visibilitychange', active);
    const timer = setInterval(active, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', active);
      document.removeEventListener('visibilitychange', active);
    };
  }, [enabled, owner]);
}
