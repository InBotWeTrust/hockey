import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import {
  approveAdminTournamentParticipant,
  fetchAdminTournamentParticipants,
} from './adminApi.js';

describe('tournament admin API', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'ADMIN-TOKEN', refreshToken: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ participants: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  it('uses participant operations scoped to the selected tournament', async () => {
    await fetchAdminTournamentParticipants('tournament-1');
    await approveAdminTournamentParticipant('tournament-1', 'participant-1');

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/tournaments/tournament-1/participants',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/tournaments/tournament-1/participants/participant-1/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
