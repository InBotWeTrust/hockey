import { describe, expect, it } from 'vitest';
import { getAdvancedTrainingV2Scenario, evaluateAdvancedTrainingV2Shot } from '@hockey/game-core';
import { getAdvancedTrainingV2Explanation, getAdvancedTrainingV2FailureExplanation,
  getAdvancedTrainingV2StopHint } from './AdvancedTrainingV2Explanation.js';

describe('advanced training V2 demonstration explanation', () => {
  it.each([
    ['near_goalie', 'вратарь окажется снаружи ворот'],
    ['counter_direction', 'ты и ворота движетесь в противоположные стороны'],
    ['complex', 'вратарь перекроет часть ворот'],
    ['precise', 'останется узкий просвет'],
    ['behind_goalie', 'откроется просвет за вратарём'],
    ['corner', 'останется просвет в углу'],
    ['edge', 'пройдёт рядом с вратарём'],
    ['super_precise', 'останется совсем маленький просвет'],
  ] as const)('briefly explains %s before the shot', (technique, condition) => {
    const scenario = getAdvancedTrainingV2Scenario(technique, 'left', 'demonstration', 0);
    const hint = getAdvancedTrainingV2StopHint(scenario,
      { player: 'left', goal: 'right', goalie: 'right' });
    expect(hint.situation).toContain('Ты движешься влево, ворота движутся вправо, вратарь движется вправо.');
    expect(hint.situation).toContain(condition);
    expect(hint.instruction).toBe('Бросай сейчас: шайбе нужно время долететь до ворот.');
  });
  it.each(['left', 'right'] as const)('explains the actual %s situation without measurements', (side) => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', side, 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs });
    const explanation = getAdvancedTrainingV2Explanation(scenario, evaluation);
    expect(evaluation.result.type).toBe('goal');
    expect(explanation).toContain('Вратарь рядом');
    expect(explanation).toContain(side === 'left' ? 'слева' : 'справа');
    expect(explanation).toContain('Пока шайба летела');
    expect(explanation).not.toMatch(/\d|ед\.|Момент твоего броска|Попадание/);
  });

  it.each([
    ['counter_direction', 'в противоположную сторону'],
    ['complex', 'часть ворот'],
    ['precise', 'узкий проход'],
    ['behind_goalie', 'За вратарём'],
    ['corner', 'левого борта'],
    ['edge', 'рядом с вратарём'],
    ['super_precise', 'совсем узкий'],
  ] as const)('explains %s in everyday language', (technique, detail) => {
    const scenario = getAdvancedTrainingV2Scenario(technique, 'left', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs });
    const explanation = getAdvancedTrainingV2Explanation(scenario, evaluation);
    expect(explanation).toContain(detail);
    expect(explanation).not.toMatch(/\d|ед\.|просвет|зазор/);
  });

  it('explains a mismatched practice goal without exposing measurements', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs });
    const feedback = getAdvancedTrainingV2FailureExplanation(scenario, 'ordinary', evaluation.measurements);
    expect(feedback).toContain('Вратарь рядом');
    expect(feedback).not.toMatch(/\d|ед\.|зазор|просвет/);
    expect(feedback.split('\n\n')).toHaveLength(2);
  });

  it('distinguishes a far-away goalie from one still touching the goal', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const base = evaluateAdvancedTrainingV2Shot(scenario,
      { tapTime: scenario.targetTapTimeMs }).measurements!;
    const far = { ...base, goalieMin: base.goalMax + 100,
      goalieMax: base.goalMax + 130 };
    const feedback = getAdvancedTrainingV2FailureExplanation(scenario, 'ordinary', far);
    expect(feedback.split('\n\n')).toHaveLength(2);
    expect(feedback).toContain('вратарь уже был далеко от ворот');
    expect(feedback).toContain('Дождись, когда вратарь выйдет за пределы ворот, но будет около них');
  });

  it('explains when the right technique happened on the other side', () => {
    const target = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const opposite = getAdvancedTrainingV2Scenario('near_goalie', 'right', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(opposite, { tapTime: opposite.targetTapTimeMs });
    const feedback = getAdvancedTrainingV2FailureExplanation(target, 'near_goalie', evaluation.measurements);
    expect(feedback).toContain('вратарь был справа от ворот');
    expect(feedback).toContain('вратарь окажется слева от ворот');
    expect(feedback).not.toMatch(/\d|ед\.|зазор|просвет/);
  });

  it('suggests an observable change when the target technique did not occur', () => {
    const target = getAdvancedTrainingV2Scenario('super_precise', 'left', 'demonstration', 0);
    const other = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(other, { tapTime: other.targetTapTimeMs });
    const feedback = getAdvancedTrainingV2FailureExplanation(target, 'near_goalie', evaluation.measurements);
    expect(feedback).toContain('совсем узкого прохода');
    expect(feedback).not.toMatch(/\d|ед\.|зазор|просвет/);
  });

  it('refuses to present a non-matching result as the target technique', () => {
    const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    const evaluation = evaluateAdvancedTrainingV2Shot(scenario, { tapTime: scenario.targetTapTimeMs - 1000 });
    expect(() => getAdvancedTrainingV2Explanation(scenario, evaluation)).toThrow();
  });
});
