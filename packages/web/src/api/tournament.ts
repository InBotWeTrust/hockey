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

export interface RegularSeasonPodiumCongratulation {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  place: 1 | 2 | 3;
  reward: {
    coins: number;
    stars: number;
    experience: number;
  };
  createdAt: string;
}

export type TournamentLifecycleAction =
  | 'legacy_requires_audit'
  | 'registration_waiting'
  | 'registration_open'
  | 'generate_schedule'
  | 'block_registration'
  | 'await_manual_regular_start'
  | 'regular_active'
  | 'await_regular_results'
  | 'playoff_schedule_missing'
  | 'await_playoff_time'
  | 'start_playoff'
  | 'playoff_active'
  | 'terminal'
  | 'unchanged';

export interface TournamentLifecycleDTO {
  action: TournamentLifecycleAction;
  dueAt: string | null;
  approvedParticipantCount: number;
  requiredParticipantCount: number;
  reason:
    | 'not_enough_participants'
    | 'regular_results_incomplete'
    | 'playoff_schedule_missing'
    | 'legacy_requires_audit'
    | null;
}

export interface TournamentSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  status: TournamentStatus;
  regularSource: 'head_to_head' | 'daily_aggregate' | 'classic';
  visibility: 'public' | 'hidden';
  revision: number;
  participantCount: number;
  lifecycle: TournamentLifecycleDTO;
  myParticipantState: string | null;
  myFinalPlace?: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  projectedEndsAt?: string | null;
  completedAt?: string | null;
  rewardEditability?: { regular: 'editable' | 'paid'; playoff: 'editable' | 'paid' };
  playoffFormats?: Array<{
    roundNumber: number;
    duelKind: 'express' | 'express_plus' | 'classic';
  }>;
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
  seriesId?: string | null;
  gameNumber?: number | null;
  seriesWinsRequired?: number | null;
  gameDay?: {
    id: string;
    dayNumber: number;
    localDate: string;
    startsAt: string;
  } | null;
  fixtureNumber: number;
  stage: string;
  roundNumber: number;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  actualStartsAt?: string | null;
  status: string;
  venueMode: 'home_selected' | 'neutral_default';
  home: {
    userId: string;
    name: string | null;
    avatarUrl?: string | null;
    seed?: number | null;
  } | null;
  away: {
    userId: string;
    name: string | null;
    avatarUrl?: string | null;
    seed?: number | null;
  } | null;
  score: { home: number; away: number };
  winnerUserId?: string | null;
  technicalResult?: boolean;
}

export interface TournamentScheduleDay {
  localDate: string;
  hasGames: boolean;
  hasMyGame: boolean;
  hasPlayoff: boolean;
}

export interface TournamentScheduleCursor {
  fixtureNumber: number;
  id: string;
}

export interface TournamentScheduleResponse {
  days?: TournamentScheduleDay[];
  myGames?: TournamentFixture[];
  hasOtherGames?: boolean;
  matchdays?: TournamentMatchday[];
  /** Test/legacy response compatibility; the authenticated server never returns this field. */
  fixtures?: TournamentFixture[];
}

export interface TournamentScheduleOtherGamesPage {
  games: TournamentFixture[];
  nextCursor: TournamentScheduleCursor | null;
}

export interface TournamentMatchday {
  id: string;
  number: number;
  localDate: string;
  startsAt: string;
  endsAt: string;
  myResult?: {
    goals: number;
    shots: number;
    accuracy: number;
    completed: boolean;
  } | null;
}

export interface TournamentMatchdayResult {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  goals: number;
  shots: number;
  accuracy: number;
}

export interface TournamentMatchdayResultPage {
  results: TournamentMatchdayResult[];
  nextCursor: TournamentMatchdayResultCursor | null;
}

export interface TournamentMatchdayResultCursor {
  finalizedAt: string;
  id: string;
}

export type TournamentGameContextAction =
  | 'play_daily'
  | 'play_classic'
  | 'round_completed'
  | 'not_started'
  | 'waiting_playoff'
  | 'playoff_active'
  | 'tournament_completed'
  | 'not_participant';

export interface TournamentGameContext {
  action: TournamentGameContextAction;
  tournamentDay: number | null;
  result: {
    goals: number;
    shots: number;
    accuracy: number;
    completed: boolean;
  } | null;
  message: string | null;
}

