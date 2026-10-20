import { describe, it, expect } from 'vitest';
import { scoredActiveDeltaMs } from './scoredClock.js';
describe('server anchored scored clock', () => {
  const start = new Date(5200).toISOString(), end = new Date(6200).toISOString();
  it('advances before contact and stops throughout the result', () => {
    expect(scoredActiveDeltaMs(5000,5100,start,end)).toBe(100);
    expect(scoredActiveDeltaMs(5000,5700,start,end)).toBe(200);
    expect(scoredActiveDeltaMs(5000,6200,start,end)).toBe(200);
  });
  it('resumes and excludes only the remaining pause after reconnect', () => {
    expect(scoredActiveDeltaMs(5000,6500,start,end)).toBe(500);
    expect(scoredActiveDeltaMs(5700,6500,start,end)).toBe(300);
  });
  it('freezes interpolation during a fight or medical aid', () => {
    expect(scoredActiveDeltaMs(5000, 9000, null, null, true)).toBe(0);
  });
  it('preserves ordinary continuous clocks', () => {
    expect(scoredActiveDeltaMs(5000,6500)).toBe(1500);
  });
});
