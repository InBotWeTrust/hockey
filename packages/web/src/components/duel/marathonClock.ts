import { goalWindowRemainingMs } from '../../game/bonusGameTiming.js';

export interface MarathonWindowClockInput {
  nowMs: number;
  windowMs: number;
  startsAtMs: number;
  endsAtMs: number;
  frozenRemainingMs: number | null;
  shot: { contactAtMs: number; resumeAtMs: number; previousEndsAtMs: number; pending: boolean; goal: boolean } | null;
}

/** Catch up timeout windows before freezing a shot based on an older poll. */
export function marathonWindowEndAtShot(endsAtMs: number, shotStartedAtMs: number, windowMs: number): number {
  return shotStartedAtMs > endsAtMs
    ? endsAtMs + Math.ceil((shotStartedAtMs - endsAtMs) / windowMs) * windowMs
    : endsAtMs;
}

/** Present the server window, using the local shot only until it is acknowledged. */
export function marathonWindowRemainingMs(input: MarathonWindowClockInput): number {
  const { nowMs, windowMs, frozenRemainingMs, shot } = input;
  const clamp = (value: number) => Number.isFinite(value) ? Math.min(windowMs, Math.max(0, value)) : 0;
  if (frozenRemainingMs !== null) return clamp(frozenRemainingMs);
  if (shot && nowMs < shot.contactAtMs) return clamp(shot.previousEndsAtMs - nowMs);
  if (shot && nowMs < shot.resumeAtMs) return clamp(shot.previousEndsAtMs - shot.contactAtMs);
  let startsAtMs = input.startsAtMs;
  let endsAtMs = input.endsAtMs;
  if (shot?.pending) {
    startsAtMs = shot.resumeAtMs;
    if (shot.goal) endsAtMs = startsAtMs + windowMs;
    else {
      endsAtMs = shot.previousEndsAtMs;
      if (shot.contactAtMs >= endsAtMs) {
        endsAtMs += (Math.floor((shot.contactAtMs - endsAtMs) / windowMs) + 1) * windowMs;
      }
      endsAtMs += shot.resumeAtMs - shot.contactAtMs;
    }
  }
  // Polling latency must not leave a live rolling window visibly stuck at zero.
  // The server alone records penalties; this only projects the next window.
  if (Number.isFinite(endsAtMs) && nowMs >= endsAtMs) {
    endsAtMs += (Math.floor((nowMs - endsAtMs) / windowMs) + 1) * windowMs;
    startsAtMs = endsAtMs - windowMs;
  }
  return clamp(goalWindowRemainingMs(startsAtMs, endsAtMs, nowMs));
}
