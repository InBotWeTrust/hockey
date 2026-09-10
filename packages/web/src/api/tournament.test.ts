import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmateurAccessToastStore } from '../amateur/amateurAccessStore.js';
import { useAuthStore } from '../auth/authStore.js';
import {
  acknowledgeRegularSeasonPodiumCongratulation,
  applyToTournament,
  dismissTournamentReadinessHint,
  fetchTournamentReadinessHint,
  fetchTournamentSchedule,
  fetchTournamentScheduleOtherGames,
  openTournamentFixtureSegment,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
  withdrawFromTournament,
} from './tournament.js';

describe('tournament public API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
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

  it('acknowledges a regular season podium congratulation', async () => {
    await acknowledgeRegularSeasonPodiumCongratulation('00000000-0000-4000-8000-000000000951');

    expect(fetch).toHaveBeenCalledWith(
      '/api/tournaments/congratulations/00000000-0000-4000-8000-000000000951/read',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['apply', () => applyToTournament('tournament-1')],
    ['withdraw', () => withdrawFromTournament('tournament-1')],
    ['open fixture', () => openTournamentFixtureSegment('tournament-1', 'fixture-1')],
    ['propose live time', () => proposeFixtureLiveTime('fixture-1', '2030-09-03T18:00:00.000Z')],
    ['respond to live proposal', () => respondFixtureLiveProposal('fixture-1', 'proposal-1', true)],
  ])('maps an Amateur access rejection for %s to the shared toast', async (_label, mutate) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'amateur_level_required',
            message: 'internal policy',
            details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(mutate()).rejects.toMatchObject({ code: 'amateur_level_required' });
    expect(useAmateurAccessToastStore.getState().toast).toMatchObject({
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });
  });
});
