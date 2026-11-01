import { createRng } from '../rng.js';
export const DRIFT_VERSION = 7;
export const DRIFT_FALL_TICKS = 60;
export const DRIFT_WIDTH = 600,
  DRIFT_HEIGHT = 800,
  DRIFT_COLS = 48,
  DRIFT_ROWS = 64,
  DRIFT_DT = 1 / 60,
  DRIFT_TARGET = 1;
export interface DriftControl {
  x: number;
  y: number;
  held: boolean;
}
export interface DriftState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  ticks: number;
  snow: number[];
  initialSnow: number;
  cleared: number;
  collision: number;
  fallTicks: number;
  reboundTicks: number;
  gentleHits: number;
  scatter: { from: number; to: number }[];
}
export function createDrift(seed: string): DriftState {
  const rng = createRng(seed),
    snow = Array<number>(DRIFT_COLS * DRIFT_ROWS).fill(0);
  for (let patch = 0; patch < 6; patch++) {
    const cx = 150 + (patch % 2) * 300 + (rng.next() - 0.5) * 65,
      cy = 160 + Math.floor(patch / 2) * 220 + (rng.next() - 0.5) * 45;
    const rx = 85 + rng.next() * 30,
      ry = 55 + rng.next() * 25;
    for (let row = 0; row < DRIFT_ROWS; row++)
      for (let col = 0; col < DRIFT_COLS; col++) {
        const x = (col + 0.5) * 12.5,
          y = (row + 0.5) * 12.5;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.84 + rng.next() * 0.3)
          snow[row * DRIFT_COLS + col] = 1;
      }
  }
  return {
    x: 300,
    y: 690,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    ticks: 0,
    snow,
    initialSnow: snow.reduce((a, b) => a + b, 0),
    cleared: 0,
    collision: 0,
    fallTicks: 0,
    reboundTicks: 0,
    gentleHits: 0,
    scatter: [],
  };
}
export const driftProgress = (state: DriftState) =>
  state.initialSnow ? state.cleared / state.initialSnow : 0;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay,
    t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
