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
  withGameRequestTimeout,
} from '../api/requestTimeout.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

interface PendingDuelShot {
  matchId: string;
  period: number;
  shotIndex: number;
  claimed: ShotResultType;
}

function pendingFor(match: AmateurDuelMatchState, pending: readonly PendingDuelShot[]) {
  if (!pending.length) return [];
  return match.me.state === 'period_active'
    ? pending.filter(shot => shot.matchId === match.id && shot.period === match.me.current_period &&
      shot.shotIndex > (match.me.current_period_shots ?? match.current_period_shots)) : [];
}

/** me.current_period_* is confirmed; top-level counters include local predictions. */
function projectPendingShots(match: AmateurDuelMatchState, pending: readonly PendingDuelShot[], strip = false): AmateurDuelMatchState {
  if (!pending.length && !strip) return match;
  if (match.me.state !== 'period_active') return match;
  const shots = match.me.current_period_shots ?? match.current_period_shots;
  const goals = match.me.current_period_goals ?? match.current_period_goals;
  const remaining = pendingFor(match, pending);
  const predictedGoals = remaining.filter(shot => shot.claimed === 'goal').length;
  return {...match, current_period_shots: shots + remaining.length,
    current_period_goals: goals + predictedGoals,
    me: {...match.me,
      shots_taken: match.me.shots_taken - Math.max(0, match.current_period_shots - shots) + remaining.length,
      goals: match.me.goals - Math.max(0, match.current_period_goals - goals) + predictedGoals,
    },
  };
}

interface AmateurDuelStoreState {
  match: AmateurDuelMatchState | null;
  pendingShots: PendingDuelShot[];
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
  discardPendingShots: (matchId: string, period: number, fromIndex: number) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{
    serverResult: ShotResultType;
    awardedPoints?: number;
    state: AmateurDuelMatchState;
    isCurrent: () => boolean;
  } | null>;
}

function retainFightProgress(current:AmateurDuelMatchState|null,incoming:AmateurDuelMatchState):AmateurDuelMatchState {
  return current?.id===incoming.id && current.fight && current.fight.id===incoming.fight?.id &&
    Number(current.fight?.revision??0)>Number(incoming.fight?.revision??0)
    ? {...incoming,fight:current.fight} : incoming;
}

function retainNewerMatch(current:AmateurDuelMatchState|null,incoming:AmateurDuelMatchState):AmateurDuelMatchState {
  return current?.id===incoming.id && (current.state_revision??0)>(incoming.state_revision??0)?current:retainDuelClock(current,retainFightProgress(current,incoming));
}

/** A slower response must not move the already running clock back into a result pause.
 * Keep the authoritative timestamp/elapsed values together; only adjust their local anchor. */
function retainDuelClock(
  current: AmateurDuelMatchState | null,
  incoming: AmateurDuelMatchState,
): AmateurDuelMatchState {
  if (!current || current.id !== incoming.id || current.received_at_performance_ms === undefined ||
      current.me.current_period !== incoming.me.current_period) return incoming;
  const currentServerMs = Date.parse(current.server_now);
  const incomingServerMs = Date.parse(incoming.server_now);
  const receivedAt = incoming.received_at_performance_ms ?? performance.now();
  if (!Number.isFinite(currentServerMs) || !Number.isFinite(incomingServerMs) ||
      !Number.isFinite(receivedAt) || !Number.isFinite(current.received_at_performance_ms)) return incoming;
  // Project both samples at the incoming anchor, even when it predates the current one.
  // Clamping this delta counts a deferred acknowledgement's age twice.
  const projectedNow = currentServerMs + receivedAt - current.received_at_performance_ms;
  if (incomingServerMs >= projectedNow) return incoming;
  return {...incoming, received_at_performance_ms: receivedAt - (projectedNow - incomingServerMs)};
}

function withoutRejectedOptimisticShot(
  latest: AmateurDuelMatchState,
  started: AmateurDuelMatchState,
  shotIndex: number,
  claimedResult: ShotResultType,
): AmateurDuelMatchState {
  if (latest.id !== started.id || latest.me.current_period !== started.me.current_period ||
      latest.me.state !== 'period_active' || latest.current_period_shots !== shotIndex ||
      latest.me.current_period_shots >= shotIndex) return latest;
  const goalDelta = claimedResult === 'goal' ? 1 : 0;
  return {...latest,
    current_period_shots: Math.max(0, latest.current_period_shots - 1),
    current_period_goals: Math.max(0, latest.current_period_goals - goalDelta),
    me: {...latest.me, shots_taken: Math.max(0, latest.me.shots_taken - 1),
      goals: Math.max(0, latest.me.goals - goalDelta)},
  };
}