export interface TournamentBracketSource {
  type: 'seed' | 'winner' | 'loser';
  participantId?: string;
  seriesKey?: string;
}

export interface TournamentBracketFixture {
  id: string;
  gameNumber: number;
  gameDay?: {
    id: string;
    dayNumber: number;
    localDate: string;
    startsAt: string;
  } | null;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  status: string;
  homeUserId?: string | null;
  awayUserId?: string | null;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide: 'home' | 'away' | null;
  technicalResult?: boolean;
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

export interface TournamentFixtureAttemptState {
  attempt: {
    id: string;
    number: number;
    kind: 'initial' | 'replay';
    status: string;
    scheduledStart: string;
    readinessExpiresAt: string;
    hardDeadlineAt: string;
    myReady: boolean;
    opponentReady: boolean;
    duelMatchId: string | null;
    result: {
      outcome: string;
      winnerUserId: string | null;
      myScore: number | null;
      opponentScore: number | null;
      myAccuracy: number | null;
      opponentAccuracy: number | null;
      myActiveTimeMs: number | null;
      opponentActiveTimeMs: number | null;
    } | null;
    incidentType: string | null;
  };
  opponentProgress: {
    state: string;
    currentPeriod: number;
    periodEndsAt: string | null;
  } | null;
  series: {
    id: string;
    kind?: 'championship' | 'third_place';
    winsRequired: number;
    myWins: number;
    opponentWins: number;
    higherSeedWins: number;
    lowerSeedWins: number;
    higherSeedUserId: string;
    lowerSeedUserId: string;
    higherSeed?: number | null;
    lowerSeed?: number | null;
    status: string;
    winnerUserId: string | null;
  } | null;
  tournament: {
    status: string;
    winnerUserId: string | null;
  };
  nextGame: {
    fixtureId: string;
    breakEndsAt: string;
    available: boolean;
  } | null;
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

export function fetchTournamentSchedule(tournamentId: string, localDate: string) {
  const query = new URLSearchParams({ date: localDate });
  return apiFetch<TournamentScheduleResponse>(
    `/tournaments/${tournamentId}/schedule?${query.toString()}`,
  );
}

export function fetchTournamentScheduleOtherGames(
  tournamentId: string,
  localDate: string,
  cursor: TournamentScheduleCursor | null = null,
) {
  const query = new URLSearchParams({ date: localDate });
  if (cursor !== null) {
    query.set('cursorFixtureNumber', String(cursor.fixtureNumber));
    query.set('cursorId', cursor.id);
  }
  return apiFetch<TournamentScheduleOtherGamesPage>(
    `/tournaments/${tournamentId}/schedule/other-games?${query.toString()}`,
  );
}

export function fetchTournamentReadinessHint(tournamentId: string) {
  return apiFetch<{ dismissed: boolean; dismissedAt: string | null }>(
    `/tournaments/${tournamentId}/readiness-hint`,
  );
}

export function dismissTournamentReadinessHint(tournamentId: string) {
  return apiFetch<{ dismissed: true; dismissedAt: string }>(
    `/tournaments/${tournamentId}/readiness-hint/dismiss`,
    { method: 'POST' },
  );
}

export function fetchTournamentMatchdayResults(
  tournamentId: string,
  matchdayNumber: number,
  cursor: TournamentMatchdayResultCursor | null = null,
  limit = 4,
) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) {
    query.set('cursorFinalizedAt', cursor.finalizedAt);
    query.set('cursorId', cursor.id);
  }
  return apiFetch<TournamentMatchdayResultPage>(
    `/tournaments/${tournamentId}/matchdays/${matchdayNumber}/results?${query.toString()}`,
  );
}

export function fetchTournamentGameContext(tournamentId: string) {
  return apiFetch<TournamentGameContext>(`/tournaments/${tournamentId}/game-context`);
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

export function fetchTournamentFixtureAttempt(tournamentId: string, fixtureId: string) {
  return apiFetch<TournamentFixtureAttemptState>(
    `/tournaments/${tournamentId}/fixtures/${fixtureId}/attempt`,
  );
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

export function acknowledgeRegularSeasonPodiumCongratulation(congratulationId: string) {
  return apiFetch<{ acknowledged: true }>(
    `/tournaments/congratulations/${congratulationId}/read`,
    { method: 'POST' },
  );
}
