import type { DailyPeriodSpeedPreset, StickEffects } from '@hockey/game-core';
import { apiFetch } from './apiFetch.js';
import type { ShotInputPayload, ShotResultType } from './duel.js';

export type AmateurDuelMatchStatus =
  | 'invited'
  | 'ready_check'
  | 'active'
  | 'settled'
  | 'cancelled'
  | 'expired';
export type AmateurDuelParticipantState =
  | 'invited'
  | 'loadout_pending'
  | 'ready'
  | 'accepted'
  | 'period_active'
  | 'break_active'
  | 'completed'
  | 'forfeit';
export type AmateurDuelOutcome = 'challenger_win' | 'opponent_win' | 'draw' | 'double_loss';

export interface AmateurDuelTemplate {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duel_variant: 'classic' | 'time_attack';
  ranked_enabled: boolean;
  matchmaking_enabled: boolean;
  starts_at: string;
  ends_at: string;
  total_periods: number;
  shots_per_period: number;
  period_duration_ms: number;
  break_duration_ms: number;
  challenge_ttl_ms: number;
  ready_duration_ms: number;
  ready_no_show_cooldown_ms: number;
  matchmaking_timeout_ms: number;
  ranked_daily_limit: number;
  ranked_same_opponent_limit: number;
  power_cap: number;
  goalie_id: string;
  period_speed_presets: DailyPeriodSpeedPreset[];
  stake_amount: number;
  entry_fee_amount: number;
  required_inventory_item_id: string | null;
  inventory_charges_per_period: number;
}

export interface AmateurDuelRules {
  templateId: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duelVariant: 'classic' | 'time_attack';
  rankedEnabled: boolean;
  matchmakingEnabled: boolean;
  totalPeriods: number;
  shotsPerPeriod: number;
  periodDurationMs: number;
  breakDurationMs: number;
  challengeTtlMs: number;
  readyDurationMs: number;
  readyNoShowCooldownMs: number;
  matchmakingTimeoutMs: number;
  rankedDailyLimit: number;
  rankedSameOpponentLimit: number;
  powerCap: number;
  goalieId: string;
  periodSpeedPresets: DailyPeriodSpeedPreset[];
  stakeAmount: number;
  entryFeeAmount: number;
  requiredInventoryItemId: string | null;
  inventoryChargesPerPeriod: number;
}

export interface AmateurDuelParticipant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  side: 'challenger' | 'opponent';
  state: AmateurDuelParticipantState;
  current_period: number;
  shots_taken: number;
  goals: number;
  accuracy: number;
  active_duration_ms: number;
  active_duration_seconds: number;
  result_points: number;
  ready_at: string | null;
  loadout: AmateurDuelLoadout;
  inventory_report: AmateurDuelInventoryPeriodReport[];
}

export interface AmateurDuelLoadoutItem {
  id: string;
  kind: 'stick' | 'skates' | 'nutrition';
  title: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  chargesReserved: number;
}

export interface AmateurDuelLoadout {
  items: AmateurDuelLoadoutItem[];
  powerScore: number;
  powerCap: number;
}

export interface AmateurDuelInventoryPeriodReport {
  periodNumber: number;
  consumed: Array<{
    id: string;
    kind: 'stick' | 'skates' | 'nutrition';
    title: string;
    charges: number;
    remainingReserved: number;
  }>;
}

export interface AmateurDuelPeriodLog {
  period_number: number;
  shots_taken: number;
  goals: number;
  duration_ms: number;
  closed_reason: 'quota' | 'timeout' | 'window_end';
  ended_at: string;
}

export interface AmateurDuelMatch {
  id: string;
  template_id: string | null;
  status: AmateurDuelMatchStatus;
  source: 'challenge' | 'matchmaking';
  ranked: boolean;
  season_key: string;
  starts_at: string;
  ends_at: string;
  ready_expires_at: string | null;
  cooldown_user_id: string | null;
  cooldown_until: string | null;
  stake_amount: number;
  entry_fee_amount: number;
  bank_amount: number;
  winner_user_id: string | null;
  outcome: AmateurDuelOutcome | null;
  settled_reason: string | null;
  accepted_at: string | null;
  settled_at: string | null;
  created_at: string;
  server_now: string;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_ends_at: string | null;
  received_at_performance_ms?: number;
  rules: AmateurDuelRules;
  me: AmateurDuelParticipant;
  opponent: AmateurDuelParticipant;
}

