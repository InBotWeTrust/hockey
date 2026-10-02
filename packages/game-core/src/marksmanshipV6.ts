import { RINK } from './rink.js';
import type { MarksmanshipV5Measurements } from './marksmanshipV5.js';

export type MarksmanshipV6Measurements = MarksmanshipV5Measurements;

export type MarksmanshipV6Technique =
  | 'ordinary'
  | 'near_goalie'
  | 'counter_direction'
  | 'complex'
  | 'precise'
  | 'behind_goalie'
  | 'corner'
  | 'edge'
  | 'super_precise';

export interface MarksmanshipV6Score {
  technique: MarksmanshipV6Technique;
  points: 10 | 12 | 13 | 14 | 16 | 17 | 18 | 20;
  availableTechniques: MarksmanshipV6Technique[];
}

const PRIORITY: readonly { technique: MarksmanshipV6Technique; points: MarksmanshipV6Score['points'] }[] = [
  { technique: 'super_precise', points: 20 },
  { technique: 'edge', points: 18 },
  { technique: 'corner', points: 17 },
  { technique: 'behind_goalie', points: 16 },
  { technique: 'precise', points: 14 },
  { technique: 'complex', points: 13 },
  { technique: 'counter_direction', points: 13 },
  { technique: 'near_goalie', points: 12 },
  { technique: 'ordinary', points: 10 },
];

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function classifyMarksmanshipV6Score(m: MarksmanshipV6Measurements): MarksmanshipV6Score {
  const side = m.puckX < m.goalieMin ? 'left' : m.puckX > m.goalieMax ? 'right' : null;
  if (side === null) throw new Error('a saved puck cannot be classified as a V6 goal');

  const overlap = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const innerGap = overlap
    ? side === 'left' ? m.goalieMin - m.goalMin : m.goalMax - m.goalieMax
    : 0;
  const outerGap = overlap ? 0
    : Math.max(0, m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const goalieEdgeDistance = side === 'left' ? m.goalieMin - m.puckX : m.puckX - m.goalieMax;
  const counterDirection = m.shooterDirection !== 0 && m.goalDirection === -m.shooterDirection;
  const behindGoalie = counterDirection && m.goalieDirection === -m.shooterDirection &&
    overlap && innerGap > 10 && innerGap <= 60 &&
    (side === 'right' ? m.shooterDirection === 1 : m.shooterDirection === -1);
  const corner = overlap && (
    (side === 'left' && (
      (inRange(m.goalMin, 55, 105) && inRange(innerGap, 6, 60)) ||
      (inRange(m.goalieMin, 36.7, 86.7) && inRange(innerGap, 6, 50))
    )) ||
    (side === 'right' && (
      (inRange(m.goalMax, RINK.width - 105, RINK.width - 55) && inRange(innerGap, 6, 60)) ||
      (inRange(m.goalieMax, RINK.width - 86.7, RINK.width - 36.7) && inRange(innerGap, 6, 50))
    ))
  );
  const active: Record<MarksmanshipV6Technique, boolean> = {
    super_precise: overlap && innerGap > 0 && innerGap <= 10,
    edge: overlap && innerGap > 10 && goalieEdgeDistance <= 6,
    corner,
    behind_goalie: behindGoalie,
    precise: overlap && inRange(innerGap, 10, 60),
    complex: overlap && innerGap >= 60 && innerGap <= 79.8 + Number.EPSILON * 79.8,
    counter_direction: counterDirection && !overlap && outerGap > 0 && outerGap <= 75,
    near_goalie: !overlap && outerGap > 0 && outerGap <= 75,
    ordinary: true,
  };
  const availableTechniques = PRIORITY.filter(({ technique }) => active[technique])
    .map(({ technique }) => technique);
  const primary = PRIORITY.find(({ technique }) => active[technique])!;
  return { technique: primary.technique, points: primary.points, availableTechniques };
}
