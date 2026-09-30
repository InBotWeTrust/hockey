import type { ShotResult } from './shot/types.js';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from './shooter/types.js';

export const ADVANCED_TRAINING_EXERCISE_KEYS = [
  'board-side',
  'open-net',
  'crossing',
  'goalie-leaving',
  'narrow-gap',
  'counter-direction',
  'second-tempo',
  'rhythm-reset',
] as const;

export type AdvancedTrainingExerciseKey = (typeof ADVANCED_TRAINING_EXERCISE_KEYS)[number];

export type AdvancedTrainingFeedbackCode =
  | 'technique_success'
  | 'early'
  | 'late'
  | 'goalie_blocked'
  | 'miss_wide'
  | 'goal_wrong_technique'
  | 'intentional_miss_required'
  | 'series_step_accepted'
  | 'series_incomplete';

export interface AdvancedTrainingScenario {
  id: string;
  exerciseKey: AdvancedTrainingExerciseKey;
  targetTapTimeMs: number;
  timingWindowMs: number;
  requiredSide: 'left' | 'right' | null;
  minOpenWindowMs: number | null;
  maxOpenWindowMs: number | null;
  requireCounterDirection: boolean;
  seriesGoals: number;
  intentionalMissFirst: boolean;
}

export interface AdvancedTrainingEvaluationInput {
  result: ShotResult;
  goalOpening: { xMin: number; xMax: number };
  windowDurationMs: number | null;
  counterDirection: boolean;
  tapOffsetMs: number;
  seriesStep: number;
  shooterX: number;
}

export interface AdvancedTrainingEvaluation {
  situationComplete: boolean;
  success: boolean | null;
  seriesStep: number;
  feedbackCode: AdvancedTrainingFeedbackCode;
}

function scenario(
  id: string,
  exerciseKey: AdvancedTrainingExerciseKey,
  targetTapTimeMs: number,
  overrides: Partial<Omit<AdvancedTrainingScenario, 'id' | 'exerciseKey' | 'targetTapTimeMs'>> = {},
): AdvancedTrainingScenario {
  return {
    id,
    exerciseKey,
    targetTapTimeMs,
    timingWindowMs: 70,
    requiredSide: null,
    minOpenWindowMs: null,
    maxOpenWindowMs: null,
    requireCounterDirection: false,
    seriesGoals: 1,
    intentionalMissFirst: false,
    ...overrides,
  };
}

export const ADVANCED_TRAINING_SCENARIOS: readonly AdvancedTrainingScenario[] = [
  scenario('board-side-left-1', 'board-side', 720, { requiredSide: 'left' }),
  scenario('board-side-right-1', 'board-side', 980, { requiredSide: 'right' }),
  scenario('board-side-left-2', 'board-side', 1_240, { requiredSide: 'left' }),
  scenario('board-side-right-2', 'board-side', 1_500, { requiredSide: 'right' }),
  scenario('open-net-1', 'open-net', 760, { minOpenWindowMs: 250 }),
  scenario('open-net-2', 'open-net', 1_020, { minOpenWindowMs: 250 }),
  scenario('open-net-3', 'open-net', 1_280, { minOpenWindowMs: 250 }),
  scenario('open-net-4', 'open-net', 1_540, { minOpenWindowMs: 250 }),
  scenario('crossing-1', 'crossing', 780, { timingWindowMs: 60 }),
  scenario('crossing-2', 'crossing', 1_060, { timingWindowMs: 60 }),
  scenario('crossing-3', 'crossing', 1_340, { timingWindowMs: 55 }),
  scenario('crossing-4', 'crossing', 1_620, { timingWindowMs: 55 }),
  scenario('goalie-leaving-1', 'goalie-leaving', 800, { timingWindowMs: 120 }),
  scenario('goalie-leaving-2', 'goalie-leaving', 1_080, { timingWindowMs: 120 }),
  scenario('goalie-leaving-3', 'goalie-leaving', 1_360, { timingWindowMs: 110 }),
  scenario('goalie-leaving-4', 'goalie-leaving', 1_640, { timingWindowMs: 110 }),
  scenario('narrow-gap-1', 'narrow-gap', 820, { maxOpenWindowMs: 100 }),
  scenario('narrow-gap-2', 'narrow-gap', 1_100, { maxOpenWindowMs: 100 }),
  scenario('narrow-gap-3', 'narrow-gap', 1_380, { maxOpenWindowMs: 90 }),
  scenario('narrow-gap-4', 'narrow-gap', 1_660, { maxOpenWindowMs: 90 }),
  scenario('counter-direction-1', 'counter-direction', 840, { requireCounterDirection: true }),
  scenario('counter-direction-2', 'counter-direction', 1_120, { requireCounterDirection: true }),
  scenario('counter-direction-3', 'counter-direction', 1_400, { requireCounterDirection: true }),
  scenario('counter-direction-4', 'counter-direction', 1_680, { requireCounterDirection: true }),
  scenario('second-tempo-2', 'second-tempo', 860, { seriesGoals: 2 }),
  scenario('second-tempo-3', 'second-tempo', 1_140, { seriesGoals: 3 }),
  scenario('second-tempo-2b', 'second-tempo', 1_420, { seriesGoals: 2 }),
  scenario('second-tempo-3b', 'second-tempo', 1_700, { seriesGoals: 3 }),
  scenario('rhythm-reset-2', 'rhythm-reset', 880, { seriesGoals: 2, intentionalMissFirst: true }),
  scenario('rhythm-reset-3', 'rhythm-reset', 1_160, { seriesGoals: 3, intentionalMissFirst: true }),
  scenario('rhythm-reset-2b', 'rhythm-reset', 1_440, { seriesGoals: 2, intentionalMissFirst: true }),
  scenario('rhythm-reset-3b', 'rhythm-reset', 1_720, { seriesGoals: 3, intentionalMissFirst: true }),
];

