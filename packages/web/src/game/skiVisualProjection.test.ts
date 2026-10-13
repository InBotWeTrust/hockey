import { expect, it } from 'vitest';
import { SKI_ENTITY_SHEAR } from './skiVisualProjection.js';
it('uses the same displacement as the original arena artwork', () => {
  // All original rink rows: left +170px, right unchanged; background display height107%.
  expect(1212 * SKI_ENTITY_SHEAR).toBeCloseTo(-181.9, 8);
});