export interface AmateurDuelMatchState extends AmateurDuelMatch {
  match_seed: string | null;
  current_period_shots: number;
  current_period_goals: number;
  period_speed_presets: DailyPeriodSpeedPreset[];
  stick_effects: StickEffects;
  recent_periods: AmateurDuelPeriodLog[];
}

export interface AmateurOpponent {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AmateurRatingRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  matches_played: number;
  active_duration_seconds: number;
}

export interface SubmitAmateurDuelShotRequest {
  shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface SubmitAmateurDuelShotResponse {
  server_result: ShotResultType;
  match: AmateurDuelMatchState;
}

export interface AmateurDuelLoadoutSelection {
  stick?: string | null;
  skates?: string | null;
  nutrition?: string | null;
}

function stampMatch<T extends AmateurDuelMatch>(match: T): T {
  return {
    ...match,
    received_at_performance_ms: performance.now(),
  } as T;
}

export function fetchAmateurTemplates(): Promise<{ templates: AmateurDuelTemplate[] }> {
  return apiFetch<{ templates: AmateurDuelTemplate[] }>('/duel/amateur/templates');
}

export function searchAmateurOpponents(q = '', limit = 20): Promise<{ users: AmateurOpponent[] }> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<{ users: AmateurOpponent[] }>(`/duel/amateur/opponents?${params.toString()}`);
}

export function fetchAmateurMatches(): Promise<{ matches: AmateurDuelMatch[] }> {
  return apiFetch<{ matches: AmateurDuelMatch[] }>('/duel/amateur/matches').then((res) => ({
    matches: res.matches.map(stampMatch),
  }));
}

export function fetchAmateurEvents(): Promise<{ events: AmateurDuelMatch[] }> {
  return apiFetch<{ events: AmateurDuelMatch[] }>('/duel/amateur/events').then((res) => ({
    events: res.events.map(stampMatch),
  }));
}

export function fetchAmateurMatch(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}`).then(
    (res) => ({ match: stampMatch(res.match) }),
  );
}

export function challengeAmateurDuel(body: {
  template_id: string;
  opponent_user_id: string;
}): Promise<{ match: AmateurDuelMatch }> {
  return apiFetch<{ match: AmateurDuelMatch }>('/duel/amateur/challenge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function acceptAmateurDuel(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}/accept`, {
    method: 'POST',
  }).then((res) => ({ match: stampMatch(res.match) }));
}

export function cancelAmateurDuel(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}/cancel`, {
    method: 'POST',
  }).then((res) => ({ match: stampMatch(res.match) }));
}

export function declineAmateurDuel(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}/decline`, {
    method: 'POST',
  }).then((res) => ({ match: stampMatch(res.match) }));
}

export function readyAmateurDuel(
  matchId: string,
  loadout: AmateurDuelLoadoutSelection,
): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}/ready`, {
    method: 'POST',
    body: JSON.stringify({ loadout }),
  }).then((res) => ({ match: stampMatch(res.match) }));
}

export function joinAmateurMatchmaking(
  templateId: string,
): Promise<{ ticket?: { id: string; status: string; expires_at: string }; match?: AmateurDuelMatch }> {
  return apiFetch<{ ticket?: { id: string; status: string; expires_at: string }; match?: AmateurDuelMatch }>(
    '/duel/amateur/matchmaking/join',
    {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId }),
    },
  ).then((res) => (res.match ? { ...res, match: stampMatch(res.match) } : res));
}

export function leaveAmateurMatchmaking(templateId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/duel/amateur/matchmaking/leave', {
    method: 'POST',
    body: JSON.stringify({ template_id: templateId }),
  });
}

export function startAmateurDuelPeriod(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(
    `/duel/amateur/matches/${matchId}/period/start`,
    { method: 'POST' },
  ).then((res) => ({ match: stampMatch(res.match) }));
}

export function submitAmateurDuelShot(
  matchId: string,
  body: SubmitAmateurDuelShotRequest,
): Promise<SubmitAmateurDuelShotResponse> {
  return apiFetch<SubmitAmateurDuelShotResponse>(`/duel/amateur/matches/${matchId}/shot`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, match: stampMatch(res.match) }));
}

export function settleAmateurDuel(matchId: string): Promise<{ match: AmateurDuelMatchState }> {
  return apiFetch<{ match: AmateurDuelMatchState }>(`/duel/amateur/matches/${matchId}/settle`, {
    method: 'POST',
  }).then((res) => ({ match: stampMatch(res.match) }));
}

export function fetchAmateurRating(): Promise<{ rating: AmateurRatingRow[] }> {
  return apiFetch<{ rating: AmateurRatingRow[] }>('/duel/amateur/rating');
}
