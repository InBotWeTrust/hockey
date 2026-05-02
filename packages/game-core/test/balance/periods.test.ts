import { describe, it, expect } from 'vitest';
import {
  DAILY_PERIOD_SPEED_PRESETS,
  getDailyPeriodSpeedPreset,
} from '../../src/balance/periods.js';

describe('daily period speed presets', () => {
  it('defines one preset for each daily period', () => {
    expect(DAILY_PERIOD_SPEED_PRESETS.map((p) => p.periodNumber)).toEqual([1, 2, 3]);
  });

  it('applies shooter fatigue while keeping goal and goalie speeds stable', () => {
    const p1 = getDailyPeriodSpeedPreset(1);
    const p2 = getDailyPeriodSpeedPreset(2);
    const p3 = getDailyPeriodSpeedPreset(3);

    expect([p1.shooterFrequency, p2.shooterFrequency, p3.shooterFrequency]).toEqual([
      0.8,
      0.75,
      0.7,
    ]);
    expect(p2.goalFrequency).toBe(p1.goalFrequency);
    expect(p3.goalFrequency).toBe(p1.goalFrequency);
    expect(p2.goalieFrequency).toBe(p1.goalieFrequency);
    expect(p3.goalieFrequency).toBe(p1.goalieFrequency);
  });

  it('clamps out-of-range period numbers', () => {
    expect(getDailyPeriodSpeedPreset(0).periodNumber).toBe(1);
    expect(getDailyPeriodSpeedPreset(9).periodNumber).toBe(3);
  });
});
