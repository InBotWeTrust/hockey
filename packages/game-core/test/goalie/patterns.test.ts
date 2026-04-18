import { describe, it, expect } from 'vitest';
import {
  linearPattern,
  sinePattern,
  dashPattern,
  feintPattern,
} from '../../src/goalie/patterns.js';
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

  it('feint: stays within goal opening for full duration', () => {
    for (let t = 0; t < 10000; t += 25) {
      const p = feintPattern(cfg, createRng('s'), t);
      expect(p.x).toBeGreaterThanOrEqual(GOAL.x);
      expect(p.x).toBeLessThanOrEqual(GOAL.x + GOAL.width);
    }
  });

  it('feint: deterministic with fresh rng (as used by simulateGoalie)', () => {
    const at800 = feintPattern(cfg, createRng('feint-seed'), 800);
    expect(feintPattern(cfg, createRng('feint-seed'), 800)).toEqual(at800);
  });

  it('feint: fake-then-commit reverses direction inside one period', () => {
    // period = 1000ms (frequency=1). Inside a period: fake grows (0..0.3*period),
    // returns to zero by 0.4*period, then commits to the opposite side.
    const fakePeak = feintPattern(cfg, createRng('feint-seed'), 200); // phase 0.2
    const commitPeak = feintPattern(cfg, createRng('feint-seed'), 900); // phase 0.9
    const center = GOAL.x + GOAL.width / 2;
    expect(Math.sign(fakePeak.x - center)).not.toBe(0);
    expect(Math.sign(commitPeak.x - center)).toBe(-Math.sign(fakePeak.x - center));
  });

  it('feint: different seeds pick different fake directions (overwhelmingly likely)', () => {
    const center = GOAL.x + GOAL.width / 2;
    const sides = new Set<number>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const p = feintPattern(cfg, createRng(seed), 200);
      sides.add(Math.sign(p.x - center));
    }
    expect(sides.size).toBeGreaterThan(1);
  });
});
