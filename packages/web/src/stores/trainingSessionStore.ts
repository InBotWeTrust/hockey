import { create } from 'zustand';
import {
  fetchTrainingState,
  startTraining,
  submitTrainingShot,
  type TrainingStateResponse,
} from '../api/training.js';
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
  }) => Promise<{ serverResult: ShotResultType; state: TrainingStateResponse } | null>;
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
      set({ data, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load training',
      });
    }
  },

  start: async (periodNumber) => {
    set({ inFlight: true, error: null });
    try {
      const data = await startTraining({ period_number: periodNumber });
      set({ data, inFlight: false });
      return data;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start training',
      });
      return null;
    }
  },

  applyState: (next) => set({ data: next }),

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
    try {
      const res = await submitTrainingShot({
        shot_index: shotIndex,
        input,
        claimed_result: claimedResult,
      });
      set({ error: null });
      return { serverResult: res.server_result, state: res.state };
    } catch (err) {
      try {
        const data = await fetchTrainingState();
        set({ data, error: err instanceof Error ? err.message : 'training shot failed' });
      } catch {
        set({ error: err instanceof Error ? err.message : 'training shot failed' });
      }
      return null;
    }
  },
}));
