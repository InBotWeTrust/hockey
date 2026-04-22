import { describe, it, expect } from 'vitest';
import { linearPattern, sinePattern, dashPattern } from '../../src/goalie/patterns.js';
import { createRng } from '../../src/rng.js';
import { GOAL, RINK } from '../../src/rink.js';
import { GOALIE_SIZE } from '../../src/goalie/types.js';

import type { GoalieConfig } from '../../src/goalie/types.js';

const cfg: GoalieConfig = {
  id: 'test',
  name: 'Test',
  pattern: 'linear',
  hp: 5,
  baseReward: 1,
  firstClearBonus: 10,
  speed: 200,
  amplitude: 0.8,
  frequency: 1,
  goalAmplitude: 0,
  goalFrequency: 0,
};

describe('goalie patterns', () => {
  it('linear: position stays within rink (board-to-board pattern)', () => {
    const rng = createRng('s');
    const halfGoalie = GOALIE_SIZE.width / 2;
    for (let t = 0; t < 10000; t += 50) {
      const p = linearPattern(cfg, rng, t);
      expect(p.x).toBeGreaterThanOrEqual(halfGoalie);
      expect(p.x).toBeLessThanOrEqual(RINK.width - halfGoalie);
    }
  });

  it('linear: oscillates around rink center', () => {
    const rng = createRng('s');
    const samples = Array.from({ length: 400 }, (_, i) =>
      linearPattern({ ...cfg, amplitude: 1.0 }, rng, i * 25).x,
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(RINK.width / 2, 0);
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
