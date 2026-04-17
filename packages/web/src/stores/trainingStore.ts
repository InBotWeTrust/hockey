import { create } from 'zustand';
import { GOALIES, getGoalie, type ShotResult } from '@hockey/game-core';

export interface TrainingState {
  currentGoalieId: string | null;
  seed: string;
  hpLeft: number;
  streak: number;
  shotIndex: number;
  sessionGoals: number;
  sessionMisses: number;
  lastResult: ShotResult | null;
  isCleared: boolean;

  startDuel: (goalieId: string) => void;
  applyResult: (result: ShotResult) => void;
  reset: () => void;
}

const EMPTY: Omit<TrainingState, 'startDuel' | 'applyResult' | 'reset'> = {
  currentGoalieId: null,
  seed: '',
  hpLeft: 0,
  streak: 0,
  shotIndex: 0,
  sessionGoals: 0,
  sessionMisses: 0,
  lastResult: null,
  isCleared: false,
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
  ...EMPTY,
  startDuel: (goalieId) => {
    const cfg = getGoalie(goalieId);
    const seed = `training:${cfg.id}:${Date.now().toString(36)}`;
    set({
      ...EMPTY,
      currentGoalieId: cfg.id,
      seed,
      hpLeft: cfg.hp,
    });
  },
  applyResult: (result) => {
    const st = get();
    if (!st.currentGoalieId) return;
    if (result.type === 'goal') {
      const nextHp = Math.max(0, st.hpLeft - 1);
      set({
        hpLeft: nextHp,
        streak: st.streak + 1,
        shotIndex: st.shotIndex + 1,
        sessionGoals: st.sessionGoals + 1,
        lastResult: result,
        isCleared: nextHp === 0,
      });
    } else if (result.type === 'save') {
      set({
        streak: 0,
        shotIndex: st.shotIndex + 1,
        lastResult: result,
      });
    } else {
      set({
        streak: 0,
        shotIndex: st.shotIndex + 1,
        sessionMisses: st.sessionMisses + 1,
        lastResult: result,
      });
    }
  },
  reset: () => set({ ...EMPTY }),
}));

export const ALL_GOALIES = GOALIES;
