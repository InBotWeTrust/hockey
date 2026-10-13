import { describe, expect, it } from 'vitest';
import { skiSlopeMotionTime } from './skiSlope.js';
import { simulateShooter } from './shooter/simulate.js';
describe('ski slope motion clock', () => {
  it('moves uphill at 65% and downhill at 125%', () => {
    expect(skiSlopeMotionTime(200, 1)).toBeCloseTo(130);
    expect(skiSlopeMotionTime(200, 1, 500)).toBeCloseTo(250);
  });
  it('preserves initial phase and position across turns', () => {
    expect(skiSlopeMotionTime(0, 1, 270)).toBe(0);
    const turn = 500 / 0.65;
    const x = (time: number) => simulateShooter(skiSlopeMotionTime(time, 1), 1).x;
    expect(Math.abs(x(turn + 0.001) - x(turn - 0.001))).toBeLessThan(0.01);
  });
  it('is deterministic and continuous after many cycles', () => {
    const cycle = 500 / 0.65 + 500 / 1.25;
    expect(skiSlopeMotionTime(cycle * 10000, 1)).toBeCloseTo(10000000);
    expect(skiSlopeMotionTime(23000, 0.75, 345)).toBe(skiSlopeMotionTime(23000, 0.75, 345));
    expect(skiSlopeMotionTime(1200, 0)).toBe(1200);
  });
});
