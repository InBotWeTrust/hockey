import { describe, it, expect } from 'vitest';
import { resolveShot } from '../../src/shot/resolve.js';
import { simulateGoalie } from '../../src/goalie/simulate.js';
import { STICK_NEUTRAL } from '../../src/shot/types.js';

const cfg = {
  id: 'rookie',
  name: 'Новичок',
  pattern: 'linear' as const,
  hp: 5,
  baseReward: 1,
  firstClearBonus: 20,
  speed: 200,
  amplitude: 0.0,
  frequency: 0.5,
};

describe('resolveShot', () => {
  it('straight shot into center → save (goalie stands in center)', () => {
    const goalie = simulateGoalie(cfg, 's', 0, 0);
    const res = resolveShot(
      { angle: 0, power: 1, releaseTime: 0 },
      goalie,
      STICK_NEUTRAL,
    );
    expect(res.type).toBe('save');
  });

  it('sharp angle → wide miss', () => {
    const goalie = simulateGoalie(cfg, 's', 0, 0);
    const res = resolveShot(
      { angle: 1.4, power: 1, releaseTime: 0 },
      goalie,
      STICK_NEUTRAL,
    );
    expect(res.type).toBe('miss');
    if (res.type === 'miss') expect(res.reason).toBe('wide');
  });

  it('zero power → short miss', () => {
    const goalie = simulateGoalie(cfg, 's', 0, 0);
    const res = resolveShot(
      { angle: 0, power: 0, releaseTime: 0 },
      goalie,
      STICK_NEUTRAL,
    );
    expect(res.type).toBe('miss');
    if (res.type === 'miss') expect(res.reason).toBe('short');
  });

  it('angled shot that clears the goalie → goal', () => {
    const goalie = simulateGoalie(cfg, 's', 0, 0);
    const res = resolveShot(
      { angle: 0.2, power: 1, releaseTime: 0 },
      goalie,
      STICK_NEUTRAL,
    );
    expect(res.type).toBe('goal');
  });

  it('is a pure function', () => {
    const goalie = simulateGoalie(cfg, 's', 0, 0);
    const a = resolveShot({ angle: 0.2, power: 0.9, releaseTime: 0 }, goalie, STICK_NEUTRAL);
    const b = resolveShot({ angle: 0.2, power: 0.9, releaseTime: 0 }, goalie, STICK_NEUTRAL);
    expect(a).toEqual(b);
  });
});
