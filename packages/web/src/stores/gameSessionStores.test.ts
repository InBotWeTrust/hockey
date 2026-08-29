import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import {
  fetchAmateurMatch,
  readyAmateurDuel,
  startAmateurDuelPeriod,
  submitAmateurDuelShot,
} from '../api/amateurDuel.js';
import type { DailyStateResponse } from '../api/duel.js';
import { fetchDailyState, startDailyPeriod, submitDailyShot } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import { fetchTrainingState, startTraining, submitTrainingShot } from '../api/training.js';
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

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('game session stores', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('refreshes daily state when starting a period fails because the client is stale', async () => {
    const staleIdleState = {
      state: 'idle',
      current_period: 0,
    } as unknown as DailyStateResponse;
    const activeState = {
      state: 'period_active',
      current_period: 1,
    } as unknown as DailyStateResponse;
    vi.mocked(startDailyPeriod).mockRejectedValueOnce(new Error('already active'));
    vi.mocked(fetchDailyState).mockResolvedValueOnce(activeState);
    useDailyStore.setState({ data: staleIdleState, error: null });

    const result = await useDailyStore.getState().startPeriod();

    expect(result).toBe(activeState);
    expect(fetchDailyState).toHaveBeenCalledTimes(1);
    expect(useDailyStore.getState().data).toBe(activeState);
    expect(useDailyStore.getState().error).toBe('already active');
    expect(useDailyStore.getState().inFlight).toBe(false);
  });

  it('rolls back an optimistic final daily shot to the latest server state after submit fails', async () => {
    const staleActiveState = {
      state: 'period_active',
      current_period: 1,
      current_period_shots: 29,
      current_period_goals: 10,
      daily_total_shots: 29,
      daily_total_goals: 10,
      shots_per_period: 30,
      total_periods: 3,
      day_date: '2026-04-25',
    } as DailyStateResponse;
    const optimisticFinalState = {
      ...staleActiveState,
      current_period_shots: 30,
      current_period_goals: 11,
      daily_total_shots: 30,
      daily_total_goals: 11,
    };
    vi.mocked(submitDailyShot).mockRejectedValueOnce(new Error('internal error'));
    vi.mocked(fetchDailyState).mockResolvedValueOnce(staleActiveState);
    useDailyStore.setState({ data: optimisticFinalState, error: null });

    const result = await useDailyStore.getState().submitShot({
      shotIndex: 30,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });

    expect(result).toBeNull();
    expect(useDailyStore.getState().data?.current_period_shots).toBe(29);
    expect(useDailyStore.getState().data?.daily_total_shots).toBe(29);
    expect(useDailyStore.getState().error).toBe('internal error');
  });

  it('recovers the authoritative daily state when the final-shot request stalls', async () => {
    vi.useFakeTimers();
    const optimisticFinalState = {
      state: 'period_active',
      current_period: 3,
      current_period_shots: 30,
      current_period_goals: 18,
      daily_total_shots: 90,
      daily_total_goals: 54,
      shots_per_period: 30,
      total_periods: 3,
      day_date: '2026-04-25',
    } as DailyStateResponse;
    const completedState = {
      ...optimisticFinalState,
      state: 'closed' as const,
      current_period_shots: 0,
      current_period_goals: 0,
    };
    vi.mocked(submitDailyShot).mockImplementation(
      (_body, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        }),
    );
    vi.mocked(fetchDailyState).mockResolvedValueOnce(completedState);
    useDailyStore.setState({ data: optimisticFinalState, error: null });

    let settled = false;
    const submit = useDailyStore
      .getState()
      .submitShot({
        shotIndex: 30,
        input: { tapTime: 3000 },
        claimedResult: 'goal',
      })
      .finally(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(12_000);
    await submit;

    expect(settled).toBe(true);
    expect(fetchDailyState).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(useDailyStore.getState().data).toEqual(completedState);
    expect(useDailyStore.getState().error).toBeNull();
  });

  it('unlocks a daily retry when both final-shot requests stall', async () => {
    vi.useFakeTimers();
    const optimistic = {
      state: 'period_active',
      current_period: 1,
      current_period_shots: 100,
      current_period_goals: 51,
      daily_total_shots: 100,
      daily_total_goals: 51,
      shots_per_period: 100,
      total_periods: 1,
    } as DailyStateResponse;
    vi.mocked(submitDailyShot).mockImplementation(() => neverSettles());
    vi.mocked(fetchDailyState).mockImplementation(() => neverSettles());
    useDailyStore.setState({ data: optimistic });

    const submit = useDailyStore.getState().submitShot({
      shotIndex: 100,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.advanceTimersByTimeAsync(24_000);
    await submit;

    expect(useDailyStore.getState().data).toMatchObject({
      current_period_shots: 99,
      current_period_goals: 50,
      daily_total_shots: 99,
      daily_total_goals: 50,
    });
  });

  it('does not start a second training request while one is already in flight', async () => {
    useTrainingSessionStore.setState({ inFlight: true });

    const result = await useTrainingSessionStore.getState().start(1);

    expect(result).toBeNull();
    expect(startTraining).not.toHaveBeenCalled();
  });

  it('recovers training state when a shot request stalls', async () => {
    vi.useFakeTimers();
    const active = {
      ...trainingState,
      state: 'active' as const,
      shots_taken: 50,
      shots_limit: 50,
    };
    const closed = { ...active, state: 'closed' as const };
    vi.mocked(submitTrainingShot).mockImplementation(
      (_body, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        }),
    );
    vi.mocked(fetchTrainingState).mockResolvedValueOnce(closed);
    useTrainingSessionStore.setState({ data: active });

    const submit = useTrainingSessionStore.getState().submitShot({
      shotIndex: 50,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await submit;

    expect(fetchTrainingState).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(useTrainingSessionStore.getState().data).toEqual(closed);
    expect(useTrainingSessionStore.getState().error).toBeNull();
  });

  it('unlocks a training retry when both final-shot requests stall', async () => {
    vi.useFakeTimers();
    const optimistic = {
      ...trainingState,
      state: 'active' as const,
      shots_taken: 100,
      goals: 51,
      shots_limit: 100,
    };
    vi.mocked(submitTrainingShot).mockImplementation(() => neverSettles());
    vi.mocked(fetchTrainingState).mockImplementation(() => neverSettles());
    useTrainingSessionStore.setState({ data: optimistic });

    const submit = useTrainingSessionStore.getState().submitShot({
      shotIndex: 100,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.advanceTimersByTimeAsync(24_000);
    await submit;

    expect(useTrainingSessionStore.getState().data).toMatchObject({
      shots_taken: 99,
      goals: 50,
    });
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

  it('recovers duel state when a shot request stalls', async () => {
    vi.useFakeTimers();
    const active = {
      ...amateurDuelState,
      id: 'match-final-shot',
      me: { state: 'period_active' },
    } as AmateurDuelMatchState;
    const settled = {
      ...active,
      status: 'settled' as const,
      me: { ...active.me, state: 'completed' as const },
    };
    vi.mocked(submitAmateurDuelShot).mockImplementation(
      (_matchId, _body, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        }),
    );
    vi.mocked(fetchAmateurMatch).mockResolvedValueOnce({ match: settled });
    useAmateurDuelStore.setState({ match: active });

    const submit = useAmateurDuelStore.getState().submitShot({
      shotIndex: 30,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await submit;

    expect(fetchAmateurMatch).toHaveBeenCalledWith(active.id, {
      signal: expect.any(AbortSignal),
    });
    expect(useAmateurDuelStore.getState().match).toEqual(settled);
    expect(useAmateurDuelStore.getState().error).toBeNull();
  });

  it('unlocks a duel retry when both final-shot requests stall', async () => {
    vi.useFakeTimers();
    const optimistic = {
      ...amateurDuelState,
      id: 'match-final-shot',
      current_period_shots: 30,
      current_period_goals: 16,
      me: { state: 'period_active', shots_taken: 30, goals: 16 },
    } as AmateurDuelMatchState;
    vi.mocked(submitAmateurDuelShot).mockImplementation(() => neverSettles());
    vi.mocked(fetchAmateurMatch).mockImplementation(() => neverSettles());
    useAmateurDuelStore.setState({ match: optimistic });

    const submit = useAmateurDuelStore.getState().submitShot({
      shotIndex: 30,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.advanceTimersByTimeAsync(24_000);
    await submit;

    expect(useAmateurDuelStore.getState().match).toMatchObject({
      current_period_shots: 29,
      current_period_goals: 15,
      me: { shots_taken: 29, goals: 15 },
    });
  });

  it('does not replace a newly opened duel with late reconciliation from the previous duel', async () => {
    const previous = {
      ...amateurDuelState,
      id: 'match-a',
      me: { state: 'period_active' },
    } as AmateurDuelMatchState;
    const next = { ...previous, id: 'match-b' };
    let resolveReconciliation: ((value: { match: AmateurDuelMatchState }) => void) | undefined;
    vi.mocked(submitAmateurDuelShot).mockRejectedValueOnce(new Error('request failed'));
    vi.mocked(fetchAmateurMatch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReconciliation = resolve;
        }),
    );
    useAmateurDuelStore.setState({ match: previous });

    const submit = useAmateurDuelStore.getState().submitShot({
      shotIndex: 1,
      input: { tapTime: 3000 },
      claimedResult: 'goal',
    });
    await vi.waitFor(() => {
      expect(resolveReconciliation).toBeTypeOf('function');
    });
    useAmateurDuelStore.setState({ match: next });
    resolveReconciliation?.({ match: previous });
    await submit;

    expect(useAmateurDuelStore.getState().match).toBe(next);
  });
});
