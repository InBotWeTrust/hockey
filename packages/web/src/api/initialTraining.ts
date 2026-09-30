import type { GoalieConfig } from '@hockey/game-core';
import type { ShotInputPayload, ShotResultType } from './duel.js';
import type { GameplayLockDTO } from './gameplayLock.js';
import { apiFetch } from './apiFetch.js';

export type InitialTrainingExerciseKey =
  | 'first-shot'
  | 'three-positions'
  | 'follow-the-goal'
  | 'moving-goal'
  | 'find-the-gap'
  | 'pressure-window'
  | 'game-pace';

export type InitialTrainingExerciseState = 'completed' | 'available' | 'locked';
export type InitialTrainingFeedbackCode =
  | 'goal_timing'
  | 'goalie_blocked'
  | 'miss_left'
  | 'miss_right';

export interface InitialTrainingExercise {
  key: InitialTrainingExerciseKey;
  position: number;
  title: string;
  description: string;
  targetGoals: number;
  rewardStars: number;
  rewardExperience: number;
  state: InitialTrainingExerciseState;
}

export interface InitialTrainingCatalogResponse {
  enabled: boolean;
  completed_count: number;
  beginner_training_completed: boolean;
  total_count: number;
  open_training_unlocked: boolean;
  open_training_unlock_source: 'course' | 'legacy' | null;
  gameplay_lock: GameplayLockDTO | null;
  exercises: InitialTrainingExercise[];
  advanced_training: AdvancedTrainingCatalogResponse;
}

export interface AdvancedTrainingCatalogResponse {
  enabled: boolean;
  access: {
    amateur_completed: boolean;
    beginner_training_completed: boolean;
    unlocked: boolean;
  };
  completed_count: number;
  total_count: number;
  exercises: Array<{
    key:
      | 'board-side'
      | 'open-net'
      | 'crossing'
      | 'goalie-leaving'
      | 'narrow-gap'
      | 'counter-direction'
      | 'second-tempo'
      | 'rhythm-reset';
    position: number;
    title: string;
    description: string | null;
    skill: string | null;
    goal: string | null;
    rewardStars: number;
    rewardExperience: number;
    state: 'completed' | 'available' | 'locked';
  }>;
}

export interface InitialTrainingScene {
  has_goalie: boolean;
  goalie_id: string;
  goalie_config: GoalieConfig;
  speeds: {
    shooter_frequency: number;
    goalie_frequency: number;
    goal_frequency: number;
    puck_speed_per_ms: number;
  };
}

export interface InitialTrainingRun {
  run_id: string;
  exercise: InitialTrainingExercise;
  seed: string;
  game_core_version: number;
  shots_taken: number;
  goals: number;
  target_goals: number;
  started_at: string;
  server_now: string;
  scene: InitialTrainingScene;
}

export interface InitialTrainingShotState {
  run_id: string;
  exercise_key: InitialTrainingExerciseKey;
  shots_taken: number;
  goals: number;
  target_goals: number;
  scene: InitialTrainingScene;
}

export interface SubmitInitialTrainingShotRequest {
  run_id: string;
  shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface SubmitInitialTrainingShotResponse {
  server_result: ShotResultType;
  feedback_code: InitialTrainingFeedbackCode;
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  state: InitialTrainingShotState;
}

export function fetchInitialTrainingCourse(): Promise<InitialTrainingCatalogResponse> {
  return apiFetch<InitialTrainingCatalogResponse>('/duel/training/course');
}

export function startInitialTrainingExercise(
  exerciseKey: InitialTrainingExerciseKey,
): Promise<InitialTrainingRun> {
  return apiFetch<InitialTrainingRun>(`/duel/training/course/${exerciseKey}/start`, {
    method: 'POST',
  });
}

export function submitInitialTrainingShot(
  exerciseKey: InitialTrainingExerciseKey,
  body: SubmitInitialTrainingShotRequest,
): Promise<SubmitInitialTrainingShotResponse> {
  return apiFetch<SubmitInitialTrainingShotResponse>(
    `/duel/training/course/${exerciseKey}/shot`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
