import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import {
  approveAllAdminTournamentApplications,
  approveAdminTournamentParticipant,
  dispatchAdminTournamentCommunication,
  fetchAdminTournamentParticipants,
  fetchAdminTournaments,
  rejectAdminTournamentApplication,
} from './adminApi.js';

describe('tournament admin API', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'ADMIN-TOKEN', refreshToken: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
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
    await approveAllAdminTournamentApplications('tournament-1');
    await rejectAdminTournamentApplication('tournament-1', 'participant-2', 'Причина отказа');

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
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/admin/tournaments/tournament-1/participants/approve-all',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      '/api/admin/tournaments/tournament-1/participants/participant-2/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Причина отказа' }),
      }),
    );
  });

  it('sends the all-players audience and tournament button choice', async () => {
    await dispatchAdminTournamentCommunication('tournament-1', {
      idempotencyKey: 'tournament-1:mailing:1',
      kind: 'direct_message',
      audience: 'all_players',
      title: 'Новый турнир',
      body: 'Регистрация открыта.',
      includeTournamentButton: true,
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/tournaments/tournament-1/dispatches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: 'tournament-1:mailing:1',
          kind: 'direct_message',
          audience: 'all_players',
          title: 'Новый турнир',
          body: 'Регистрация открыта.',
          includeTournamentButton: true,
        }),
      }),
    );
  });

  it('keeps the lifecycle contract returned by the tournament list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              tournaments: [
                {
                  id: 'tournament-1',
                  lifecycle: {
                    action: 'playoff_schedule_missing',
                    dueAt: null,
                    approvedParticipantCount: 4,
                    requiredParticipantCount: 4,
                    reason: 'playoff_schedule_missing',
                  },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const response = await fetchAdminTournaments();

    expect(response.tournaments[0]?.lifecycle).toEqual({
      action: 'playoff_schedule_missing',
      dueAt: null,
      approvedParticipantCount: 4,
      requiredParticipantCount: 4,
      reason: 'playoff_schedule_missing',
    });
  });
});