function applyShotAcknowledgement(
  match: AmateurDuelMatchState,
  acknowledgement: SubmitAmateurDuelShotResponse,
): AmateurDuelMatchState {
  if(acknowledgement.state_revision!==undefined && acknowledgement.state_revision<(match.state_revision??0))return match;
  const inventoryReport = match.me.inventory_report.filter(
    (report) => report.periodNumber !== acknowledgement.current_period_inventory.periodNumber,
  );
  inventoryReport.push(acknowledgement.current_period_inventory);
  return retainDuelClock(match, {
    ...match,
    state_revision:acknowledgement.state_revision??match.state_revision??0,
    ...(acknowledgement.server_now ? {
      server_now: acknowledgement.server_now,
      received_at_performance_ms: performance.now(),
      period_started_at: acknowledgement.period_started_at ?? match.period_started_at,
      period_ends_at: acknowledgement.period_ends_at ?? match.period_ends_at,
    } : {}),
    current_period_shots: acknowledgement.participant.current_period_shots,
    current_period_goals: acknowledgement.participant.current_period_goals,
    me: {
      ...match.me,
      ...acknowledgement.participant,
      state: acknowledgement.participant.state,
      current_period: acknowledgement.participant.current_period,
      current_period_shots: acknowledgement.participant.current_period_shots,
      current_period_goals: acknowledgement.participant.current_period_goals,
      shots_taken: acknowledgement.participant.shots_taken,
      goals: acknowledgement.participant.goals,
      inventory_report: inventoryReport,
    },
  });
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
  if (left.current_period_shots !== right.current_period_shots) {
    return left.current_period_shots - right.current_period_shots;
  }
  if (left.shots_taken !== right.shots_taken) return left.shots_taken - right.shots_taken;
  return 0;
}

function mergeOpponentProgress(
  current: AmateurDuelMatchState,
  polled: AmateurDuelMatchState,
): AmateurDuelMatchState {
  if (compareParticipantProgress(polled.opponent, current.opponent) < 0) return current;
  return {
    ...current,
    // The retained local elapsed/remaining values belong to current.server_now.
    opponent: polled.opponent,
    opponent_recent_periods: polled.opponent_recent_periods,
  };
}

function isOlderScoredSnapshot(current: AmateurDuelMatchState | null, next: AmateurDuelMatchState): boolean {
  return current?.id === next.id &&
    (current.state_revision ?? 0) === (next.state_revision ?? 0) &&
    (current.rules?.duelKind === 'sniper' || current.rules?.duelKind === 'marathon' || current.rules?.duelKind === 'rhythm') &&
    Date.parse(current.server_now) > Date.parse(next.server_now) &&
    compareParticipantProgress(next.me, current.me) <= 0 &&
    compareParticipantProgress(next.opponent, current.opponent) <= 0;
}

