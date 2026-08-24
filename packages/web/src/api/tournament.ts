import { apiFetch } from './apiFetch.js';

export type TournamentStatus =
  | 'registration'
  | 'registration_blocked'
  | 'scheduling'
  | 'regular'
  | 'playoff'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface TournamentSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: TournamentStatus;
  regularSource: 'head_to_head' | 'daily_aggregate';
  visibility: 'public' | 'hidden';
  revision: number;
  participantCount: number;
  myParticipantState: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  rules: {
    config: {
      participantLimit: number;
      entryFeeCoins: number;
      playoffSize: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface TournamentFixture {
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

export function fetchTournaments(): Promise<{ tournaments: TournamentSummary[] }> {
  return apiFetch('/tournaments');
}

export function applyToTournament(tournamentId: string) {
  return apiFetch<{ tournamentId: string; participantId: string; state: string }>(
    `/tournaments/${tournamentId}/applications`,
    { method: 'POST' },
  );
}

export function withdrawFromTournament(tournamentId: string) {
  return apiFetch<{ tournamentId: string; state: 'withdrawn' }>(
    `/tournaments/${tournamentId}/applications/me`,
    { method: 'DELETE' },
  );
}

export function fetchTournamentSchedule(tournamentId: string) {
  return apiFetch<{ fixtures: TournamentFixture[] }>(`/tournaments/${tournamentId}/schedule`);
}

export function fetchTournamentStandings(tournamentId: string) {
  return apiFetch<{ standings: Array<Record<string, unknown>> }>(
    `/tournaments/${tournamentId}/standings`,
  );
}

export function openTournamentFixtureSegment(tournamentId: string, fixtureId: string) {
  return apiFetch<{
    fixtureId: string;
    segmentId: string;
    duelMatchId: string;
    kind: string;
    sequenceNumber: number;
  }>(`/tournaments/${tournamentId}/fixtures/${fixtureId}/segments/open`, { method: 'POST' });
}
