import { expect, it } from 'vitest';
import { aim } from '../../src/barGames/darts.js';
import { advance, command, createMatch } from '../../src/barGames/runtime.js';

const gentle = { dx: 0, dy: -0.25, durationMs: 100 };
it('keeps a short quick swipe on the board rather than above it', () => {
  expect(aim(gentle).y).toBeCloseTo(-0.2);
  expect(aim({ dx: 0, dy: -0.45, durationMs: 200 }).y).toBeCloseTo(-0.02);
  expect(aim({ dx: 0, dy: -0.6, durationMs: 100 }).y).toBe(-2);
});
it('pins existing matches to their original swipe sensitivity', () => {
  for (const version of [1, 2, 3]) {
    const m = { ...createMatch('darts', 0, 0, false, 12), engineVersion: version };
    expect(command(m, 0, { type: 'dart', gesture: gentle }, 1).lastDart?.y).toBeCloseTo(-1.6);
  }
  const m = createMatch('darts', 0, 0, false, 12);
  expect(command(m, 0, { type: 'dart', gesture: gentle }, 1).lastDart?.y).toBeCloseTo(-0.2);
});
it('preserves Maria targeting and deterministic results after recalibration', () => {
  const current = createMatch('darts', 1, 0, true, 12);
  const legacy = { ...current, engineVersion: 3 };
  const oldHit = advance(legacy, legacy.animationUntil).lastDart!;
  const hit = advance(current, current.animationUntil).lastDart!;
  expect(hit.x).toBeCloseTo(oldHit.x);
  expect(hit.y).toBeCloseTo(oldHit.y);
  expect(advance(current, current.animationUntil)).toEqual(
    advance(current, current.animationUntil),
  );
});
