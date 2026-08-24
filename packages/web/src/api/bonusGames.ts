import { apiFetch } from './apiFetch.js';
import type { ShotInputPayload, ShotResultType } from './duel.js';

export type BonusGameCardState =
  | 'level_locked'
  | 'sequence_locked'
  | 'purchase_required'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'archived';

export type BonusAttemptStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type BonusAttemptState = 'idle' | 'period_active' | 'break_active' | 'closed';
export type BonusGoaliePattern = 'linear' | 'sine' | 'dash';

export interface BonusPeriodRule {
  period_number: number;
  duration_ms: number;
  shots_limit: number;
  goal_frequency: number;
  goalie_frequency: number;
  shooter_frequency: number;
  puck_speed_per_ms: number;
  goalie_pattern: BonusGoaliePattern;
  goalie_amplitude: number;
  goal_amplitude: number;
}

export interface BonusArena {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}

export interface BonusReward {
  coins: number;
  stars: number;
  experience: number;
}

export interface BonusGameCardAttempt {
  id: string;
  game_id: string;
  state: BonusAttemptState;
  current_period: number;
  period_started_at: string | null;
  break_started_at: string | null;
  shots_taken: number;
  goals: number;
}

export interface BonusGameCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  access_type: 'free' | 'paid';
  unlock_price_stars: number;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  period_rules: BonusPeriodRule[];
  reward: BonusReward;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  arena: BonusArena;
  is_unlocked: boolean;
  is_completed: boolean;
  state: BonusGameCardState;
  active_attempt: BonusGameCardAttempt | null;
}

export interface BonusCatalogResponse {
  games: BonusGameCard[];
  active_attempt: BonusGameCardAttempt | null;
}

export interface BonusAttemptRules {
  game_id: string;
  slug: string;
  title: string;
  revision: number;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  periods: BonusPeriodRule[];
}

export interface BonusGameAttempt {
  id: string;
  game_id: string;
  game_slug: string;
  game_title: string;
  status: BonusAttemptStatus;
  state: BonusAttemptState;
  current_period: number;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_started_at: string | null;
  break_ends_at: string | null;
  closed_at: string | null;
  shots_taken: number;
  goals: number;
  attempt_seed: string;
  game_core_version: number;
  definition_revision: number;
  server_now: string;
  rules: BonusAttemptRules;
  reward: BonusReward;
  arena: BonusArena;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
}

export interface BonusAttemptResponse {
  attempt: BonusGameAttempt;
}

export interface BonusCurrentAttemptResponse {
  attempt: BonusGameAttempt | null;
}

export interface BonusUnlockResponse {
  unlocked: boolean;
  star_balance: number;
}

export interface BonusShotRequest {
  claimed_shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface BonusShotResponse {
  server_result: ShotResultType;
  attempt: BonusGameAttempt;
  reward_granted: boolean;
  balances: BonusReward;
}

export const fetchBonusGames = (): Promise<BonusCatalogResponse> =>
  apiFetch<BonusCatalogResponse>('/bonus-games');

export const fetchCurrentBonusAttempt = (): Promise<BonusCurrentAttemptResponse> =>
  apiFetch<BonusCurrentAttemptResponse>('/bonus-games/attempts/current');

export const fetchBonusAttempt = (attemptId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}`);

export const purchaseBonusGame = (gameId: string): Promise<BonusUnlockResponse> =>
  apiFetch<BonusUnlockResponse>(`/bonus-games/${gameId}/unlock`, { method: 'POST' });

export const startBonusAttempt = (gameId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/${gameId}/attempts`, { method: 'POST' });

export const startBonusPeriod = (attemptId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}/period/start`, {
    method: 'POST',
  });

export const submitBonusShot = (
  attemptId: string,
  body: BonusShotRequest,
): Promise<BonusShotResponse> =>
  apiFetch<BonusShotResponse>(`/bonus-games/attempts/${attemptId}/shot`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const abandonBonusAttempt = (attemptId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}/abandon`, {
    method: 'POST',
  });
