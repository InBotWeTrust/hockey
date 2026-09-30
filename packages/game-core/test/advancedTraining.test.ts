import { describe, expect, it } from 'vitest';
import {
  ADVANCED_TRAINING_SCENARIOS,
  evaluateAdvancedTrainingShot,
  type AdvancedTrainingEvaluationInput,
} from '../src/advancedTraining.js';

const goal = { type: 'goal', hitPoint: { x: 90, y: 0 } } as const;
const save = { type: 'save', goalieContact: { x: 286, y: 0 } } as const;
const miss = { type: 'miss', reason: 'wide' } as const;

function input(overrides: Partial<AdvancedTrainingEvaluationInput> = {}): AdvancedTrainingEvaluationInput {
  return {
    result: goal,
    goalOpening: { xMin: 60, xMax: 512 },
    windowDurationMs: 80,
    counterDirection: false,
    tapOffsetMs: 0,
    seriesStep: 0,
    shooterX: 60,
    ...overrides,
  };
}

describe('advanced training technique evaluation', () => {
  it('publishes at least four deterministic situations for every exercise', () => {
    const counts = new Map<string, number>();
    for (const scenario of ADVANCED_TRAINING_SCENARIOS) {
      counts.set(scenario.exerciseKey, (counts.get(scenario.exerciseKey) ?? 0) + 1);
    }
    expect([...counts.values()]).toHaveLength(8);
    expect([...counts.values()].every((count) => count >= 4)).toBe(true);
  });

  it('accepts a board-side goal only when the shooter is at the requested board', () => {
    const scenario = ADVANCED_TRAINING_SCENARIOS.find((item) => item.id === 'board-side-left-1')!;
    expect(evaluateAdvancedTrainingShot(scenario, input())).toMatchObject({
      situationComplete: true,
      success: true,
      feedbackCode: 'technique_success',
    });
    expect(
      evaluateAdvancedTrainingShot(
        scenario,
        input({ shooterX: 286, result: { type: 'goal', hitPoint: { x: 90, y: 0 } } }),
      ),
    ).toMatchObject({ success: false, feedbackCode: 'goal_wrong_technique' });
    expect(
      evaluateAdvancedTrainingShot(
        scenario,
        input({ shooterX: 60, result: { type: 'goal', hitPoint: { x: 286, y: 0 } } }),
      ),
    ).toMatchObject({ success: true, feedbackCode: 'technique_success' });
  });

  it.each([
    ['open-net-1', input({ windowDurationMs: 300 })],
    ['crossing-1', input({ tapOffsetMs: 20 })],
    ['goalie-leaving-1', input({ tapOffsetMs: 40 })],
    ['narrow-gap-1', input({ windowDurationMs: 70 })],
    ['counter-direction-1', input({ counterDirection: true })],
  ])('accepts the requested technique for %s', (scenarioId, evaluationInput) => {
    const scenario = ADVANCED_TRAINING_SCENARIOS.find((item) => item.id === scenarioId)!;
    expect(evaluateAdvancedTrainingShot(scenario, evaluationInput)).toMatchObject({
      situationComplete: true,
      success: true,
      feedbackCode: 'technique_success',
    });
  });

  it('distinguishes early, late, save and miss feedback', () => {
    const scenario = ADVANCED_TRAINING_SCENARIOS.find((item) => item.id === 'crossing-1')!;
    expect(evaluateAdvancedTrainingShot(scenario, input({ tapOffsetMs: -100 }))).toMatchObject({
      feedbackCode: 'early',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ tapOffsetMs: 100 }))).toMatchObject({
      feedbackCode: 'late',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ result: save }))).toMatchObject({
      feedbackCode: 'goalie_blocked',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ result: miss }))).toMatchObject({
      feedbackCode: 'miss_wide',
    });
  });

  it('keeps a scoring series open until every goal is accepted', () => {
    const scenario = ADVANCED_TRAINING_SCENARIOS.find((item) => item.id === 'second-tempo-2')!;
    expect(evaluateAdvancedTrainingShot(scenario, input())).toMatchObject({
      situationComplete: false,
      success: null,
      seriesStep: 1,
      feedbackCode: 'series_step_accepted',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ seriesStep: 1 }))).toMatchObject({
      situationComplete: true,
      success: true,
      seriesStep: 2,
    });
  });

  it('requires the prescribed miss before the bonus scoring series', () => {
    const scenario = ADVANCED_TRAINING_SCENARIOS.find((item) => item.id === 'rhythm-reset-2')!;
    expect(evaluateAdvancedTrainingShot(scenario, input())).toMatchObject({
      situationComplete: true,
      success: false,
      feedbackCode: 'intentional_miss_required',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ result: miss }))).toMatchObject({
      situationComplete: false,
      success: null,
      seriesStep: 1,
      feedbackCode: 'series_step_accepted',
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ seriesStep: 1 }))).toMatchObject({
      situationComplete: false,
      success: null,
      seriesStep: 2,
    });
    expect(evaluateAdvancedTrainingShot(scenario, input({ seriesStep: 2 }))).toMatchObject({
      situationComplete: true,
      success: true,
      seriesStep: 3,
    });
  });
});
