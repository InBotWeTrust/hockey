import { create } from 'zustand';
import {
  fetchAmateurMatch,
  confirmTournamentDuelLoadout,
  readyAmateurDuel,
  startAmateurDuelPeriod,
  submitAmateurDuelShot,
  updateAmateurDuelLoadout,
  type AmateurDuelLoadoutSelection,
  type AmateurDuelMatchState,
} from '../api/amateurDuel.js';
import {
  isDefinitiveGameRequestError,
  withGameRequestReconciliation,
} from '../api/requestTimeout.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

interface AmateurDuelStoreState {
  match: AmateurDuelMatchState | null;
  loading: boolean;
  error: string | null;
  inFlight: boolean;
  load: (matchId: string) => Promise<AmateurDuelMatchState | null>;
  refresh: () => Promise<void>;
  ready: (loadout?: AmateurDuelLoadoutSelection) => Promise<AmateurDuelMatchState | null>;
  confirmTournamentLoadout: (
    loadout: AmateurDuelLoadoutSelection,
  ) => Promise<AmateurDuelMatchState | null>;
  startPeriod: (loadout?: AmateurDuelLoadoutSelection) => Promise<AmateurDuelMatchState | null>;
  updateLoadout: (
    loadout: Pick<AmateurDuelLoadoutSelection, 'stick'>,
  ) => Promise<AmateurDuelMatchState | null>;
  applyState: (next: AmateurDuelMatchState) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{
    serverResult: ShotResultType;
    state: AmateurDuelMatchState;
    isCurrent: () => boolean;
  } | null>;
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
      set({ match, loading: false, error: null });
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
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await readyAmateurDuel(current.id, loadout);
      set({ match, inFlight: false, error: null });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to ready duel',
      });
      return null;
    }
  },

  confirmTournamentLoadout: async (loadout) => {
    const current = get().match;
    if (!current || get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await confirmTournamentDuelLoadout(current.id, loadout);
      set({ match, inFlight: false, error: null });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to confirm tournament loadout',
      });
      return null;
    }
  },

  startPeriod: async (loadout) => {
    const current = get().match;
    if (!current) return null;
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const outcome = await withGameRequestReconciliation({
        request: (signal) => startAmateurDuelPeriod(current.id, loadout, { signal }),
        reconcile: async (signal) => (await fetchAmateurMatch(current.id, { signal })).match,
        isReconciled: (match) =>
          match.id === current.id &&
          (match.me.state !== 'accepted' || match.me.current_period > current.me.current_period),
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (get().match !== current) {
        set({ inFlight: false });
        return null;
      }
      if (outcome.kind === 'unreconciled') {
        const message =
          outcome.error instanceof Error ? outcome.error.message : 'failed to start duel period';
        set({ match: outcome.value, inFlight: false, error: message });
        return null;
      }
      const match = outcome.kind === 'request' ? outcome.value.match : outcome.value;
      set({ match, inFlight: false, error: null });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to start duel period',
      });
      return null;
    }
  },

  updateLoadout: async (loadout) => {
    const current = get().match;
    if (!current) return null;
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await updateAmateurDuelLoadout(current.id, loadout);
      set({ match, inFlight: false, error: null });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to update duel loadout',
      });
      return null;
    }
  },

  applyState: (next) => set({ match: next, error: null }),

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
      const outcome = await withGameRequestReconciliation({
        request: (signal) =>
          submitAmateurDuelShot(
          current.id,
          {
            shot_index: shotIndex,
            input,
            claimed_result: claimedResult,
          },
          { signal },
        ),
        reconcile: async (signal) => (await fetchAmateurMatch(current.id, { signal })).match,
        isReconciled: (match) =>
          match.id === current.id &&
          (match.me.state !== 'period_active' || match.current_period_shots >= shotIndex),
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (outcome.kind === 'unreconciled') {
        if (get().match === current) {
          set({
            match: outcome.value,
            error:
              outcome.error instanceof Error ? outcome.error.message : 'duel shot failed',
          });
        }
        return null;
      }
      const res =
        outcome.kind === 'request'
          ? outcome.value
          : { server_result: claimedResult, match: outcome.value };
      if (get().match !== current) return null;
      set({ error: null });
      return {
        serverResult: res.server_result,
        state: res.match,
        isCurrent: () => get().match === current,
      };
    } catch (err) {
      if (
        get().match === current &&
        current.me.state === 'period_active' &&
        current.current_period_shots === shotIndex
      ) {
        const goalDelta = claimedResult === 'goal' ? 1 : 0;
        set({
          match: {
            ...current,
            current_period_shots: Math.max(0, current.current_period_shots - 1),
            current_period_goals: Math.max(0, current.current_period_goals - goalDelta),
            me: {
              ...current.me,
              shots_taken: Math.max(0, current.me.shots_taken - 1),
              goals: Math.max(0, current.me.goals - goalDelta),
            },
          },
          error: err instanceof Error ? err.message : 'duel shot failed',
        });
      } else if (get().match === current) {
        set({ error: err instanceof Error ? err.message : 'duel shot failed' });
      }
      return null;
    }
  },
}));
