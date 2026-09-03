import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import {
  dismissTournamentReadinessHint,
  fetchTournamentReadinessHint,
  fetchTournamentSchedule,
  fetchTournamentScheduleOtherGames,
} from './tournament.js';

describe('tournament public API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  it('scopes schedule reads and cursor pages by local date', async () => {
    await fetchTournamentSchedule('tournament-1', '2030-09-03');
    await fetchTournamentScheduleOtherGames('tournament-1', '2030-09-03', {
      fixtureNumber: 15,
      id: '00000000-0000-4000-8000-000000000715',
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/tournaments/tournament-1/schedule?date=2030-09-03',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/tournaments/tournament-1/schedule/other-games?date=2030-09-03&cursorFixtureNumber=15&cursorId=00000000-0000-4000-8000-000000000715',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('reads and idempotently dismisses the authenticated tournament hint', async () => {
    await fetchTournamentReadinessHint('tournament-1');
    await dismissTournamentReadinessHint('tournament-1');

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/tournaments/tournament-1/readiness-hint',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/tournaments/tournament-1/readiness-hint/dismiss',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
