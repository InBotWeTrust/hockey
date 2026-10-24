import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { prepareInitialPlayerExperience } from './playerStartup.js';
import { apiFetch } from '../api/apiFetch.js';
import { fetchDailyState } from '../api/duel.js';
import { fetchTrainingState } from '../api/training.js';
import { preloadStartupArtwork } from './artworkCache.js';
import { useAuthStore } from '../auth/authStore.js';
vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../api/duel.js', () => ({ fetchDailyState: vi.fn() }));
vi.mock('../api/training.js', () => ({ fetchTrainingState: vi.fn() }));
vi.mock('./artworkCache.js', () => ({ preloadStartupArtwork: vi.fn() }));
const profile = { id: 'player-1', competitionLevel: 'amateur', achievements: [] };
describe('destination player preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); useAuthStore.setState({ user: {id:'player-1',displayName:'Игрок'} });
    vi.mocked(apiFetch).mockResolvedValue(profile);
  });
  it('prepares account metadata without waiting for games or old arena images', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prepareInitialPlayerExperience(client);
    expect(apiFetch).toHaveBeenCalledWith('/me?summary=true&countersOnly=true', expect.anything());
    expect(client.getQueryData(['profile', 'summary', 'player-1'])).toEqual(profile);
    expect(client.getQueryData(['profile'])).toBeUndefined();
    expect(fetchDailyState).not.toHaveBeenCalled();
    expect(fetchTrainingState).not.toHaveBeenCalled();
    expect(preloadStartupArtwork).not.toHaveBeenCalled();
  });
  it('warms an explicitly requested game module without duplicating gameplay hydration', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const preloadRootRoute = vi.fn().mockResolvedValue(undefined);
    await prepareInitialPlayerExperience(client, {preloadRootRoute});
    expect(preloadRootRoute).toHaveBeenCalledOnce();
    expect(fetchDailyState).not.toHaveBeenCalled();
    expect(fetchTrainingState).not.toHaveBeenCalled();
  });
});
