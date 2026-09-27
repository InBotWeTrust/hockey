import { GOAL_OPENING, PUCK_START, type AdvancedTrainingV2Scenario,
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
  evaluation: Evaluation): string {
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
  const impactTime = scenario.targetTapTimeMs +
    (PUCK_START.y - GOAL_OPENING.y) / scenario.speeds.puckSpeedPerMs;
  return `${ADVANCED_TRAINING_V2_TITLES[scenario.technique]}. ${relation} Нажать «Бросок»: ${(scenario.targetTapTimeMs / 1000).toFixed(2)} с. Попадание: ${(impactTime / 1000).toFixed(2)} с.`;
}
