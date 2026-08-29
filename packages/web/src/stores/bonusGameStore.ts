import { create } from 'zustand';
import {
  abandonBonusAttempt,
  acknowledgeBonusPreview,
  fetchBonusAttempt,
  fetchCurrentBonusAttempt,
  startBonusPeriod,
  submitBonusShot,
  type BonusGameAttempt,
  type BonusPeriodLoadoutSelection,
  type BonusShotRequest,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import type { ShotResultType } from '../api/duel.js';

interface PendingBonusShot {
  attempt: BonusGameAttempt;
  receivedAtPerformanceMs: number;
}

interface BonusGameStoreState {
  attempt: BonusGameAttempt | null;
  pendingShot: PendingBonusShot | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  inFlight: boolean;
  needsReconcile: boolean;
  requestEpoch: number;
  receivedAtPerformanceMs: number | null;
  loadCurrent: () => Promise<BonusGameAttempt | null>;
  loadAttempt: (attemptId: string) => Promise<BonusGameAttempt | null>;
  applyState: (next: BonusGameAttempt | null) => void;
  applyPendingShot: (fallback?: BonusGameAttempt) => BonusGameAttempt | null;
  optimisticAddShot: (claimed: ShotResultType) => void;
  startPeriod: (loadout?: BonusPeriodLoadoutSelection) => Promise<BonusGameAttempt | null>;
  acknowledgePreview: (dismissFuture: boolean) => Promise<BonusGameAttempt | null>;
  submitShot: (
    body: BonusShotRequest,
    options?: { deferApply?: boolean },
  ) => Promise<{
    serverResult: ShotResultType;
    attempt: BonusGameAttempt;
    rewardGranted: boolean;
  } | null>;
  abandon: () => Promise<BonusGameAttempt | null>;
  refresh: () => Promise<BonusGameAttempt | null>;
  canSubmitShot: () => boolean;
}

let shotInFlight = false;
const BONUS_SHOT_REQUEST_TIMEOUT_MS = 12_000;

async function withRequestTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BONUS_SHOT_REQUEST_TIMEOUT_MS);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

function errorDetails(error: unknown, fallback: string): { message: string; code: string | null } {
  if (error instanceof ApiError) return { message: error.message, code: error.code };
  return { message: fallback, code: null };
}

function applyServerAttempt(
  set: (partial: Partial<BonusGameStoreState>) => void,
  get: () => BonusGameStoreState,
  attempt: BonusGameAttempt | null,
  receivedAtPerformanceMs?: number,
): void {
  set({
    attempt,
    pendingShot: null,
    loading: false,
    error: null,
    errorCode: null,
    needsReconcile: false,
    requestEpoch: get().requestEpoch + 1,
    receivedAtPerformanceMs:
      attempt === null ? null : (receivedAtPerformanceMs ?? performance.now()),
  });
}

function beginMutation(
  set: (partial: Partial<BonusGameStoreState>) => void,
  get: () => BonusGameStoreState,
): void {
  // A read that started before this mutation cannot be used to clear a later
  // reconciliation lock or replace its server-confirmed result.
  set({
    inFlight: true,
    loading: false,
    error: null,
    errorCode: null,
    pendingShot: null,
    requestEpoch: get().requestEpoch + 1,
  });
}

function recordMutationFailure(
  set: (partial: Partial<BonusGameStoreState>) => void,
  get: () => BonusGameStoreState,
  details: { message: string; code: string | null },
): void {
  // Reads may have been issued after beginMutation. Invalidate them atomically
  // with the ambiguity lock so none can clear this failure before a fresh read.
  set({
    inFlight: false,
    loading: false,
    error: details.message,
    errorCode: details.code,
    needsReconcile: true,
    pendingShot: null,
    requestEpoch: get().requestEpoch + 1,
  });
}

