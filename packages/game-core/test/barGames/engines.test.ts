import { describe, expect, it } from 'vitest';
import * as darts from '../../src/barGames/darts.js';
import * as checkers from '../../src/barGames/checkers.js';
import * as pool from '../../src/barGames/pool.js';

describe('darts', () => {
  it('scores bull, rings and sector boundaries deterministically', () => {
    expect(darts.score({ x: 0, y: 0 })).toBe(50);
    expect(darts.score({ x: 0, y: -0.07 })).toBe(25);
    expect(darts.score({ x: 0, y: -0.6 })).toBe(60);
    expect(darts.score({ x: 0, y: -0.96 })).toBe(40);
    expect(darts.score({ x: 0, y: -1.1 })).toBe(0);
  });
  it('ignores only an overscoring dart, preserves earlier points and wins single-out', () => {
    let g = darts.create(0);
    g.scores = [50, 301];
    g = darts.hit(g, { x: 0, y: -0.6 }, false);
    expect(g.scores[0]).toBe(50);
    g = darts.hit(g, { x: 0, y: 0 }, false);
    expect(g.winner).toBe(0);
  });
  it('passes after three darts and maps normalized gestures without randomness', () => {
    let g = darts.create(0);
    for (let i = 0; i < 3; i++) g = darts.hit(g, { x: 2, y: 2 });
    expect(g.turn).toBe(1);
    expect(g.dartsLeft).toBe(3);
    const gesture = { dx: 0, dy: -0.5, durationMs: 400 };
    expect(darts.aim(gesture)).toEqual(darts.aim(gesture));
  });
});
describe('Russian checkers', () => {
  const position = (pieces: Record<number, number>) => ({
    ...checkers.create(0),
    board: Array.from({ length: 64 }, (_, i) => pieces[i] ?? 0),
  });
  it('starts with 12 men each, mandatory backward capture and complete chains', () => {
    const g = checkers.create(0);
    expect(g.board.filter((x) => x === 1)).toHaveLength(12);
    const p = position({ 26: 1, 35: -1, 53: -1 });
    expect(checkers.moves(p)).toEqual([[26, 44, 62]]);
    expect(() => checkers.move(p, [26, 44])).toThrow();
    const n = checkers.move(p, [26, 44, 62]);
    expect(n.board[35]).toBe(0);
    expect(n.winner).toBe(0);
  });
  it('crowns immediately and continues as a flying king', () => {
    const p = position({ 17: 1, 10: -1, 21: -1 });
    expect(checkers.moves(p)).toContainEqual([17, 3, 30]);
    expect(checkers.move(p, [17, 3, 30]).board[30]).toBe(2);
  });
  it('allows any capture branch and flying kings cannot jump captured ghosts', () => {
    const p = position({ 26: 2, 17: -1, 35: -1 });
    expect(checkers.moves(p).every((path) => path.length === 2)).toBe(true);
    expect(checkers.moves(p).length).toBeGreaterThan(1);
  });
  it('draws after 60 king-only plies and repetition includes side to move', () => {
    const p = position({ 56: 2, 7: -2 });
    p.quiet = 59;
    expect(checkers.move(p, checkers.moves(p)[0]!).winner).toBe('draw');
    const q = position({ 56: 2, 7: -2 });
    const next = checkers.move(q, checkers.moves(q)[0]!);
    q.positions[checkers.key(next)] = 2;
    expect(checkers.move(q, checkers.moves(q)[0]!).winner).toBe('draw');
  });
});
describe('eight-ball', () => {
  it('creates a legal rack and produces identical collision simulations', () => {
    const g = pool.create(0);
    expect(g.balls).toHaveLength(16);
    const a = pool.shoot(g, { angle: -Math.PI / 2, power: 1 });
    expect(a).toEqual(pool.shoot(g, { angle: -Math.PI / 2, power: 1 }));
    expect(a.firstContact).not.toBeNull();
    expect(a.durationMs).toBeGreaterThan(0);
  });
  it('assigns groups by pocket order only after a legal post-break shot', () => {
    const g = pool.create(0);
    g.break = false;
    const n = pool.resolve(g, {
      firstContact: 9,
      pocketed: [9, 1],
      railAfter: true,
      scratch: false,
    });
    expect(n.groups).toEqual(['stripes', 'solids']);
    expect(n.turn).toBe(0);
    expect(
      pool.resolve(
        { ...g, break: true },
        { firstContact: 9, pocketed: [9], railAfter: true, scratch: false },
      ).groups,
    ).toEqual([null, null]);
  });
  it('applies fouls, early eight, eight plus scratch and respots a break eight', () => {
    const g = pool.create(0);
    g.break = false;
    expect(
      pool.resolve(g, { firstContact: null, pocketed: [], railAfter: false, scratch: false })
        .ballInHand,
    ).toBe(true);
    expect(
      pool.resolve(g, { firstContact: 8, pocketed: [8], railAfter: true, scratch: false }).winner,
    ).toBe(1);
    const b = pool.create(0);
    const n = pool.resolve(b, { firstContact: 1, pocketed: [8], railAfter: true, scratch: false });
    expect(n.winner).toBeNull();
    expect(n.balls.find((x) => x.id === 8)?.pocketed).toBe(false);
    const cleared = {
      ...g,
      groups: ['solids', 'stripes'] as pool.Game['groups'],
      balls: g.balls.map((b) => ({ ...b, pocketed: b.id > 0 && b.id < 8 })),
    };
    expect(
      pool.resolve(cleared, { firstContact: 8, pocketed: [8], railAfter: true, scratch: false })
        .winner,
    ).toBe(0);
    expect(
      pool.resolve(cleared, { firstContact: 8, pocketed: [8, 0], railAfter: true, scratch: true })
        .winner,
    ).toBe(1);
  });
  it('rejects overlapping ball-in-hand and impossible shot values', () => {
    const g = pool.create(0);
    g.ballInHand = true;
    expect(() => pool.place(g, { x: 0.5, y: 0.5 })).toThrow();
    expect(() => pool.shoot(g, { angle: NaN, power: 1 })).toThrow();
  });
});
it('allows a shot when the cue is touching a ball', () => {
  const g = pool.create(0);
  g.break = false;
  g.balls = [
    { id: 0, x: 0.5, y: 1, pocketed: false },
    { id: 1, x: 0.5, y: 1 - pool.R * 2, pocketed: false },
    { id: 8, x: 0.5, y: 0.5, pocketed: false },
  ];
  expect(() => pool.shoot(g, { angle: -Math.PI / 2, power: 0.5 })).not.toThrow();
});
it('gives player one white movement when randomly chosen to start', () => {
  const g = checkers.create(1);
  expect(g.white).toBe(1);
  expect(checkers.moves(g).length).toBe(7);
  expect(checkers.moves(g).every((path) => path[1]! < path[0]!)).toBe(true);
});
