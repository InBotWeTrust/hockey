import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { readyAmateurDuel, startAmateurDuelPeriod } from '../api/amateurDuel.js';
import type { DailyStateResponse } from '../api/duel.js';
import { startDailyPeriod } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import { startTraining } from '../api/training.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';
import { useDailyStore } from './dailyStore.js';
import { useTrainingSessionStore } from './trainingSessionStore.js';

vi.mock('../api/duel.js', () => ({
  fetchDailyState: vi.fn(),
  startDailyPeriod: vi.fn(),
  submitDailyShot: vi.fn(),
}));

vi.mock('../api/training.js', () => ({
  fetchTrainingState: vi.fn(),
  startTraining: vi.fn(),
  submitTrainingShot: vi.fn(),
}));

vi.mock('../api/amateurDuel.js', () => ({
  fetchAmateurMatch: vi.fn(),
  readyAmateurDuel: vi.fn(),
  startAmateurDuelPeriod: vi.fn(),
  submitAmateurDuelShot: vi.fn(),
  updateAmateurDuelLoadout: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    useDailyStore.setState({
      data: null,
      deferredState: null,
      loading: false,
      error: null,
      inFlight: false,
    });
    useTrainingSessionStore.setState({
      data: null,
      loading: false,
      error: null,
      inFlight: false,
    });
    useAmateurDuelStore.setState({
      match: null,
      loading: false,
      error: null,
      inFlight: false,
    });
  });

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

  it('does not start a second daily period request while one is already in flight', async () => {
    useDailyStore.setState({ inFlight: true });

    const result = await useDailyStore.getState().startPeriod();

    expect(result).toBeNull();
    expect(startDailyPeriod).not.toHaveBeenCalled();
  });

  it('does not start a second training request while one is already in flight', async () => {
    useTrainingSessionStore.setState({ inFlight: true });

    const result = await useTrainingSessionStore.getState().start(1);

    expect(result).toBeNull();
    expect(startTraining).not.toHaveBeenCalled();
  });

  it('does not send duplicate amateur duel ready or start requests while one is in flight', async () => {
    useAmateurDuelStore.setState({ match: amateurDuelState, inFlight: true });

    const readyResult = await useAmateurDuelStore.getState().ready({});
    const startResult = await useAmateurDuelStore.getState().startPeriod({});

    expect(readyResult).toBeNull();
    expect(startResult).toBeNull();
    expect(readyAmateurDuel).not.toHaveBeenCalled();
    expect(startAmateurDuelPeriod).not.toHaveBeenCalled();
  });
});
