import { expect, it } from 'vitest';
import { advance, command, createMatch } from '../../src/barGames/runtime.js';
import { moves } from '../../src/barGames/checkers.js';

it('gives new character turns a seeded 3–5 second thinking period', () => {
  const delays = new Set<number>();
  for (const seed of [1, 12, 700, 999999]) {
    for (const kind of ['checkers', 'darts', 'billiards'] as const) {
      const match = createMatch(kind, 1, 100, true, seed);
      const next = advance(match, match.animationUntil);
      const acted = kind === 'billiards' ? advance(next, next.animationUntil) : next;
      const delay = acted.animationStart - 100;
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
      delays.add(delay);
      expect(advance(match, match.animationUntil - 1)).toEqual(match);
      expect(advance(match, 20000)).toEqual(advance(match, 20000));
    }
  }
  expect(delays.size).toBeGreaterThan(1);
});

it('waits after a player move and timeout, and does not restart thinking on read', () => {
  const start = createMatch('checkers', 0, 0, true, 7);
  if (start.game.kind !== 'checkers') throw new Error('fixture');
  const moved = command(start, 0, { type: 'checkers', path: moves(start.game)[0]! }, 100);
  const delay = moved.animationUntil - 100 - 350;
  expect(delay).toBeGreaterThanOrEqual(3000);
  expect(delay).toBeLessThanOrEqual(5000);
  expect(advance(moved, moved.animationUntil - 1)).toBe(moved);
  const timeout = advance(start, start.deadline);
  const timeoutDelay = timeout.animationUntil - start.deadline - 350;
  expect(timeoutDelay).toBeGreaterThanOrEqual(3000);
  expect(timeoutDelay).toBeLessThanOrEqual(5000);
});

it('keeps existing version-one matches on their original schedule', () => {
  const old = { ...createMatch('checkers', 1, 0, true, 7), engineVersion: 1, animationUntil: 900 };
  const moved = advance(old, 900);
  expect(moved.revision).toBe(1);
  expect(moved.game.turn).toBe(0);
  expect(moved.engineVersion).toBe(1);
});

it('preserves the version-one dart cadence and pool preparation', () => {
  const dart = {
    ...createMatch('darts', 1, 0, true, 20),
    engineVersion: 1,
    seed: 20,
    animationUntil: 1800,
  };
  const first = advance(dart, 1800);
  expect(first.animationUntil).toBe(4650);
  const pool = {
    ...createMatch('billiards', 1, 0, true, 20),
    engineVersion: 1,
    seed: 20,
    animationUntil: 1800,
  };
  const preparing = advance(pool, 1800);
  expect(preparing.animationUntil).toBe(3600);
  expect(preparing.poolAim?.actor).toBe(1);
});
