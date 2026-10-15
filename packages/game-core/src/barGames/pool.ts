import type { Player, Winner, Point } from './darts.js';
export const R = 0.026;
export const POCKETS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 0, y: 2 },
  { x: 1, y: 2 },
];
export interface Ball extends Point {
  id: number;
  pocketed: boolean;
}
export type Group = 'solids' | 'stripes';
export interface Game {
  kind: 'billiards';
  turn: Player;
  winner: Winner;
  balls: Ball[];
  groups: [Group | null, Group | null];
  break: boolean;
  ballInHand: boolean;
  lastFoul: boolean;
}
export interface Shot {
  angle: number;
  power: number;
  spin?: Point | undefined;
}
export interface Events {
  firstContact: number | null;
  pocketed: number[];
  railAfter: boolean;
  scratch: boolean;
}
export interface Simulation extends Events {
  game: Game;
  frames: Ball[][];
  durationMs: number;
}
export const group = (id: number): Group => (id < 8 ? 'solids' : 'stripes');
export function create(turn: Player): Game {
  const balls: Ball[] = [{ id: 0, x: 0.5, y: 1.52, pocketed: false }];
  const order = [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 13, 6, 14, 15, 7];
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col <= row; col++)
      balls.push({
        id: order[k++]!,
        x: 0.5 + (col - row / 2) * R * 2.015,
        y: 0.5 - row * R * Math.sqrt(3) * 1.008,
        pocketed: false,
      });
  return {
    kind: 'billiards',
    turn,
    winner: null,
    balls,
    groups: [null, null],
    break: true,
    ballInHand: false,
    lastFoul: false,
  };
}
const free = (balls: Ball[], p: Point) =>
  p.x >= R &&
  p.x <= 1 - R &&
  p.y >= R &&
  p.y <= 2 - R &&
  !POCKETS.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.068) &&
  !balls.some((b) => b.id !== 0 && !b.pocketed && Math.hypot(b.x - p.x, b.y - p.y) < R * 2 + 0.001);
