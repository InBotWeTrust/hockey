import { createRng } from './rng.js';

export interface SessionPhaseOffsets {
  goalie: number;
  goal: number;
  shooter: number;
}

/**
 * Derives deterministic random phase offsets (in ms) from the session seed.
 * Adding these to `t` before passing to simulate* functions randomises the
 * starting position of each entity without breaking cross-client determinism.
 */
export function getSessionPhaseOffsets(seed: string): SessionPhaseOffsets {
  const rng = createRng(`phase:${seed}`);
  return {
    goalie: rng.next() * 10000,
    goal: rng.next() * 10000,
    shooter: rng.next() * 10000,
  };
}

/**
 * Per-shot seed derivation. Both server and client must use this identical
 * function so that resolveShot yields the same result on either side.
 */
export function deriveShotSeed(
  dailySeed: string,
  periodNumber: number,
  shotIndex: number,
): string {
  return `${dailySeed}:p${periodNumber}:s${shotIndex}`;
}
