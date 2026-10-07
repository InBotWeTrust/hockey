import type { BarMotion, BarMotionFrame } from './types.js';
export class MotionTimeline {
  private track: BarMotion | null = null;
  private receivedAt = 0;
  push(track: BarMotion, now: number): void {
    if (this.track && (track.period < this.track.period || track.sampledAt <= this.track.sampledAt))
      return;
    this.track = track;
    this.receivedAt = now;
  }
  reset(): void {
    this.track = null;
  }
  sample(period: number, now: number): BarMotionFrame | null {
    const track = this.track;
    if (!track || track.period !== period || !track.frames.length) return null;
    const elapsed = Math.max(0, now - this.receivedAt);
    const first = track.frames[0]!;
    if (elapsed <= first.offsetMs) return first;
    const right = track.frames.find((f) => f.offsetMs >= elapsed);
    if (!right) return track.frames[track.frames.length - 1]!;
    const index = track.frames.indexOf(right);
    const left = track.frames[index - 1] ?? right;
    const fraction = (elapsed - left.offsetMs) / Math.max(1, right.offsetMs - left.offsetMs);
    const mix = (a: number, b: number) => a + (b - a) * fraction;
    return {
      offsetMs: elapsed,
      shooterX: mix(left.shooterX, right.shooterX),
      goalOffsetX: mix(left.goalOffsetX, right.goalOffsetX),
      goalieX: mix(left.goalieX, right.goalieX),
      goalieY: mix(left.goalieY, right.goalieY),
    };
  }
}
