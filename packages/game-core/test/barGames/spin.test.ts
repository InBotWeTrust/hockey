import { expect, it } from 'vitest';
import * as pool from '../../src/barGames/pool.js';
const contactGame = () => ({
  ...pool.create(0),
  break: false,
  balls: [
    { id: 0, x: 0.5, y: 1.3, pocketed: false },
    { id: 1, x: 0.5, y: 1.05, pocketed: false },
  ],
});
it('keeps centre-ball shots identical and spin deterministic', () => {
  const g = contactGame();
  const shot = { angle: -Math.PI / 2, power: 0.3 };
  expect(pool.shoot(g, { ...shot, spin: { x: 0, y: 0 } })).toEqual(pool.shoot(g, shot));
  expect(pool.shoot(g, { ...shot, spin: { x: 0.3, y: 0.5 } })).toEqual(
    pool.shoot(g, { ...shot, spin: { x: 0.3, y: 0.5 } }),
  );
});
it('follows with top spin and draws back with bottom spin after contacting a ball', () => {
  const shot = { angle: -Math.PI / 2, power: 0.3 };
  const plain = pool.shoot(contactGame(), shot).game.balls[0]!;
  const follow = pool.shoot(contactGame(), { ...shot, spin: { x: 0, y: -0.8 } }).game.balls[0]!;
  const draw = pool.shoot(contactGame(), { ...shot, spin: { x: 0, y: 0.8 } }).game.balls[0]!;
  expect(follow.y).toBeLessThan(plain.y - 0.01);
  expect(draw.y).toBeGreaterThan(plain.y + 0.01);
});
it('changes cushion exit with side spin and rejects invalid contact points', () => {
  const g = { ...pool.create(0), balls: [{ id: 0, x: 0.7, y: 0.7, pocketed: false }] };
  const a = pool.shoot(g, { angle: 0, power: 0.3, spin: { x: 0.8, y: 0 } }).game.balls[0]!;
  const b = pool.shoot(g, { angle: 0, power: 0.3, spin: { x: -0.8, y: 0 } }).game.balls[0]!;
  expect(a.y).toBeGreaterThan(b.y + 0.01);
  for (const spin of [
    { x: 1, y: 1 },
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
  ])
    expect(() => pool.shoot(g, { angle: 0, power: 0.3, spin })).toThrow();
});
