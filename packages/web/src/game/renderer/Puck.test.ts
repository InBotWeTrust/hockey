import { describe, expect, it } from 'vitest';
import { Puck } from './Puck.js';

describe('Puck', () => {
  it('applies a perspective rotation to the rendered puck', () => {
    const puck = new Puck('right', { rotation: -0.36 });

    puck.resetAtStart({ factor: 1, offsetX: 0, offsetY: 0 });

    expect(puck.container.rotation).toBeCloseTo(-0.36);
  });

  it('mirrors a custom blade offset by grip', () => {
    const leftPuck = new Puck('left', { bladeOffsetX: 41, bladeOffsetY: 29 });
    const rightPuck = new Puck('right', { bladeOffsetX: 41, bladeOffsetY: 29 });

    expect(leftPuck.bladePoint(100).x).toBe(59);
    expect(rightPuck.bladePoint(100).x).toBe(141);
  });
});
