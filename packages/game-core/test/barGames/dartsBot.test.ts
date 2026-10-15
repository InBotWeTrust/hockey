import { expect, it } from 'vitest';
import { botTarget, score } from '../../src/barGames/darts.js';
it('finishes any single-dart checkout instead of overshooting', () => {
  for (const n of [
    ...Array.from({ length: 20 }, (_, i) => i + 1),
    22,
    24,
    25,
    26,
    28,
    30,
    32,
    34,
    36,
    38,
    40,
    42,
    45,
    48,
    50,
    51,
    54,
    57,
    60,
  ])
    expect(score(botTarget(n))).toBe(n);
});
it('sets up a simple finish for awkward remainders and targets triple twenty for scoring', () => {
  for (const n of [23, 29, 31, 37, 41, 43, 47, 49, 53, 59]) {
    const left = n - score(botTarget(n));
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(20);
  }
  expect(score(botTarget(301))).toBe(60);
});
