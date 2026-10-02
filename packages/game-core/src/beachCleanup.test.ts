import { expect, it } from 'vitest';
import { beachCleanupRules } from './beachCleanup.js';
import { sampleBeachPuddles } from './beachEnvironment.js';
const original = [{id:'one', x:200, y:300, radiusX:80, radiusY:40, deepRatio:.5, speedMultiplier:.65,
  warningMs:0, activeMs:0, fullMs:0, initialScale:1}];
it('reconstructs smaller geometry without changing snapshots or applying future events', () => {
  const events = [{id:'event', puddleId:'one', tapTime:100}];
  expect(beachCleanupRules(original, events, 99)).toEqual(original);
  const updated = beachCleanupRules(original, events, 100);
  expect(sampleBeachPuddles(updated,100)[0]!.radiusX).toBeCloseTo(80*Math.sqrt(.875));
  expect(original[0]!.initialScale).toBe(1);
  expect(sampleBeachPuddles(updated,30100)[0]!.radiusX).toBe(80);
});
