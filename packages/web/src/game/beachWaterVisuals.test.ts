import { expect, it } from 'vitest';
import { createBeachWaterSampler, projectBeachWaterY } from './beachWaterVisuals.js';
it('freezes release geometry during flight and catches up smoothly after thaw', () => {
  const sample = createBeachWaterSampler([{ id: 'one', x: 200, y: 300, radiusX: 100, radiusY: 50,
    deepRatio: .5, speedMultiplier: .65, warningMs: 0, activeMs: 100, fullMs: 1000, initialScale: .1 }]);
  const release = sample(200, 200);
  expect(sample(800, 200)).toEqual(release);
  expect(sample(800, null)).toEqual(release);
  expect(sample(925, null)[0]!.radiusX).toBeGreaterThan(release[0]!.radiusX);
  expect(sample(1100, null)[0]!.radiusX).toBe(100);
});
it('projects the goal and release plane through the existing perspective court', () => {
  expect(projectBeachWaterY(60)).toBeCloseTo(60 * .72 + 205 - 127);
  expect(projectBeachWaterY(580)).toBeCloseTo(609 * .72 + 205);
});
