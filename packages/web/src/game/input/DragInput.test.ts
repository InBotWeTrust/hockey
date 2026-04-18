import { describe, it, expect } from 'vitest';
import { computeShotFromDrag, MAX_DRAG } from './DragInput.js';

describe('computeShotFromDrag', () => {
  it('straight-down drag (away from goal) produces angle~0 (straight up shot)', () => {
    const input = computeShotFromDrag(
      { x: 195, y: 660 },
      { x: 195, y: 860 },
      0,
    );
    expect(input.angle).toBeCloseTo(0, 5);
    expect(input.power).toBeCloseTo(200 / MAX_DRAG, 5);
  });

  it('drag down-and-right produces left-angled shot (negative angle)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 295, y: 760 }, 0);
    expect(input.angle).toBeLessThan(0);
    expect(input.power).toBeGreaterThan(0);
  });

  it('drag down-and-left produces right-angled shot (positive angle)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 95, y: 760 }, 0);
    expect(input.angle).toBeGreaterThan(0);
  });

  it('power clamped at 1 for very long drags', () => {
    const input = computeShotFromDrag(
      { x: 195, y: 660 },
      { x: 195, y: 660 + MAX_DRAG * 3 },
      0,
    );
    expect(input.power).toBe(1);
  });

  it('tiny drag produces tiny power (may be below MIN_POWER)', () => {
    const input = computeShotFromDrag({ x: 195, y: 660 }, { x: 195, y: 665 }, 0);
    expect(input.power).toBeLessThan(0.1);
  });

  it('passes releaseTime through', () => {
    const input = computeShotFromDrag({ x: 0, y: 0 }, { x: 0, y: 100 }, 12345);
    expect(input.releaseTime).toBe(12345);
  });
});
