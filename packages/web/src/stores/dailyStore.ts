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
  loading: boolean;
  error: string | null;
  inFlight: boolean;
  refresh: () => Promise<void>;
  startPeriod: () => Promise<DailyStateResponse | null>;
  applyState: (next: DailyStateResponse) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (
    args: {
      shotIndex: number;
      input: ShotInputPayload;
      claimedResult: ShotResultType;
    },
  ) => Promise<{ serverResult: ShotResultType; state: DailyStateResponse } | null>;
}

export const useDailyStore = create<DailyStoreState>()((set, get) => ({
  data: null,
  loading: false,
  error: null,
  inFlight: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchDailyState();
      set({ data, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load',
      });
    }
  },

  startPeriod: async () => {
    set({ inFlight: true, error: null });
    try {
      const data = await startDailyPeriod();
      set({ data, inFlight: false });
      return data;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start period',
      });
      return null;
    }
  },

  applyState: (next) => set({ data: next }),

  optimisticAddShot: (claimed) => {
    const cur = get().data;
    if (!cur || cur.state !== 'period_active') return;
    set({
      data: {
        ...cur,
        current_period_shots: cur.current_period_shots + 1,
        current_period_goals:
          cur.current_period_goals + (claimed === 'goal' ? 1 : 0),
        daily_total_shots: cur.daily_total_shots + 1,
        daily_total_goals:
          cur.daily_total_goals + (claimed === 'goal' ? 1 : 0),
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
      set({ data: res.state, error: null });
      return { serverResult: res.server_result, state: res.state };
    } catch (err) {
      // Refresh state from server on any submission error so the UI gets
      // back into a consistent shape (e.g. period closed by timeout while
      // the user was tapping).
      try {
        const data = await fetchDailyState();
        set({ data, error: err instanceof Error ? err.message : 'shot failed' });
      } catch {
        set({ error: err instanceof Error ? err.message : 'shot failed' });
      }
      return null;
    }
  },
}));
