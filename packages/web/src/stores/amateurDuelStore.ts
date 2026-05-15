import { create } from 'zustand';
import {
  fetchAmateurMatch,
  readyAmateurDuel,
  startAmateurDuelPeriod,
  submitAmateurDuelShot,
  type AmateurDuelLoadoutSelection,
  type AmateurDuelMatchState,
} from '../api/amateurDuel.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

interface AmateurDuelStoreState {
  match: AmateurDuelMatchState | null;
  loading: boolean;
  error: string | null;
  inFlight: boolean;
  load: (matchId: string) => Promise<AmateurDuelMatchState | null>;
  refresh: () => Promise<void>;
  ready: (loadout?: AmateurDuelLoadoutSelection) => Promise<AmateurDuelMatchState | null>;
  startPeriod: () => Promise<AmateurDuelMatchState | null>;
  applyState: (next: AmateurDuelMatchState) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{ serverResult: ShotResultType; state: AmateurDuelMatchState } | null>;
}

export const useAmateurDuelStore = create<AmateurDuelStoreState>()((set, get) => ({
  match: null,
  loading: false,
  error: null,
  inFlight: false,

  load: async (matchId) => {
    set({ loading: true, error: null });
    try {
      const { match } = await fetchAmateurMatch(matchId);
      set({ match, loading: false });
      return match;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'failed to load duel',
      });
      return null;
    }
  },

  refresh: async () => {
    const current = get().match;
    if (!current) return;
    await get().load(current.id);
  },

  ready: async (loadout = {}) => {
    const current = get().match;
    if (!current) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await readyAmateurDuel(current.id, loadout);
      set({ match, inFlight: false });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to ready duel',
      });
      return null;
    }
  },

  startPeriod: async () => {
    const current = get().match;
    if (!current) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await startAmateurDuelPeriod(current.id);
      set({ match, inFlight: false });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start duel period',
      });
      return null;
    }
  },

  applyState: (next) => set({ match: next }),

  optimisticAddShot: (claimed) => {
    const cur = get().match;
    if (!cur || cur.me.state !== 'period_active') return;
    set({
      match: {
        ...cur,
        current_period_shots: cur.current_period_shots + 1,
        current_period_goals: cur.current_period_goals + (claimed === 'goal' ? 1 : 0),
        me: {
          ...cur.me,
          shots_taken: cur.me.shots_taken + 1,
          goals: cur.me.goals + (claimed === 'goal' ? 1 : 0),
        },
      },
    });
  },

  submitShot: async ({ shotIndex, input, claimedResult }) => {
    const current = get().match;
    if (!current) return null;
    try {
      const res = await submitAmateurDuelShot(current.id, {
        shot_index: shotIndex,
        input,
        claimed_result: claimedResult,
      });
      set({ error: null });
      return { serverResult: res.server_result, state: res.match };
    } catch (err) {
      try {
        const { match } = await fetchAmateurMatch(current.id);
        set({ match, error: err instanceof Error ? err.message : 'duel shot failed' });
      } catch {
        set({ error: err instanceof Error ? err.message : 'duel shot failed' });
      }
      return null;
    }
  },
}));