export function place(g: Game, p: Point): Game {
  if (!g.ballInHand || ![p.x, p.y].every(Number.isFinite) || !free(g.balls, p))
    throw new Error('Invalid cue placement');
  return {
    ...g,
    ballInHand: false,
    balls: g.balls.map((b) => (b.id === 0 ? { ...b, ...p, pocketed: false } : b)),
  };
}
function respot(balls: Ball[]): Ball[] {
  const other = balls.filter((b) => b.id !== 8);
  for (let step = 0; step < 2000; step++) {
    const y = 0.5 + step * 0.001;
    if (y > 2 - R) break;
    const p = { x: 0.5, y };
    if (!other.some((b) => !b.pocketed && Math.hypot(b.x - p.x, b.y - p.y) < R * 2 + 0.001))
      return balls.map((b) => (b.id === 8 ? { ...b, ...p, pocketed: false } : b));
  }
  throw new Error('No respot position');
}
export function resolve(g: Game, e: Events): Game {
  const current = g.groups[g.turn];
  const remaining = g.balls.filter(
    (b) => !b.pocketed && b.id > 0 && b.id !== 8 && group(b.id) === current,
  ).length;
  const legalFirst =
    e.firstContact !== null &&
    (current
      ? remaining === 0
        ? e.firstContact === 8
        : e.firstContact !== 8 && group(e.firstContact) === current
      : e.firstContact !== 8);
  const foul = e.scratch || !legalFirst || (!e.pocketed.length && !e.railAfter);
  let balls = g.balls.map((b) => (e.pocketed.includes(b.id) ? { ...b, pocketed: true } : b));
  let winner: Winner = null;
  if (e.pocketed.includes(8)) {
    if (g.break) balls = respot(balls);
    else winner = !foul && current !== null && remaining === 0 ? g.turn : g.turn === 0 ? 1 : 0;
  }
  const groups: [Group | null, Group | null] = [...g.groups];
  const first = e.pocketed.find((id) => id !== 0 && id !== 8);
  if (!g.break && !foul && !current && first !== undefined) {
    groups[g.turn] = group(first);
    groups[g.turn === 0 ? 1 : 0] = group(first) === 'solids' ? 'stripes' : 'solids';
  }
  const keep =
    !foul &&
    e.pocketed.some((id) => id !== 0 && id !== 8 && (g.break || group(id) === groups[g.turn]));
  return {
    ...g,
    balls,
    groups,
    winner,
    turn: keep ? g.turn : g.turn === 0 ? 1 : 0,
    break: false,
    ballInHand: foul,
    lastFoul: foul,
  };
}
export function validSpin(spin: Point | undefined): boolean {
  return (
    spin === undefined ||
    (Number.isFinite(spin.x) && Number.isFinite(spin.y) && Math.hypot(spin.x, spin.y) <= 1)
  );
}
export function shoot(g: Game, s: Shot, pace: 'classic' | 'responsive' = 'responsive'): Simulation {
  if (
    g.winner !== null ||
    !validSpin(s.spin) ||
    ![s.angle, s.power].every(Number.isFinite) ||
    Math.abs(s.angle) > Math.PI * 4 ||
    s.power < 0.03 ||
    s.power > 1
  )
    throw new Error('Invalid shot');
  const balls = g.balls.map((b) => ({ ...b }));
  const cue = balls.find((b) => b.id === 0)!;
  if (g.ballInHand || cue.pocketed) throw new Error('Place the cue ball');
  // Keep fine control at low power, with more pace towards a full stroke.
  const speedScale = pace === 'classic' ? 2.8 : 2.8 + 0.8 * s.power;
  const clothDeceleration = pace === 'classic' ? 0.4 : 0.32;
  const velocity = balls.map((b) => ({
    x: b.id === 0 ? Math.cos(s.angle) * s.power * speedScale : 0,
    y: b.id === 0 ? Math.sin(s.angle) * s.power * speedScale : 0,
  }));
  const events: Events = { firstContact: null, pocketed: [], railAfter: false, scratch: false };
  const frames: Ball[][] = [balls.map((b) => ({ ...b }))];
  const dt = 1 / 240;
  // Contact offset is local to the cue: x is side spin, negative y is follow.
  // Spin decays on the cloth; longitudinal spin transfers only at first ball contact.
  let sideSpin = (s.spin?.x ?? 0) * s.power * 0.65;
  let longitudinalSpin = -(s.spin?.y ?? 0) * s.power * 1.1;
  const railSpin = (v: Point, nx: number, ny: number) => {
    const transfer =
      Math.min(Math.hypot(v.x, v.y) * 0.35, Math.abs(sideSpin)) * Math.sign(sideSpin);
    v.x += ny * transfer;
    v.y -= nx * transfer;
    sideSpin *= 0.55;
  };
  let ticks = 0;
  for (; ticks < 240 * 12; ticks++) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!,
        v = velocity[i]!;
      if (b.pocketed) continue;
      b.x += v.x * dt;
      b.y += v.y * dt;
      if (POCKETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < 0.059)) {
        b.pocketed = true;
        v.x = 0;
        v.y = 0;
        events.pocketed.push(b.id);
        if (b.id === 0) events.scratch = true;
        continue;
      }
      let rail = false;
      if (b.x < R) {
        b.x = R;
        v.x = Math.abs(v.x) * 0.85;
        if (b.id === 0) railSpin(v, 1, 0);
        rail = true;
      }
      if (b.x > 1 - R) {
        b.x = 1 - R;
        v.x = -Math.abs(v.x) * 0.85;
        if (b.id === 0) railSpin(v, -1, 0);
        rail = true;
      }
      if (b.y < R) {
        b.y = R;
        v.y = Math.abs(v.y) * 0.85;
        if (b.id === 0) railSpin(v, 0, 1);
        rail = true;
      }
      if (b.y > 2 - R) {
        b.y = 2 - R;
        v.y = -Math.abs(v.y) * 0.85;
        if (b.id === 0) railSpin(v, 0, -1);
        rail = true;
      }
      if (rail && events.firstContact !== null) events.railAfter = true;
    }
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i]!,
          b = balls[j]!;
        if (a.pocketed || b.pocketed) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (d >= 2 * R || d < 1e-10) continue;
        const nx = dx / d,
          ny = dy / d;
        const va = velocity[i]!,
          vb = velocity[j]!;
        const relative = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
        const overlap = (2 * R - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        if (relative <= 0) continue;
        const firstCueContact = events.firstContact === null && (a.id === 0 || b.id === 0);
        if (firstCueContact) events.firstContact = a.id === 0 ? b.id : a.id;
        const impulse = relative * 0.98;
        va.x -= impulse * nx;
        va.y -= impulse * ny;
        vb.x += impulse * nx;
        vb.y += impulse * ny;
        if (firstCueContact && longitudinalSpin !== 0) {
          const vc = a.id === 0 ? va : vb;
          vc.x += Math.cos(s.angle) * longitudinalSpin;
          vc.y += Math.sin(s.angle) * longitudinalSpin;
          longitudinalSpin = 0;
        }
      }
    sideSpin *= Math.exp(-0.7 * dt);
    longitudinalSpin *= Math.exp(-0.7 * dt);
    let moving = false;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!,
        v = velocity[i]!;
      const speed = Math.hypot(v.x, v.y);
      const factor = speed ? Math.max(0, speed - clothDeceleration * dt) / speed : 0;
      v.x *= factor;
      v.y *= factor;
      b.x = Math.round(b.x * 1e9) / 1e9;
      b.y = Math.round(b.y * 1e9) / 1e9;
      if (Math.hypot(v.x, v.y) > 0.008) moving = true;
      else {
        v.x = 0;
        v.y = 0;
      }
    }
    if (ticks % 4 === 0) frames.push(balls.map((b) => ({ ...b })));
    if (!moving) break;
  }
  frames.push(balls.map((b) => ({ ...b })));
  // Resolve against the pre-shot board so pocketing one's last ball and the eight together loses.
  const result = resolve(g, events);
  result.balls = balls.map((b) => ({ ...b }));
  if (g.break && events.pocketed.includes(8)) result.balls = respot(result.balls);
  return { ...events, game: result, frames, durationMs: Math.ceil(((ticks + 1) * 1000) / 240) };
}
export function timeout(g: Game): Game {
  return { ...g, turn: g.turn === 0 ? 1 : 0, ballInHand: true, lastFoul: true };
}
export function bot(g: Game): { placement: Point | null; shot: Shot } {
  let state = g;
  let placement: Point | null = null;
  if (g.ballInHand) {
    outer: for (let y = 1.5; y > 0.1; y -= 0.1)
      for (let x = 0.1; x < 0.95; x += 0.1)
        if (free(g.balls, { x, y })) {
          placement = { x, y };
          state = place(g, placement);
          break outer;
        }
  }
  const cue = state.balls.find((b) => b.id === 0)!;
  const own = state.groups[state.turn];
  let targets = state.balls.filter(
    (b) => !b.pocketed && b.id > 0 && b.id !== 8 && (!own || group(b.id) === own),
  );
  if (!targets.length) targets = state.balls.filter((b) => b.id === 8 && !b.pocketed);
  let best: Shot = { angle: -Math.PI / 2, power: 1 };
  let cost = Infinity;
  for (const b of targets)
    for (const p of POCKETS) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      const ghost = { x: b.x - ((p.x - b.x) / d) * 2 * R, y: b.y - ((p.y - b.y) / d) * 2 * R };
      const distance = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
      const c = d + distance;
      if (c < cost) {
        cost = c;
        best = {
          angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x),
          power: Math.max(0.2, Math.min(1, (d + distance) * 0.28 + 0.15)),
        };
      }
    }
  if (g.break) best = { angle: -Math.PI / 2, power: 1 };
  return { placement, shot: best };
}
