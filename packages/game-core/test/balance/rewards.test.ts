import { describe, it, expect } from 'vitest';
import { calcShotReward } from '../../src/balance/rewards.js';
import { getGoalie } from '../../src/balance/goalies.js';
import { getStick } from '../../src/balance/sticks.js';

describe('calcShotReward', () => {
  const rookie = getGoalie('rookie');
  const training = getStick('training');

  it('returns 0 for non-goal result', () => {
    expect(calcShotReward(
      { type: 'save', goalieContact: { x: 0, y: 0 } },
      rookie,
      training,
      0,
    )).toBe(0);
  });

  it('base reward at zero streak', () => {
    const r = calcShotReward(
      { type: 'goal', hitPoint: { x: 0, y: 0 } },
      rookie,
      training,
      0,
    );
    expect(r).toBe(rookie.baseReward);
  });

  it('streak multiplier caps at 2x', () => {
    const r = calcShotReward(
      { type: 'goal', hitPoint: { x: 0, y: 0 } },
      rookie,
      training,
      100,
    );
    expect(r).toBe(rookie.baseReward * 2);
  });

  it('stick reward multiplier applies', () => {
    const sokol = getStick('sokol');
    const r = calcShotReward(
      { type: 'goal', hitPoint: { x: 0, y: 0 } },
      rookie,
      sokol,
      0,
    );
    expect(r).toBe(Math.round(rookie.baseReward * sokol.effects.rewardMultiplier));
  });
});
