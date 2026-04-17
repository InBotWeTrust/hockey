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
  return goalie.baseReward * stick.effects.rewardMultiplier * streakBonus;
}
