import { apiFetch } from './apiFetch.js';
import type { ShotInputPayload, ShotResultType } from './duel.js';

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
  goalie_id: string;
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

export function fetchTrainingState(): Promise<TrainingStateResponse> {
  return apiFetch<TrainingStateResponse>('/duel/training/state');
}

export function startTraining(body: StartTrainingRequest): Promise<TrainingStateResponse> {
  return apiFetch<TrainingStateResponse>('/duel/training/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function submitTrainingShot(
  body: SubmitTrainingShotRequest,
): Promise<SubmitTrainingShotResponse> {
  return apiFetch<SubmitTrainingShotResponse>('/duel/training/shot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
