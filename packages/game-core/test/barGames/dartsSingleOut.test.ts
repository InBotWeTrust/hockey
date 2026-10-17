import { expect, it } from 'vitest';
import {
  barDarts as darts,
  command,
  createMatch,
  type Runtime,
} from '../../src/barGames/runtime.js';
function match(remaining = 501, angle = 0, version?: number) {
  const m = createMatch('darts', 0, 0, false, 7);
  if (version !== undefined) m.engineVersion = version;
  if (m.game.kind !== 'darts') throw Error('Expected darts');
  m.game = { ...m.game, scores: [remaining, 501], turnStartScore: remaining, boardAngle: angle };
  return m;
}
function hit(m: Runtime, point: darts.Point) {
  const dy = (-(1.6 - point.y) * 400) / darts.SWIPE_GAIN;
  return command(
    m,
    0,
    { type: 'dart', gesture: { dx: (point.x / 1.4) * -dy, dy, durationMs: 400 } },
    m.animationUntil + 1,
  );
}
it('starts new single-out games at 501 and accepts an ordinary winning sector', () => {
  expect(createMatch('darts', 0, 0, false, 1).game).toMatchObject({ scores: [501, 501] });
  expect(hit(match(20), { x: 0, y: -0.4 }).game).toMatchObject({ scores: [0, 501], winner: 0 });
});
it('preserves all three sixties from 181, permits one left, and rotates after the visit', () => {
  let m = match(181);
  for (let i = 0; i < 3; i++) m = hit(m, { x: 0, y: -0.6 });
  expect(m.game).toMatchObject({ scores: [1, 501], winner: null, turn: 1, lastBust: false });
  expect(m.dartRotation).toBeDefined();
  const a = Math.PI / 10;
  expect(hit(match(1), { x: Math.sin(a) * 0.4, y: -Math.cos(a) * 0.4 }).game.winner).toBe(0);
});
it('ignores only the overscoring dart and keeps the remaining throws', () => {
  let m = hit(match(50), { x: 0, y: -0.4 });
  m = hit(m, { x: 0, y: -0.6 });
  expect(m.game).toMatchObject({ scores: [30, 501], turn: 0, dartsLeft: 1, lastBust: true });
  expect(m.feedback).toMatchObject({ points: 60, bust: true });
  expect(m.dartRotation).toBeUndefined();
  m = hit(m, { x: 0, y: -0.4 });
  expect(m.game).toMatchObject({ scores: [10, 501], turn: 1, lastBust: false });
  expect(m.dartRotation).toBeDefined();
});
it('scores single-out shots using the current board rotation', () => {
  const m = hit(match(501, 90), { x: 0.6, y: 0 });
  expect(m.game).toMatchObject({ scores: [441, 501] });
  expect(m.feedback?.points).toBe(60);
});
it.each([9, 10])('retains double-out and whole-visit busts for engine %s', (version) => {
  let m = match(181, 0, version);
  for (let i = 0; i < 3; i++) m = hit(m, { x: 0, y: -0.6 });
  expect(m.game).toMatchObject({ scores: [181, 501], turn: 1, lastBust: true });
  expect(hit(match(20, 0, version), { x: 0, y: -0.4 }).game.winner).toBeNull();
});
it('offers legal single-out targets including one and ordinary winning sectors', () => {
  for (let n = 1; n <= 501; n++) {
    const p = darts.botTarget(n, false),
      points = darts.score(p);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(points).toBeGreaterThan(0);
    expect(points).toBeLessThanOrEqual(n);
    if (n <= 20) expect(points).toBe(n);
  }
});
