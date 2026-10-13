import { afterEach, expect, it } from 'vitest';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
import { useAmateurDuelStore } from './amateurDuelStore.js';
afterEach(() => useAmateurDuelStore.setState({ match: null }));
it('does not roll back Marathon penalties with an older poll at the same shot revision', () => {
  const current = {
    id: 'scored',
    state_revision: 5,
    status: 'active',
    server_now: '2026-10-11T10:00:10Z',
    rules: { duelKind: 'marathon' },
    me: {
      state: 'period_active',
      current_period: 1,
      shots_taken: 3,
      current_period_shots: 3,
      goals: 2,
      format_score: 1,
      marathon_penalties: 1,
    },
    opponent: {
      state: 'period_active',
      current_period: 1,
      shots_taken: 0,
      current_period_shots: 0,
      goals: 0,
      format_score: 0,
      marathon_penalties: 1,
    },
  } as AmateurDuelMatchState;
  useAmateurDuelStore.setState({ match: current });
  useAmateurDuelStore
    .getState()
    .applyState({
      ...current,
      server_now: '2026-10-11T10:00:05Z',
      me: { ...current.me, format_score: 2, marathon_penalties: 0 },
    });
  expect(useAmateurDuelStore.getState().match?.me.format_score).toBe(1);
});
