import type {
  AdvancedTrainingV2Scenario,
  AdvancedTrainingContinuousContext,
  AdvancedTrainingV2Side,
  AdvancedTrainingV2Technique,
  MarksmanshipV6Measurements,
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

export interface AdvancedTrainingV2RunState {
  run_id: string;
  exercise_key: AdvancedTrainingV2Technique;
  stage: 'practice' | 'assessment';
  side: AdvancedTrainingV2Side;
  side_successes: { left: number; right: number };
  shot_index: number;
  scenario_id: string;
  scenario: AdvancedTrainingV2Scenario;
  movement_id: string;
  movement: AdvancedTrainingContinuousContext;
  resume_scene_ms: number;
  seed: string;
  game_core_version: number;
  bank_version: number;
  server_now: string;
}

export interface AdvancedTrainingV2ShotResponse {
  movement_id: string;
  tap_time: number;
  server_result: ShotResult['type'];
  success: boolean;
  actual_technique: AdvancedTrainingV2Technique | 'ordinary' | null;
  actual_side: AdvancedTrainingV2Side | null;
  measurements: MarksmanshipV6Measurements | null;
  feedback_code: 'correct' | 'wrong_category' | 'goal' | 'save' | 'miss' | 'post';
  stage_finished: boolean;
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  state: AdvancedTrainingV2RunState;
}

export function startAdvancedTrainingV2Exercise(exerciseKey: AdvancedTrainingV2Technique):
  Promise<{ state: AdvancedTrainingV2RunState }> {
  return apiFetch(`/duel/training/advanced/v2/${exerciseKey}/start`, { method: 'POST' });
}

export function submitAdvancedTrainingV2Shot(exerciseKey: AdvancedTrainingV2Technique, body: {
  run_id: string;
  shot_index: number;
  movement_id: string;
  input: Pick<ShotInput, 'tapTime' | 'shooterTapTime'>;
  claimed_result: ShotResult['type'];
}): Promise<AdvancedTrainingV2ShotResponse> {
  return apiFetch(`/duel/training/advanced/v2/${exerciseKey}/shot`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export function startAdvancedTrainingV2Assessment(exerciseKey: AdvancedTrainingV2Technique,
  runId: string): Promise<{ state: AdvancedTrainingV2RunState }> {
  return apiFetch(`/duel/training/advanced/v2/${exerciseKey}/assessment/start`, {
    method: 'POST', body: JSON.stringify({ run_id: runId }),
  });
}
