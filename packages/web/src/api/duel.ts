import { apiFetch } from './apiFetch.js';

export type DailyState =
  | 'idle'
  | 'period_active'
  | 'break_active'
  | 'closed';

export type ShotResultType = 'goal' | 'save' | 'miss';

export interface DailyStateResponse {
  state: DailyState;
  current_period: number; // 0..3
  current_period_shots: number;
  current_period_goals: number;
  daily_total_shots: number;
  daily_total_goals: number;
  lifetime_total_shots: number;
  lifetime_total_goals: number;
  period_ends_at: string | null; // ISO ts
  break_ends_at: string | null;
  day_date: string | null; // YYYY-MM-DD
  daily_seed: string | null;
  goalie_id: string;
  shots_per_period: number;
  total_periods: number;
}

export interface ShotInputPayload {
  tapTime: number;
  shooterTapTime?: number;
  puckSpeedPerMs?: number;
  shooterFrequency?: number;
}

export interface SubmitShotRequest {
  shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface SubmitShotResponse {
  server_result: ShotResultType;
  state: DailyStateResponse;
}

export function fetchDailyState(): Promise<DailyStateResponse> {
  return apiFetch<DailyStateResponse>('/duel/daily/state');
}

export function startDailyPeriod(): Promise<DailyStateResponse> {
  return apiFetch<DailyStateResponse>('/duel/daily/period/start', {
    method: 'POST',
  });
}

export function submitDailyShot(
  body: SubmitShotRequest,
): Promise<SubmitShotResponse> {
  return apiFetch<SubmitShotResponse>('/duel/daily/shot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
