import { describe, expect, it } from 'vitest';
import { sampleBeachPuddles, traceBeachPuckFlight, sampleBeachPuckPosition } from './beachEnvironment.js';

const puddle = { id: 'test', x: 100, y: 300, radiusX: 50, radiusY: 50, deepRatio: 0.4, speedMultiplier: 0.5 };
const flight = (puddles = [puddle], x = 100) => traceBeachPuckFlight({ x, startY: 580, endY: 60, speedPerMs: 1, puddles });
describe('beach puddle flight', () => {
  it('keeps dry flight unchanged', () => {
    const result = flight([]);
    expect(result.durationMs).toBe(520);
    expect(result.blocked).toBe(false);
    expect(result.arrivalMsAtY(150)).toBe(430);
  });
  it('adds only shallow path resistance, independently at each crossing', () => {
    const result = flight([{ ...puddle, y: 120, radiusY: 40, deepRatio: 0 }]);
    expect(result.arrivalMsAtY(150)).toBe(440);
    expect(result.arrivalMsAtY(60)).toBe(600);
    expect(result.blocked).toBe(false);
  });
  it('stops at the first deep boundary, never reaches the goal', () => {
    const result = flight();
    expect(result.blocked).toBe(true);
    expect(result.stopY).toBeCloseTo(320);
    expect(result.arrivalMsAtY(60)).toBeNull();
    expect(sampleBeachPuckPosition(result, 9999)).toEqual({ x: 100, y: 320 });
  });
  it('tangent deep contact does not stop the puck', () => {
    const result = flight([puddle], 120);
    expect(result.blocked).toBe(false);
  });
  it('overlapping shallow water uses strongest resistance once', () => {
    const a = { ...puddle, deepRatio: 0 };
    const result = flight([a, { ...a, id: 'second', speedMultiplier: 0.75 }]);
    expect(result.durationMs).toBe(620);
    expect(flight([{ ...a, id: 'second', speedMultiplier: 0.75 }, a]).durationMs).toBe(620);
  });
  it('samples continuous travel across a shallow boundary', () => {
    const result = flight([{ ...puddle, deepRatio: 0 }]);
    expect(sampleBeachPuckPosition(result, 230)).toEqual({ x: 100, y: 350 });
    expect(sampleBeachPuckPosition(result, 231)).toEqual({ x: 100, y: 349.5 });
    expect(sampleBeachPuckPosition(result, -1)).toEqual({ x: 100, y: 580 });
  });
  it('preserves an earlier goalie crossing before a deeper obstacle', () => {
    const result = flight([{ ...puddle, y: 100, radiusY: 20 }]);
    expect(result.arrivalMsAtY(150)).toBe(430);
    expect(result.arrivalMsAtY(60)).toBeNull();
  });
  it('rejects nonfinite geometry and invalid water speed', () => {
    expect(() => flight([{ ...puddle, radiusX: NaN }])).toThrow();
    expect(() => flight([{ ...puddle, speedMultiplier: 0 }])).toThrow();
    expect(() => traceBeachPuckFlight({ x: 100, startY: 580, endY: 60, speedPerMs: 1e-320, puddles: [] })).toThrow();
  });
});
describe('release-time puddle snapshot', () => {
  const rules = [{ ...puddle, warningMs: 100, activeMs: 200, fullMs: 400, initialScale: 0.25 }];
  it('warns before activation without obstructing a shot', () => {
    expect(sampleBeachPuddles(rules, 50)).toEqual([]);
    const warning = sampleBeachPuddles(rules, 150);
    expect(warning[0]?.active).toBe(false);
    expect(flight(warning).durationMs).toBe(520);
  });
  it('grows from initial size and preserves an earlier release snapshot', () => {
    const release = sampleBeachPuddles(rules, 200);
    expect(release[0]?.radiusX).toBe(12.5);
    expect(sampleBeachPuddles(rules, 400)[0]?.radiusX).toBe(50);
    expect(release[0]?.radiusX).toBe(12.5);
    expect(sampleBeachPuddles(rules, 300)).toEqual(sampleBeachPuddles(rules, 300));
  });
});
