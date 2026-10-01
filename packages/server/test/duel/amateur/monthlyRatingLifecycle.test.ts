import { describe, expect, it } from 'vitest';
import { millisecondsUntilNextMinuteBoundary } from '../../../src/plugins/monthlyRatingLifecycle.js';

describe('monthly rating lifecycle scheduling', () => {
  it.each([
    ['2026-09-30T20:59:59.999Z', 1],
    ['2026-09-30T21:00:00.000Z', 60_000],
    ['2026-09-30T21:00:42.250Z', 17_750],
  ])('aligns the next reconciliation to a minute boundary from %s', (value, expected) => {
    expect(millisecondsUntilNextMinuteBoundary(new Date(value))).toBe(expected);
  });
});
