import { expect, it } from 'vitest';
import { advance, command, createMatch } from '../../src/barGames/runtime.js';
function capture(computer = false) {
  const m = createMatch('checkers', 0, 0, computer, 7);
  if (m.game.kind !== 'checkers') throw new Error('fixture');
  m.game.board.fill(0);
  m.game.board[42] = 1;
  m.game.board[33] = -1;
  m.game.board[17] = -1;
  m.game.board[7] = -1;
  return { ...m, game: m.game };
}
it('keeps the initial board and full capture path and reserves time per landing', () => {
  const m = capture();
  const n = command(m, 0, { type: 'checkers', path: [42, 24, 10] }, 100);
  expect(n.checkersMove).toEqual({
    board: m.game.board,
    path: [42, 24, 10],
    actor: 0,
    durationMs: 900,
  });
  expect(n.checkersMove?.board).not.toBe(m.game.board);
  expect(n.animationUntil).toBe(1000);
  expect(n.deadline).toBe(41000);
  if (n.game.kind !== 'checkers') throw new Error('fixture');
  expect(n.game.board[33]).toBe(0);
  expect(m.game.board[33]).toBe(-1);
});
it('records automatic moves as well as manual moves', () => {
  const m = capture();
  const n = advance(m, m.deadline);
  expect(n.checkersMove?.path).toEqual([42, 24, 10]);
  expect(n.animationUntil).toBe(40900);
  expect(n.deadline).toBe(80900);
});
it('does not change timing in existing engine-two matches', () => {
  const m = { ...capture(), engineVersion: 2 };
  const n = command(m, 0, { type: 'checkers', path: [42, 24, 10] }, 100);
  expect(n.checkersMove?.durationMs).toBe(350);
  expect(n.animationUntil).toBe(450);
});

it('records the computer capture with the same trajectory and duration', () => {
  const m = capture(true);
  if (m.game.kind !== 'checkers') throw new Error('fixture');
  m.game.board = m.game.board.map((p) => -p);
  m.game.turn = 1;
  m.game.white = 1;
  m.animationUntil = 3000;
  const n = advance(m, 3000);
  expect(n.checkersMove).toMatchObject({ actor: 1, path: [42, 24, 10], durationMs: 900 });
  expect(n.animationUntil).toBe(3900);
});
