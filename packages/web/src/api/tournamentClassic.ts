import { apiFetch } from './apiFetch.js';
import type { GameRequestOptions } from './requestTimeout.js';
import type {
  DailyStateResponse,
  ShotInputPayload,
  ShotResultType,
  SubmitShotRequest,
} from './duel.js';
import type { DuelInventoryTiming } from '@hockey/game-core';

export interface ActiveClassicTournamentGame {
  kind: 'classic';
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

export interface ActivePlayoffTournamentGame {
  kind: 'playoff';
  tournament_id: string;
  fixture_id: string;
  duel_match_id: string | null;
  tournament_title: string;
  tournament_day: number;
  round_stage: 'playoff' | 'third_place';
  round_number: number;
  final_round_number: number;
  total_periods: number;
  starts_at: string;
  readiness_ends_at: string;
  closes_at: string;
  break_ends_at: string | null;
  state: 'scheduled' | 'ready_check' | 'active' | 'inter_game_break' | 'paused';
  current_period: 0;
  total_shots: 0;
  total_goals: 0;
}

export type ActiveTournamentGame = ActiveClassicTournamentGame | ActivePlayoffTournamentGame;

export interface ClassicTournamentState extends DailyStateResponse {
  tournament_id: string;
  tournament_title: string;
  tournament_day: number;
  player_id: string;
  session_id: string;
  daily_seed: string;
  expired: boolean;
  closes_at: string;
  period_duration_ms: number;
  break_duration_ms: number;
  base_period_speed_presets: DailyStateResponse['period_speed_presets'];
  loadout: ClassicTournamentLoadout;
  loadout_editable: boolean;
  inventory_available: ClassicTournamentInventoryItem[];
  inventory_consumption: ClassicTournamentInventoryConsumption[];
  current_period_inventory_consumption: ClassicTournamentInventoryConsumption[];
  result: {
    goals: number;
    shots: number;
    accuracy: number;
    counted: boolean;
    game_completed: boolean;
  } | null;
}

export interface ClassicTournamentLoadoutSelection {
  stick?: string | null;
  skates?: string | null;
  nutrition?: string | null;
}

export interface ClassicTournamentInventoryItem {
  id: string;
  itemId: string;
  instanceId: string | null;
  kind: 'stick' | 'skates' | 'nutrition';
  title: string;
  imageUrl: string | null;
  resourceUnit: 'period' | 'shot' | 'distance' | 'energy_ms';
  resourceAvailable: number;
  effectPuckSpeedPoints: number;
  effectShooterFrequencyDelta: number;
  effectGoalieFrequencyDelta: number;
  effectGoalFrequencyDelta: number;
  timing?: DuelInventoryTiming;
}

export interface ClassicTournamentLoadout { items: ClassicTournamentInventoryItem[] }

export interface ClassicTournamentInventoryConsumption {
  id: string;
  itemId: string;
  kind: 'stick' | 'skates' | 'nutrition';
  title: string;
  charges: number;
}

export interface ClassicTournamentShotResponse {
  server_result: ShotResultType;
  state: ClassicTournamentState;
}

function stampState(state: ClassicTournamentState): ClassicTournamentState {
  return { ...state, received_at_performance_ms: performance.now() };
}

export function fetchActiveClassicTournamentGames(): Promise<{
  games: ActiveTournamentGame[];
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
  loadout?: ClassicTournamentLoadoutSelection,
): Promise<ClassicTournamentState> {
  return apiFetch<ClassicTournamentState>(
    `/tournaments/${encodeURIComponent(tournamentId)}/classic/period/start`,
    {
      method: 'POST',
      ...(loadout === undefined ? {} : { body: JSON.stringify({ loadout }) }),
    },
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
