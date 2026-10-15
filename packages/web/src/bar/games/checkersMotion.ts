import type { CheckersMotion } from '@hockey/game-core';
export function checkerPosition(index: number, flipped: boolean) {
  const cell = flipped ? 63 - index : index;
  return { x: (cell % 8) * 12.5 + 1.75, y: (cell >> 3) * 12.5 + 1.75 };
}
export interface MovingChecker {
  from: number;
  to: number;
  piece: number;
  step: number;
  elapsed: number;
  duration: number;
  capture: boolean;
}
// Presentation only: the server validates the full path and supplies the final board.
export function checkersFrame(
  motion: CheckersMotion,
  white: 0 | 1,
  elapsed: number,
): {
  board: number[];
  moving: MovingChecker | null;
} {
  const board = [...motion.board];
  const steps = motion.path.length - 1;
  if (steps < 1) return { board, moving: null };
  const duration = motion.durationMs / steps;
  let piece = board[motion.path[0]!]!;
  for (let step = 0; step < steps; step++) {
    const from = motion.path[step]!,
      to = motion.path[step + 1]!;
    const dr = Math.sign((to >> 3) - (from >> 3)),
      dc = Math.sign((to % 8) - (from % 8));
    const crossed: number[] = [];
    for (let r = (from >> 3) + dr, c = (from % 8) + dc; r !== to >> 3; r += dr, c += dc) {
      if (board[r * 8 + c]) crossed.push(r * 8 + c);
    }
    board[from] = 0;
    if (elapsed < (step + 1) * duration)
      return {
        board,
        moving: {
          from,
          to,
          piece,
          step,
          duration,
          elapsed: Math.max(0, elapsed - step * duration),
          capture: crossed.length > 0,
        },
      };
    for (const cell of crossed) board[cell] = 0;
    if (to >> 3 === (motion.actor === white ? 0 : 7)) piece = Math.sign(piece) * 2;
    board[to] = piece;
  }
  return { board, moving: null };
}
