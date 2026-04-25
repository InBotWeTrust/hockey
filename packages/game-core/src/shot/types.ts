import type { Vec2 } from '../rink.js';

export interface ShotInput {
  tapTime: number;        // ms from session start, для goalie/goal cross-time
  // Отдельный tap-time для шутера. Web-клиент паузит шутера и сцену
  // независимо (шутер замирает на тапе, сцена — на импакте), поэтому
  // эффективное время для simulateShooter может отличаться от tapTime.
  // Если не задан — используется tapTime (старое поведение / тесты).
  shooterTapTime?: number;
  puckSpeedPerMs?: number; // override for PUCK_SPEED_PER_MS
  shooterFrequency?: number; // override for SHOOTER_FREQUENCY
  // Override goalie/goal frequency in cfg. Sent in input (rather than baked
  // into cfg) so client and server agree on the effective movement rates and
  // every shot is reproducible bit-for-bit. Anti-cheat: server will validate
  // these against allowed ranges in a follow-up; for now anything goes.
  goalieFrequency?: number;
  goalFrequency?: number;
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
