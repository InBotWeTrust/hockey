import type { Player, Winner } from './darts.js';
export interface Game {
  kind: 'checkers';
  board: number[];
  turn: Player;
  winner: Winner;
  quiet: number;
  white: Player;
  positions: Record<string, number>;
}
const dirs = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const owner = (p: number): Player => (p > 0 ? 0 : 1);
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const key = (g: Pick<Game, 'board' | 'turn'>) => `${g.board.join(',')}:${g.turn}`;
export function create(turn: Player): Game {
  // Player indices are stable across games; the randomly selected starter owns white.
  const board: number[] = Array.from({ length: 64 }, (_, i) =>
    ((i >> 3) + (i % 8)) % 2 === 1 ? (i < 24 ? -1 : i >= 40 ? 1 : 0) : 0,
  );
  if (turn === 1) for (let i = 0; i < 64; i++) board[i] = -board[i]!;
  const g: Game = {
    kind: 'checkers',
    board,
    turn,
    winner: null,
    quiet: 0,
    white: turn,
    positions: {},
  };
  g.positions[key(g)] = 1;
  return g;
}
// Movement orientation is stored explicitly for games whose starter is player 1.
function captures(
  board: number[],
  at: number,
  piece: number,
  path: number[],
  taken: number[],
  forward: number,
  out: number[][],
): void {
  let found = false;
  const r = at >> 3,
    c = at % 8;
  for (const [dr, dc] of dirs) {
    let rr = r + dr,
      cc = c + dc;
    let victim = -1;
    while (inside(rr, cc)) {
      const i = rr * 8 + cc,
        v = board[i]!;
      if (v) {
        if (victim >= 0 || owner(v) === owner(piece) || taken.includes(i)) break;
        victim = i;
      } else if (victim >= 0) {
        found = true;
        const b = [...board];
        b[at] = 0;
        b[i] = crownOriented(piece, rr, forward);
        captures(b, i, b[i]!, [...path, i], [...taken, victim], forward, out);
        if (Math.abs(piece) === 1) break;
      } else if (Math.abs(piece) === 1) break;
      if (Math.abs(piece) === 1 && victim >= 0 && v === 0) break;
      rr += dr;
      cc += dc;
    }
  }
  if (!found && taken.length) out.push(path);
}
function crownOriented(p: number, r: number, forward: number) {
  return Math.abs(p) === 1 && r === (forward < 0 ? 0 : 7) ? p * 2 : p;
}
export function moves(g: Game): number[][] {
  if (g.winner !== null) return [];
  const capture: number[][] = [];
  const simple: number[][] = [];
  const w = g.white;
  const forward = g.turn === w ? -1 : 1;
  for (let i = 0; i < 64; i++) {
    const p = g.board[i]!;
    if (!p || owner(p) !== g.turn) continue;
    captures(g.board, i, p, [i], [], forward, capture);
    const r = i >> 3,
      c = i % 8;
    for (const [dr, dc] of dirs) {
      if (Math.abs(p) === 1 && dr !== forward) continue;
      let rr = r + dr,
        cc = c + dc;
      while (inside(rr, cc) && !g.board[rr * 8 + cc]) {
        simple.push([i, rr * 8 + cc]);
        if (Math.abs(p) === 1) break;
        rr += dr;
        cc += dc;
      }
    }
  }
  return (capture.length ? capture : simple).sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return a.length - b.length;
  });
}
export function move(g: Game, path: number[]): Game {
  if (!moves(g).some((m) => m.length === path.length && m.every((v, i) => v === path[i])))
    throw new Error('Illegal checkers move');
  const board = [...g.board];
  let p = board[path[0]!]!;
  const man = Math.abs(p) === 1;
  let count = 0;
  const forward = g.turn === g.white ? -1 : 1;
  for (let j = 1; j < path.length; j++) {
    const from = path[j - 1]!,
      to = path[j]!;
    const dr = Math.sign((to >> 3) - (from >> 3)),
      dc = Math.sign((to % 8) - (from % 8));
    for (let r = (from >> 3) + dr, c = (from % 8) + dc; r !== to >> 3; r += dr, c += dc) {
      if (board[r * 8 + c]) {
        board[r * 8 + c] = 0;
        count++;
      }
    }
    board[from] = 0;
    p = crownOriented(p, to >> 3, forward);
    board[to] = p;
  }
  const n: Game = {
    ...g,
    board,
    turn: g.turn === 0 ? 1 : 0,
    quiet: count || man ? 0 : g.quiet + 1,
    positions: { ...g.positions },
  };
  const k = key(n);
  n.positions[k] = (n.positions[k] ?? 0) + 1;
  if (!moves(n).length) n.winner = g.turn;
  else if (n.positions[k]! >= 3 || n.quiet >= 60) n.winner = 'draw';
  return n;
}
export const withWhite = create;
export function bot(g: Game, depth = 3): number[] {
  const all = moves(g);
  if (!all.length) throw new Error('No move');
  const evaluate = (n: Game) =>
    n.winner === 'draw'
      ? 0
      : n.winner !== null
        ? n.winner === g.turn
          ? 10000
          : -10000
        : n.board.reduce(
            (s, p) => s + (p ? (owner(p) === g.turn ? 1 : -1) * (Math.abs(p) === 2 ? 4 : 1) : 0),
            0,
          );
  function search(n: Game, d: number): number {
    if (!d || n.winner !== null) return evaluate(n);
    const values = moves(n).map((m) => search(move(n, m), d - 1));
    return n.turn === g.turn ? Math.max(...values) : Math.min(...values);
  }
  return all.reduce(
    (best, m) => (search(move(g, m), depth - 1) > search(move(g, best), depth - 1) ? m : best),
    all[0]!,
  );
}