export function stepDrift(previous: DriftState, control: DriftControl): DriftState {
  const state = {
    ...previous,
    ticks: previous.ticks + 1,
    scatter: [] as { from: number; to: number }[],
    collision: Math.max(0, previous.collision - DRIFT_DT),
  };
  if (previous.fallTicks > 0) return { ...state, fallTicks: previous.fallTicks - 1, vx: 0, vy: 0 };
  state.reboundTicks = Math.max(0, previous.reboundTicks - 1);
  const held =
    previous.reboundTicks === 0 &&
    control.held &&
    Number.isFinite(control.x) &&
    Number.isFinite(control.y) &&
    Math.hypot(control.x, control.y) > 0.05;
  if (held) {
    const target = Math.atan2(control.y, control.x),
      delta = wrap(target - state.angle),
      turn = 4.6 * DRIFT_DT;
    state.angle += Math.max(-turn, Math.min(turn, delta));
    state.vx += Math.cos(state.angle) * 720 * DRIFT_DT;
    state.vy += Math.sin(state.angle) * 720 * DRIFT_DT;
  }
  const friction = Math.exp(-(held || previous.reboundTicks > 0 ? 0.5 : 0.65) * DRIFT_DT);
  state.vx *= friction;
  state.vy *= friction;
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > 360) {
    state.vx *= 360 / speed;
    state.vy *= 360 / speed;
  }
  state.x += state.vx * DRIFT_DT;
  state.y += state.vy * DRIFT_DT;
  // Bounds follow the rotated scraper and body instead of a fixed centre inset.
  const c = Math.cos(state.angle),
    sn = Math.sin(state.angle);
  const xs = [c * 54 - sn * 60, c * 54 + sn * 60, -c * 105 - sn * 32, -c * 105 + sn * 32];
  const ys = [sn * 54 + c * 60, sn * 54 - c * 60, -sn * 105 + c * 32, -sn * 105 - c * 32];
  const minX = -Math.min(...xs),
    maxX = 600 - Math.max(...xs);
  const topCurve = 65 * ((state.x - 300) / 300) ** 2;
  const minY = topCurve - Math.min(...ys),
    maxY = 800 - Math.max(...ys);
  let impact = 0;
  if (state.x < minX || state.x > maxX) {
    const outward = state.x < minX ? state.vx < 0 : state.vx > 0;
    state.x = Math.max(minX, Math.min(maxX, state.x));
    if (outward) { impact = Math.max(impact, Math.abs(state.vx)); state.vx *= -0.72; }
  }
  if (state.y < minY || state.y > maxY) {
    const outward = state.y < minY ? state.vy < 0 : state.vy > 0;
    state.y = Math.max(minY, Math.min(maxY, state.y));
    if (outward) { impact = Math.max(impact, Math.abs(state.vy)); state.vy *= -0.72; }
  }
  if (impact > 0) {
    state.collision = 0.22;
    state.reboundTicks = 18;
    if (impact >= 35 && previous.reboundTicks === 0) state.gentleHits++;
    if (impact >= 270 || state.gentleHits >= 2) {
      state.gentleHits = 0;
      state.fallTicks = DRIFT_FALL_TICKS;
      state.vx = 0;
      state.vy = 0;
      state.reboundTicks = 0;
      return state;
    }
  }
  // Sweep the actual front blade, including rotation; the body itself never clears snow.
  if (Math.hypot(state.x - previous.x, state.y - previous.y) > 0.025) {
    const snow = previous.snow.slice(),
      da = wrap(state.angle - previous.angle),
      steps = Math.max(
        1,
        Math.ceil((Math.hypot(state.x - previous.x, state.y - previous.y) + Math.abs(da) * 70) / 4),
      );
    const moved: { from: number; x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps,
        a = previous.angle + da * f,
        x = previous.x + (state.x - previous.x) * f + Math.cos(a) * 54,
        y = previous.y + (state.y - previous.y) * f + Math.sin(a) * 54;
      const ax = x - Math.sin(a) * 60,
        ay = y + Math.cos(a) * 60,
        bx = x + Math.sin(a) * 60,
        by = y - Math.cos(a) * 60;
      const minX = Math.max(0, Math.floor((Math.min(ax, bx) - 9) / 12.5)),
        maxX = Math.min(47, Math.floor((Math.max(ax, bx) + 9) / 12.5));
      const minY = Math.max(0, Math.floor((Math.min(ay, by) - 9) / 12.5)),
        maxY = Math.min(63, Math.floor((Math.max(ay, by) + 9) / 12.5));
      for (let row = minY; row <= maxY; row++)
        for (let col = minX; col <= maxX; col++) {
          const index = row * 48 + col;
          if (
            snow[index] &&
            segmentDistance((col + 0.5) * 12.5, (row + 0.5) * 12.5, ax, ay, bx, by) < 9
          ) {
            const fresh = snow[index] === 1;
            snow[index] = 0;
            state.cleared++;
            if (fresh && index % 3 === 0) {
              const side = index % 2 === 0 ? 1 : -1;
              moved.push({from:index, x:x - Math.sin(a) * side * 150 + Math.cos(a) * 48,
                y:y + Math.cos(a) * side * 150 + Math.sin(a) * 48});
            }
          }
        }
    }
    // Move only fresh snow, once. Fragments disappear on their next sweep.
    for (const fragment of moved) {
      const col = Math.floor(Math.max(62.5, Math.min(537.5, fragment.x)) / 12.5);
      const row = Math.floor(Math.max(112.5, Math.min(687.5, fragment.y)) / 12.5);
      const to = row * DRIFT_COLS + col;
      if (!snow[to]) {
        snow[to] = 2;
        state.cleared--;
        state.scatter.push({from:fragment.from,to});
      }
    }
    state.snow = snow;
  }
  return state;
}

// Completion shortens the remaining break, with at least a 45-second saving.
export function caretakerBreakReadyAt(original: number, completed: number): number {
  const remaining = original - completed;
  if (remaining <= 120000) return Math.min(original, completed);
  return completed + Math.min(120000, remaining - 45000);
}
