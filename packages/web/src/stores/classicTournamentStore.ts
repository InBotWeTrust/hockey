import { create } from 'zustand';
import {
  fetchClassicTournamentState,
  startClassicTournamentPeriod,
  submitClassicTournamentShot,
  type ClassicTournamentState,
  type ClassicTournamentLoadoutSelection,
} from '../api/tournamentClassic.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';
import {
  isDefinitiveGameRequestError,
  withGameRequestReconciliation,
} from '../api/requestTimeout.js';
import { amateurAccessDetailsFromError } from '../amateur/amateurAccess.js';

interface ClassicTournamentStoreState {
  tournamentId: string | null;
  data: ClassicTournamentState | null;
  loading: boolean;
  inFlight: boolean;
  error: string | null;
  refresh: (tournamentId: string) => Promise<void>;
  startPeriod: (
    loadout?: ClassicTournamentLoadoutSelection,
  ) => Promise<ClassicTournamentState | null>;
  applyState: (state: ClassicTournamentState) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (input: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{
    serverResult: ShotResultType;
    state: ClassicTournamentState;
    isCurrent: () => boolean;
  } | null>;
}

// Background reads cannot replace the snapshot that owns a pending shot.
const pendingShots = new WeakSet<ClassicTournamentState>();
let refreshVersion = 0;

export const useClassicTournamentStore = create<ClassicTournamentStoreState>()((set, get) => ({
  tournamentId: null,
  data: null,
  loading: false,
  inFlight: false,
  error: null,

  refresh: async (tournamentId) => {
    const before = get().data;
    if (
      get().tournamentId === tournamentId &&
      (get().inFlight || (before !== null && pendingShots.has(before)))
    )
      return;
    const version = ++refreshVersion;
    set((current) => ({
      tournamentId,
      data: current.tournamentId === tournamentId ? current.data : null,
      inFlight: current.tournamentId === tournamentId ? current.inFlight : false,
      loading: true,
      error: null,
    }));
    const requestedState = get().data;
    try {
      const data = await fetchClassicTournamentState(tournamentId);
      if (version !== refreshVersion) return;
      if (
        get().data !== requestedState ||
        get().inFlight ||
        (requestedState !== null && pendingShots.has(requestedState))
      ) {
        set({ loading: false });
        return;
      }
      if (get().tournamentId === tournamentId) set({ data, loading: false, error: null });
    } catch (error) {
      if (version !== refreshVersion) return;
      if (
        get().data !== requestedState ||
        get().inFlight ||
        (requestedState !== null && pendingShots.has(requestedState))
      ) {
        set({ loading: false });
        return;
      }
      if (get().tournamentId === tournamentId) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Не удалось загрузить игру.',
        });
      }
    }
  },

  startPeriod: async (loadout) => {
    const tournamentId = get().tournamentId;
    if (tournamentId === null || get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const data =
        loadout === undefined
          ? await startClassicTournamentPeriod(tournamentId)
          : await startClassicTournamentPeriod(tournamentId, loadout);
      if (get().tournamentId !== tournamentId) return null;
      set({ data, inFlight: false, error: null });
      return data;
    } catch (error) {
      if (get().tournamentId === tournamentId) {
        set({
          inFlight: false,
          error:
            amateurAccessDetailsFromError(error) !== null
              ? null
              : error instanceof Error
                ? error.message
                : 'Не удалось начать период.',
        });
      }
      return null;
    }
  },

  applyState: (data) => set({ data, error: null }),

  optimisticAddShot: (claimed) => {
    const current = get().data;
    if (current?.state !== 'period_active') return;
    const goal = claimed === 'goal' ? 1 : 0;
    set({
      data: {
        ...current,
        current_period_shots: current.current_period_shots + 1,
        current_period_goals: current.current_period_goals + goal,
        daily_total_shots: current.daily_total_shots + 1,
        daily_total_goals: current.daily_total_goals + goal,
      },
    });
  },

  submitShot: async ({ shotIndex, input, claimedResult }) => {
    const tournamentId = get().tournamentId;
    const submittedState = get().data;
    if (tournamentId === null || submittedState === null) return null;
    if (submittedState !== null && pendingShots.has(submittedState)) return null;
    if (submittedState !== null) pendingShots.add(submittedState);
    try {
      const outcome = await withGameRequestReconciliation({
        request: (signal) =>
          submitClassicTournamentShot(
            tournamentId,
            { shot_index: shotIndex, input, claimed_result: claimedResult },
            { signal },
          ),
        reconcile: (signal) => fetchClassicTournamentState(tournamentId, { signal }),
        isReconciled: (state) =>
          state.state !== 'period_active' || state.current_period_shots >= shotIndex,
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (get().tournamentId !== tournamentId || get().data !== submittedState) return null;
      if (outcome.kind === 'unreconciled') {
        set({
          data: outcome.value,
          error:
            amateurAccessDetailsFromError(outcome.error) !== null
              ? null
              : outcome.error instanceof Error
                ? outcome.error.message
                : 'Бросок не сохранён.',
        });
        return null;
      }
      const response =
        outcome.kind === 'request'
          ? outcome.value
          : { server_result: claimedResult, state: outcome.value };
      return {
        serverResult: response.server_result,
        state: response.state,
        isCurrent: () => get().tournamentId === tournamentId && get().data === submittedState,
      };
    } catch (error) {
      if (get().tournamentId === tournamentId && get().data === submittedState) {
        const goal = claimedResult === 'goal' ? 1 : 0;
        set({
          data: {
            ...submittedState,
            current_period_shots: Math.max(0, submittedState.current_period_shots - 1),
            current_period_goals: Math.max(0, submittedState.current_period_goals - goal),
            daily_total_shots: Math.max(0, submittedState.daily_total_shots - 1),
            daily_total_goals: Math.max(0, submittedState.daily_total_goals - goal),
          },
          error:
            amateurAccessDetailsFromError(error) !== null
              ? null
              : error instanceof Error
                ? error.message
                : 'Бросок не сохранён.',
        });
      }
      return null;
    } finally {
      if (submittedState !== null) pendingShots.delete(submittedState);
    }
  },
}));
