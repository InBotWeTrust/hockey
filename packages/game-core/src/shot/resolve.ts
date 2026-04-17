import type { ShotInput, ShotResult, StickEffects } from './types.js';
import type { GoalieState } from '../goalie/types.js';
import type { Vec2 } from '../rink.js';
import { GOAL, GOAL_OPENING } from '../rink.js';
import { computeTrajectory } from './trajectory.js';

const MIN_POWER = 0.1;

interface Aabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

function segmentHitsAabb(start: Vec2, end: Vec2, box: Aabb): Vec2 | null {
  // Liang–Barsky clipping of segment [start, end] against AABB.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    start.x - box.x,
    box.x + box.width - start.x,
    start.y - box.y,
    box.y + box.height - start.y,
  ];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > tMax) return null;
        if (t > tMin) tMin = t;
      } else {
        if (t < tMin) return null;
        if (t < tMax) tMax = t;
      }
    }
  }
  return { x: start.x + dx * tMin, y: start.y + dy * tMin };
}

export function resolveShot(
  input: ShotInput,
  goalie: GoalieState,
  stick: StickEffects,
): ShotResult {
  if (input.power < MIN_POWER) return { type: 'miss', reason: 'short' };

  const tr = computeTrajectory(input);

  const shrink = 1 / Math.max(stick.shotZoneMultiplier, 1);
  const effWidth = goalie.width * shrink;
  const goalieBox: Aabb = {
    x: goalie.position.x - effWidth / 2,
    y: goalie.position.y - goalie.height / 2,
    width: effWidth,
    height: goalie.height,
  };
  const savePoint = segmentHitsAabb(tr.start, tr.end, goalieBox);
  if (savePoint) return { type: 'save', goalieContact: savePoint };

  if (
    segmentHitsAabb(tr.start, tr.end, GOAL.leftPost) ||
    segmentHitsAabb(tr.start, tr.end, GOAL.rightPost)
  ) {
    return { type: 'miss', reason: 'wide' };
  }

  // Where would the trajectory (extended to infinity) cross the goal line?
  const dy = tr.end.y - tr.start.y;
  if (dy >= 0) {
    // Direction not pointing toward goal — puck never crosses y=60.
    return { type: 'miss', reason: 'short' };
  }
  const tGoalLine = (GOAL_OPENING.y - tr.start.y) / dy;
  const xAtGoal = tr.start.x + (tr.end.x - tr.start.x) * tGoalLine;
  const inOpening = xAtGoal >= GOAL_OPENING.xMin && xAtGoal <= GOAL_OPENING.xMax;

  if (tr.end.y > GOAL_OPENING.y) {
    // Trajectory fell short of the goal line. Direction still tells us why.
    return inOpening
      ? { type: 'miss', reason: 'short' }
      : { type: 'miss', reason: 'wide' };
  }

  if (!inOpening) return { type: 'miss', reason: 'wide' };

  return { type: 'goal', hitPoint: { x: xAtGoal, y: GOAL_OPENING.y } };
}
