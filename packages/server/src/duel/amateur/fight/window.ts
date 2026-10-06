import type { ParticipantClock } from '../clock.js';

export const FIGHT_PERIOD_WINDOW_MS = 45_000;
export const FIGHT_RESPONSE_TIMEOUT_MS = 10_000;

// Time until the current opening or closing window ends; zero means unavailable.
export function fightWindowRemainingMs(
  clock: Pick<ParticipantClock, 'periodElapsedMs' | 'remainingMs' | 'running'>,
): number {
  if (!clock.running || clock.remainingMs <= 0) return 0;
  if (clock.remainingMs <= FIGHT_PERIOD_WINDOW_MS ||
      clock.periodElapsedMs + clock.remainingMs <= 2 * FIGHT_PERIOD_WINDOW_MS)
    return clock.remainingMs;
  return Math.max(0, FIGHT_PERIOD_WINDOW_MS - clock.periodElapsedMs);
}
