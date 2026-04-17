import { describe, it, expect } from 'vitest';
import { linearPattern, sinePattern, dashPattern } from '../../src/goalie/patterns.js';
import { createRng } from '../../src/rng.js';
import { GOAL } from '../../src/rink.js';

const cfg = {
  id: 'test',
  name: 'Test',
  pattern: 'linear' as const,
  hp: 5,
  baseReward: 1,
  firstClearBonus: 10,
  speed: 200,
  amplitude: 0.8,
  frequency: 1,
};

describe('goalie patterns', () => {
  it('linear: position stays within goal opening', () => {
    const rng = createRng('s');
    for (let t = 0; t < 10000; t += 50) {
      const p = linearPattern(cfg, rng, t);
      expect(p.x).toBeGreaterThanOrEqual(GOAL.x);
      expect(p.x).toBeLessThanOrEqual(GOAL.x + GOAL.width);
    }
  });

  it('linear: deterministic for same seed', () => {
    const a = linearPattern(cfg, createRng('s'), 1234);
    const b = linearPattern(cfg, createRng('s'), 1234);
    expect(a).toEqual(b);
  });

  it('sine: oscillates around goal center', () => {
    const rng = createRng('s');
    const samples = Array.from({ length: 200 }, (_, i) => sinePattern(cfg, rng, i * 50).x);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(GOAL.x + GOAL.width / 2, 0);
  });

  it('dash: deterministic with fresh rng (as used by simulateGoalie)', () => {
    const at1000 = dashPattern(cfg, createRng('dash-seed'), 1000);
    const at1050 = dashPattern(cfg, createRng('dash-seed'), 1050);
    // Same seed, same t → same result
    expect(dashPattern(cfg, createRng('dash-seed'), 1000)).toEqual(at1000);
    expect(dashPattern(cfg, createRng('dash-seed'), 1050)).toEqual(at1050);
    // Different seeds → different results (overwhelmingly likely)
    const otherSeed = dashPattern(cfg, createRng('other-seed'), 1000);
    expect(otherSeed).not.toEqual(at1000);
  });
});
