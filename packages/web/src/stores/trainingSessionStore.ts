import { create } from 'zustand';
import {
  fetchTrainingState,
  startTraining,
  submitTrainingShot,
  type TrainingStateResponse,
} from '../api/training.js';
import {
  isDefinitiveGameRequestError,
  withGameRequestReconciliation,
} from '../api/requestTimeout.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

interface TrainingSessionStoreState {
  data: TrainingStateResponse | null;
  loading: boolean;
  error: string | null;
  inFlight: boolean;
  refresh: () => Promise<void>;
  start: (periodNumber: number) => Promise<TrainingStateResponse | null>;
  applyState: (next: TrainingStateResponse) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{
    serverResult: ShotResultType;
    state: TrainingStateResponse;
    isCurrent: () => boolean;
  } | null>;
}

export const useTrainingSessionStore = create<TrainingSessionStoreState>()((set, get) => ({
  data: null,
  loading: false,
  error: null,
  inFlight: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchTrainingState();
      set({ data, loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load training',
      });
    }
  },

  start: async (periodNumber) => {
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const data = await startTraining({ period_number: periodNumber });
      set({ data, inFlight: false, error: null });
      return data;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start training',
      });
      return null;
    }
  },

  applyState: (next) => set({ data: next, error: null }),

  optimisticAddShot: (claimed) => {
    const cur = get().data;
    if (!cur || cur.state !== 'active') return;
    set({
      data: {
        ...cur,
        shots_taken: cur.shots_taken + 1,
        goals: cur.goals + (claimed === 'goal' ? 1 : 0),
      },
    });
  },

  submitShot: async ({ shotIndex, input, claimedResult }) => {
    const submittedState = get().data;
    try {
      const outcome = await withGameRequestReconciliation({
        request: (signal) =>
          submitTrainingShot(
          {
            shot_index: shotIndex,
            input,
            claimed_result: claimedResult,
          },
          { signal },
        ),
        reconcile: (signal) => fetchTrainingState({ signal }),
        isReconciled: (state) => state.state !== 'active' || state.shots_taken >= shotIndex,
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (outcome.kind === 'unreconciled') {
        if (get().data === submittedState) {
          set({
            data: outcome.value,
            error:
              outcome.error instanceof Error
                ? outcome.error.message
                : 'training shot failed',
          });
        }
        return null;
      }
      const res =
        outcome.kind === 'request'
          ? outcome.value
          : { server_result: claimedResult, state: outcome.value };
      if (get().data !== submittedState) return null;
      set({ error: null });
      return {
        serverResult: res.server_result,
        state: res.state,
        isCurrent: () => get().data === submittedState,
      };
    } catch (err) {
      if (
        submittedState &&
        get().data === submittedState &&
        submittedState.state === 'active' &&
        submittedState.shots_taken === shotIndex
      ) {
        set({
          data: {
            ...submittedState,
            shots_taken: Math.max(0, submittedState.shots_taken - 1),
            goals: Math.max(0, submittedState.goals - (claimedResult === 'goal' ? 1 : 0)),
          },
          error: err instanceof Error ? err.message : 'training shot failed',
        });
      } else if (get().data === submittedState) {
        set({ error: err instanceof Error ? err.message : 'training shot failed' });
      }
      return null;
    }
  },
}));
