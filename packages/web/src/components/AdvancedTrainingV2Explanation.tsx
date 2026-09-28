import { GOAL_OPENING, PUCK_START, classifyMarksmanshipV6Score, getAdvancedTrainingV2Side,
  type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique,
  type MarksmanshipV6Measurements, type ShotResult } from '@hockey/game-core';

export const ADVANCED_TRAINING_V2_TITLES: Record<AdvancedTrainingV2Technique, string> = {
  near_goalie: 'Вратарь рядом', counter_direction: 'Противоход',
  complex: 'Сложный', precise: 'Меткий', behind_goalie: 'За вратаря',
  corner: 'Сложный в углу', edge: 'На грани', super_precise: 'Суперметкий',
};

type Evaluation = {
  result: ShotResult;
  actualTechnique: AdvancedTrainingV2Technique | 'ordinary' | null;
  actualSide: AdvancedTrainingV2Side | null;
  success: boolean;
  measurements: MarksmanshipV6Measurements | null;
};

export function getAdvancedTrainingV2Explanation(scenario: AdvancedTrainingV2Scenario,
  evaluation: Evaluation, actualTapTimeMs = scenario.targetTapTimeMs): string {
  if (!evaluation.success || evaluation.result.type !== 'goal' || !evaluation.measurements) {
    throw new Error('Demonstration scenario did not produce the selected category');
  }
  const m = evaluation.measurements;
  const overlap = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const gap = overlap
    ? scenario.side === 'left' ? m.goalieMin - m.goalMin : m.goalMax - m.goalieMax
    : Math.max(0, m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const sideCopy = scenario.side === 'left' ? 'слева' : 'справа';
  const direction = (value: number) => value < 0 ? 'влево' : value > 0 ? 'вправо' : 'стоит';
  const relation = scenario.technique === 'near_goalie'
    ? `Вратарь ${sideCopy} за пределами ворот, внешний зазор ${gap.toFixed(1)} ед.`
    : scenario.technique === 'counter_direction'
      ? `Игрок движется ${direction(m.shooterDirection)}, ворота — ${direction(m.goalDirection)}. Внешний зазор ${gap.toFixed(1)} ед.`
      : scenario.technique === 'behind_goalie'
        ? `Игрок движется ${direction(m.shooterDirection)}, ворота и вратарь — в противоположную сторону. Внутренний просвет ${gap.toFixed(1)} ед.`
        : scenario.technique === 'corner'
          ? `У ${scenario.side === 'left' ? 'левого' : 'правого'} борта открыт внутренний просвет ${gap.toFixed(1)} ед.`
          : scenario.technique === 'edge'
            ? `Шайба прошла в ${Math.abs(scenario.side === 'left' ? m.goalieMin - m.puckX : m.puckX - m.goalieMax).toFixed(1)} ед. от вратаря; внутренний просвет ${gap.toFixed(1)} ед.`
            : `Внутренний просвет ${sideCopy} от вратаря — ${gap.toFixed(1)} ед.`;
  const impactTime = actualTapTimeMs +
    (PUCK_START.y - GOAL_OPENING.y) / scenario.speeds.puckSpeedPerMs;
  return `${ADVANCED_TRAINING_V2_TITLES[scenario.technique]}. ${relation} Нажать «Бросок»: ${(actualTapTimeMs / 1000).toFixed(2)} с. Попадание: ${(impactTime / 1000).toFixed(2)} с.`;
}

export function getAdvancedTrainingV2FailureExplanation(scenario: AdvancedTrainingV2Scenario,
  actual: AdvancedTrainingV2Technique | 'ordinary' | null,
  m: MarksmanshipV6Measurements | null): string {
  if (!m) return `${actual === 'ordinary' ? 'Простой бросок' : actual
    ? ADVANCED_TRAINING_V2_TITLES[actual] : 'Другая ситуация'}. Данные просвета не получены; сравните положение шайбы, ворот и вратаря в момент попадания.`;
  const overlap = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const inner = scenario.side === 'left' ? m.goalieMin - m.goalMin : m.goalMax - m.goalieMax;
  const outer = Math.max(0, m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const gap = overlap ? `Внутренний просвет ${inner.toFixed(1)} ед.` :
    `Вратарь вне ворот, внешний зазор ${outer.toFixed(1)} ед.`;
  const side = scenario.side === 'left' ? 'слева' : 'справа';
  const actualName = actual === 'ordinary' ? 'Простой бросок' : actual
    ? ADVANCED_TRAINING_V2_TITLES[actual] : 'Другая ситуация';
  const targetAvailable = classifyMarksmanshipV6Score(m).availableTechniques.includes(scenario.technique);
  const targetSide = targetAvailable ? getAdvancedTrainingV2Side(scenario.technique, m) : null;
  if (targetAvailable && targetSide === scenario.side) {
    return `${actualName}. ${gap} Условие «${ADVANCED_TRAINING_V2_TITLES[scenario.technique]}» выполнено, но приоритетнее другая категория.`;
  }
  if (targetAvailable && targetSide !== scenario.side) {
    return `${actualName}. ${gap} Нужная категория возникла ${targetSide === 'left' ? 'слева' : 'справа'}, а упражнение требует ${side}.`;
  }
  const condition: Record<AdvancedTrainingV2Technique, string> = {
    near_goalie: 'Вратарь должен быть вне ворот, внешний зазор — больше 0 и не больше 75 ед.',
    counter_direction: 'Игрок и ворота должны двигаться в противоположных направлениях, вратарь — вне ворот не дальше 75 ед.',
    complex: 'Вратарь должен перекрывать ворота, внутренний просвет — от 60 до 79,8 ед.',
    precise: 'Внутренний просвет должен быть от 10 до 60 ед.',
    behind_goalie: 'Игрок должен двигаться против ворот и вратаря, внутренний просвет — больше 10 и не больше 60 ед.',
    corner: `У борта край ворот сейчас ${scenario.side === 'left' ? m.goalMin : m.goalMax.toFixed(1)} ед., край вратаря ${scenario.side === 'left' ? m.goalieMin : m.goalieMax.toFixed(1)} ед.; нужен просвет 6–60 ед. у ворот или 6–50 ед. у вратаря.`,
    edge: 'Шайба должна пройти не дальше 6 ед. от вратаря при внутреннем просвете больше 10 ед.',
    super_precise: 'Внутренний просвет должен быть больше 0 и не больше 10 ед.',
  };
  return `${actualName}. ${gap} Для броска ${side} «${ADVANCED_TRAINING_V2_TITLES[scenario.technique]}» не выполнено условие: ${condition[scenario.technique]}`;
}
