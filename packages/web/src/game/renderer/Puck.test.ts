import { describe, expect, it } from 'vitest';
import { Puck } from './Puck.js';

describe('Puck', () => {
  it('applies a perspective rotation to the rendered puck', () => {
    const puck = new Puck('right', { rotation: -0.36 });

    puck.resetAtStart({ factor: 1, offsetX: 0, offsetY: 0 });

    expect(puck.container.rotation).toBeCloseTo(-0.36);
  });
});
