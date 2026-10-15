export type Player = 0 | 1;
export type Winner = Player | 'draw' | null;
export interface Point {
  x: number;
  y: number;
}
export interface Gesture {
  dx: number;
  dy: number;
  durationMs: number;
}
export interface Game {
  kind: 'darts';
  turn: Player;
  winner: Winner;
  scores: [number, number];
  dartsLeft: number;
  hits: Point[];
  lastScore: number;
}
const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export function create(turn: Player): Game {
  return {
    kind: 'darts',
    turn,
    winner: null,
    scores: [301, 301],
    dartsLeft: 3,
    hits: [],
    lastScore: 0,
  };
}
export function score(p: Point): number {
  const r = Math.hypot(p.x, p.y);
  if (r > 1) return 0;
  if (r <= 0.037) return 50;
  if (r <= 0.094) return 25;
  const a = (Math.atan2(p.x, -p.y) + Math.PI / 20 + Math.PI * 2) % (Math.PI * 2);
  const n = sectors[Math.floor(a / (Math.PI / 10))]!;
  return n * (r >= 0.94 ? 2 : r >= 0.56 && r <= 0.63 ? 3 : 1);
}
export function aim(g: Gesture): Point {
  if (
    ![g.dx, g.dy, g.durationMs].every(Number.isFinite) ||
    g.durationMs < 40 ||
    g.durationMs > 5000 ||
    Math.abs(g.dx) > 3 ||
    Math.abs(g.dy) > 3
  )
    throw new Error('Invalid gesture');
  if (g.dy >= -0.02) return { x: 2, y: 2 };
  return {
    x: Math.max(-2, Math.min(2, (g.dx / -g.dy) * 1.4)),
    y: Math.max(-2, Math.min(2, 1.6 - (-g.dy / g.durationMs) * 1280)),
  };
}
export function hit(g: Game, p: Point): Game {
  if (g.winner !== null || ![p.x, p.y].every(Number.isFinite)) throw new Error('Invalid dart');
  const n: Game = {
    ...g,
    scores: [...g.scores],
    hits: [...g.hits, p],
    lastScore: score(p),
    dartsLeft: g.dartsLeft - 1,
  };
  if (n.lastScore <= n.scores[g.turn]) n.scores[g.turn] -= n.lastScore;
  if (n.scores[g.turn] === 0) n.winner = g.turn;
  else if (!n.dartsLeft) {
    n.turn = g.turn === 0 ? 1 : 0;
    n.dartsLeft = 3;
    n.hits = [];
  }
  return n;
}
export function timeout(g: Game): Game {
  return { ...g, turn: g.turn === 0 ? 1 : 0, dartsLeft: 3, hits: [], lastScore: 0 };
}
