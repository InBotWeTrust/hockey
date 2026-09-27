import { describe, expect, it } from 'vitest';
import { getAdvancedTrainingV2Scenario, evaluateAdvancedTrainingV2Shot } from '@hockey/game-core';
import { getAdvancedTrainingV2Explanation } from './AdvancedTrainingV2Explanation.js';

describe('advanced training V2 demonstration explanation', () => {
  it.each(['left', 'right'] as const)('explains the actual %s goal and distinguishes tap from impact', (side) => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', side, 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs });
    const explanation = getAdvancedTrainingV2Explanation(scenario, evaluation);
    expect(evaluation.result.type).toBe('goal');
    expect(explanation).toContain('Вратарь рядом');
    expect(explanation).toContain(side === 'left' ? 'слева' : 'справа');
    expect(explanation).toContain('Нажать');
    expect(explanation).toContain('Попадание');
  });

  it('refuses to present a non-matching result as the target technique', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs - 1000 });
    expect(() => getAdvancedTrainingV2Explanation(scenario, evaluation)).toThrow();
  });
});
