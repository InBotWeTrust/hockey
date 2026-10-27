import { afterEach, it, expect, vi } from 'vitest';
import * as dailyApi from '../api/duel.js';
import * as trainingApi from '../api/training.js';
import * as tournamentApi from '../api/tournamentClassic.js';
import { useDailyStore } from './dailyStore.js';
import { useTrainingSessionStore } from './trainingSessionStore.js';
import { useClassicTournamentStore } from './classicTournamentStore.js';
afterEach(() => {
  vi.restoreAllMocks();
});
it.each(['daily', 'training', 'tournament'])(
  'a delayed %s read must not roll back an accepted shot',
  async (kind) => {
    const input = {
      tapTime: 1000,
      shooterTapTime: 1000,
      puckSpeedPerMs: 1,
      shooterFrequency: 1,
      goalieFrequency: 1,
      goalFrequency: 1,
    };
    const base = {
      state: kind === 'training' ? 'active' : 'period_active',
      current_period: 1,
      selected_period: 1,
      current_period_shots: 0,
      current_period_goals: 0,
      daily_total_shots: 0,
      daily_total_goals: 0,
      shots_taken: 0,
      goals: 0,
    };
    const accepted = {
      ...base,
      current_period_shots: 1,
      current_period_goals: 1,
      daily_total_shots: 1,
      daily_total_goals: 1,
      shots_taken: 1,
      goals: 1,
    };
    const store =
      kind === 'daily'
        ? useDailyStore
        : kind === 'training'
          ? useTrainingSessionStore
          : useClassicTournamentStore;
    store.setState({ data: base, tournamentId: 'audit', needsReconcile: false } as never);
    let resolve!: (x: unknown) => void;
    const read =
      kind === 'daily'
        ? vi.spyOn(dailyApi, 'fetchDailyState')
        : kind === 'training'
          ? vi.spyOn(trainingApi, 'fetchTrainingState')
          : vi.spyOn(tournamentApi, 'fetchClassicTournamentState');
    read.mockImplementation(
      (() =>
        new Promise((r) => {
          resolve = r;
        })) as never,
    );
    const shot =
      kind === 'daily'
        ? vi.spyOn(dailyApi, 'submitDailyShot')
        : kind === 'training'
          ? vi.spyOn(trainingApi, 'submitTrainingShot')
          : vi.spyOn(tournamentApi, 'submitClassicTournamentShot');
    shot.mockResolvedValue({ server_result: 'goal', state: accepted } as never);
    const refresh =
      kind === 'tournament'
        ? useClassicTournamentStore.getState().refresh('audit')
        : kind === 'daily'
          ? useDailyStore.getState().refresh()
          : useTrainingSessionStore.getState().refresh();
    store.getState().optimisticAddShot('goal');
    const result = await store
      .getState()
      .submitShot({ shotIndex: 1, input, claimedResult: 'goal' });
    expect(result).not.toBeNull();
    store.getState().applyState(result!.state as never);
    expect(store.getState().data).toMatchObject(
      kind === 'training' ? { shots_taken: 1 } : { current_period_shots: 1 },
    );
    resolve({ ...base });
    await refresh;
    expect(store.getState().data).toMatchObject(
      kind === 'training' ? { shots_taken: 1 } : { current_period_shots: 1 },
    );
  },
);
it.each(['daily', 'training', 'tournament'])(
  'a %s refresh during a pending shot must not invalidate its acknowledgement',
  async (kind) => {
    const input = {
      tapTime: 1000,
      shooterTapTime: 1000,
      puckSpeedPerMs: 1,
      shooterFrequency: 1,
      goalieFrequency: 1,
      goalFrequency: 1,
    };
    const base = {
      state: kind === 'training' ? 'active' : 'period_active',
      current_period: 1,
      selected_period: 1,
      current_period_shots: 0,
      current_period_goals: 0,
      daily_total_shots: 0,
      daily_total_goals: 0,
      shots_taken: 0,
      goals: 0,
    };
    const accepted = {
      ...base,
      current_period_shots: 1,
      current_period_goals: 1,
      daily_total_shots: 1,
      daily_total_goals: 1,
      shots_taken: 1,
      goals: 1,
    };
    const store =
      kind === 'daily'
        ? useDailyStore
        : kind === 'training'
          ? useTrainingSessionStore
          : useClassicTournamentStore;
    store.setState({ data: base, tournamentId: 'audit', needsReconcile: false } as never);
    let resolveShot!: (x: unknown) => void;
    const read =
      kind === 'daily'
        ? vi.spyOn(dailyApi, 'fetchDailyState')
        : kind === 'training'
          ? vi.spyOn(trainingApi, 'fetchTrainingState')
          : vi.spyOn(tournamentApi, 'fetchClassicTournamentState');
    read.mockResolvedValue({ ...base } as never);
    const shot =
      kind === 'daily'
        ? vi.spyOn(dailyApi, 'submitDailyShot')
        : kind === 'training'
          ? vi.spyOn(trainingApi, 'submitTrainingShot')
          : vi.spyOn(tournamentApi, 'submitClassicTournamentShot');
    shot.mockImplementation(
      (() =>
        new Promise((r) => {
          resolveShot = r;
        })) as never,
    );
    store.getState().optimisticAddShot('goal');
    const pending = store.getState().submitShot({ shotIndex: 1, input, claimedResult: 'goal' });
    if (kind === 'tournament') await useClassicTournamentStore.getState().refresh('audit');
    else if (kind === 'daily') await useDailyStore.getState().refresh();
    else await useTrainingSessionStore.getState().refresh();
    resolveShot({ server_result: 'goal', state: accepted });
    const result = await pending;
    expect(result).not.toBeNull();
    expect(result?.isCurrent()).toBe(true);
    store.getState().applyState(result!.state as never);
    expect(store.getState().data).toMatchObject(
      kind === 'training' ? { shots_taken: 1 } : { current_period_shots: 1 },
    );
  },
);
