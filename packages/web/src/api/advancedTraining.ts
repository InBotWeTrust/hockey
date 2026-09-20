import type {
  AdvancedTrainingFeedbackCode,
  AdvancedTrainingScenario,
  GoalieConfig,
  ShotInput,
  ShotResult,
} from '@hockey/game-core';
import { apiFetch } from './apiFetch.js';
import type { AdvancedTrainingExerciseKey } from '../components/AdvancedTrainingCourse.js';

export type AdvancedTrainingStage = 'practice' | 'assessment';

export interface AdvancedTrainingRunState {
  run_id: string;
  exercise_key: AdvancedTrainingExerciseKey;
  stage: AdvancedTrainingStage;
  situation_index: number;
  total_situations: number;
  successes: number;
  shots_taken: number;
  series_step: number;
  scenario: AdvancedTrainingScenario;
  seed: string;
  game_core_version: number;
  started_at: string;
  server_now: string;
  scene: {
    goalie_id: string;
    goalie_config: GoalieConfig;
    speeds: {
      shooter_frequency: number;
      goalie_frequency: number;
      goal_frequency: number;
      puck_speed_per_ms: number;
    };
  };
}

export interface AdvancedTrainingStartResponse {
  demonstrations: AdvancedTrainingScenario[];
  state: AdvancedTrainingRunState;
}

export interface AdvancedTrainingShotResponse {
  server_result: ShotResult['type'];
  feedback_code: AdvancedTrainingFeedbackCode;
  situation_complete: boolean;
  situation_success: boolean | null;
  stage_finished: boolean;
  completed: boolean;
  passed: boolean | null;
  reward_granted: { stars: number; experience: number } | null;
  state: AdvancedTrainingRunState;
}

export function startAdvancedTrainingExercise(
  exerciseKey: AdvancedTrainingExerciseKey,
): Promise<AdvancedTrainingStartResponse> {
  return apiFetch(`/duel/training/advanced/${exerciseKey}/start`, { method: 'POST' });
}

export function submitAdvancedTrainingShot(
  exerciseKey: AdvancedTrainingExerciseKey,
  body: {
    run_id: string;
    shot_index: number;
    input: Pick<ShotInput, 'tapTime' | 'shooterTapTime'>;
    claimed_result: ShotResult['type'];
  },
): Promise<AdvancedTrainingShotResponse> {
  return apiFetch(`/duel/training/advanced/${exerciseKey}/shot`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function startAdvancedTrainingAssessment(
  exerciseKey: AdvancedTrainingExerciseKey,
  runId: string,
): Promise<{ state: AdvancedTrainingRunState }> {
  return apiFetch(`/duel/training/advanced/${exerciseKey}/assessment/start`, {
    method: 'POST',
    body: JSON.stringify({ run_id: runId }),
  });
}

export function restartAdvancedTrainingPractice(
  exerciseKey: AdvancedTrainingExerciseKey,
  runId: string,
): Promise<{ state: AdvancedTrainingRunState }> {
  return apiFetch(`/duel/training/advanced/${exerciseKey}/practice/restart`, {
    method: 'POST',
    body: JSON.stringify({ run_id: runId }),
  });
}
