import { describe, it, expect } from 'vitest';
import { simulateGoal } from '../../src/goal/simulate.js';
import type { GoalieConfig } from '../../src/goalie/types.js';

const base: GoalieConfig = {
  id: 'test',
  name: 'Test',
  pattern: 'linear',
  hp: 5,
  baseReward: 1,
  firstClearBonus: 10,
  speed: 100,
  amplitude: 0.5,
  frequency: 0.5,
  goalAmplitude: 40,
  goalFrequency: 0.25,
};

describe('simulateGoal', () => {
  it('is deterministic for same t', () => {
    expect(simulateGoal(base, 1500)).toEqual(simulateGoal(base, 1500));
  });

  it('is zero for static goal', () => {
    expect(simulateGoal({ ...base, goalAmplitude: 0 }, 1500).offsetX).toBe(0);
    expect(simulateGoal({ ...base, goalFrequency: 0 }, 1500).offsetX).toBe(0);
  });

  it('starts at -amplitude at t=0 (triangle wave phase 0)', () => {
    // With triangle wave implementation, phase 0 → tri = -1, offset = -amp.
    expect(simulateGoal(base, 0).offsetX).toBeCloseTo(-base.goalAmplitude, 5);
  });

  it('peaks at +amplitude at half-period', () => {
    const period = 1000 / base.goalFrequency;
    expect(simulateGoal(base, period / 2).offsetX).toBeCloseTo(
      base.goalAmplitude,
      5,
    );
  });

  it('returns to -amplitude at full period', () => {
    const period = 1000 / base.goalFrequency;
    expect(simulateGoal(base, period).offsetX).toBeCloseTo(
      -base.goalAmplitude,
      5,
    );
  });

  it('stays within amplitude bounds over long time', () => {
    for (let t = 0; t < 30000; t += 137) {
      const { offsetX } = simulateGoal(base, t);
      expect(Math.abs(offsetX)).toBeLessThanOrEqual(base.goalAmplitude + 1e-6);
    }
  });

  it('clamps amplitude to keep goal on rink', () => {
    const huge = simulateGoal(
      { ...base, goalAmplitude: 10000 },
      1000 / base.goalFrequency / 2,
    );
    // Geometry: GOAL.x=150, width=90 → boundaries leave max 150; MARGIN=-50 → 200.
    expect(Math.abs(huge.offsetX)).toBeLessThanOrEqual(200 + 1e-6);
  });
});
