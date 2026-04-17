import type { ShotInput } from './types.js';
import type { Vec2 } from '../rink.js';
import { PUCK_START, RINK } from '../rink.js';

export interface Trajectory {
  start: Vec2;
  end: Vec2;
  length: number;
  angle: number;
}

const MAX_RANGE = RINK.height * 1.5; // at power=1 the puck reliably reaches

export function computeTrajectory(input: ShotInput): Trajectory {
  const length = Math.max(0, Math.min(1, input.power)) * MAX_RANGE;
  // angle = 0 → up (decreasing y). Positive angle → right.
  const dx = Math.sin(input.angle) * length;
  const dy = -Math.cos(input.angle) * length;
  return {
    start: { ...PUCK_START },
    end: { x: PUCK_START.x + dx, y: PUCK_START.y + dy },
    length,
    angle: input.angle,
  };
}
