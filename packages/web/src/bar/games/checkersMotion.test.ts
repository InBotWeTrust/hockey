import { expect, it } from 'vitest';
import { checkersFrame, checkerPosition } from './checkersMotion.js';
const board = Array(64).fill(0) as number[];
board[42] = 1;
board[33] = -1;
board[17] = -1;
const motion = { board, path: [42, 24, 10], actor: 0 as const, durationMs: 900 };
it('retains a captured piece until landing, then animates the next jump', () => {
  const first = checkersFrame(motion, 0, 449);
  expect(first.board[33]).toBe(-1);
  expect(first.board[42]).toBe(0);
  expect(first.moving).toMatchObject({ from: 42, to: 24, capture: true, step: 0 });
  const second = checkersFrame(motion, 0, 450);
  expect(second.board[33]).toBe(0);
  expect(second.board[17]).toBe(-1);
  expect(second.moving).toMatchObject({ from: 24, to: 10, step: 1 });
  const end = checkersFrame(motion, 0, 900);
  expect(end.board[17]).toBe(0);
  expect(end.board[10]).toBe(1);
  expect(end.moving).toBeNull();
  expect(board[33]).toBe(-1);
});
it('resumes at the correct segment and supports board rotation', () => {
  expect(checkersFrame(motion, 0, 700).moving).toMatchObject({ step: 1, elapsed: 250 });
  expect(checkerPosition(0, false)).toEqual({ x: 1.75, y: 1.75 });
  expect(checkerPosition(63, true)).toEqual(checkerPosition(0, false));
});
it('crowns a man on landing before continuing a capture as king', () => {
  const b = Array(64).fill(0) as number[];
  b[17] = 1;
  b[10] = -1;
  b[12] = -1;
  const move = { board: b, path: [17, 3, 21], actor: 0 as const, durationMs: 900 };
  expect(checkersFrame(move, 0, 449).moving?.piece).toBe(1);
  expect(checkersFrame(move, 0, 450).moving?.piece).toBe(2);
});
