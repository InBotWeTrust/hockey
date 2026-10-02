/** Logical rink geometry, frozen at release; no wall clock or renderer dependency. */
export interface BeachPuddle {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  deepRatio: number;
  speedMultiplier: number;
  active?: boolean;
}
export interface BeachPuddleRule extends BeachPuddle {
  warningMs: number;
  activeMs: number;
  fullMs: number;
  initialScale: number;
}
export interface BeachFlightSegment {
  fromY: number;
  toY: number;
  startMs: number;
  endMs: number;
  speedPerMs: number;
}
export interface BeachPuckFlight {
  x: number;
  startY: number;
  stopY: number;
  blocked: boolean;
  durationMs: number;
  segments: readonly BeachFlightSegment[];
  arrivalMsAtY: (y: number) => number | null;
}
function finite(...values: number[]): void {
  if (values.some(value => !Number.isFinite(value))) throw new Error('Beach geometry must be finite');
}
function validate(puddle: BeachPuddle): void {
  finite(puddle.x, puddle.y, puddle.radiusX, puddle.radiusY, puddle.deepRatio, puddle.speedMultiplier);
  if (puddle.radiusX <= 0 || puddle.radiusY <= 0 || puddle.deepRatio < 0 || puddle.deepRatio > 1
    || puddle.speedMultiplier <= 0 || puddle.speedMultiplier > 1) {
    throw new Error('Invalid beach puddle');
  }
}
export function sampleBeachPuddles(rules: readonly BeachPuddleRule[], elapsedMs: number): BeachPuddle[] {
  finite(elapsedMs);
  const result: BeachPuddle[] = [];
  for (const rule of rules) {
    validate(rule);
    finite(rule.warningMs, rule.activeMs, rule.fullMs, rule.initialScale);
    if (rule.warningMs < 0 || rule.warningMs > rule.activeMs || rule.activeMs > rule.fullMs
      || rule.initialScale <= 0 || rule.initialScale > 1) throw new Error('Invalid beach growth');
    if (elapsedMs < rule.warningMs) continue;
    const progress = rule.fullMs === rule.activeMs ? Number(elapsedMs >= rule.activeMs)
      : Math.max(0, Math.min(1, (elapsedMs - rule.activeMs) / (rule.fullMs - rule.activeMs)));
    const scale = rule.initialScale + (1 - rule.initialScale) * progress;
    result.push({ id: rule.id, x: rule.x, y: rule.y, radiusX: rule.radiusX * scale,
      radiusY: rule.radiusY * scale, deepRatio: rule.deepRatio,
      speedMultiplier: rule.speedMultiplier, active: elapsedMs >= rule.activeMs });
  }
  return result;
}
interface WaterInterval { low: number; high: number; speed: number; deep: boolean }
function intersection(puddle: BeachPuddle, x: number, scale: number): [number, number] | null {
  if (scale <= 0) return null;
  const distance = (x - puddle.x) / (puddle.radiusX * scale);
  // Tangency has zero path length and is not penetration into water.
  if (Math.abs(distance) >= 1) return null;
  const half = puddle.radiusY * scale * Math.sqrt(1 - distance * distance);
  return [puddle.y - half, puddle.y + half];
}
export function traceBeachPuckFlight(input: {
  x: number;
  startY: number;
  endY: number;
  speedPerMs: number;
  puddles: readonly BeachPuddle[];
}): BeachPuckFlight {
  const { x, startY, endY, speedPerMs } = input;
  finite(x, startY, endY, speedPerMs);
  if (startY <= endY || speedPerMs <= 0) throw new Error('Invalid beach flight');
  const boundaries = new Set([startY, endY]);
  const intervals: WaterInterval[] = [];
  for (const puddle of input.puddles) {
    validate(puddle);
    if (puddle.active === false) continue;
    for (const deep of [false, true]) {
      const bounds = intersection(puddle, x, deep ? puddle.deepRatio : 1);
      if (!bounds) continue;
      const low = Math.max(endY, bounds[0]);
      const high = Math.min(startY, bounds[1]);
      if (low >= high) continue;
      boundaries.add(low); boundaries.add(high);
      intervals.push({ low, high, speed: puddle.speedMultiplier, deep });
    }
  }
  const ordered = [...boundaries].sort((a, b) => b - a);
  const segments: BeachFlightSegment[] = [];
  let durationMs = 0;
  let stopY = endY;
  let blocked = false;
  for (let index = 1; index < ordered.length; index++) {
    const fromY = ordered[index - 1]!;
    const toY = ordered[index]!;
    const middle = (fromY + toY) / 2;
    const crossed = intervals.filter(interval => middle > interval.low && middle < interval.high);
    if (crossed.some(interval => interval.deep)) { stopY = fromY; blocked = true; break; }
    const speed = speedPerMs * crossed.reduce((minimum, interval) => Math.min(minimum, interval.speed), 1);
    const endMs = durationMs + (fromY - toY) / speed;
    finite(speed, endMs);
    if (speed <= 0) throw new Error('Invalid beach flight speed');
    segments.push({ fromY, toY, startMs: durationMs, endMs, speedPerMs: speed });
    durationMs = endMs;
  }
  return { x, startY, stopY, blocked, durationMs, segments,
    arrivalMsAtY: y => {
      finite(y);
      if (y > startY || y < stopY || (blocked && y === stopY)) return null;
      if (y === startY) return 0;
      const segment = segments.find(part => y <= part.fromY && y >= part.toY);
      return segment ? segment.startMs + (segment.fromY - y) / segment.speedPerMs : null;
    } };
}
export function sampleBeachPuckPosition(flight: BeachPuckFlight, elapsedMs: number): { x: number; y: number } {
  finite(elapsedMs);
  if (elapsedMs <= 0) return { x: flight.x, y: flight.startY };
  const segment = flight.segments.find(part => elapsedMs < part.endMs);
  return { x: flight.x, y: segment
    ? segment.fromY - Math.max(0, elapsedMs - segment.startMs) * segment.speedPerMs
    : flight.stopY };
}
