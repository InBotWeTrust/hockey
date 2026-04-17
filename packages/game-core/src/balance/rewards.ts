import type { ShotResult } from '../shot/types.js';
import type { GoalieConfig } from '../goalie/types.js';
import type { Stick } from './sticks.js';

export function calcShotReward(
  result: ShotResult,
  goalie: GoalieConfig,
  stick: Stick,
  currentStreak: number,
): number {
  if (result.type !== 'goal') return 0;
  const streakBonus = 1 + Math.min(currentStreak * 0.1, 1.0);
  // Reward is a shared int contract between client and server: both must
  // produce the same value bit-for-bit, and the UI shows it as "+N шайб".
  // Math.round pins both — anything floating stays server-side.
  return Math.round(goalie.baseReward * stick.effects.rewardMultiplier * streakBonus);
}
