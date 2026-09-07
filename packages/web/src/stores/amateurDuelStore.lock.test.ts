import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/amateurDuel.js';
import { ApiError } from '../api/apiFetch.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ordinary duel stale lock recovery', () => {
  it.each(['ready', 'startPeriod'] as const)(
    'refreshes authoritative lock after a rejected %s action',
    async (action) => {
      const original = {
        id: 'match-1',
        source: 'challenge',
        me: { state: 'accepted', current_period: 0 },
      } as api.AmateurDuelMatchState;
      const locked = {
        ...original,
        duel_lock: {
          blocked: true,
          reason: 'active_classic' as const,
          ends_at: null,
          tournament_starts_at: null,
        },
      };
      vi.spyOn(api, 'fetchAmateurMatch').mockResolvedValue({ match: locked });
      vi.spyOn(
        api,
        action === 'ready' ? 'readyAmateurDuel' : 'startAmateurDuelPeriod',
      ).mockRejectedValue(new ApiError(409, 'conflict', 'Временно недоступно'));
      useAmateurDuelStore.setState({
        match: original,
        inFlight: false,
        loading: false,
        error: null,
      });
      await useAmateurDuelStore.getState()[action]({});
      expect(useAmateurDuelStore.getState().match?.duel_lock).toEqual(locked.duel_lock);
      expect(useAmateurDuelStore.getState().inFlight).toBe(false);
    },
  );
});
