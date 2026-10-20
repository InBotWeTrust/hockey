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
  boardAngle?: number;
  turnStartScore?: number;
  lastBust?: boolean;
}
const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export function create(turn: Player): Game {
  return {
    kind: 'darts',
    turn,
    winner: null,
    scores: [501, 501],
    boardAngle: 0,
    turnStartScore: 501,
    lastBust: false,
    dartsLeft: 3,
    hits: [],
    lastScore: 0,
  };
}
export function rotatePoint(p: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180;
  return {x:p.x*Math.cos(angle)-p.y*Math.sin(angle),y:p.x*Math.sin(angle)+p.y*Math.cos(angle)};
}
export function score(point: Point, angle = 0): number {
  const p = rotatePoint(point, -angle);
  const r = Math.hypot(p.x, p.y);
  if (r > 1) return 0;
  if (r <= 0.037) return 50;
  if (r <= 0.094) return 25;
  const a = (Math.atan2(p.x, -p.y) + Math.PI / 20 + Math.PI * 2) % (Math.PI * 2);
  const n = sectors[Math.floor(a / (Math.PI / 10))]!;
  return n * (r >= 0.94 ? 2 : r >= 0.56 && r <= 0.63 ? 3 : 1);
}
export const SWIPE_GAIN = 720;
export const LEGACY_SWIPE_GAIN = 1280;
export function aim(g: Gesture, gain = SWIPE_GAIN): Point {
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
    y: Math.max(-2, Math.min(2, 1.6 - (-g.dy / g.durationMs) * gain)),
  };
}
export function hit(g: Game, p: Point, doubleOut = true, rotatedBoard = doubleOut): Game {
  if (g.winner !== null || ![p.x, p.y].every(Number.isFinite)) throw new Error('Invalid dart');
  const n: Game = {
    ...g,
    scores: [...g.scores],
    hits: [...g.hits, p],
    lastScore: score(p, rotatedBoard ? g.boardAngle ?? 0 : 0),
    lastBust: false,
    dartsLeft: g.dartsLeft - 1,
  };
  if (doubleOut) {
    const start = g.turnStartScore ?? g.scores[g.turn];
    const remaining = g.scores[g.turn] - n.lastScore;
    const radius = Math.hypot(p.x,p.y);
    const double = radius <= .037 || (radius >= .94 && radius <= 1);
    if (remaining < 0 || remaining === 1 || (remaining === 0 && !double)) {
      n.scores[g.turn] = start;
      n.lastBust = true;
      n.dartsLeft = 0;
    } else {
      n.scores[g.turn] = remaining;
      if (remaining === 0) n.winner = g.turn;
    }
  } else {
    if (n.lastScore <= n.scores[g.turn]) n.scores[g.turn] -= n.lastScore;
    else if (rotatedBoard) n.lastBust = true;
    if (n.scores[g.turn] === 0) n.winner = g.turn;
  }
  if (n.winner === null && !n.dartsLeft) {
    n.turn = g.turn === 0 ? 1 : 0;
    n.dartsLeft = 3;
    n.hits = [];
    n.turnStartScore = n.scores[n.turn];
  }
  return n;
}
export function timeout(g: Game): Game {
  const next = g.turn === 0 ? 1 : 0;
  return { ...g, turn: next, turnStartScore: g.scores[next], dartsLeft: 3, hits: [], lastScore: 0, lastBust: false };
}

// Prefer wide singles for finishes; otherwise leave a single-sector checkout.
export function botTarget(remaining: number, doubleOut = false): Point {
  if (doubleOut) {
    if (remaining === 50) return {x:0,y:0};
    const double = remaining <= 40 && remaining % 2 === 0;
    const value = double ? remaining / 2 : remaining > 60 ? 20 : remaining > 40 ? remaining - 40 : remaining <= 20 ? remaining - 2 : 1;
    const radius = double ? .97 : remaining > 61 ? .595 : .4;
    const angle = sectors.indexOf(value) * Math.PI / 10;
    return {x:Math.sin(angle)*radius,y:-Math.cos(angle)*radius};
  }
  const targets = sectors.flatMap((value, index) => [
    { value, radius: 0.4, index },
    { value: value * 2, radius: 0.97, index },
    { value: value * 3, radius: 0.595, index },
  ]);
  const candidates = [
    ...targets.filter((t) => t.radius === 0.4),
    { value: 50, radius: 0, index: 0 },
    { value: 25, radius: 0.065, index: 0 },
    ...targets.filter((t) => t.radius !== 0.4),
  ];
  const target =
    remaining > 60
      ? targets.find((t) => t.value === 60)!
      : (candidates.find((t) => t.value === remaining) ??
        candidates
          .filter((t) => t.value < remaining && remaining - t.value <= 20)
          .sort((a, b) => b.value - a.value)[0]!);
  const angle = (target.index * Math.PI) / 10;
  return { x: Math.sin(angle) * target.radius, y: -Math.cos(angle) * target.radius };
}
