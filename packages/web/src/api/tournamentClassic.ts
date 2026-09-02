import { apiFetch } from './apiFetch.js';
import type { GameRequestOptions } from './requestTimeout.js';
import type {
  DailyStateResponse,
  ShotInputPayload,
  ShotResultType,
  SubmitShotRequest,
} from './duel.js';

export interface ActiveClassicTournamentGame {
  tournament_id: string;
  tournament_title: string;
  tournament_day: number;
  starts_at: string;
  closes_at: string;
  break_ends_at: string | null;
  state: 'available' | 'idle' | 'period_active' | 'break_active' | 'closed';
  current_period: number;
  total_shots: number;
  total_goals: number;
}

export interface ClassicTournamentState extends DailyStateResponse {
  tournament_id: string;
  tournament_title: string;
  tournament_day: number;
  session_id: string;
  expired: boolean;
  closes_at: string;
  period_duration_ms: number;
  break_duration_ms: number;
  result: {
    goals: number;
    shots: number;
    accuracy: number;
    counted: boolean;
    game_completed: boolean;
  } | null;
}

export interface ClassicTournamentShotResponse {
  server_result: ShotResultType;
  state: ClassicTournamentState;
}

function stampState(state: ClassicTournamentState): ClassicTournamentState {
  return { ...state, received_at_performance_ms: performance.now() };
}

export function fetchActiveClassicTournamentGames(): Promise<{
  games: ActiveClassicTournamentGame[];
}> {
  return apiFetch('/tournaments/classic/active');
}

export function fetchClassicTournamentState(
  tournamentId: string,
  options?: GameRequestOptions,
): Promise<ClassicTournamentState> {
  return apiFetch<ClassicTournamentState>(
    `/tournaments/${encodeURIComponent(tournamentId)}/classic/state`,
    options?.signal === undefined ? {} : { signal: options.signal },
  ).then(stampState);
}

export function startClassicTournamentPeriod(
  tournamentId: string,
): Promise<ClassicTournamentState> {
  return apiFetch<ClassicTournamentState>(
    `/tournaments/${encodeURIComponent(tournamentId)}/classic/period/start`,
    { method: 'POST' },
  ).then(stampState);
}

export function submitClassicTournamentShot(
  tournamentId: string,
  body: SubmitShotRequest,
  options?: GameRequestOptions,
): Promise<ClassicTournamentShotResponse> {
  return apiFetch<ClassicTournamentShotResponse>(
    `/tournaments/${encodeURIComponent(tournamentId)}/classic/shot`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    },
  ).then((response) => ({ ...response, state: stampState(response.state) }));
}

export type ClassicTournamentShotInput = ShotInputPayload;
