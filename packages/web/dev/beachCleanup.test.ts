import { expect, it } from 'vitest';
import { sampleBeachPuddles } from '@hockey/game-core';
import { createBeachCleanup } from './beachCleanup.js';
const rule = () => ({ id: 'one', x: 200, y: 300, radiusX: 80, radiusY: 40, deepRatio: .5, speedMultiplier: .65, warningMs: 0, activeMs: 0, fullMs: 0, initialScale: 1 });
it('removes a fixed area portion, consumes cooldown taps and regrows', () => {
  const rules = [rule()]; const tap = createBeachCleanup(rules);
  expect(tap(200, 300, 100)).toBe(true);
  expect(sampleBeachPuddles(rules, 100)[0]!.radiusX).toBeCloseTo(80 * Math.sqrt(.875));
  expect(tap(200, 300, 150)).toBe(true);
  expect(sampleBeachPuddles(rules, 150)[0]!.radiusX).toBeLessThan(76);
  expect(sampleBeachPuddles(rules, 30100)[0]!.radiusX).toBe(80);
  expect(tap(500, 300, 400)).toBe(false);
});
it('small puddles clear with fewer taps and keep a short dry interval', () => {
  const rules = [{ ...rule(), initialScale: .25, fullMs: 30000 }]; const tap = createBeachCleanup(rules);
  expect(tap(200, 300, 0)).toBe(true);
  expect(sampleBeachPuddles(rules, 0)).toEqual([]);
  expect(sampleBeachPuddles(rules, 2000)[0]!.active).toBe(true);
});
