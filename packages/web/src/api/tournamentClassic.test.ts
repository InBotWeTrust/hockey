import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmateurAccessToastStore } from '../amateur/amateurAccessStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { startClassicTournamentPeriod, submitClassicTournamentShot } from './tournamentClassic.js';

describe('Classic tournament mutation API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
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
  });

  it.each([
    ['period start', () => startClassicTournamentPeriod('classic-1')],
    [
      'shot',
      () =>
        submitClassicTournamentShot('classic-1', {
          shot_index: 1,
          input: { tapTime: 100 },
          claimed_result: 'goal',
        }),
    ],
  ])('maps a stale Amateur access rejection for %s exactly once', async (_label, mutate) => {
    await expect(mutate()).rejects.toMatchObject({ code: 'amateur_level_required' });
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 1,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });
  });
});
