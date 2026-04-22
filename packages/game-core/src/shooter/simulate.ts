import {
  SHOOTER_AMPLITUDE,
  SHOOTER_CENTER_X,
  SHOOTER_FREQUENCY,
  type ShooterState,
} from './types.js';

export function simulateShooter(t: number, frequency: number = SHOOTER_FREQUENCY): ShooterState {
  const period = 1000 / frequency;
  const phase = ((t % period) + period) % period / period; // 0..1
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; // -1..1..-1
  // No clamp needed: amplitude is exactly half the [MIN, MAX] range,
  // so the wave naturally reaches both board margins and reverses.
  return { x: SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri };
}
