import { describe, it, expect } from 'vitest';
import { sampleBarMotion } from '../../src/bar/motion.js';
const source = {
  userId: 'a',
  period: 1,
  state: 'period_active',
  elapsedMs: 5000,
  seed: 'private',
  shotIndex: 0,
  shooterFrequency: 0.3,
  goalieFrequency: 0.3,
  goalFrequency: 0.2,
};
describe('public spectator movement', () => {
  it('produces bounded moving coordinates without publishing private simulation inputs', () => {
    const track = sampleBarMotion(source, 'rookie', new Date('2026-10-07T00:00:00Z'));
    expect(track.frames).toHaveLength(21);
    expect(new Set(track.frames.map((f) => f.shooterX)).size).toBeGreaterThan(1);
    expect(JSON.stringify(track)).not.toMatch(/private|seed|Frequency/);
  });
  it('freezes actors during a break', () => {
    const track = sampleBarMotion({ ...source, state: 'break_active' }, 'rookie', new Date());
    expect(new Set(track.frames.map((f) => f.shooterX)).size).toBe(1);
    expect(new Set(track.frames.map((f) => f.goalieX)).size).toBe(1);
  });
});
