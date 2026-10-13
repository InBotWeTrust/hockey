import { describe, expect, it } from 'vitest';
import { marathonWindowEndAtShot, marathonWindowRemainingMs } from './marathonClock.js';

describe.each([4000, 7000])('Marathon %i ms window', (windowMs) => {
  const base = { nowMs: 0, windowMs, startsAtMs: 0, endsAtMs: windowMs, frozenRemainingMs: null, shot: null };
  it('captures the current window when a shot starts after a stale deadline', () => {
    expect(marathonWindowEndAtShot(windowMs, windowMs * 3 + 200, windowMs)).toBe(windowMs * 4);
    expect(marathonWindowEndAtShot(windowMs, windowMs, windowMs)).toBe(windowMs);
  });
  it('rolls elapsed windows immediately while the penalty request is pending', () => {
    expect(marathonWindowRemainingMs({ ...base, nowMs: windowMs - 200 })).toBe(200);
    expect(marathonWindowRemainingMs({ ...base, nowMs: windowMs })).toBe(windowMs);
    expect(marathonWindowRemainingMs({ ...base, nowMs: windowMs * 3 + 200 })).toBe(windowMs - 200);
  });
  it('counts flight, freezes the result, and resets once when motion resumes', () => {
    const shot = { contactAtMs: 2500, resumeAtMs: 3500, previousEndsAtMs: windowMs, pending: true };
    expect(marathonWindowRemainingMs({ ...base, shot, nowMs: 2300 })).toBe(windowMs - 2300);
    for (const nowMs of [2500, 2800, 3499]) {
      expect(marathonWindowRemainingMs({ ...base, shot, nowMs, frozenRemainingMs: 1500 })).toBe(1500);
    }
    expect(marathonWindowRemainingMs({ ...base, shot, nowMs: 3500 })).toBe(windowMs);
    expect(marathonWindowRemainingMs({ ...base, shot, nowMs: 3600 })).toBe(windowMs - 100);
    expect(marathonWindowRemainingMs({ ...base, shot: { ...shot, pending: false }, startsAtMs: 3500, endsAtMs: 3500 + windowMs, nowMs: 3600 })).toBe(windowMs - 100);
  });
  it('does not count a future start or a malformed frozen value as extra seconds', () => {
    expect(marathonWindowRemainingMs({ ...base, startsAtMs: 3500, endsAtMs: 3500 + windowMs, nowMs: 2300 })).toBe(windowMs);
    expect(marathonWindowRemainingMs({ ...base, frozenRemainingMs: 5200 })).toBe(Math.min(windowMs, 5200));
  });
});
