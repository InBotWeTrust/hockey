import { create } from 'zustand';
import { ApiError } from '../api/apiFetch.js';
import {
  fetchAmateurMatch,
  confirmTournamentDuelLoadout,
  readyAmateurDuel,
  startAmateurDuelPeriod,
  submitAmateurDuelShot,
  updateAmateurDuelLoadout,
  type AmateurDuelLoadoutSelection,
  type AmateurDuelMatchState,
  type SubmitAmateurDuelShotResponse,
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
  load: (
    matchId: string,
    options?: { reconcilePolling?: boolean },
  ) => Promise<AmateurDuelMatchState | null>;
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

function applyShotAcknowledgement(
  match: AmateurDuelMatchState,
  acknowledgement: SubmitAmateurDuelShotResponse,
): AmateurDuelMatchState {
  const inventoryReport = match.me.inventory_report.filter(
    (report) => report.periodNumber !== acknowledgement.current_period_inventory.periodNumber,
  );
  inventoryReport.push(acknowledgement.current_period_inventory);
  return {
    ...match,
    current_period_shots: acknowledgement.participant.current_period_shots,
    current_period_goals: acknowledgement.participant.current_period_goals,
    me: {
      ...match.me,
      state: acknowledgement.participant.state,
      current_period: acknowledgement.participant.current_period,
      current_period_shots: acknowledgement.participant.current_period_shots,
      current_period_goals: acknowledgement.participant.current_period_goals,
      shots_taken: acknowledgement.participant.shots_taken,
      goals: acknowledgement.participant.goals,
      inventory_report: inventoryReport,
    },
  };
}

const PARTICIPANT_STATE_ORDER: Record<AmateurDuelMatchState['me']['state'], number> = {
  invited: 0,
  loadout_pending: 1,
  ready: 2,
  period_active: 3,
  break_active: 4,
  accepted: 5,
  completed: 6,
  forfeit: 6,
};

const MATCH_STATUS_ORDER: Record<AmateurDuelMatchState['status'], number> = {
  invited: 0,
  ready_check: 1,
  active: 2,
  settled: 3,
  cancelled: 3,
  expired: 3,
};

function compareParticipantProgress(
  left: AmateurDuelMatchState['me'],
  right: AmateurDuelMatchState['me'],
): number {
  if (left.current_period !== right.current_period) {
    return left.current_period - right.current_period;
  }
  const stateDelta = PARTICIPANT_STATE_ORDER[left.state] - PARTICIPANT_STATE_ORDER[right.state];
  if (stateDelta !== 0) return stateDelta;
  if (left.shots_taken !== right.shots_taken) return left.shots_taken - right.shots_taken;
  if (left.current_period_shots !== right.current_period_shots) {
    return left.current_period_shots - right.current_period_shots;
  }
  return 0;
}

function newerServerTime(
  current: AmateurDuelMatchState,
  polled: AmateurDuelMatchState,
): {
  server_now: string;
  received_at_performance_ms?: number;
} {
  const currentServerNow = Date.parse(current.server_now);
  const polledServerNow = Date.parse(polled.server_now);
  if (Number.isFinite(currentServerNow) && currentServerNow > polledServerNow) {
    return {
      server_now: current.server_now,
      ...(current.received_at_performance_ms === undefined
        ? {}
        : { received_at_performance_ms: current.received_at_performance_ms }),
    };
  }
  return {
    server_now: polled.server_now,
    ...(polled.received_at_performance_ms === undefined
      ? {}
      : { received_at_performance_ms: polled.received_at_performance_ms }),
  };
}

function mergeOpponentProgress(
  current: AmateurDuelMatchState,
  polled: AmateurDuelMatchState,
): AmateurDuelMatchState {
  if (compareParticipantProgress(polled.opponent, current.opponent) < 0) return current;
  return {
    ...current,
    ...newerServerTime(current, polled),
    opponent: polled.opponent,
    opponent_recent_periods: polled.opponent_recent_periods,
  };
}

function reconcilePolledMatch(
  current: AmateurDuelMatchState,
  polled: AmateurDuelMatchState,
): AmateurDuelMatchState {
  if (current.id !== polled.id) return current;
  const statusDelta = MATCH_STATUS_ORDER[polled.status] - MATCH_STATUS_ORDER[current.status];
  if (statusDelta < 0) {
    return current.opponent && polled.opponent
      ? mergeOpponentProgress(current, polled)
      : current;
  }
  if (statusDelta > 0) return polled;
  if (!current.opponent || !polled.opponent) return polled;

  const myProgressDelta = compareParticipantProgress(polled.me, current.me);
  if (myProgressDelta > 0) return polled;
  if (myProgressDelta < 0) return mergeOpponentProgress(current, polled);

  const opponentProgressDelta = compareParticipantProgress(polled.opponent, current.opponent);
  if (opponentProgressDelta < 0) {
    return current;
  }
  return polled;
}

export const useAmateurDuelStore = create<AmateurDuelStoreState>()((set, get) => ({
  match: null,
  loading: false,
  error: null,
  inFlight: false,

  load: async (matchId, options = {}) => {
    const startedFromMatch = get().match;
    set({ loading: true, error: null });
    try {
      const { match } = await fetchAmateurMatch(matchId);
      const current = get().match;
      if (current !== startedFromMatch && !options.reconcilePolling) return match;
      if (current !== startedFromMatch && current?.id !== match.id) return match;
      set({
        match:
          options.reconcilePolling && current?.id === match.id
            ? reconcilePolledMatch(current, match)
            : match,
        loading: false,
        error: null,
      });
      return match;
    } catch (err) {
      if (get().match !== startedFromMatch) return null;
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
    await get().load(current.id, { reconcilePolling: true });
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
      if (err instanceof ApiError && err.status === 409 && get().match === current) {
        await get().refresh();
      }
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

  applyState: (next) => set({ match: next, loading: false, error: null }),

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
            error: outcome.error instanceof Error ? outcome.error.message : 'duel shot failed',
          });
        }
        return null;
      }
      const latest = get().match;
      if (!latest || latest.id !== current.id) return null;
      if (outcome.kind === 'reconciled') {
        set({ error: null });
        return {
          serverResult: claimedResult,
          state: reconcilePolledMatch(latest, outcome.value),
          isCurrent: () => get().match === latest,
        };
      }
      const acknowledgement = outcome.value;
      let next = applyShotAcknowledgement(latest, acknowledgement);
      let resolvedAgainst = latest;
      if (acknowledgement.settled || acknowledgement.participant.state !== 'period_active') {
        try {
          const refreshed = (await fetchAmateurMatch(current.id)).match;
          const live = get().match;
          if (!live || live.id !== current.id) return null;
          resolvedAgainst = live;
          next = reconcilePolledMatch(live, refreshed);
        } catch {
          // The shot is already authoritative. Keep the compact transition state
          // and let normal polling reconcile the richer break/result DTO.
        }
      }
      set({ error: null });
      return {
        serverResult: acknowledgement.server_result,
        state: next,
        isCurrent: () => get().match === resolvedAgainst,
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
