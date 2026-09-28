import { describe, expect, it } from 'vitest';
import { evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import { getAdvancedTrainingV2FailureExplanation } from './AdvancedTrainingV2Explanation.js';

describe('advanced training feedback', () => {
  it('states the measured gap and the missing category condition at impact', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const shot = evaluateAdvancedTrainingV2Shot(scenario,
      { tapTime: scenario.targetTapTimeMs });
    const feedback = getAdvancedTrainingV2FailureExplanation(
      { ...scenario, technique: 'precise' }, 'near_goalie', shot.measurements);
    expect(feedback).toContain('Вратарь вне ворот');
    expect(feedback).toContain('внешний зазор');
    expect(feedback).toContain('Внутренний просвет должен быть от 10 до 60 ед.');
  });
});