function failed(feedbackCode: AdvancedTrainingFeedbackCode): AdvancedTrainingEvaluation {
  return { situationComplete: true, success: false, seriesStep: 0, feedbackCode };
}

export function evaluateAdvancedTrainingShot(
  scenarioDefinition: AdvancedTrainingScenario,
  input: AdvancedTrainingEvaluationInput,
): AdvancedTrainingEvaluation {
  if (scenarioDefinition.intentionalMissFirst && input.seriesStep === 0) {
    if (input.result.type !== 'miss') return failed('intentional_miss_required');
    return {
      situationComplete: false,
      success: null,
      seriesStep: 1,
      feedbackCode: 'series_step_accepted',
    };
  }

  if (input.result.type === 'save') return failed('goalie_blocked');
  if (input.result.type === 'miss') return failed('miss_wide');

  if (
    scenarioDefinition.exerciseKey === 'crossing' ||
    scenarioDefinition.exerciseKey === 'goalie-leaving'
  ) {
    if (input.tapOffsetMs < -scenarioDefinition.timingWindowMs) return failed('early');
    if (input.tapOffsetMs > scenarioDefinition.timingWindowMs) return failed('late');
  }

  const boardZoneWidth = (SHOOTER_MAX_X - SHOOTER_MIN_X) * 0.2;
  const sideAccepted =
    scenarioDefinition.requiredSide === null ||
    (scenarioDefinition.requiredSide === 'left'
      ? input.shooterX <= SHOOTER_MIN_X + boardZoneWidth
      : input.shooterX >= SHOOTER_MAX_X - boardZoneWidth);
  const openWindowAccepted =
    scenarioDefinition.minOpenWindowMs === null ||
    (input.windowDurationMs !== null && input.windowDurationMs >= scenarioDefinition.minOpenWindowMs);
  const narrowWindowAccepted =
    scenarioDefinition.maxOpenWindowMs === null ||
    (input.windowDurationMs !== null &&
      input.windowDurationMs > 0 &&
      input.windowDurationMs <= scenarioDefinition.maxOpenWindowMs);
  const counterAccepted =
    !scenarioDefinition.requireCounterDirection || input.counterDirection;

  if (!sideAccepted || !openWindowAccepted || !narrowWindowAccepted || !counterAccepted) {
    return failed('goal_wrong_technique');
  }

  const initialSeriesStep = scenarioDefinition.intentionalMissFirst ? 1 : 0;
  const scoringStepsCompleted = input.seriesStep - initialSeriesStep + 1;
  if (scoringStepsCompleted < scenarioDefinition.seriesGoals) {
    return {
      situationComplete: false,
      success: null,
      seriesStep: input.seriesStep + 1,
      feedbackCode: 'series_step_accepted',
    };
  }

  return {
    situationComplete: true,
    success: true,
    seriesStep: input.seriesStep + 1,
    feedbackCode: 'technique_success',
  };
}
