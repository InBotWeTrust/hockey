import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmateurAccessToastStore } from '../amateur/amateurAccessStore.js';
import { useAuthStore } from '../auth/authStore.js';
import { useRecoveryKit } from './inventory.js';

describe('inventory mutation API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ accessToken: 'TOKEN', refreshToken: null });
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
  });

  it('maps a stale Classic recovery restriction to the shared toast exactly once', async () => {
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

    await expect(
      useRecoveryKit({
        itemId: '10900000-0000-4000-8000-000000000030',
        action: 'start_classic',
        buyIfNeeded: true,
        idempotencyKey: '10900000-0000-4000-8000-000000000031',
      }),
    ).rejects.toMatchObject({ code: 'amateur_level_required' });
    expect(useAmateurAccessToastStore.getState()).toMatchObject({
      sequence: 1,
      toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });
  });
});
