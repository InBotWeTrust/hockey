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
  imageUrl?: string | null;
  status: TournamentStatus;
  regularSource: 'head_to_head' | 'daily_aggregate';
  visibility: 'public' | 'hidden';
  revision: number;
  participantCount: number;
  myParticipantState: string | null;
  myFinalPlace?: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  projectedEndsAt?: string | null;
  completedAt?: string | null;
  rewardEditability?: { regular: 'editable' | 'paid'; playoff: 'editable' | 'paid' };
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

export interface TournamentParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  seed: number | null;
}

export interface TournamentFixture {
  id: string;
  fixtureNumber: number;
  stage: string;
  roundNumber: number;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  status: string;
  venueMode: 'home_selected' | 'neutral_default';
  home: { userId: string; name: string | null; avatarUrl?: string | null } | null;
  away: { userId: string; name: string | null; avatarUrl?: string | null } | null;
  score: { home: number; away: number };
}

export interface TournamentMatchday {
  id: string;
  number: number;
  localDate: string;
  startsAt: string;
  endsAt: string;
}

export interface TournamentBracketSource {
  type: 'seed' | 'winner' | 'loser';
  participantId?: string;
  seriesKey?: string;
}

export interface TournamentBracketFixture {
  id: string;
  gameNumber: number;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  status: string;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide: 'home' | 'away' | null;
}

export interface TournamentBracketSeries {
  id: string;
  bracket_position: number;
  kind: 'championship' | 'third_place';
  round_number: number;
  round_name: string;
  wins_required: number;
  higher_seed_wins: number;
  lower_seed_wins: number;
  status: string;
  higher_user_id: string | null;
  higher_name: string | null;
  higher_avatar_url: string | null;
  higher_seed: number | null;
  lower_user_id: string | null;
  lower_name: string | null;
  lower_avatar_url: string | null;
  lower_seed: number | null;
  winner_user_id: string | null;
  depends_on: { key?: string; sources?: TournamentBracketSource[] } | null;
  fixtures: TournamentBracketFixture[];
}

export interface TournamentLiveParticipant {
  userId: string;
  state: string;
  currentPeriod: number;
  goals: number;
  shotsTaken: number;
}

export interface TournamentFixtureLiveOverlapWarning {
  fixtureId: string;
  tournamentId: string;
  tournamentTitle: string;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  acceptedLiveAt: string | null;
}

export interface TournamentLiveState {
  fixtureId: string;
  status: string;
  score: { home: number; away: number };
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  proposal: {
    id: string;
    proposedAt: string | null;
    proposedByUserId: string | null;
    state: string | null;
  } | null;
  overlapWarnings: TournamentFixtureLiveOverlapWarning[];
  duelMatchId: string | null;
  participants: TournamentLiveParticipant[];
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
  return apiFetch<{ fixtures: TournamentFixture[]; matchdays?: TournamentMatchday[] }>(
    `/tournaments/${tournamentId}/schedule`,
  );
}

export function fetchTournamentParticipants(tournamentId: string) {
  return apiFetch<{ participants: TournamentParticipant[] }>(
    `/tournaments/${tournamentId}/participants`,
  );
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

export function fetchTournamentBracket(tournamentId: string) {
  return apiFetch<{ series: TournamentBracketSeries[] }>(`/tournaments/${tournamentId}/bracket`);
}

export function fetchFixtureLiveState(fixtureId: string) {
  return apiFetch<{ live: TournamentLiveState | null }>(`/tournaments/fixtures/${fixtureId}/live`);
}

export function proposeFixtureLiveTime(fixtureId: string, proposedAt: string) {
  return apiFetch<{
    id: string;
    fixtureId: string;
    proposedAt: string;
    state: 'pending';
    overlapWarnings: TournamentFixtureLiveOverlapWarning[];
  }>(`/tournaments/fixtures/${fixtureId}/live/proposals`, {
    method: 'POST',
    body: JSON.stringify({ proposedAt }),
  });
}

export function respondFixtureLiveProposal(fixtureId: string, proposalId: string, accept: boolean) {
  return apiFetch<{
    fixtureId: string;
    proposalId: string;
    state: 'accepted' | 'declined';
    overlapWarnings: TournamentFixtureLiveOverlapWarning[];
  }>(`/tournaments/fixtures/${fixtureId}/live/proposals/${proposalId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}
