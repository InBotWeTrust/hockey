import type { QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch.js';
import { fetchDailyState } from '../api/duel.js';
import { fetchTrainingState } from '../api/training.js';
import type { ProfileData } from '../screens/profileTypes.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { preloadStartupArtwork } from './artworkCache.js';

export async function prepareInitialPlayerExperience(
  queryClient: QueryClient,
  options: { preloadRootRoute?: () => Promise<unknown> } = {},
): Promise<void> {
  const profilePromise = queryClient.fetchQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  if (!options.preloadRootRoute) {
    const profile = await profilePromise;
    await preloadStartupArtwork(profile.competitionLevel);
    return;
  }

  const rootRoutePromise = options.preloadRootRoute();
  const [profile, daily, training] = await Promise.all([
    profilePromise,
    fetchDailyState(),
    fetchTrainingState(),
  ]);
  useDailyStore.getState().applyState(daily);
  useTrainingSessionStore.getState().applyState(training);
  await Promise.all([
    preloadStartupArtwork(profile.competitionLevel),
    rootRoutePromise,
  ]);
}
