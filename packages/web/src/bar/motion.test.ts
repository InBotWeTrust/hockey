import { describe, it, expect } from 'vitest';
import { MotionTimeline } from './motion.js';
const track = {
  userId: 'a',
  period: 1,
  sampledAt: '2026-10-07T00:00:00Z',
  frames: [
    { offsetMs: 0, shooterX: 100, goalOffsetX: 0, goalieX: 250, goalieY: 78 },
    { offsetMs: 2000, shooterX: 300, goalOffsetX: 20, goalieX: 350, goalieY: 78 },
  ],
};
describe('spectator motion timeline', () => {
  it('interpolates received positions and freezes at the end of a missing update', () => {
    const timeline = new MotionTimeline();
    timeline.push(track, 100);
    expect(timeline.sample(1, 1100)?.shooterX).toBe(200);
    expect(timeline.sample(1, 10000)?.shooterX).toBe(300);
    expect(timeline.sample(2, 1100)).toBeNull();
  });
  it('ignores stale tracks and resets at a new match', () => {
    const timeline = new MotionTimeline();
    timeline.push(track, 100);
    timeline.push({ ...track, sampledAt: '2026-10-06T00:00:00Z' }, 1100);
    expect(timeline.sample(1, 1100)?.shooterX).toBe(200);
    timeline.reset();
    expect(timeline.sample(1, 1100)).toBeNull();
  });
});
