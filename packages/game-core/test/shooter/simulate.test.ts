import { describe, it, expect } from 'vitest';
import { simulateShooter } from '../../src/shooter/simulate.js';
import {
  SHOOTER_AMPLITUDE,
  SHOOTER_FREQUENCY,
} from '../../src/shooter/types.js';
import { RINK } from '../../src/rink.js';

const CENTER_X = RINK.width / 2;

describe('simulateShooter', () => {
  it('is deterministic for same t', () => {
    expect(simulateShooter(1234)).toEqual(simulateShooter(1234));
  });

  it('starts at center - amplitude at t=0', () => {
    expect(simulateShooter(0).x).toBeCloseTo(CENTER_X - SHOOTER_AMPLITUDE, 5);
  });

  it('peaks at +amplitude at half-period', () => {
    const period = 1000 / SHOOTER_FREQUENCY;
    expect(simulateShooter(period / 2).x).toBeCloseTo(
      CENTER_X + SHOOTER_AMPLITUDE,
      5,
    );
  });

  it('returns to -amplitude at full period', () => {
    const period = 1000 / SHOOTER_FREQUENCY;
    expect(simulateShooter(period).x).toBeCloseTo(
      CENTER_X - SHOOTER_AMPLITUDE,
      5,
    );
  });

  it('stays inside rink width over long time', () => {
    const half = RINK.width / 2;
    for (let t = 0; t < 30000; t += 113) {
      const { x } = simulateShooter(t);
      expect(x).toBeGreaterThanOrEqual(CENTER_X - half);
      expect(x).toBeLessThanOrEqual(CENTER_X + half);
      expect(Math.abs(x - CENTER_X)).toBeLessThanOrEqual(
        SHOOTER_AMPLITUDE + 1e-6,
      );
    }
  });

  it('handles negative t deterministically', () => {
    expect(simulateShooter(-500)).toEqual(simulateShooter(-500));
  });
});
