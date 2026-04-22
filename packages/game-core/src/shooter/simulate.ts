import { RINK } from '../rink.js';
import {
  SHOOTER_AMPLITUDE,
  SHOOTER_FREQUENCY,
  type ShooterState,
} from './types.js';

const CENTER_X = RINK.width / 2;

export function simulateShooter(t: number): ShooterState {
  const period = 1000 / SHOOTER_FREQUENCY;
  const phase = ((t % period) + period) % period / period; // 0..1
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; // -1..1..-1
  return { x: CENTER_X + SHOOTER_AMPLITUDE * tri };
}
