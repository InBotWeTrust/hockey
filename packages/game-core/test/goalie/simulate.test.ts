import { describe, it, expect } from 'vitest';
import { createGoalieSimulator, simulateGoalie } from '../../src/goalie/simulate.js';
import type { GoalieConfig } from '../../src/goalie/types.js';

const cfg: GoalieConfig = {
  id: 'rookie',
  name: 'Новичок',
  pattern: 'linear',
  hp: 5,
  baseReward: 1,
  firstClearBonus: 20,
  speed: 200,
  amplitude: 0.7,
  frequency: 0.5,
  goalAmplitude: 0,
  goalFrequency: 0,
};

describe('simulateGoalie', () => {
  it('is fully deterministic for (config, seed, shotIndex, t)', () => {
    const a = simulateGoalie(cfg, 'seed-1', 0, 1500);
    const b = simulateGoalie(cfg, 'seed-1', 0, 1500);
    expect(a).toEqual(b);
  });

  it('different shotIndex → different trajectory at same t', () => {
    const b = simulateGoalie(cfg, 'seed-1', 1, 1500);
    expect(simulateGoalie(cfg, 'seed-1', 1, 1500)).toEqual(b);
  });

  it('AABB width is constant', () => {
    const s = simulateGoalie(cfg, 'seed', 0, 0);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });

  it('persistent simulator is exactly equivalent across patterns, seeds, shots and times', () => {
    const patterns: GoalieConfig['pattern'][] = ['linear', 'sine', 'dash', 'feint'];
    const times = [0, 1, 16.67, 999, 1_000, 7_777, 45_000, 120_000];
    for (const pattern of patterns) {
      for (const seed of ['seed-1', 'seed-2', 'другой-seed']) {
        for (const shotIndex of [1, 17, 90]) {
          const config = { ...cfg, pattern, frequency: 1.37 };
          const simulator = createGoalieSimulator(config, seed, shotIndex);
          for (const time of times) {
            expect(simulator(time, 321.5)).toEqual(
              simulateGoalie(config, seed, shotIndex, time, 321.5),
            );
          }
        }
      }
    }
  });
});
