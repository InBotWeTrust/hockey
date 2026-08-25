import { apiFetch } from '../api/apiFetch.js';

export interface AdminTournament {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  regularSource: 'head_to_head' | 'daily_aggregate';
  revision: number;
  participantCount: number;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  startsAt?: string | null;
  rules?: Record<string, unknown> & { config?: Record<string, unknown> };
}

export interface AdminTournamentParticipant {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  state: string;
  seed: number | null;
  entry_fee_coins: number;
  entry_fee_state: string;
}

export interface AdminTournamentFixture {
  id: string;
  fixtureNumber: number;
  stage: string;
  roundNumber: number;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  status: string;
  home: { userId: string; name: string | null } | null;
  away: { userId: string; name: string | null } | null;
  score: { home: number; away: number };
}

export function fetchAdminTournaments(): Promise<{ tournaments: AdminTournament[] }> {
  return apiFetch('/admin/tournaments');
}

export function createAdminTournament(body: Record<string, unknown>) {
  return apiFetch<{ tournament: AdminTournament }>('/admin/tournaments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminTournament(
  tournamentId: string,
  expectedRevision: number,
  body: Record<string, unknown>,
) {
  return apiFetch<{ tournament: AdminTournament }>(`/admin/tournaments/${tournamentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, expectedRevision }),
  });
}

export function duplicateAdminTournament(
  tournamentId: string,
  input: { slug: string; title: string },
) {
  return apiFetch<{ tournament: AdminTournament }>(
    `/admin/tournaments/${tournamentId}/duplicate`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function deleteAdminTournamentDraft(tournamentId: string): Promise<void> {
  return apiFetch(`/admin/tournaments/${tournamentId}`, { method: 'DELETE' });
}

export function cancelAdminTournament(tournamentId: string, expectedRevision: number) {
  return apiFetch(`/admin/tournaments/${tournamentId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision }),
  });
}

export function archiveAdminTournament(tournamentId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/archive`, { method: 'POST' });
}

export function pauseAdminTournament(tournamentId: string, reason: string) {
  return apiFetch<{ tournamentId: string; status: 'paused'; previousStatus: string }>(
    `/admin/tournaments/${tournamentId}/pause`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function resumeAdminTournament(tournamentId: string, reason: string) {
  return apiFetch<{ tournamentId: string; status: string }>(
    `/admin/tournaments/${tournamentId}/resume`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function inviteAdminTournamentParticipant(tournamentId: string, userId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function publishAdminTournament(tournamentId: string, expectedRevision: number) {
  return apiFetch(`/admin/tournaments/${tournamentId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision }),
  });
}

export function fetchAdminTournamentParticipants(tournamentId: string) {
  return apiFetch<{ participants: AdminTournamentParticipant[] }>(
    `/admin/tournaments/${tournamentId}/participants`,
  );
}

export function approveAdminTournamentParticipant(tournamentId: string, participantId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/participants/${participantId}/approve`, {
    method: 'POST',
  });
}

export function disqualifyAdminTournamentParticipant(
  tournamentId: string,
  participantId: string,
  reason: string,
) {
  return apiFetch(`/admin/tournaments/${tournamentId}/participants/${participantId}/disqualify`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function fetchAdminTournamentSchedule(tournamentId: string) {
  return apiFetch<{ fixtures: AdminTournamentFixture[] }>(
    `/admin/tournaments/${tournamentId}/schedule`,
  );
}

export function fetchAdminTournamentStandings(tournamentId: string) {
  return apiFetch<{ standings: Array<Record<string, unknown>> }>(
    `/admin/tournaments/${tournamentId}/standings`,
  );
}

export function fetchAdminTournamentBracket(tournamentId: string) {
  return apiFetch<{ series: Array<Record<string, unknown>> }>(
    `/admin/tournaments/${tournamentId}/bracket`,
  );
}

export function generateAdminTournamentSchedule(tournamentId: string, expectedRevision: number) {
  return apiFetch(`/admin/tournaments/${tournamentId}/schedule/generate`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision }),
  });
}

export function publishAdminTournamentSchedule(tournamentId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/schedule/publish`, { method: 'POST' });
}

export function startAdminTournamentPlayoffs(tournamentId: string) {
  return apiFetch(`/admin/tournaments/${tournamentId}/playoffs/start`, { method: 'POST' });
}

export function grantAdminTournamentRewards(tournamentId: string, stage: 'regular' | 'playoff') {
  return apiFetch(`/admin/tournaments/${tournamentId}/rewards/${stage}/grant`, { method: 'POST' });
}

export function rescheduleAdminTournamentFixture(
  tournamentId: string,
  fixtureId: string,
  input: { startsAt: string; endsAt: string; reason: string },
) {
  return apiFetch(`/admin/tournaments/${tournamentId}/fixtures/${fixtureId}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function resolveAdminTournamentNoShow(
  tournamentId: string,
  fixtureId: string,
  input: { absent: 'home' | 'away' | 'both'; reason: string },
) {
  return apiFetch(`/admin/tournaments/${tournamentId}/fixtures/${fixtureId}/no-show`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function previewAdminTournamentAudience(
  tournamentId: string,
  audience: 'approved' | 'all_participants',
) {
  return apiFetch<{ count: number; recipients: Array<Record<string, unknown>> }>(
    `/admin/tournaments/${tournamentId}/audience-preview?audience=${audience}`,
  );
}

export function fetchAdminTournamentDispatches(tournamentId: string) {
  return apiFetch<{ dispatches: Array<Record<string, unknown>> }>(
    `/admin/tournaments/${tournamentId}/dispatches`,
  );
}

export function dispatchAdminTournamentCommunication(
  tournamentId: string,
  input: {
    idempotencyKey: string;
    kind: 'push' | 'direct_message' | 'official_news';
    audience: 'approved' | 'all_participants';
    title: string;
    body: string;
  },
) {
  return apiFetch(`/admin/tournaments/${tournamentId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
