import {
  GOAL,
  GOAL_OPENING,
  RINK,
  type GoalieState,
  type ShotResult,
  type Vec2,
} from '@hockey/game-core';
import type { ResultModalKind } from '../components/ResultModal.js';

export interface PuckOutcomeMotion {
  end: Vec2;
  durationMs: number;
  waypoint?: {
    position: Vec2;
    progress: number;
  };
}

export interface PuckReboundObstacle {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const RINK_EDGE_INSET = 8;
const END_BOARD_INSET = 18;
const END_BOARD_CORNER_RADIUS = 74;
const END_BOARD_STRAIGHT_MIN_X = END_BOARD_INSET + END_BOARD_CORNER_RADIUS;
const END_BOARD_STRAIGHT_MAX_X =
  RINK.width - END_BOARD_INSET - END_BOARD_CORNER_RADIUS;
const END_BOARD_MIN_IMPACT_MS = 45;
const END_BOARD_REBOUND_MS = 220;
const END_BOARD_REBOUND_DISTANCE = 95;
const SAVE_DEFLECTION_X = 60;
const SAVE_DEFLECTION_Y = 100;
const SAVE_VISUAL_CONTACT_Y_OFFSET = 14;
const POST_REBOUND_X = 78;
const POST_REBOUND_Y = 125;

function clampToRink(x: number): number {
  return Math.max(RINK_EDGE_INSET, Math.min(RINK.width - RINK_EDGE_INSET, x));
}

export function puckReboundObstacles(
  goalOffsetX: number,
  goalieState: GoalieState,
): PuckReboundObstacle[] {
  return [
    {
      minX: GOAL.x + goalOffsetX,
      maxX: GOAL.x + goalOffsetX + GOAL.width,
      minY: GOAL.y,
      maxY: GOAL.y + GOAL.height,
    },
    {
      minX: goalieState.position.x - goalieState.width / 2,
      maxX: goalieState.position.x + goalieState.width / 2,
      minY: goalieState.position.y - goalieState.height / 2,
      maxY: goalieState.position.y + goalieState.height / 2,
    },
  ];
}

function segmentObstacleIntersection(
  start: Vec2,
  end: Vec2,
  obstacle: PuckReboundObstacle,
): number | null {
  const delta = { x: end.x - start.x, y: end.y - start.y };
  let minT = 0;
  let maxT = 1;

  for (const axis of ['x', 'y'] as const) {
    const min = axis === 'x' ? obstacle.minX : obstacle.minY;
    const max = axis === 'x' ? obstacle.maxX : obstacle.maxY;
    if (Math.abs(delta[axis]) < Number.EPSILON) {
      if (start[axis] < min || start[axis] > max) return null;
      continue;
    }
    const first = (min - start[axis]) / delta[axis];
    const second = (max - start[axis]) / delta[axis];
    minT = Math.max(minT, Math.min(first, second));
    maxT = Math.min(maxT, Math.max(first, second));
    if (minT > maxT) return null;
  }

  return minT >= 0 && minT <= 1 ? minT : null;
}

function endBoardMissMotion(
  contact: Vec2,
  reduceMotion: boolean,
  puckSpeedPerMs: number,
  obstacles: readonly PuckReboundObstacle[],
): PuckOutcomeMotion {
  const x = Math.max(END_BOARD_INSET, Math.min(RINK.width - END_BOARD_INSET, contact.x));
  let impact: Vec2;
  let normal: Vec2;

  if (x >= END_BOARD_STRAIGHT_MIN_X && x <= END_BOARD_STRAIGHT_MAX_X) {
    impact = { x, y: END_BOARD_INSET };
    normal = { x: 0, y: -1 };
  } else {
    const centerX = x < RINK.width / 2 ? END_BOARD_STRAIGHT_MIN_X : END_BOARD_STRAIGHT_MAX_X;
    const dx = x - centerX;
    const dy = -Math.sqrt(Math.max(0, END_BOARD_CORNER_RADIUS ** 2 - dx ** 2));
    impact = { x, y: END_BOARD_INSET + END_BOARD_CORNER_RADIUS + dy };
    normal = { x: dx / END_BOARD_CORNER_RADIUS, y: dy / END_BOARD_CORNER_RADIUS };
  }

  const incoming = { x: 0, y: -1 };
  const dot = incoming.x * normal.x + incoming.y * normal.y;
  const reflected = {
    x: incoming.x - 2 * dot * normal.x,
    y: incoming.y - 2 * dot * normal.y,
  };
  const impactDurationMs = Math.max(
    END_BOARD_MIN_IMPACT_MS,
    (contact.y - impact.y) / Math.max(0.1, puckSpeedPerMs),
  );
  const plannedEnd = {
    x: clampToRink(impact.x + reflected.x * END_BOARD_REBOUND_DISTANCE),
    y: impact.y + reflected.y * END_BOARD_REBOUND_DISTANCE,
  };
  const obstacleT = obstacles.reduce<number | null>((nearest, obstacle) => {
    const intersection = segmentObstacleIntersection(impact, plannedEnd, obstacle);
    if (intersection === null) return nearest;
    return nearest === null ? intersection : Math.min(nearest, intersection);
  }, null);
  const reboundProgress = obstacleT ?? 1;
  const end = {
    x: impact.x + (plannedEnd.x - impact.x) * reboundProgress,
    y: impact.y + (plannedEnd.y - impact.y) * reboundProgress,
  };
  const reboundDurationMs = END_BOARD_REBOUND_MS * reboundProgress;
  const durationMs = reduceMotion ? 0 : impactDurationMs + reboundDurationMs;

  return {
    end,
    durationMs,
    waypoint: {
      position: impact,
      progress: impactDurationMs / (impactDurationMs + reboundDurationMs),
    },
  };
}

export function puckResultContact(result: ShotResult, shooterX: number): Vec2 {
  if (result.type === 'goal') return result.hitPoint;
  if (result.type === 'save') {
    return {
      x: result.goalieContact.x,
      y: result.goalieContact.y + SAVE_VISUAL_CONTACT_Y_OFFSET,
    };
  }
  return { x: shooterX, y: GOAL_OPENING.y };
}

export function puckOutcomeMotion(
  kind: ResultModalKind,
  contact: Vec2,
  reduceMotion = false,
  puckSpeedPerMs = 1,
  obstacles: readonly PuckReboundObstacle[] = [],
): PuckOutcomeMotion | null {
  const rinkCenterX = RINK.width / 2;

  if (kind === 'save') {
    const direction = contact.x < rinkCenterX ? -1 : 1;
    return {
      end: {
        x: clampToRink(contact.x + direction * SAVE_DEFLECTION_X),
        y: contact.y + SAVE_DEFLECTION_Y,
      },
      durationMs: reduceMotion ? 0 : 320,
    };
  }

  if (kind === 'post') {
    const direction = contact.x < rinkCenterX ? 1 : -1;
    return {
      end: {
        x: clampToRink(contact.x + direction * POST_REBOUND_X),
        y: contact.y + POST_REBOUND_Y,
      },
      durationMs: reduceMotion ? 0 : 280,
    };
  }

  if (kind === 'miss') {
    return endBoardMissMotion(contact, reduceMotion, puckSpeedPerMs, obstacles);
  }

  return null;
}
