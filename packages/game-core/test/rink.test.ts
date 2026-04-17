import { describe, it, expect } from 'vitest';
import { RINK, GOAL, PUCK_START, type Vec2 } from '../src/rink.js';

describe('rink geometry', () => {
  it('has positive dimensions', () => {
    expect(RINK.width).toBeGreaterThan(0);
    expect(RINK.height).toBeGreaterThan(0);
  });

  it('goal is centered horizontally at the top', () => {
    expect(GOAL.y).toBe(0);
    const mid = GOAL.x + GOAL.width / 2;
    expect(mid).toBeCloseTo(RINK.width / 2);
  });

  it('puck start is below the goal and centered', () => {
    expect(PUCK_START.y).toBeGreaterThan(GOAL.y + GOAL.height);
    expect(PUCK_START.x).toBeCloseTo(RINK.width / 2);
  });
});
