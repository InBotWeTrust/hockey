import { describe, it, expect } from 'vitest';
import { STICKS, getStick, TRAINING_STICK_ID } from '../../src/balance/sticks.js';

describe('STICKS catalog', () => {
  it('has exactly 4 entries', () => {
    expect(STICKS).toHaveLength(4);
  });

  it('training stick has neutral effects', () => {
    const s = getStick(TRAINING_STICK_ID);
    expect(s.effects.shotZoneMultiplier).toBe(1);
    expect(s.effects.rewardMultiplier).toBe(1);
    expect(s.effects.streakGrowthMultiplier).toBe(1);
  });

  it('legendary stick has the strongest multipliers', () => {
    const legendary = STICKS[STICKS.length - 1]!;
    for (const s of STICKS.slice(0, -1)) {
      expect(legendary.effects.rewardMultiplier).toBeGreaterThanOrEqual(s.effects.rewardMultiplier);
    }
  });
});
