import type { GoalieConfig, GoaliePatternId } from '@hockey/game-core';
import { z } from 'zod';

export type BonusGameStatus = 'draft' | 'active' | 'archived';
export type BonusGameAccessType = 'free' | 'paid';
export type BonusGameAttemptStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type BonusGameAttemptState = 'idle' | 'period_active' | 'break_active' | 'closed';
export type BonusPeriodClosedReason = 'quota' | 'timeout' | 'target_reached' | 'attempt_abandoned';
export type BonusGameEconomyEventKind = 'unlock_purchase' | 'first_clear_reward';
export type BonusGoaliePattern = Extract<GoaliePatternId, 'linear' | 'sine' | 'dash'>;

export interface BonusPeriodRule {
  periodNumber: number;
  durationMs: number;
  shotsLimit: number;
  goalFrequency: number;
  goalieFrequency: number;
  shooterFrequency: number;
  puckSpeedPerMs: number;
  goaliePattern: BonusGoaliePattern;
  goalieAmplitude: number;
  goalAmplitude: number;
}

export interface BonusArenaSnapshot {
  id: string;
  slug: string;
  title: string;
  artworkUrl: string;
  thumbnailUrl: string;
}

export interface BonusRewardSnapshot {
  coins: number;
  stars: number;
  experience: number;
}

export interface BonusRulesSnapshot {
  gameId: string;
  slug: string;
  title: string;
  revision: number;
  targetGoals: number;
  totalPeriods: number;
  breakDurationMs: number;
  periods: BonusPeriodRule[];
  goalkeeperReadyUrl: string;
  goalkeeperSaveUrl: string;
  arena: BonusArenaSnapshot;
}

export interface ArenaThemeRow {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
  status: 'active' | 'archived';
  is_selectable: boolean;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface BonusGameRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  status: BonusGameStatus;
  access_type: BonusGameAccessType;
  unlock_price_stars: number;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  period_rules: BonusPeriodRule[];
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  arena_theme_id: string;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  revision: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface BonusGameAttemptRow {
  id: string;
  user_id: string;
  bonus_game_id: string;
  status: BonusGameAttemptStatus;
  state: BonusGameAttemptState;
  current_period: number;
  period_started_at: Date | null;
  break_started_at: Date | null;
  closed_at: Date | null;
  shots_taken: number;
  goals: number;
  attempt_seed: string;
  game_core_version: number;
  definition_revision: number;
  rules_snapshot: BonusRulesSnapshot;
  reward_snapshot: BonusRewardSnapshot;
  arena_theme_id_snapshot: string;
  arena_snapshot: BonusArenaSnapshot;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  created_at: Date;
  updated_at: Date;
}

export interface BonusGamePeriodLogRow {
  id: string;
  attempt_id: string;
  period_number: number;
  started_at: Date;
  ended_at: Date;
  shots_taken: number;
  goals: number;
  duration_ms: number;
  closed_reason: BonusPeriodClosedReason;
  created_at: Date;
}

export interface BonusGameEconomyEventRow {
  id: string;
  user_id: string;
  bonus_game_id: string;
  attempt_id: string | null;
  kind: BonusGameEconomyEventKind;
  coins_delta: number;
  stars_delta: number;
  experience_delta: number;
  coins_after: number;
  stars_after: number;
  experience_after: number;
  snapshot: BonusRewardSnapshot;
  created_at: Date;
}

export interface UserBonusGameUnlockRow {
  id: string;
  user_id: string;
  bonus_game_id: string;
  paid_price_stars: number;
  economy_event_id: string;
  unlocked_at: Date;
}

export interface UserBonusGameCompletionRow {
  id: string;
  user_id: string;
  bonus_game_id: string;
  attempt_id: string;
  reward_snapshot: BonusRewardSnapshot;
  completed_at: Date;
}

export interface UserArenaUnlockRow {
  id: string;
  user_id: string;
  arena_theme_id: string;
  source_type: 'bonus_game';
  source_bonus_game_id: string;
  source_completion_id: string;
  unlocked_at: Date;
}

export interface BonusArenaDTO extends BonusArenaSnapshot {}

export interface BonusGameDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  accessType: BonusGameAccessType;
  unlockPriceStars: number;
  targetGoals: number;
  totalPeriods: number;
  breakDurationMs: number;
  periods: BonusPeriodRule[];
  reward: BonusRewardSnapshot;
  goalkeeperReadyUrl: string;
  goalkeeperSaveUrl: string;
  arena: BonusArenaDTO;
  isUnlocked: boolean;
  isCompleted: boolean;
}

