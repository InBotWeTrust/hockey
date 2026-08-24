import { create } from 'zustand';
import {
  abandonBonusAttempt,
  fetchCurrentBonusAttempt,
  startBonusPeriod,
  submitBonusShot,
  type BonusGameAttempt,
  type BonusShotRequest,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import type { ShotResultType } from '../api/duel.js';

interface BonusGameStoreState {
  attempt: BonusGameAttempt | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  inFlight: boolean;
  needsReconcile: boolean;
  loadCurrent: () => Promise<BonusGameAttempt | null>;
  applyState: (next: BonusGameAttempt | null) => void;
  optimisticAddShot: (claimed: ShotResultType) => void;
  startPeriod: () => Promise<BonusGameAttempt | null>;
  submitShot: (body: BonusShotRequest) => Promise<{
    serverResult: ShotResultType;
    attempt: BonusGameAttempt;
    rewardGranted: boolean;
  } | null>;
  abandon: () => Promise<BonusGameAttempt | null>;
  refresh: () => Promise<BonusGameAttempt | null>;
  canSubmitShot: () => boolean;
}

let shotInFlight = false;

function errorDetails(error: unknown, fallback: string): { message: string; code: string | null } {
  if (error instanceof ApiError) return { message: error.message, code: error.code };
  return { message: error instanceof Error ? error.message : fallback, code: null };
}

function applyServerAttempt(
  set: (partial: Partial<BonusGameStoreState>) => void,
  attempt: BonusGameAttempt | null,
): void {
  set({
    attempt,
    error: null,
    errorCode: null,
    needsReconcile: false,
  });
}

export const useBonusGameStore = create<BonusGameStoreState>()((set, get) => ({
  attempt: null,
  loading: false,
  error: null,
  errorCode: null,
  inFlight: false,
  needsReconcile: false,

  loadCurrent: async () => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const { attempt } = await fetchCurrentBonusAttempt();
      applyServerAttempt(set, attempt);
      set({ loading: false });
      return attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось загрузить бонус-попытку.');
      set({ loading: false, error: details.message, errorCode: details.code });
      return null;
    }
  },

  applyState: (next) => applyServerAttempt(set, next),

  optimisticAddShot: (claimed) => {
    const attempt = get().attempt;
    if (!attempt || attempt.status !== 'active' || attempt.state !== 'period_active') return;
    set({
      attempt: {
        ...attempt,
        shots_taken: attempt.shots_taken + 1,
        goals: attempt.goals + (claimed === 'goal' ? 1 : 0),
      },
    });
  },

  startPeriod: async () => {
    const attempt = get().attempt;
    if (!attempt || get().inFlight || get().needsReconcile) return null;
    set({ inFlight: true, error: null, errorCode: null });
    try {
      const response = await startBonusPeriod(attempt.id);
      applyServerAttempt(set, response.attempt);
      set({ inFlight: false });
      return response.attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось начать период.');
      set({
        inFlight: false,
        error: details.message,
        errorCode: details.code,
        needsReconcile: true,
      });
      return null;
    }
  },

  submitShot: async (body) => {
    const attempt = get().attempt;
    if (!attempt || !get().canSubmitShot() || shotInFlight) return null;
    shotInFlight = true;
    set({ inFlight: true, error: null, errorCode: null });
    try {
      const response = await submitBonusShot(attempt.id, body);
      applyServerAttempt(set, response.attempt);
      return {
        serverResult: response.server_result,
        attempt: response.attempt,
        rewardGranted: response.reward_granted,
      };
    } catch (error) {
      const details = errorDetails(error, 'Не удалось отправить бросок.');
      set({
        error: details.message,
        errorCode: details.code,
        needsReconcile: true,
      });
      return null;
    } finally {
      shotInFlight = false;
      set({ inFlight: false });
    }
  },

  abandon: async () => {
    const attempt = get().attempt;
    if (!attempt || get().inFlight || get().needsReconcile) return null;
    set({ inFlight: true, error: null, errorCode: null });
    try {
      const response = await abandonBonusAttempt(attempt.id);
      applyServerAttempt(set, response.attempt);
      set({ inFlight: false });
      return response.attempt;
    } catch (error) {
      const details = errorDetails(error, 'Не удалось завершить попытку.');
      set({
        inFlight: false,
        error: details.message,
        errorCode: details.code,
        needsReconcile: true,
      });
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
      attempt?.status === 'active' &&
      attempt.state === 'period_active'
    );
  },
}));
