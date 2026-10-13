import { describe, expect, it } from 'vitest';
import { SnowBurst } from './SnowBurst.js';
describe('snow spray', () => {
  it('keeps the burst visible after a short skid ends, then clears it', () => {
    const snow = new SnowBurst();
    const scale = { factor: 1, offsetX: 0, offsetY: 0 };
    snow.update(10, 100, 200, scale, false, 1000);
    expect(snow.container.getLocalBounds().width).toBeGreaterThan(0);
    snow.update(null, 100, 200, scale, false, 1800);
    expect(snow.container.getLocalBounds().width).toBeGreaterThan(0);
    snow.update(null, 100, 200, scale, false, 2000);
    expect(snow.container.getLocalBounds().width).toBe(0);
    snow.destroy();
  });
});
