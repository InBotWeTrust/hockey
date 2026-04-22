import type { Vec2 } from '../rink.js';

export interface ShotInput {
  tapTime: number;        // ms from session start
  puckSpeedPerMs?: number; // override for PUCK_SPEED_PER_MS (debug/test)
}

export type ShotResult =
  | { type: 'goal'; hitPoint: Vec2 }
  | { type: 'save'; goalieContact: Vec2 }
  | { type: 'miss'; reason: 'wide' };

export interface StickEffects {
  shotZoneMultiplier: number;     // >=1 widens good zone (narrows goalie AABB)
  rewardMultiplier: number;       // used in calcRewards
  streakGrowthMultiplier: number; // used in calcRewards
}

export const STICK_NEUTRAL: StickEffects = {
  shotZoneMultiplier: 1,
  rewardMultiplier: 1,
  streakGrowthMultiplier: 1,
};

export const PUCK_SPEED_PER_MS = 1.2; // rink units per millisecond
