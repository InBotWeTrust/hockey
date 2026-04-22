import { describe, it, expect } from 'vitest';
import { simulateShooter } from '../../src/shooter/simulate.js';
import {
  SHOOTER_MIN_X,
  SHOOTER_MAX_X,
  SHOOTER_FREQUENCY,
} from '../../src/shooter/types.js';

describe('simulateShooter', () => {
  it('is deterministic for same t', () => {
    expect(simulateShooter(1234)).toEqual(simulateShooter(1234));
  });

  it('starts at SHOOTER_MIN_X at t=0', () => {
    expect(simulateShooter(0).x).toBeCloseTo(SHOOTER_MIN_X, 5);
  });

  it('reaches SHOOTER_MAX_X at half-period', () => {
    const period = 1000 / SHOOTER_FREQUENCY;
    expect(simulateShooter(period / 2).x).toBeCloseTo(SHOOTER_MAX_X, 5);
  });

  it('returns to SHOOTER_MIN_X at full period', () => {
    const period = 1000 / SHOOTER_FREQUENCY;
    expect(simulateShooter(period).x).toBeCloseTo(SHOOTER_MIN_X, 5);
  });

  it('stays within board margins over long time', () => {
    for (let t = 0; t < 30000; t += 113) {
      const { x } = simulateShooter(t);
      expect(x).toBeGreaterThanOrEqual(SHOOTER_MIN_X);
      expect(x).toBeLessThanOrEqual(SHOOTER_MAX_X);
    }
  });

  it('handles negative t deterministically', () => {
    expect(simulateShooter(-500)).toEqual(simulateShooter(-500));
  });
});
