import { describe, it, expect } from 'vitest';
import { computeTrajectory } from '../../src/shot/trajectory.js';
import { PUCK_START } from '../../src/rink.js';

describe('computeTrajectory', () => {
  it('angle=0, power=1 → straight up, reaches goal line', () => {
    const tr = computeTrajectory({ angle: 0, power: 1, releaseTime: 0 });
    expect(tr.end.x).toBeCloseTo(PUCK_START.x);
    expect(tr.end.y).toBeLessThanOrEqual(0); // reaches top
  });

  it('angle>0 → puck goes to the right', () => {
    const tr = computeTrajectory({ angle: 0.3, power: 1, releaseTime: 0 });
    expect(tr.end.x).toBeGreaterThan(PUCK_START.x);
  });

  it('power=0 → length is 0', () => {
    const tr = computeTrajectory({ angle: 0, power: 0, releaseTime: 0 });
    expect(tr.length).toBe(0);
  });
});
