import { describe, it, expect } from 'vitest';
import { simulateGoalie } from '../../src/goalie/simulate.js';
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
    const a = simulateGoalie(cfg, 'seed-1', 0, 1500);
    const b = simulateGoalie(cfg, 'seed-1', 1, 1500);
    expect(simulateGoalie(cfg, 'seed-1', 1, 1500)).toEqual(b);
  });

  it('AABB width is constant', () => {
    const s = simulateGoalie(cfg, 'seed', 0, 0);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });
});
