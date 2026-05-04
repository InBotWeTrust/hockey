import { apiFetch } from './apiFetch.js';
import type { ShotInputPayload, ShotResultType } from './duel.js';
import type { DailyPeriodSpeedPreset } from '@hockey/game-core';

export type TrainingState = 'idle' | 'active' | 'closed';

export interface TrainingStateResponse {
  state: TrainingState;
  selected_period: number | null;
  shots_taken: number;
  goals: number;
  shots_limit: number;
  day_date: string;
  next_day_starts_at: string;
  training_seed: string | null;
  started_at: string | null;
  server_now: string;
  received_at_performance_ms?: number;
  goalie_id: string;
  period_speed_presets: DailyPeriodSpeedPreset[];
}

export interface StartTrainingRequest {
  period_number: number;
}

export interface SubmitTrainingShotRequest {
  shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface SubmitTrainingShotResponse {
  server_result: ShotResultType;
  state: TrainingStateResponse;
}

function stampTrainingState(state: TrainingStateResponse): TrainingStateResponse {
  return {
    ...state,
    received_at_performance_ms: performance.now(),
  };
}

export function fetchTrainingState(): Promise<TrainingStateResponse> {
  return apiFetch<TrainingStateResponse>('/duel/training/state').then(stampTrainingState);
}

export function startTraining(body: StartTrainingRequest): Promise<TrainingStateResponse> {
  return apiFetch<TrainingStateResponse>('/duel/training/start', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(stampTrainingState);
}

export function submitTrainingShot(
  body: SubmitTrainingShotRequest,
): Promise<SubmitTrainingShotResponse> {
  return apiFetch<SubmitTrainingShotResponse>('/duel/training/shot', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => ({ ...res, state: stampTrainingState(res.state) }));
}
