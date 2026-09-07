import { expect, it, vi } from 'vitest';
import { apiFetch } from './apiFetch.js';
import { fetchAmateurMatches, fetchAmateurMatch } from './amateurDuel.js';

vi.mock('./apiFetch.js', () => ({ apiFetch: vi.fn() }));

it('clears legacy duel locks when the authoritative gameplay lock is null', async () => {
  const legacyLock = {
    blocked: true,
    reason: 'active_classic',
    ends_at: null,
    tournament_starts_at: null,
  };
  vi.mocked(apiFetch).mockResolvedValueOnce({
    matches: [],
    gameplay_lock: null,
    duel_lock: legacyLock,
  });
  expect((await fetchAmateurMatches()).duel_lock).toBeNull();
  vi.mocked(apiFetch).mockResolvedValueOnce({
    match: { id: 'match', gameplay_lock: null, duel_lock: legacyLock },
  });
  expect((await fetchAmateurMatch('match')).match.duel_lock).toBeNull();
});
