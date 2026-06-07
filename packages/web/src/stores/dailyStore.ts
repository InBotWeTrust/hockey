import { create } from 'zustand';
import {
  fetchDailyState,
  startDailyPeriod,
  submitDailyShot,
  type DailyStateResponse,
  type ShotInputPayload,
  type ShotResultType,
} from '../api/duel.js';

interface DailyStoreState {
  data: DailyStateResponse | null;
  // State returned by /shot but not yet applied. Set when submitting the
  // 30th shot of a period — we hold the visible state in `period_active`
  // (rink stays on screen) until the player dismisses the period summary
  // modal, which then promotes deferredState into data.
  deferredState: DailyStateResponse | null;
  loading: boolean;
  error: string | null;
  inFlight: boolean;
  refresh: () => Promise<void>;
  startPeriod: () => Promise<DailyStateResponse | null>;
  applyState: (next: DailyStateResponse) => void;
  setDeferredState: (next: DailyStateResponse) => void;
  applyDeferredState: () => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{ serverResult: ShotResultType; state: DailyStateResponse } | null>;
}

function isStaleFinalShotRefresh(
  current: DailyStateResponse | null,
  next: DailyStateResponse,
  shotIndex: number,
): boolean {
  if (!current || current.state !== 'period_active' || next.state !== 'period_active') return false;
  if (current.day_date !== next.day_date || current.current_period !== next.current_period) {
    return false;
  }
  if (shotIndex < current.shots_per_period) return false;
  if (current.current_period_shots < current.shots_per_period) return false;
  return next.current_period_shots < current.current_period_shots;
}

export const useDailyStore = create<DailyStoreState>()((set, get) => ({
  data: null,
  deferredState: null,
  loading: false,
  error: null,
  inFlight: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchDailyState();
      set({ data, loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load',
      });
    }
  },

  startPeriod: async () => {
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const data = await startDailyPeriod();
      set({ data, inFlight: false, error: null });
      return data;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start period',
      });
      return null;
    }
  },

  applyState: (next) => set({ data: next, deferredState: null, error: null }),

  setDeferredState: (next) => set({ deferredState: next }),

  applyDeferredState: () => {
    const pending = get().deferredState;
    if (pending) set({ data: pending, deferredState: null, error: null });
  },

  optimisticAddShot: (claimed) => {
    const cur = get().data;
    if (!cur || cur.state !== 'period_active') return;
    set({
      data: {
        ...cur,
        current_period_shots: cur.current_period_shots + 1,
        current_period_goals: cur.current_period_goals + (claimed === 'goal' ? 1 : 0),
        daily_total_shots: cur.daily_total_shots + 1,
        daily_total_goals: cur.daily_total_goals + (claimed === 'goal' ? 1 : 0),
      },
    });
  },

  submitShot: async ({ shotIndex, input, claimedResult }) => {
    try {
      const res = await submitDailyShot({
        shot_index: shotIndex,
        input,
        claimed_result: claimedResult,
      });
      // Caller decides when to applyState — for the 30th shot we want to
      // hold on the current view until the broadcast/period summary modals
      // are dismissed.
      set({ error: null });
      return { serverResult: res.server_result, state: res.state };
    } catch (err) {
      try {
        const current = get().data;
        const data = await fetchDailyState();
        set({
          data: isStaleFinalShotRefresh(current, data, shotIndex) ? current : data,
          error: err instanceof Error ? err.message : 'shot failed',
        });
      } catch {
        set({ error: err instanceof Error ? err.message : 'shot failed' });
      }
      return null;
    }
  },
}));