function reconcilePolledMatch(
  current: AmateurDuelMatchState,
  polled: AmateurDuelMatchState,
): AmateurDuelMatchState {
  if (current.id !== polled.id) return current;
  polled=retainFightProgress(current,polled);
  if ((current.state_revision ?? 0) > (polled.state_revision ?? 0)) return current;
  if ((polled.state_revision ?? 0) > (current.state_revision ?? 0)) return polled;
  if (isOlderScoredSnapshot(current, polled)) return current;
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

const pendingMatchRefreshes = new Map<string, Promise<void>>();

export const useAmateurDuelStore = create<AmateurDuelStoreState>()((set, get) => ({
  match: null,
  pendingShots: [],
  loading: false,
  error: null,
  inFlight: false,

  load: async (matchId, options = {}) => {
    const startedFromMatch = get().match;
    set({ loading: true, error: null });
    try {
      const { match } = await withGameRequestTimeout((signal) => fetchAmateurMatch(matchId, { signal }));
      const current = get().match;
      if (current !== startedFromMatch && !options.reconcilePolling) return match;
      if (current !== startedFromMatch && current?.id !== match.id) return match;
      const incoming = options.reconcilePolling && current?.id === match.id
        ? retainDuelClock(current, reconcilePolledMatch(current, match))
        : retainDuelClock(current, match);
      const pending = get().pendingShots;
      set({match: projectPendingShots(incoming, pending), pendingShots: pendingFor(incoming, pending),
        loading: false, error: null});
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
    const existing = pendingMatchRefreshes.get(current.id);
    if (existing) return existing;
    const pending = get().load(current.id, { reconcilePolling: true }).then(() => undefined)
      .finally(() => pendingMatchRefreshes.delete(current.id));
    pendingMatchRefreshes.set(current.id, pending);
    return pending;
  },

  ready: async (loadout = {}) => {
    const current = get().match;
    if (!current) return null;
    if (get().inFlight) return null;
    set({ inFlight: true, error: null });
    try {
      const { match } = await readyAmateurDuel(current.id, loadout);
      set({ match:retainNewerMatch(get().match,match), inFlight: false, error: null });
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
      set({ match:retainNewerMatch(get().match,match), inFlight: false, error: null });
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
      if (get().match?.id !== current.id) {
        set({ inFlight: false });
        return null;
      }
      if (outcome.kind === 'unreconciled') {
        const message =
          outcome.error instanceof Error ? outcome.error.message : 'failed to start duel period';
        set({ match: retainNewerMatch(get().match,outcome.value), inFlight: false, error: message });
        return null;
      }
      const match = outcome.kind === 'request' ? outcome.value.match : outcome.value;
      const live = get().match;
      set({ match: live ? retainDuelClock(live, reconcilePolledMatch(live, match)) : match, inFlight: false, error: null });
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
      set({ match:retainNewerMatch(get().match,match), inFlight: false, error: null });
      return match;
    } catch (err) {
      set({
        inFlight: false,
        error: err instanceof Error ? err.message : 'failed to update duel loadout',
      });
      return null;
    }
  },

  applyState: (next) => {
    const current = get().match;
    if (current?.id === next.id && (current.state_revision ?? 0) > (next.state_revision ?? 0))
      return;
    if (isOlderScoredSnapshot(current, next)) return;
    let incoming = retainFightProgress(current, next);
    if (
      current?.id === next.id &&
      (current.state_revision ?? 0) === (next.state_revision ?? 0) &&
      current.opponent &&
      next.opponent
    ) {
      if (compareParticipantProgress(next.me, current.me) < 0)
        incoming = {
          ...current,
          // Keep the local clock snapshot and its timestamp together.
          ...(incoming.fight !== undefined ? { fight: incoming.fight } : {}),
        };
      else if (compareParticipantProgress(next.opponent, current.opponent) < 0)
        incoming = {
          ...incoming,
          opponent: current.opponent,
          opponent_recent_periods: current.opponent_recent_periods,
        };
    }
    const pending = get().pendingShots;
    set({match:projectPendingShots(retainDuelClock(current,incoming),pending),
      pendingShots:pendingFor(incoming,pending),loading:false,error:null});
  },

  discardPendingShots: (matchId, period, fromIndex) => {
    const current=get().match;
    if (!current || current.id!==matchId || current.me.current_period!==period) return;
    const remaining=get().pendingShots.filter(shot=>shot.matchId!==matchId || shot.period!==period || shot.shotIndex<fromIndex);
    set({pendingShots:remaining,match:projectPendingShots(current,remaining,true)});
  },

  optimisticAddShot: (claimed) => {
    const cur = get().match;
    if (!cur || cur.me.state !== 'period_active') return;
    set({
      pendingShots: [...get().pendingShots, {matchId:cur.id,period:cur.me.current_period,
        shotIndex:cur.current_period_shots+1,claimed}],
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
        retryOnceOnUnchanged: ['rhythm', 'sniper', 'marathon'].includes(current.rules?.duelKind ?? ''),
        reconcile: async (signal) => (await fetchAmateurMatch(current.id, { signal })).match,
        isReconciled: (match) =>
          match.id === current.id &&
          (match.me.state !== 'period_active' || match.current_period_shots >= shotIndex),
        isRequestErrorDefinitive: isDefinitiveGameRequestError,
      });
      if (outcome.kind === 'unreconciled') {
        const latest = get().match;
        if (latest?.id === current.id && latest.me.current_period === current.me.current_period) {
          const pending = get().pendingShots.filter(shot => shot.matchId !== current.id ||
            shot.period !== current.me.current_period || shot.shotIndex < shotIndex);
          const rolledBack = get().pendingShots.length
            ? projectPendingShots(latest, pending, true)
            : withoutRejectedOptimisticShot(latest, current, shotIndex, claimedResult);
          const incoming = reconcilePolledMatch(rolledBack, outcome.value);
          set({
            pendingShots: pendingFor(incoming, pending),
            match: projectPendingShots(retainDuelClock(latest, incoming), pending),
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
        ...(acknowledgement.awarded_points !== undefined ? { awardedPoints: acknowledgement.awarded_points } : {}),
        state: next,
        isCurrent: () => {
          const live=get().match;
          return live?.id===current.id && live.me.current_period===resolvedAgainst.me.current_period &&
            live.me.state===resolvedAgainst.me.state &&
            live.current_period_shots<=Math.max(resolvedAgainst.current_period_shots,shotIndex);
        },
      };
    } catch (err) {
      const latest = get().match;
      if (latest?.id === current.id && latest.me.current_period === current.me.current_period) {
        const pending = get().pendingShots.filter(shot => shot.matchId !== current.id ||
          shot.period !== current.me.current_period || shot.shotIndex < shotIndex);
        set({pendingShots:pending, match:get().pendingShots.length
          ? projectPendingShots(latest,pending,true)
          : withoutRejectedOptimisticShot(latest, current, shotIndex, claimedResult),
          error: err instanceof Error ? err.message : 'duel shot failed'});
        // Refresh inventory/clock restrictions as well as counters, without holding
        // the shot button on a second network request. Poll merging protects retries.
        void get().refresh();
      }
      return null;
    }
  },
}));

// Route exits/test resets and period transitions must not retain another session's predictions.
useAmateurDuelStore.subscribe((state, previous) => {
  if (state.pendingShots.length && (!state.match || state.match.id !== previous.match?.id ||
      state.match.me.current_period !== previous.match?.me.current_period || state.match.me.state !== 'period_active'))
    useAmateurDuelStore.setState({pendingShots:[]});
});
