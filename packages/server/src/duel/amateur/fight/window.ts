import type { ParticipantClock } from '../clock.js';

export const FIGHT_RESPONSE_TIMEOUT_MS = 10_000;
export const FIGHT_MAX_CALLS = 3;
export const FIGHT_MAX_REFUSALS = 2;

// Offers require both players to be playing; there are no opening/closing windows.
export function fightWindowRemainingMs(
  clock: Pick<ParticipantClock, 'remainingMs' | 'running'>,
): number {
  return clock.running ? Math.max(0, clock.remainingMs) : 0;
}