export const useBonusGameStore = create<BonusGameStoreState>()((set, get) => ({
  attempt: null,
  pendingShot: null,
  loading: false,
  error: null,
  errorCode: null,
  inFlight: false,
  needsReconcile: false,
  requestEpoch: 0,
  receivedAtPerformanceMs: null,

  loadCurrent: async () => {
    if (get().pendingShot !== null) return get().attempt;
    const requestEpoch = get().requestEpoch + 1;
    set({ loading: true, requestEpoch });
    try {
      const { attempt } = await fetchCurrentBonusAttempt();
      if (get().requestEpoch !== requestEpoch) return get().attempt;
      applyServerAttempt(set, get, attempt);
      return attempt;
    } catch (error) {
      if (get().requestEpoch !== requestEpoch) return get().attempt;
      const current = get();
      if (current.needsReconcile && current.error !== null) {
        set({ loading: false });
        return null;
      }
      const details = errorDetails(error, 'Не удалось загрузить бонус-попытку.');
      set({ loading: false, error: details.message, errorCode: details.code });
      return null;
    }
  },

  loadAttempt: async (attemptId) => {
    if (get().pendingShot !== null) return get().attempt;
    const requestEpoch = get().requestEpoch + 1;
    set({ loading: true, requestEpoch });
    try {
      const { attempt } = await fetchBonusAttempt(attemptId);
      if (get().requestEpoch !== requestEpoch) return get().attempt;
      applyServerAttempt(set, get, attempt);
      return attempt;
    } catch (error) {
      if (get().requestEpoch !== requestEpoch) return get().attempt;
      const current = get();
      if (current.needsReconcile && current.error !== null) {
        set({ loading: false });
        return null;
      }
      const details = errorDetails(error, 'Не удалось загрузить бонус-попытку.');
      set({ loading: false, error: details.message, errorCode: details.code });
      return null;
    }
  },

  applyState: (next) => applyServerAttempt(set, get, next),

  applyPendingShot: (fallback) => {
    const pendingShot = get().pendingShot;
    const resolvedAttempt = pendingShot?.attempt ?? fallback ?? null;
    if (resolvedAttempt === null) return null;
    set({
      attempt: resolvedAttempt,
      pendingShot: null,
      loading: false,
      error: null,
      errorCode: null,
      inFlight: false,
      needsReconcile: false,
      requestEpoch: get().requestEpoch + 1,
      receivedAtPerformanceMs: pendingShot?.receivedAtPerformanceMs ?? performance.now(),
    });
    return resolvedAttempt;
  },

  optimisticAddShot: (claimed) => {
    const attempt = get().attempt;
    if (!attempt || attempt.status !== 'active' || attempt.state !== 'period_active') return;
    set({
      attempt: {
        ...attempt,
        shots_taken: attempt.shots_taken + 1,
        current_period_shots_taken: attempt.current_period_shots_taken + 1,
        goals: attempt.goals + (claimed === 'goal' ? 1 : 0),
        current_goal_streak:
          claimed === 'goal' ? attempt.current_goal_streak + 1 : 0,
        best_goal_streak:
          claimed === 'goal'
            ? Math.max(attempt.best_goal_streak, attempt.current_goal_streak + 1)
            : attempt.best_goal_streak,
      },
    });
  },

  acknowledgePreview: async (dismissFuture) => {
    const attempt = get().attempt;
    if (!attempt || get().inFlight || get().needsReconcile) return null;
    beginMutation(set, get);
    try {
      const response = await acknowledgeBonusPreview(attempt.id, dismissFuture);
      applyServerAttempt(set, get, response.attempt);
      set({ inFlight: false });
      return response.attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось сохранить просмотр превью.');
      recordMutationFailure(set, get, details);
      return null;
    }
  },

  startPeriod: async (loadout) => {
    const attempt = get().attempt;
    if (!attempt || get().inFlight || get().needsReconcile) return null;
    beginMutation(set, get);
    try {
      const response = await startBonusPeriod(attempt.id, loadout);
      applyServerAttempt(set, get, response.attempt);
      set({ inFlight: false });
      return response.attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось начать период.');
      recordMutationFailure(set, get, details);
      return null;
    }
  },

  submitShot: async (body, options) => {
    const attempt = get().attempt;
    if (!attempt || !get().canSubmitShot() || shotInFlight) return null;
    shotInFlight = true;
    beginMutation(set, get);
    let keepLockedForDeferredApply = false;
    try {
      const response = await withRequestTimeout((signal) =>
        submitBonusShot(attempt.id, body, { signal }),
      );
      const receivedAtPerformanceMs = performance.now();
      if (options?.deferApply) {
        keepLockedForDeferredApply = true;
        set({
          pendingShot: {
            attempt: response.attempt,
            receivedAtPerformanceMs,
          },
          loading: false,
          error: null,
          errorCode: null,
          needsReconcile: false,
          requestEpoch: get().requestEpoch + 1,
        });
      } else {
        applyServerAttempt(set, get, response.attempt, receivedAtPerformanceMs);
      }
      return {
        serverResult: response.server_result,
        attempt: response.attempt,
        rewardGranted: response.reward_granted,
      };
    } catch (error) {
      const details = errorDetails(error, 'Не удалось отправить бросок.');
      try {
        const reconciled = await withRequestTimeout((signal) =>
          fetchBonusAttempt(attempt.id, { signal }),
        );
        applyServerAttempt(set, get, reconciled.attempt);
      } catch {
        recordMutationFailure(set, get, details);
      }
      return null;
    } finally {
      shotInFlight = false;
      if (!keepLockedForDeferredApply) set({ inFlight: false });
    }
  },

  abandon: async () => {
    const attempt = get().attempt;
    if (!attempt || get().inFlight || get().needsReconcile) return null;
    beginMutation(set, get);
    try {
      const response = await abandonBonusAttempt(attempt.id);
      applyServerAttempt(set, get, response.attempt);
      set({ inFlight: false });
      return response.attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось завершить попытку.');
      recordMutationFailure(set, get, details);
      return null;
    }
  },

  refresh: async () => get().loadCurrent(),

  canSubmitShot: () => {
    const attempt = get().attempt;
    return (
      !shotInFlight &&
      !get().inFlight &&
      !get().needsReconcile &&
      get().pendingShot === null &&
      attempt?.status === 'active' &&
      attempt.state === 'period_active'
    );
  },
}));
