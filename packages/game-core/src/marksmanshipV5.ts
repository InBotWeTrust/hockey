export type MarksmanshipV5Technique =
  | 'ordinary'
  | 'near_goalie'
  | 'counter_direction'
  | 'precise'
  | 'behind_goalie'
  | 'corner'
  | 'edge'
  | 'super_precise';

export interface MarksmanshipV5Measurements {
  puckX: number;
  goalMin: number;
  goalMax: number;
  goalieMin: number;
  goalieMax: number;
  shooterDirection: -1 | 0 | 1;
  goalDirection: -1 | 0 | 1;
  goalieDirection: -1 | 0 | 1;
}

export interface MarksmanshipV5Score {
  technique: MarksmanshipV5Technique;
  points: 10 | 12 | 13 | 14 | 16 | 17 | 18 | 20;
  availableTechniques: MarksmanshipV5Technique[];
}

const PRIORITY: readonly { technique: MarksmanshipV5Technique; points: MarksmanshipV5Score['points'] }[] = [
  { technique: 'super_precise', points: 20 },
  { technique: 'edge', points: 18 },
  { technique: 'corner', points: 17 },
  { technique: 'behind_goalie', points: 16 },
  { technique: 'precise', points: 14 },
  { technique: 'counter_direction', points: 13 },
  { technique: 'near_goalie', points: 12 },
  { technique: 'ordinary', points: 10 },
];

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function classifyMarksmanshipV5Score(m: MarksmanshipV5Measurements): MarksmanshipV5Score {
  const side = m.puckX < m.goalieMin ? 'left' : m.puckX > m.goalieMax ? 'right' : null;
  if (side === null) throw new Error('a saved puck cannot be classified as a V5 goal');

  const goalieOverlapsGoal = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const innerGap = goalieOverlapsGoal
    ? side === 'left' ? m.goalieMin - m.goalMin : m.goalMax - m.goalieMax
    : 0;
  const outerGap = goalieOverlapsGoal ? 0
    : Math.max(0, m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const goalieEdgeDistance = side === 'left' ? m.goalieMin - m.puckX : m.puckX - m.goalieMax;
  const counterDirection = m.shooterDirection !== 0 && m.goalDirection === -m.shooterDirection;
  const behindGoalie = counterDirection && m.goalieDirection === -m.shooterDirection &&
    goalieOverlapsGoal && innerGap > 0 && innerGap <= 30 &&
    (side === 'right' ? m.shooterDirection === 1 : m.shooterDirection === -1);
  const corner = goalieOverlapsGoal && (
    ((inRange(m.goalMin, 55, 95) || inRange(m.goalMax, 477, 517)) && inRange(innerGap, 6, 40)) ||
    ((inRange(m.goalieMin, 36.7, 71.7) || inRange(m.goalieMax, 500.9, 535.9)) &&
      inRange(innerGap, 6, 35))
  );
  const active: Record<MarksmanshipV5Technique, boolean> = {
    super_precise: goalieOverlapsGoal && innerGap > 0 && innerGap <= 6,
    edge: goalieOverlapsGoal && inRange(innerGap, 6, 79.8) && goalieEdgeDistance <= 3,
    corner,
    behind_goalie: behindGoalie,
    precise: goalieOverlapsGoal && inRange(innerGap, 6, 40),
    counter_direction: counterDirection && !goalieOverlapsGoal && inRange(outerGap, 8, 75),
    near_goalie: (goalieOverlapsGoal && innerGap >= 72) ||
      (!goalieOverlapsGoal && outerGap <= 8),
    ordinary: true,
  };
  const availableTechniques = PRIORITY.filter(({ technique }) => active[technique])
    .map(({ technique }) => technique);
  const primary = PRIORITY.find(({ technique }) => active[technique])!;
  return { technique: primary.technique, points: primary.points, availableTechniques };
}
