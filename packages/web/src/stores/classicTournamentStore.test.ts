import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_PERIOD_SPEED_PRESETS } from '@hockey/game-core';
import type { ClassicTournamentState } from '../api/tournamentClassic.js';

const api = vi.hoisted(() => ({
  fetchClassicTournamentState: vi.fn(),
  startClassicTournamentPeriod: vi.fn(),
  submitClassicTournamentShot: vi.fn(),
}));

vi.mock('../api/tournamentClassic.js', () => api);

import { useClassicTournamentStore } from './classicTournamentStore.js';

function classicState(
  tournamentId: string,
  overrides: Partial<ClassicTournamentState> = {},
): ClassicTournamentState {
  return {
    tournament_id: tournamentId,
    tournament_title: `Турнир ${tournamentId}`,
    tournament_day: 1,
    session_id: `session-${tournamentId}`,
    expired: false,
    closes_at: '2026-09-01T21:00:00.000Z',
    period_duration_ms: 1_200_000,
    break_duration_ms: 900_000,
    result: null,
    state: 'idle',
    current_period: 0,
    current_period_shots: 0,
    current_period_goals: 0,
    daily_total_shots: 0,
    daily_total_goals: 0,
    lifetime_total_shots: 10,
    lifetime_total_goals: 4,
    period_started_at: null,
    period_ends_at: null,
    break_ends_at: null,
    day_date: '2026-09-01',
    next_day_starts_at: '2026-09-02T00:00:00.000Z',
    server_now: '2026-09-01T12:00:00.000Z',
    daily_seed: 'classic-seed',
    goalie_id: 'rookie',
    shots_per_period: 30,
    total_periods: 3,
    period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
    recent_periods: [],
    previous_game: null,
    training_cooldown_ends_at: null,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

describe('classicTournamentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClassicTournamentStore.setState({
      tournamentId: null,
      data: null,
      loading: false,
      inFlight: false,
      error: null,
    });
  });

  it('loads the selected tournament state', async () => {
    const state = classicState('classic-1');
    api.fetchClassicTournamentState.mockResolvedValue(state);

    await useClassicTournamentStore.getState().refresh('classic-1');

    expect(useClassicTournamentStore.getState()).toMatchObject({
      tournamentId: 'classic-1',
      data: state,
      loading: false,
      error: null,
    });
  });

  it('ignores a late response from the previously opened tournament', async () => {
    const first = deferred<ClassicTournamentState>();
    const second = deferred<ClassicTournamentState>();
    api.fetchClassicTournamentState
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstRefresh = useClassicTournamentStore.getState().refresh('classic-1');
    useClassicTournamentStore.setState({ inFlight: true });
    const secondRefresh = useClassicTournamentStore.getState().refresh('classic-2');
    expect(useClassicTournamentStore.getState().inFlight).toBe(false);

    first.resolve(classicState('classic-1'));
    await firstRefresh;
    expect(useClassicTournamentStore.getState().data).toBeNull();

    const secondState = classicState('classic-2');
    second.resolve(secondState);
    await secondRefresh;
    expect(useClassicTournamentStore.getState().data).toBe(secondState);
  });

  it('starts the next period only for the currently opened tournament', async () => {
    const idle = classicState('classic-1');
    const active = classicState('classic-1', {
      state: 'period_active',
      current_period: 1,
      period_started_at: '2026-09-01T12:00:00.000Z',
      period_ends_at: '2026-09-01T12:20:00.000Z',
    });
    useClassicTournamentStore.setState({ tournamentId: 'classic-1', data: idle });
    api.startClassicTournamentPeriod.mockResolvedValue(active);

    await expect(useClassicTournamentStore.getState().startPeriod()).resolves.toBe(active);
    expect(api.startClassicTournamentPeriod).toHaveBeenCalledWith('classic-1');
    expect(useClassicTournamentStore.getState().data).toBe(active);
  });

  it('keeps an optimistic goal when the server confirms the shot', async () => {
    const active = classicState('classic-1', {
      state: 'period_active',
      current_period: 1,
    });
    useClassicTournamentStore.setState({ tournamentId: 'classic-1', data: active });
    useClassicTournamentStore.getState().optimisticAddShot('goal');
    const optimistic = useClassicTournamentStore.getState().data!;
    const confirmed = classicState('classic-1', {
      state: 'period_active',
      current_period: 1,
      current_period_shots: 1,
      current_period_goals: 1,
      daily_total_shots: 1,
      daily_total_goals: 1,
    });
    api.submitClassicTournamentShot.mockResolvedValue({ server_result: 'goal', state: confirmed });

    const result = await useClassicTournamentStore.getState().submitShot({
      shotIndex: 1,
      input: { tapTime: 100 },
      claimedResult: 'goal',
    });

    expect(optimistic.current_period_shots).toBe(1);
    expect(result?.state).toBe(confirmed);
    expect(result?.isCurrent()).toBe(true);
  });

  it('restores the authoritative counters when a shot is rejected', async () => {
    const active = classicState('classic-1', {
      state: 'period_active',
      current_period: 1,
    });
    useClassicTournamentStore.setState({ tournamentId: 'classic-1', data: active });
    useClassicTournamentStore.getState().optimisticAddShot('goal');
    api.submitClassicTournamentShot.mockRejectedValue({ status: 409, message: 'conflict' });
    api.fetchClassicTournamentState.mockResolvedValue(active);

    await expect(
      useClassicTournamentStore.getState().submitShot({
        shotIndex: 1,
        input: { tapTime: 100 },
        claimedResult: 'goal',
      }),
    ).resolves.toBeNull();

    expect(useClassicTournamentStore.getState().data).toBe(active);
    expect(useClassicTournamentStore.getState().error).toBe('Бросок не сохранён.');
  });
});
