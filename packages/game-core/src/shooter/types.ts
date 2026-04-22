export interface ShooterState {
  x: number;
}

export const SHOOTER_SIZE = { width: 28, height: 26 } as const;

// lefthand/righthand.webp: 1024×1024 top-down sprite, centered at body.
// Shooter body travels the same range for both grips; the puck is offset
// from the body horizontally based on grip so the blade can reach different
// boards (left grip — closer to left board, right grip — to right).
import { RINK } from '../rink.js';
const SPRITE_WIDTH = 70;
const BODY_HALF    = SPRITE_WIDTH / 2; // = 35
const INNER_MARGIN = 6;

export const SHOOTER_MIN_X    = Math.ceil(BODY_HALF + INNER_MARGIN);              // = 41
export const SHOOTER_MAX_X    = Math.floor(RINK.width - BODY_HALF - INNER_MARGIN); // = 349
export const SHOOTER_CENTER_X = (SHOOTER_MIN_X + SHOOTER_MAX_X) / 2;  // = 195
export const SHOOTER_AMPLITUDE = (SHOOTER_MAX_X - SHOOTER_MIN_X) / 2; // = 154
export const SHOOTER_FREQUENCY = 0.45; // Hz
