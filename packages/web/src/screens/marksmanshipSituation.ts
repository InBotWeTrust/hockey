import {
  classifyMarksmanshipV5Score,
  type MarksmanshipV5Measurements,
  type MarksmanshipV5Technique,
} from '@hockey/game-core';

export interface MarksmanshipSituationText {
  name: string;
  reason: string;
}

export const MARKSMANSHIP_V5_NAMES: Record<MarksmanshipV5Technique, string> = {
  ordinary: 'Простой',
  near_goalie: 'Вратарь рядом',
  counter_direction: 'Противоход',
  precise: 'Меткий',
  behind_goalie: 'За вратаря',
  corner: 'Сложный в углу',
  edge: 'На грани',
  super_precise: 'Суперметкий',
};

function units(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function describeMarksmanshipV5Situation(
  measurements: MarksmanshipV5Measurements,
): MarksmanshipSituationText {
  const m = measurements;
  const technique = classifyMarksmanshipV5Score(m).technique;
  const side = m.puckX < m.goalieMin ? 'слева' : 'справа';
  const sideLabel = side === 'слева' ? 'Слева' : 'Справа';
  const overlaps = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const innerGap = side === 'слева' ? m.goalieMin - m.goalMin : m.goalMax - m.goalieMax;
  const outerGap = Math.max(0, m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const goalieSide = m.goalieMin > m.goalMax ? 'справа' : 'слева';
  let reason: string;

  switch (technique) {
    case 'super_precise':
      reason = `${sideLabel} от вратаря: внутренний просвет ${units(innerGap)}`;
      break;
    case 'edge': {
      const edgeDistance = side === 'слева' ? m.goalieMin - m.puckX : m.puckX - m.goalieMax;
      reason = `${sideLabel} от вратаря: шайба в ${units(edgeDistance)} от края, просвет ${units(innerGap)}`;
      break;
    }
    case 'corner': {
      const leftBoard = (m.goalMin >= 55 && m.goalMin <= 95) ||
        (m.goalieMin >= 36.7 && m.goalieMin <= 71.7);
      reason = `У ${leftBoard ? 'левого' : 'правого'} борта: внутренний просвет ${units(innerGap)}`;
      break;
    }
    case 'behind_goalie':
      reason = `Игрок ${m.shooterDirection < 0 ? 'влево' : 'вправо'}, ворота и вратарь ${m.goalDirection < 0 ? 'влево' : 'вправо'}; просвет ${side} ${units(innerGap)}`;
      break;
    case 'precise':
      reason = `${sideLabel} от вратаря: внутренний просвет ${units(innerGap)}`;
      break;
    case 'counter_direction':
      reason = `Игрок ${m.shooterDirection < 0 ? 'влево' : 'вправо'}, ворота ${m.goalDirection < 0 ? 'влево' : 'вправо'}; внешний зазор ${units(outerGap)}`;
      break;
    case 'near_goalie':
      reason = overlaps
        ? `${sideLabel} от вратаря: широкий просвет ${units(innerGap)}`
        : `Вратарь ${goalieSide} от ворот: внешний зазор ${units(outerGap)}`;
      break;
    case 'ordinary':
      reason = overlaps
        ? `${sideLabel} от вратаря: просвет ${units(innerGap)} — вне сложных порогов`
        : `Вратарь ${goalieSide} от ворот: внешний зазор ${units(outerGap)} — вне сложных порогов`;
      break;
  }
  return { name: MARKSMANSHIP_V5_NAMES[technique], reason };
}
