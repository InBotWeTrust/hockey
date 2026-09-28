import { describe, expect, it } from 'vitest';
import { evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import { getAdvancedTrainingV2FailureExplanation } from './AdvancedTrainingV2Explanation.js';

describe('advanced training feedback', () => {
  it('explains the actual category and the target action without game units', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const shot = evaluateAdvancedTrainingV2Shot(scenario,
      { tapTime: scenario.targetTapTimeMs });
    const feedback = getAdvancedTrainingV2FailureExplanation(
      { ...scenario, technique: 'precise' }, 'near_goalie', shot.measurements);
    const [actual, advice] = feedback.split('\n\n');
    expect(actual).toContain('Получился «Вратарь рядом»');
    expect(actual).toContain('вратарь вышел за пределы ворот, но ещё был рядом');
    expect(advice).toContain('Найди узкий проход между вратарём и краем ворот');
    expect(advice).toContain('«Меткий»');
    expect(feedback).not.toMatch(/\d|ед\.|зазор/);
  });
});
