import type { Vec2 } from '../rink.js';

export interface ShotInput {
  angle: number;        // radians, -π/2..π/2, 0 = straight up (toward goal)
  power: number;        // 0..1
  releaseTime: number;  // ms from session start
}

export type ShotResult =
  | { type: 'goal'; hitPoint: Vec2 }
  | { type: 'save'; goalieContact: Vec2 }
  | { type: 'miss'; reason: 'wide' | 'short' | 'over' };

export interface StickEffects {
  shotZoneMultiplier: number;     // >=1 widens good zone
  rewardMultiplier: number;       // used in calcRewards
  streakGrowthMultiplier: number; // used in calcRewards
}

export const STICK_NEUTRAL: StickEffects = {
  shotZoneMultiplier: 1,
  rewardMultiplier: 1,
  streakGrowthMultiplier: 1,
};
