import type * as AmateurApi from '../api/amateurDuel.js';
import { updateAmateurDuelLoadout } from '../api/amateurDuel.js';
vi.mock('../api/amateurDuel.js', async (original) => ({
  ...(await original<typeof AmateurApi>()),
  updateAmateurDuelLoadout: vi.fn(),
}));
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useAmateurDuelStore } from './amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
afterEach(() => {
  useAmateurDuelStore.setState({ match: null, inFlight: false });
  vi.clearAllMocks();
});
describe('fight authoritative revisions', () => {
  it('an older loadout response cannot replace a newer fight snapshot', async () => {
    const old = { id: 'match', state_revision: 1, fight: null } as unknown as AmateurDuelMatchState;
    const paused = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'offered' },
    } as unknown as AmateurDuelMatchState;
    let resolve!: (value: { match: AmateurDuelMatchState }) => void;
    vi.mocked(updateAmateurDuelLoadout).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    useAmateurDuelStore.setState({ match: old, inFlight: false });
    const request = useAmateurDuelStore.getState().updateLoadout({});
    useAmateurDuelStore.getState().applyState(paused);
    resolve({ match: old });
    await request;
    expect(useAmateurDuelStore.getState().match).toBe(paused);
  });
  it('old action response cannot remove a newer shared pause', () => {
    const current = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'offered' },
    } as unknown as AmateurDuelMatchState;
    const old = { id: 'match', state_revision: 1, fight: null } as unknown as AmateurDuelMatchState;
    useAmateurDuelStore.setState({ match: current });
    useAmateurDuelStore.getState().applyState(old);
    expect(useAmateurDuelStore.getState().match).toBe(current);
  });
  it('a result revision supersedes a prior fight snapshot', () => {
    const current = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'fighting' },
    } as unknown as AmateurDuelMatchState;
    const next = {
      id: 'match',
      state_revision: 3,
      fight: { status: 'resolved' },
    } as unknown as AmateurDuelMatchState;
    useAmateurDuelStore.setState({ match: current });
    useAmateurDuelStore.getState().applyState(next);
    expect(useAmateurDuelStore.getState().match).toBe(next);
  });
});
