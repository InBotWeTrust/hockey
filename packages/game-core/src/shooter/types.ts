export interface ShooterState {
  x: number;
}

export const SHOOTER_SIZE = { width: 28, height: 26 } as const;

// Global shooter constants — same for every boss. Amplitude leaves a small
// margin so the sprite never clips the boards.
import { RINK } from '../rink.js';
export const SHOOTER_AMPLITUDE = (RINK.width - SHOOTER_SIZE.width) / 2 - 8;
export const SHOOTER_FREQUENCY = 0.35; // Hz — full board-to-board cycle ≈ 2.86s
