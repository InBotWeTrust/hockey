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

export function publishAdminTournament(tournamentId: string, expectedRevision: number) {
  return apiFetch(`/admin/tournaments/${tournamentId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision }),
  });
}
