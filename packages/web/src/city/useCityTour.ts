import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import {
  applyTourAction,
  cityTourPlaces,
  type CityTourApi,
  type TourAction,
  type TourState,
} from './cityTour.js';
const api: CityTourApi = {
  open: () => apiFetch('/city-tour/open', { method: 'POST' }),
  action: (action) =>
    apiFetch('/city-tour/action', { method: 'POST', body: JSON.stringify(action) }),
};
export function hasUnseenTourPlaces(state: TourState) {
  return (
    state.gameStarted &&
    state.viewed.length > 0 &&
    cityTourPlaces.some((place) => !state.viewed.includes(place.id))
  );
}
const openings = new Map<string, Promise<TourState>>();
const memoryQueues = new Map<string, TourAction[]>();
const unavailableStorage = new Set<string>();
const storageKey = (owner: string) => `city-tour-pending-v1:${owner}`;
function pending(owner: string): TourAction[] {
  if (unavailableStorage.has(owner)) return [...(memoryQueues.get(owner) ?? [])];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(owner)) ?? '[]');
    return Array.isArray(raw)
      ? raw
          .filter(
            (a): a is TourAction =>
              a &&
              typeof a === 'object' &&
              (['dismiss', 'finish'].includes(a.action) ||
                (a.action === 'view' && cityTourPlaces.some((p) => p.id === a.location))),
          )
          .slice(-64)
      : [];
  } catch {
    unavailableStorage.add(owner);
    return [...(memoryQueues.get(owner) ?? [])];
  }
}
function save(owner: string, actions: TourAction[]) {
  memoryQueues.set(owner, [...actions]);
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(actions));
  } catch {
    unavailableStorage.add(owner);
  }
}
export function useCityTour(
  owner: string | undefined,
  requested = false,
  previewApi?: CityTourApi,
) {
  const authenticated = useAuthStore((s) => s.user?.id);
  const transport = previewApi ?? api;
  const enabled = Boolean(owner && (previewApi || owner === authenticated));
  const [state, setState] = useState<TourState | null>(null);
  const [mode, setMode] = useState<'hidden' | 'intro' | 'tour' | 'complete' | 'compact' | 'resume'>(
    'hidden',
  );
  const [syncError, setSyncError] = useState(false);
  const running = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const sync = async () => {
    if (!enabled || !owner || running.current === owner) return;
    const current = generation.current;
    running.current = owner;
    try {
      while (
        generation.current === current &&
        (previewApi || useAuthStore.getState().user?.id === owner)
      ) {
        const actions = pending(owner);
        const first = actions[0];
        if (!first) break;
        await transport.action(first);
        const latest = pending(owner);
        if (JSON.stringify(latest[0]) === JSON.stringify(first)) {
          latest.shift();
          save(owner, latest);
        }
      }
      if (generation.current === current) setSyncError(false);
    } catch {
      if (generation.current === current) setSyncError(true);
    } finally {
      if (running.current === owner) running.current = null;
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    const current = ++generation.current;
    setState(null);
    setMode('hidden');
    if (!enabled || !owner) return;
    let disposed = false;
    const key = previewApi ? `preview:${owner}` : owner;
    let request = openings.get(key);
    if (!request) {
      request = transport.open().finally(() => openings.delete(key));
      openings.set(key, request);
    }
    void request
      .then((result) => {
        if (disposed || generation.current !== current) return;
        const queue = pending(owner);
        const merged = queue.reduce(applyTourAction, result);
        setState(merged);
        setMode(
          requested
            ? 'tour'
            : result.eligible
              ? result.autoShow && queue.length === 0
                ? 'intro'
                : 'compact'
              : hasUnseenTourPlaces(merged)
                ? 'resume'
                : 'hidden',
        );
        void syncRef.current();
      })
      .catch(() => {
        if (!disposed) setSyncError(true);
      });
    const online = () => setAttempt((n) => n + 1);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      window.removeEventListener('online', online);
    };
  }, [owner, enabled, requested, transport, attempt]);
  const record = (action: TourAction) => {
    if (!owner || !state) return;
    const queue = pending(owner);
    if (action.action !== 'view' || JSON.stringify(queue.at(-1)) !== JSON.stringify(action))
      queue.push(action);
    save(owner, queue);
    setState((previous) => (previous ? applyTourAction(previous, action) : previous));
    void syncRef.current();
  };
  // If play starts in another tab, only collapse automatic guidance; never move the map.
  useEffect(() => {
    if (!enabled || !owner || previewApi || requested || !state) return;
    let disposed = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void transport
        .open()
        .then((result) => {
          if (!disposed && (result.gameStarted || !result.eligible)) {
            const merged = pending(owner).reduce(applyTourAction, result);
            setState(merged);
            setMode((previous) =>
              previous === 'tour' && state.gameStarted
                ? previous
                : hasUnseenTourPlaces(merged)
                  ? 'resume'
                  : 'hidden',
            );
          }
        })
        .catch(() => {});
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, owner, previewApi, requested, transport, Boolean(state), state?.gameStarted]);
  return {
    state,
    mode,
    setMode,
    record,
    syncError,
    retry: () => {
      if (state) void syncRef.current();
      else setAttempt((n) => n + 1);
    },
  };
}
