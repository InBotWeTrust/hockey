import { create } from 'zustand';
import {
  fetchDailyState,
  startDailyPeriod,
  submitDailyShot,
  type DailyStateResponse,
  type ShotInputPayload,
  type ShotResultType,
} from '../api/duel.js';
import {
  isDefinitiveGameRequestError,
  withGameRequestReconciliation,
} from '../api/requestTimeout.js';

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
  needsReconcile: boolean;
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
  }) => Promise<{
    serverResult: ShotResultType;
    state: DailyStateResponse;
    isCurrent: () => boolean;
  } | null>;
}

export const useDailyStore = create<DailyStoreState>()((set, get) => ({
  data: null,
  deferredState: null,
  loading: false,
  error: null,
  inFlight: false,
  needsReconcile: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchDailyState();
      set({ data, loading: false, error: null, needsReconcile: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load',
      });
    }
  },

  startPeriod: async () => {
    if (get().inFlight) return null;
    const submittedState = get().data;
    set({ inFlight: true, error: null });
    try {
      const outcome = await withGameRequestReconciliation({
        request: (signal) => startDailyPeriod({ signal }),
        reconcile: (signal) => fetchDailyState({ signal }),
        isReconciled: (state) => state.state !== 'idle',
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (get().data !== submittedState) {
        set({ inFlight: false });
        return null;
      }
      if (outcome.kind === 'unreconciled') {
        const message =
          outcome.error instanceof Error ? outcome.error.message : 'failed to start period';
        set({ data: outcome.value, inFlight: false, error: message });
        return null;
      }
      const data = outcome.value;
      set({ data, inFlight: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to start period';
      try {
        const data = await fetchDailyState();
        set({ data, inFlight: false, error: message });
        return data.state === 'idle' ? null : data;
      } catch {
        // Keep the original start error; the follow-up state refresh is best effort.
      }
      set({
        inFlight: false,
        error: message,
      });
      return null;
    }
  },

  applyState: (next) =>
    set({ data: next, deferredState: null, error: null, needsReconcile: false }),

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
    if (get().needsReconcile) return null;
    const submittedState = get().data;
    try {
      const outcome = await withGameRequestReconciliation({
        request: (signal) =>
          submitDailyShot(
          {
            shot_index: shotIndex,
            input,
            claimed_result: claimedResult,
          },
          { signal },
        ),
        reconcile: (signal) => fetchDailyState({ signal }),
        isReconciled: (state) =>
          state.state !== 'period_active' || state.current_period_shots >= shotIndex,
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (outcome.kind === 'unreconciled') {
        if (get().data === submittedState) {
          set({
            data: outcome.value,
            needsReconcile: false,
            error:
              outcome.error instanceof Error ? outcome.error.message : 'shot failed',
          });
        }
        return null;
      }
      const res =
        outcome.kind === 'request'
          ? outcome.value
          : { server_result: claimedResult, state: outcome.value };
      if (get().data !== submittedState) return null;
      // Caller decides when to applyState — for the 30th shot we want to
      // hold on the current view until the broadcast/period summary modals
      // are dismissed.
      set({ error: null });
      return {
        serverResult: res.server_result,
        state: res.state,
        isCurrent: () => get().data === submittedState,
      };
    } catch (err) {
      if (get().data === submittedState) {
        set({
          needsReconcile: true,
          error: err instanceof Error ? err.message : 'shot failed',
        });
      }
      return null;
    }
  },
}));
