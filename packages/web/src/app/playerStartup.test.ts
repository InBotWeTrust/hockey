import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { prepareInitialPlayerExperience } from './playerStartup.js';
import { apiFetch } from '../api/apiFetch.js';
import { fetchDailyState, type DailyStateResponse } from '../api/duel.js';
import { fetchTrainingState, type TrainingStateResponse } from '../api/training.js';
import { preloadStartupArtwork } from './artworkCache.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import type { ProfileData } from '../screens/profileTypes.js';

vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../api/duel.js', () => ({ fetchDailyState: vi.fn() }));
vi.mock('../api/training.js', () => ({ fetchTrainingState: vi.fn() }));
vi.mock('./artworkCache.js', () => ({ preloadStartupArtwork: vi.fn() }));

const profile: ProfileData = {
  id: 'player-1',
  registeredAt: '2026-09-17T00:00:00.000Z',
  displayName: 'Игрок',
  grip: 'right',
  competitionLevel: 'amateur',
  beginnerOnboardingCompleted: true,
  amateurUnlockGoalsRequired: 300,
  stats: { shots: 1400, goals: 920, accuracy: 65.7, playStreakDays: 4 },
  achievements: [],
};

const daily: DailyStateResponse = {
  state: 'idle',
  current_period: 0,
  current_period_shots: 0,
  current_period_goals: 0,
  daily_total_shots: 0,
  daily_total_goals: 0,
  lifetime_total_shots: 1400,
  lifetime_total_goals: 920,
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-09-17',
  next_day_starts_at: '2026-09-18T00:00:00.000Z',
  server_now: '2026-09-17T00:00:00.000Z',
  daily_seed: 'daily-seed',
  goalie_id: 'goalie-1',
  shots_per_period: 30,
  total_periods: 3,
  period_speed_presets: [],
  recent_periods: [],
  previous_game: null,
  training_cooldown_ends_at: null,
};

const training: TrainingStateResponse = {
  state: 'idle',
  selected_period: null,
  shots_taken: 0,
  goals: 0,
  shots_limit: 100,
  day_date: '2026-09-17',
  next_day_starts_at: '2026-09-18T00:00:00.000Z',
  training_seed: 'training-seed',
  started_at: null,
  server_now: '2026-09-17T00:00:00.000Z',
  goalie_id: 'goalie-1',
  period_speed_presets: [],
  tournament_day_locked: false,
  tournament_day_starts_at: null,
};

describe('prepareInitialPlayerExperience', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(fetchDailyState).mockReset();
    vi.mocked(fetchTrainingState).mockReset();
    vi.mocked(preloadStartupArtwork).mockReset();
    useDailyStore.setState({ data: null, deferredState: null, loading: false, error: null });
    useTrainingSessionStore.setState({ data: null, loading: false, error: null });
  });

  it('hydrates the root arena only after current profile, game data, and level art are ready', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const preloadRootRoute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiFetch).mockResolvedValue(profile);
    vi.mocked(fetchDailyState).mockResolvedValue(daily);
    vi.mocked(fetchTrainingState).mockResolvedValue(training);
    vi.mocked(preloadStartupArtwork).mockResolvedValue(undefined);

    await prepareInitialPlayerExperience(client, { preloadRootRoute });

    expect(client.getQueryData(['profile'])).toEqual(profile);
    expect(useDailyStore.getState().data).toEqual(daily);
    expect(useTrainingSessionStore.getState().data).toEqual(training);
    expect(preloadStartupArtwork).toHaveBeenCalledWith('amateur');
    expect(preloadRootRoute).toHaveBeenCalledTimes(1);
  });

  it('starts loading the root screen module while player data is still in flight', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveProfile!: (value: ProfileData) => void;
    let resolveDaily!: (value: DailyStateResponse) => void;
    let resolveTraining!: (value: TrainingStateResponse) => void;
    const profilePending = new Promise<ProfileData>((resolve) => {
      resolveProfile = resolve;
    });
    const dailyPending = new Promise<DailyStateResponse>((resolve) => {
      resolveDaily = resolve;
    });
    const trainingPending = new Promise<TrainingStateResponse>((resolve) => {
      resolveTraining = resolve;
    });
    const preloadRootRoute = vi.fn().mockResolvedValue(undefined);
    vi.mocked(apiFetch).mockReturnValue(profilePending);
    vi.mocked(fetchDailyState).mockReturnValue(dailyPending);
    vi.mocked(fetchTrainingState).mockReturnValue(trainingPending);
    vi.mocked(preloadStartupArtwork).mockResolvedValue(undefined);

    const preparing = prepareInitialPlayerExperience(client, { preloadRootRoute });

    expect(preloadRootRoute).toHaveBeenCalledTimes(1);
    resolveProfile(profile);
    resolveDaily(daily);
    resolveTraining(training);
    await preparing;
  });
});
