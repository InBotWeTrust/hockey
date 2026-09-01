import { apiFetch } from '../api/apiFetch.js';
import type { TournamentLifecycleDTO } from '../api/tournament.js';

export interface AdminTournament {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  status: string;
  regularSource: 'head_to_head' | 'daily_aggregate' | 'classic';
  revision: number;
  participantCount: number;
  lifecycle?: TournamentLifecycleDTO;
  pendingApplicationCount?: number;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  startsAt?: string | null;
  projectedEndsAt?: string | null;
  completedAt?: string | null;
  rewardEditability?: { regular: 'editable' | 'paid'; playoff: 'editable' | 'paid' };
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

export interface AdminTournamentMatchday {
  id: string;
  number: number;
  localDate: string;
  startsAt: string;
  endsAt: string;
}

export interface AdminTournamentDuelTemplate {
  id: string;
  title: string;
  isActive: boolean;
  duelKind: string;
  totalPeriods: number;
  shotsPerPeriod: number;
}

export interface AdminTournamentBracketSeries {
  id: string;
  status: string;
  higher_user_id: string | null;
  higher_name: string | null;
  higher_seed_wins: number;
  lower_user_id: string | null;
  lower_name: string | null;
  lower_seed_wins: number;
  winner_user_id?: string | null;
  [key: string]: unknown;
}

export interface AdminTournamentSeriesDecision {
  id: string;
  seriesId: string;
  winnerParticipantId: string;
  reason: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  factualScore: { higherSeedWins: number; lowerSeedWins: number };
  requestedAt: string;
  confirmedAt: string | null;
}

export interface AdminTournamentUserOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  isBlocked: boolean;
  identities: Array<{
    source?: 'custom' | 'telegram' | 'vk';
    label?: string;
    id?: string | null;
    username: string | null;
  }>;
}

export function fetchAdminTournaments(): Promise<{ tournaments: AdminTournament[] }> {
  return apiFetch('/admin/tournaments');
}

export function fetchAdminTournamentDuelTemplates(): Promise<{
  templates: AdminTournamentDuelTemplate[];
}> {
  return apiFetch('/admin/duel-templates');
}

export function fetchAdminTournamentUsers(query: string): Promise<{
  users: AdminTournamentUserOption[];
}> {
  const params = new URLSearchParams({ limit: '20', offset: '0', q: query.trim() });
  return apiFetch(`/admin/users?${params.toString()}`);
}

export function uploadAdminTournamentArtwork(
  file: File,
): Promise<{ url: string; objectKey: string }> {
  if (file.type !== 'image/webp') {
    return Promise.reject(
      new Error('Этот формат изображения не поддерживается. Выберите другой файл.'),
    );
  }
  if (file.size === 0) {
    return Promise.reject(new Error('Выбранное изображение пустое. Выберите другой файл.'));
  }
  return apiFetch('/admin/tournaments/media/artwork', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/webp',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
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

export function updateAdminTournamentRewards(
  tournamentId: string,
  expectedRevision: number,
  body: {
    regular?: Array<{ place: number; experience: number; coins: number; stars: number }>;
    playoff?: Array<{ place: number; experience: number; coins: number; stars: number }>;
  },
) {
  return apiFetch<{ tournament: AdminTournament }>(`/admin/tournaments/${tournamentId}/rewards`, {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevision, ...body }),
  });
}

export function duplicateAdminTournament(tournamentId: string, input: { title: string }) {
  return apiFetch<{ tournament: AdminTournament }>(`/admin/tournaments/${tournamentId}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

export function approveAllAdminTournamentApplications(tournamentId: string) {
  return apiFetch<{ approvedCount: number }>(
    `/admin/tournaments/${tournamentId}/participants/approve-all`,
    { method: 'POST' },
  );
}

export function rejectAdminTournamentApplication(
  tournamentId: string,
  participantId: string,
  reason: string,
) {
  return apiFetch<{ participantId: string; state: 'rejected' }>(
    `/admin/tournaments/${tournamentId}/participants/${participantId}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
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
  return apiFetch<{ fixtures: AdminTournamentFixture[]; matchdays?: AdminTournamentMatchday[] }>(
    `/admin/tournaments/${tournamentId}/schedule`,
  );
}

export function fetchAdminTournamentStandings(tournamentId: string) {
  return apiFetch<{ standings: Array<Record<string, unknown>> }>(
    `/admin/tournaments/${tournamentId}/standings`,
  );
}

export function fetchAdminTournamentBracket(tournamentId: string) {
  return apiFetch<{ series: AdminTournamentBracketSeries[] }>(
    `/admin/tournaments/${tournamentId}/bracket`,
  );
}

export function requestAdminTournamentSeriesWinner(
  tournamentId: string,
  seriesId: string,
  input: { winnerParticipantId: string; reason: string; idempotencyKey: string },
) {
  return apiFetch<AdminTournamentSeriesDecision>(
    `/admin/tournaments/${tournamentId}/series/${seriesId}/winner-decisions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function confirmAdminTournamentSeriesWinner(
  tournamentId: string,
  seriesId: string,
  decisionId: string,
) {
  return apiFetch<AdminTournamentSeriesDecision>(
    `/admin/tournaments/${tournamentId}/series/${seriesId}/winner-decisions/${decisionId}/confirm`,
    { method: 'POST' },
  );
}

export function generateAdminTournamentSchedule(tournamentId: string, expectedRevision: number) {
  return apiFetch<{
    tournamentId: string;
    status: 'scheduling' | 'registration_blocked';
    participantCount?: number;
    matchdayCount?: number;
    roundCount?: number;
    fixtureCount?: number;
  }>(`/admin/tournaments/${tournamentId}/schedule/generate`, {
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
  audience: 'approved' | 'all_participants' | 'all_players',
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

export interface AdminTournamentDispatchResult {
  dispatchId: string;
  status: 'sent' | 'partially_failed' | 'failed';
  recipients: number;
  delivered: number;
  failed: number;
}

export function dispatchAdminTournamentCommunication(
  tournamentId: string,
  input: {
    idempotencyKey: string;
    kind: 'push' | 'direct_message' | 'official_news';
    audience: 'approved' | 'all_participants' | 'all_players';
    title: string;
    body: string;
    includeTournamentButton?: boolean;
  },
) {
  return apiFetch<AdminTournamentDispatchResult>(`/admin/tournaments/${tournamentId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
