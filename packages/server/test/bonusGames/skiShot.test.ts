import { expect, it } from 'vitest';
import { assertVersionedSkiEnvironment } from '../../src/bonusGames/skiShot.js';
it('keeps old attempts untouched and requires the ski slug and new core for ski snapshots', () => {
  expect(() => assertVersionedSkiEnvironment(null, 'challenge-ski-resort', 74)).not.toThrow();
  const environment = { ski: { version: 1 as const, seed: 'test', durationMs: 180000 } };
  expect(() => assertVersionedSkiEnvironment(environment, 'challenge-ski-resort', 74)).toThrow();
  expect(() => assertVersionedSkiEnvironment(environment, 'challenge-beach', 75)).toThrow();
  expect(() =>
    assertVersionedSkiEnvironment(environment, 'challenge-ski-resort', 75),
  ).not.toThrow();
});
