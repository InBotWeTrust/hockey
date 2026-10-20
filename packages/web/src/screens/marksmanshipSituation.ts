import {
  classifyMarksmanshipV5Score,
  classifyMarksmanshipV6Score,
  type MarksmanshipV5Measurements,
  type MarksmanshipV5Technique,
  type MarksmanshipV6Measurements,
  type MarksmanshipV6Technique,
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

export const MARKSMANSHIP_V6_NAMES: Record<MarksmanshipV6Technique, string> = {
  ...MARKSMANSHIP_V5_NAMES,
  complex: 'Сложный',
};

export function describeMarksmanshipV6Situation(
  measurements: MarksmanshipV6Measurements,
): MarksmanshipSituationText {
  const technique = classifyMarksmanshipV6Score(measurements).technique;
  const side = measurements.puckX < measurements.goalieMin ? 'Слева' : 'Справа';
  const innerGap = side === 'Слева'
    ? measurements.goalieMin - measurements.goalMin
    : measurements.goalMax - measurements.goalieMax;
  const outerGap = Math.max(0, measurements.goalMin - measurements.goalieMax,
    measurements.goalieMin - measurements.goalMax);
  if (technique === 'complex' || technique === 'precise' || technique === 'super_precise') {
    return { name: MARKSMANSHIP_V6_NAMES[technique],
      reason: `${side} от вратаря: внутренний просвет ${units(innerGap)}` };
  }
  if (technique === 'ordinary') {
    return { name: MARKSMANSHIP_V6_NAMES[technique],
      reason: outerGap > 0
        ? `Вратарь вне ворот: внешний зазор ${units(outerGap)} — больше 75,0`
        : `${side} от вратаря: внутренний просвет ${units(innerGap)} — вне сложных порогов` };
  }
  const reason = (() => {
    switch (technique) {
      case 'edge': {
        const distance = side === 'Слева'
          ? measurements.goalieMin - measurements.puckX
          : measurements.puckX - measurements.goalieMax;
        return `${side} от вратаря: шайба в ${units(distance)} от края, просвет ${units(innerGap)}`;
      }
      case 'corner': {
        const leftBoard = (measurements.goalMin >= 55 && measurements.goalMin <= 105) ||
          (measurements.goalieMin >= 36.7 && measurements.goalieMin <= 86.7);
        return `У ${leftBoard ? 'левого' : 'правого'} борта: внутренний просвет ${units(innerGap)}`;
      }
      case 'behind_goalie':
        return `Игрок ${measurements.shooterDirection < 0 ? 'влево' : 'вправо'}, ворота и вратарь ${measurements.goalDirection < 0 ? 'влево' : 'вправо'}; просвет ${side.toLowerCase()} ${units(innerGap)}`;
      case 'counter_direction':
        return `Игрок ${measurements.shooterDirection < 0 ? 'влево' : 'вправо'}, ворота ${measurements.goalDirection < 0 ? 'влево' : 'вправо'}; внешний зазор ${units(outerGap)}`;
      case 'near_goalie':
        return `Вратарь ${measurements.goalieMin > measurements.goalMax ? 'справа' : 'слева'} от ворот: внешний зазор ${units(outerGap)}`;
      default:
        return `${side} от вратаря: внутренний просвет ${units(innerGap)}`;
    }
  })();
  return { name: MARKSMANSHIP_V6_NAMES[technique], reason };
}

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