export interface BonusGameAttemptDTO {
  id: string;
  gameId: string;
  status: BonusGameAttemptStatus;
  state: BonusGameAttemptState;
  currentPeriod: number;
  periodStartedAt: string | null;
  breakStartedAt: string | null;
  closedAt: string | null;
  shotsTaken: number;
  currentPeriodShotsTaken: number;
  goals: number;
  rewardGranted: boolean;
  attemptSeed: string;
  gameCoreVersion: number;
  rules: BonusRulesSnapshot;
  reward: BonusRewardSnapshot;
}

const bonusPeriodRuleSchema = z
  .object({
    periodNumber: z.number().int().min(1).max(9),
    durationMs: z.number().int().min(1_000).max(10_800_000),
    shotsLimit: z.number().int().min(1).max(100),
    goalFrequency: z.number().min(0.1).max(3),
    goalieFrequency: z.number().min(0.1).max(3),
    shooterFrequency: z.number().min(0.1).max(3),
    puckSpeedPerMs: z.number().min(0.2).max(5),
    goaliePattern: z.enum(['linear', 'sine', 'dash']),
    goalieAmplitude: z.number().min(0).max(1),
    goalAmplitude: z.number().min(0).max(220),
  })
  .strict();

function assertTotalPeriods(totalPeriods: number): void {
  if (!Number.isInteger(totalPeriods) || totalPeriods < 1 || totalPeriods > 9) {
    throw new Error('total periods must be between 1 and 9');
  }
}

export function parseBonusPeriodRules(
  value: unknown,
  totalPeriods: number,
  targetGoals?: number,
): BonusPeriodRule[] {
  assertTotalPeriods(totalPeriods);

  const parsed = z.array(bonusPeriodRuleSchema).safeParse(value);
  if (!parsed.success) {
    throw new Error('invalid bonus period rules');
  }

  if (parsed.data.length !== totalPeriods) {
    throw new Error('bonus periods must be contiguous');
  }

  for (let index = 0; index < parsed.data.length; index += 1) {
    const rule = parsed.data[index];
    if (!rule || rule.periodNumber !== index + 1) {
      throw new Error('bonus periods must be contiguous');
    }
  }

  if (targetGoals !== undefined) {
    if (!Number.isInteger(targetGoals) || targetGoals < 1) {
      throw new Error('target goals must be a positive integer');
    }

    const totalShotsLimit = parsed.data.reduce((sum, rule) => sum + rule.shotsLimit, 0);
    if (targetGoals > totalShotsLimit) {
      throw new Error('target goals cannot exceed total shots limit');
    }
  }

  return parsed.data;
}

export function buildBonusGoalieConfig(
  slug: string,
  title: string,
  rule: BonusPeriodRule,
): GoalieConfig {
  return {
    id: `bonus:${slug}:p${rule.periodNumber}`,
    name: title,
    pattern: rule.goaliePattern,
    hp: 0,
    baseReward: 0,
    firstClearBonus: 0,
    speed: 0,
    amplitude: rule.goalieAmplitude,
    frequency: rule.goalieFrequency,
    goalAmplitude: rule.goalAmplitude,
    goalFrequency: rule.goalFrequency,
  };
}
