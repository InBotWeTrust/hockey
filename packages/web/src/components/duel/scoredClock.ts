/** Advance server-anchored time, excluding the reserved shot-result interval. */
export function scoredActiveDeltaMs(serverNowMs: number, nowMs: number, pauseStartsAt?: string | null, pauseEndsAt?: string | null, paused = false): number {
  if (paused) return 0;
  const elapsed = Math.max(0, nowMs - serverNowMs);
  if (!pauseStartsAt || !pauseEndsAt) return elapsed;
  const overlap = Math.max(0, Math.min(nowMs, Date.parse(pauseEndsAt)) - Math.max(serverNowMs, Date.parse(pauseStartsAt)));
  return Math.max(0, elapsed - overlap);
}
