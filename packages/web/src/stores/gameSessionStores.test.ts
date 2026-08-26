import { describe, expect, it } from 'vitest';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import type { DailyStateResponse } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';
import { useDailyStore } from './dailyStore.js';
import { useTrainingSessionStore } from './trainingSessionStore.js';

const dailyState = {
  state: 'period_active',
  current_period: 1,
} as unknown as DailyStateResponse;

const trainingState = {
  state: 'active',
  selected_period: 1,
} as unknown as TrainingStateResponse;

const amateurDuelState = {
  id: 'match-1',
  status: 'active',
} as unknown as AmateurDuelMatchState;

describe('game session stores', () => {
  it('clears a stale daily error when applying fresh state', () => {
    useDailyStore.setState({ data: null, deferredState: null, error: 'internal error' });

    useDailyStore.getState().applyState(dailyState);

    expect(useDailyStore.getState().error).toBeNull();
  });

  it('clears a stale training error when applying fresh state', () => {
    useTrainingSessionStore.setState({ data: null, error: 'internal error' });

    useTrainingSessionStore.getState().applyState(trainingState);

    expect(useTrainingSessionStore.getState().error).toBeNull();
  });

  it('clears a stale amateur duel error when applying fresh state', () => {
    useAmateurDuelStore.setState({ match: null, error: 'internal error' });

    useAmateurDuelStore.getState().applyState(amateurDuelState);

    expect(useAmateurDuelStore.getState().error).toBeNull();
  });
});
