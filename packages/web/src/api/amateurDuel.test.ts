import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmateurAccessToastStore } from '../amateur/amateurAccessStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { acceptAmateurDuel, challengeAmateurDuel, declineAmateurDuel } from './amateurDuel.js';

describe('alternate Amateur duel mutation API', () => {
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
    [
      'challenge',
      () =>
        challengeAmateurDuel({
          template_id: 'template-1',
          opponent_user_id: 'opponent-1',
        }),
    ],
    ['accept invite', () => acceptAmateurDuel('match-1')],
    ['decline invite', () => declineAmateurDuel('match-1')],
  ])('maps a stale Amateur access rejection for %s exactly once', async (_label, mutate) => {
    await expect(mutate()).rejects.toMatchObject({ code: 'amateur_level_required' });
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 1,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });
  });
});
