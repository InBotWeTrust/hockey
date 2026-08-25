import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  DEFAULT_DUEL_INVENTORY_TIMING,
  GAME_CORE_VERSION,
  SHOOTER_AMPLITUDE,
  STICK_NEUTRAL,
  getGoalie,
  getDuelPlayerCondition,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  type DailyPeriodSpeedPreset,
  type DuelInventoryItemSnapshot,
  type DuelInventoryLoadoutSnapshot,
  type DuelInventoryResourceUnit,
  type DuelInventoryTiming,
  type StickEffects,
} from '@hockey/game-core';
import { assertAdminUser } from '../../chat/channel.js';
import { invalidateUnreadCache } from '../../chat/cache.js';
import { publishMessageNew } from '../../chat/events.js';
import { findOrCreateDM, sendMessage } from '../../chat/service.js';
import { evaluateDuelSettledAchievements } from '../../achievements/engine.js';
import { AppError } from '../../plugins/errors.js';
import { enqueueDuelPush } from '../../push/duel.js';
import { appendEvent } from '../eventLog.js';
import { getGameSettings } from '../gameSettings.js';
import { deriveAmateurDuelSeed, deriveShotSeed } from '../seed.js';
import { resolveDuelVenue } from '../../arenas/service.js';
import type { MatchmakingVenuePolicy } from '../../arenas/types.js';
import {
  getDuelSettlementPolicy,
  releaseRemainingDuelInventoryReserve,
  type AmateurDuelSource,
} from './lifecycle.js';
import { settleTournamentSegmentForDuel } from '../../tournament/fixtureLifecycle.js';
import { lockTournamentForDuelMutation } from '../../tournament/locks.js';
import { publishTournamentFixtureProgress } from '../../tournament/realtimeProgress.js';

type MatchStatus = 'invited' | 'ready_check' | 'active' | 'settled' | 'cancelled' | 'expired';
type ParticipantState =
  | 'invited'
  | 'loadout_pending'
  | 'ready'
  | 'accepted'
  | 'period_active'
  | 'break_active'
  | 'completed'
  | 'forfeit';
type ParticipantSide = 'challenger' | 'opponent';
type DuelDifficulty = 'easy' | 'medium' | 'hard';
type DuelVariant = 'classic' | 'time_attack';
type DuelKind = 'express' | 'express_plus' | 'classic';
type DuelPeriodMode = 'quota' | 'time_attack';
type DuelOutcome = 'challenger_win' | 'opponent_win' | 'draw' | 'double_loss';
type DuelShotResult = 'goal' | 'save' | 'miss';
type InventoryKind = 'stick' | 'skates' | 'nutrition';

const TAP_TIME_FUTURE_TOLERANCE_MS = 2500;
const TAP_TIME_STALE_TOLERANCE_MS = 12_000;
const TAP_TIME_PAUSE_ALLOWANCE_PER_SHOT_MS = 2_000;
const MATCHMAKING_TIMEOUT_MS = 120_000;
const MAX_OPEN_DUEL_SLOTS = 5;
const DUEL_INTERMISSION_CONTINUE_GRACE_MS = 5 * 60_000;

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const duelKindSchema = z.enum(['express', 'express_plus', 'classic']);
const matchmakingVenuePolicySchema = z.enum([
  'neutral_default',
  'random_participant_home',
  'random_unselected',
]);
const duelInventoryResourceUnitSchema = z.enum(['period', 'shot', 'distance', 'energy_ms']);

const periodPresetSchema = z.object({
  periodNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  goalFrequency: z.number().min(0.1).max(3),
  goalieFrequency: z.number().min(0.1).max(3),
  shooterFrequency: z.number().min(0.1).max(3),
  puckSpeedPerMs: z.number().min(0.2).max(5),
});

const periodRuleSchema = z
  .object({
    periodNumber: z.number().int().min(1).max(9),
    mode: z.enum(['quota', 'time_attack']),
    durationMs: z.number().int().min(1000).max(10_800_000),
    shotsLimit: z.number().int().min(1).max(1000).nullable(),
  })
  .refine((rule) => (rule.mode === 'quota' ? rule.shotsLimit !== null : true), {
    message: 'quota period requires shotsLimit',
  });

const duelInventoryTimingSchema = z.object({
  stumbleIntervalMinRolls: z
    .number()
    .default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMinRolls),
  stumbleIntervalMaxRolls: z
    .number()
    .default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMaxRolls),
  stumbleIntervalMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMinMs),
  stumbleIntervalMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMaxMs),
  stumbleDurationMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleDurationMinMs),
  stumbleDurationMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleDurationMaxMs),
  stumbleOffsetMinPx: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleOffsetMinPx),
  stumbleOffsetMaxPx: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleOffsetMaxPx),
  stumbleRecoveryMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleRecoveryMinMs),
  stumbleRecoveryMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleRecoveryMaxMs),
  nutritionSlowdownMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.nutritionSlowdownMs),
  nutritionStopMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.nutritionStopMs),
  energyBaselineSpeed: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.energyBaselineSpeed),
  fatigueDelayMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueDelayMs),
  fatigueSpeedMultiplier: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSpeedMultiplier),
  fatigueGraceMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueGraceMs),
  fatigueSlowdownStartMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSlowdownStartMs),
  fatigueHeavySlowdownStartMs: z
    .number()
    .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueHeavySlowdownStartMs),
  fatigueStopStartMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueStopStartMs),
  fatigueStopDurationMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueStopDurationMs),
  fatigueAfterRestMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueAfterRestMs),
  fatigueSlowMultiplier: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSlowMultiplier),
  fatigueHeavyMultiplier: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueHeavyMultiplier),
});

const noInventoryTimingSchema = z
  .object({
    skates: duelInventoryTimingSchema.default(DEFAULT_DUEL_INVENTORY_TIMING),
    nutrition: duelInventoryTimingSchema.default(DEFAULT_DUEL_INVENTORY_TIMING),
  })
  .default({
    skates: DEFAULT_DUEL_INVENTORY_TIMING,
    nutrition: DEFAULT_DUEL_INVENTORY_TIMING,
  });

const shotBodySchema = z.object({
  shot_index: z.number().int().min(1),
  input: z.object({
    tapTime: z.number(),
    shooterTapTime: z.number().optional(),
    puckSpeedPerMs: z.number().optional(),
    shooterFrequency: z.number().optional(),
    goalieFrequency: z.number().optional(),
    goalFrequency: z.number().optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

const createTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  isActive: z.boolean().default(true),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('hard'),
  duelKind: z.enum(['express', 'express_plus', 'classic']).default('classic'),
  duelVariant: z.enum(['classic', 'time_attack']).default('classic'),
  rankedEnabled: z.boolean().default(true),
  matchmakingEnabled: z.boolean().default(true),
  matchmakingVenuePolicy: matchmakingVenuePolicySchema.default('neutral_default'),
  startsAt: isoDate,
  endsAt: isoDate,
  totalPeriods: z.number().int().min(1).max(9).default(3),
  shotsPerPeriod: z.number().int().min(1).max(100).default(30),
  periodDurationMs: z.number().int().min(1000).max(10_800_000).default(60_000),
  breakDurationMs: z.number().int().min(0).max(10_800_000).default(60_000),
  challengeTtlMs: z.number().int().min(1000).max(86_400_000).default(900_000),
  readyDurationMs: z.number().int().min(1000).max(86_400_000).default(900_000),
  readyNoShowCooldownMs: z.number().int().min(0).max(86_400_000).default(900_000),
  matchmakingTimeoutMs: z.number().int().min(1000).max(86_400_000).default(180_000),
  rankedDailyLimit: z.number().int().min(0).max(1000).default(100),
  rankedSameOpponentLimit: z.number().int().min(0).max(1000).default(100),
  powerCap: z.number().int().min(0).max(100_000).default(100),
  goalieId: z.string().trim().min(1).max(80).default('rookie'),
  periodSpeedPresets: z.array(periodPresetSchema).min(1).max(9),
  periodRules: z.array(periodRuleSchema).min(1).max(9).nullable().default(null),
  stakeAmount: z.number().int().min(0).max(9_000_000_000).default(0),
  entryFeeAmount: z.number().int().min(0).max(9_000_000_000).default(0),
  requiredInventoryItemId: uuid.nullable().default(null),
  inventoryChargesPerPeriod: z.number().int().min(0).max(1000).default(0),
  winPoints: z.number().int().min(0).max(1_000_000).default(3),
  drawPoints: z.number().int().min(0).max(1_000_000).default(1),
  winCurrencyReward: z.number().int().min(0).max(9_000_000_000).default(0),
  drawCurrencyReward: z.number().int().min(0).max(9_000_000_000).default(0),
  winStarReward: z.number().int().min(0).max(1_000_000).default(0),
});

const updateTemplateSchema = createTemplateSchema.partial().refine((value) => {
  return Object.keys(value).length > 0;
}, 'no changes');

const adminDuelHistoryQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  status: z
    .enum(['all', 'invited', 'ready_check', 'active', 'settled', 'cancelled', 'expired'])
    .default('all'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const seasonKeySchema = z.string().regex(/^\d{4}-\d{2}$/);

const duelHistoryQuerySchema = z.object({
  season_key: seasonKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const duelRatingQuerySchema = z.object({
  season_key: seasonKeySchema.optional(),
});

const matchmakingJoinSchema = z
  .object({
    template_id: uuid.optional(),
    duel_kinds: z.array(duelKindSchema).min(1).max(3).optional(),
  })
  .refine((value) => value.template_id !== undefined || value.duel_kinds !== undefined, {
    message: 'template_id or duel_kinds is required',
  });

const matchmakingLeaveSchema = z.object({ template_id: uuid.optional() }).optional();

const inventoryItemPatchSchema = z
  .object({
    itemKind: z.enum(['bundle', 'stick', 'skates', 'nutrition', 'consumable']).optional(),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
    currencyPrice: z.number().int().min(0).max(9_000_000_000).optional(),
    chargesPerPurchase: z.number().int().min(0).max(100_000).optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000_000).optional(),
    duelPeriodCost: z.number().int().min(0).max(100_000).optional(),
    powerScore: z.number().int().min(0).max(100_000).optional(),
    resourceUnit: duelInventoryResourceUnitSchema.optional(),
    effectPuckSpeedPoints: z.number().int().min(-500).max(500).optional(),
    effectPuckSpeedDelta: z.number().min(-5).max(5).optional(),
    effectShooterFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectGoalieFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectGoalFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectShotZoneMultiplier: z.number().min(1).max(5).optional(),
    effectRecoveryDelayMs: z.number().int().min(0).max(60_000).optional(),
    effectStumbleChance: z.number().min(0).max(1).optional(),
    effectStumbleMs: z.number().int().min(0).max(60_000).optional(),
    effectStumbleBlocksPerPeriod: z.number().int().min(0).max(1000).optional(),
    effectStumbleIntervalMinRolls: z.number().min(0).max(10_000).optional(),
    effectStumbleIntervalMaxRolls: z.number().min(0).max(10_000).optional(),
    effectStumbleIntervalMinMs: z.number().int().min(0).max(3_600_000).optional(),
    effectStumbleIntervalMaxMs: z.number().int().min(0).max(3_600_000).optional(),
    effectStumbleDurationMinMs: z.number().int().min(0).max(60_000).optional(),
    effectStumbleDurationMaxMs: z.number().int().min(0).max(60_000).optional(),
    effectStumbleOffsetMinPx: z.number().int().min(0).max(500).optional(),
    effectStumbleOffsetMaxPx: z.number().int().min(0).max(500).optional(),
    effectStumbleRecoveryMinMs: z.number().int().min(0).max(60_000).optional(),
    effectStumbleRecoveryMaxMs: z.number().int().min(0).max(60_000).optional(),
    effectEnergyBaselineSpeed: z.number().min(0.1).max(3).optional(),
    effectNutritionSlowdownMs: z.number().int().min(0).max(60_000).optional(),
    effectNutritionStopMs: z.number().int().min(0).max(60_000).optional(),
    effectFatigueDelayMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueSpeedMultiplier: z.number().min(0).max(1).optional(),
    effectFatigueGraceMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueSlowdownStartMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueHeavySlowdownStartMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueStopStartMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueStopDurationMs: z.number().int().min(0).max(60_000).optional(),
    effectFatigueAfterRestMs: z.number().int().min(0).max(600_000).optional(),
    effectFatigueSlowMultiplier: z.number().min(0).max(1).optional(),
    effectFatigueHeavyMultiplier: z.number().min(0).max(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'no changes');

const loadoutSchema = z
  .object({
    stick: uuid.nullable().optional(),
    skates: uuid.nullable().optional(),
    nutrition: uuid.nullable().optional(),
  })
  .default({});

const readyBodySchema = z.object({
  loadout: loadoutSchema,
});

const startPeriodBodySchema = z
  .object({
    loadout: loadoutSchema.optional(),
  })
  .default({});

const activeLoadoutBodySchema = z.object({
  loadout: z.object({
    stick: uuid.nullable(),
  }),
});

interface DuelTemplateRow {
  id: string;
  title: string;
  description: string;
  is_active: boolean;
  difficulty: DuelDifficulty;
  duel_kind: DuelKind;
  duel_variant: DuelVariant;
  ranked_enabled: boolean;
  matchmaking_enabled: boolean;
  matchmaking_venue_policy: MatchmakingVenuePolicy;
  starts_at: Date;
  ends_at: Date;
  total_periods: number;
  shots_per_period: number;
  period_duration_ms: number;
  break_duration_ms: number;
  challenge_ttl_ms: number;
  ready_duration_ms: number;
  ready_no_show_cooldown_ms: number;
  matchmaking_timeout_ms: number;
  ranked_daily_limit: number;
  ranked_same_opponent_limit: number;
  power_cap: number;
  goalie_id: string;
  period_speed_presets: unknown;
  period_rules: unknown | null;
  stake_amount: number;
  entry_fee_amount: number;
  required_inventory_item_id: string | null;
  inventory_charges_per_period: number;
  win_points: number;
  draw_points: number;
  win_currency_reward: number;
  draw_currency_reward: number;
  win_star_reward: number;
  created_at: Date;
  updated_at: Date;
}

interface DuelMatchRow {
  id: string;
  template_id: string | null;
  challenger_user_id: string;
  opponent_user_id: string;
  status: MatchStatus;
  source: AmateurDuelSource;
  ranked: boolean;
  season_key: string;
  duel_kind: DuelKind;
  rules_snapshot: unknown;
  match_seed: string;
  home_user_id: string | null;
  arena_theme_id: string | null;
  arena_snapshot: unknown | null;
  venue_policy: MatchmakingVenuePolicy | 'direct_challenge' | null;
  starts_at: Date;
  ends_at: Date;
  ready_expires_at: Date | null;
  cooldown_user_id: string | null;
  cooldown_until: Date | null;
  stake_amount: number;
  entry_fee_amount: number;
  bank_amount: number;
  winner_user_id: string | null;
  outcome: DuelOutcome | null;
  settled_reason: string | null;
  game_core_version: number;
  accepted_at: Date | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  challenger_name?: string;
  opponent_name?: string;
  challenger_avatar_url?: string | null;
  opponent_avatar_url?: string | null;
}

interface ReconciledMatch {
  match: DuelMatchRow;
  changed: boolean;
}

interface DuelPeriodRule {
  periodNumber: number;
  mode: DuelPeriodMode;
  durationMs: number;
  shotsLimit: number | null;
}

interface DuelParticipantRow {
  match_id: string;
  user_id: string;
  side: ParticipantSide;
  state: ParticipantState;
  ready_at: Date | null;
  loadout_snapshot: unknown;
  current_period: number;
  period_started_at: Date | null;
  break_started_at: Date | null;
  completed_at: Date | null;
  shots_taken: number;
  goals: number;
  active_duration_ms: number;
  stake_reserved: number;
  entry_fee_paid: number;
  reserved_inventory_item_id: string | null;
  reserved_inventory_charges: number;
  consumed_inventory_charges: number;
  inventory_effects_snapshot: unknown;
  inventory_report: unknown;
  result_points: number;
  experience_snapshot: number;
}

interface PeriodLogRow {
  period_number: number;
  shots_taken: number;
  goals: number;
  duration_ms: number;
  closed_reason: 'quota' | 'timeout' | 'window_end';
  ended_at: Date;
}

interface InventoryItemEffects {
  puckSpeedPoints: number;
  puckSpeedDelta: number;
  shooterFrequencyDelta: number;
  goalieFrequencyDelta: number;
  goalFrequencyDelta: number;
  shotZoneMultiplier: number;
  recoveryDelayMs: number;
  stumbleChance: number;
  stumbleMs: number;
  stumbleBlocksPerPeriod: number;
  stumbleIntervalMinRolls: number;
  stumbleIntervalMaxRolls: number;
  stumbleIntervalMinMs: number;
  stumbleIntervalMaxMs: number;
  stumbleDurationMinMs: number;
  stumbleDurationMaxMs: number;
  stumbleOffsetMinPx: number;
  stumbleOffsetMaxPx: number;
  stumbleRecoveryMinMs: number;
  stumbleRecoveryMaxMs: number;
  nutritionSlowdownMs: number;
  nutritionStopMs: number;
  energyBaselineSpeed: number;
  fatigueDelayMs: number;
  fatigueSpeedMultiplier: number;
  fatigueGraceMs: number;
  fatigueSlowdownStartMs: number;
  fatigueHeavySlowdownStartMs: number;
  fatigueStopStartMs: number;
  fatigueStopDurationMs: number;
  fatigueAfterRestMs: number;
  fatigueSlowMultiplier: number;
  fatigueHeavyMultiplier: number;
}

interface LoadoutSelection {
  stick?: string | null | undefined;
  skates?: string | null | undefined;
  nutrition?: string | null | undefined;
}

interface LoadoutItemSnapshot {
  id: string;
  itemId: string;
  instanceId: string | null;
  kind: InventoryKind;
  title: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  chargesReserved: number;
  resourceUnit: DuelInventoryResourceUnit;
  resourceAvailable: number;
  lowStockThreshold: number;
  effectPuckSpeedPoints: number;
  timing: DuelInventoryTiming;
  effects: InventoryItemEffects;
}

interface LoadoutSnapshot {
  items: LoadoutItemSnapshot[];
  powerScore: number;
  powerCap: number;
}

interface InventoryAvailabilityItem {
  id: string;
  itemId: string;
  instanceId: string | null;
  kind: InventoryKind;
  title: string;
  description: string;
  imageUrl: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  resourceUnit: DuelInventoryResourceUnit;
  lowStockThreshold: number;
  chargesAvailable: number;
  chargesReserved: number;
}

interface InventoryPeriodReport {
  periodNumber: number;
  consumed: Array<{
    id: string;
    itemId?: string;
    instanceId?: string | null;
    kind: InventoryKind;
    title: string;
    charges: number;
    remainingReserved: number;
  }>;
}

interface DuelRulesSnapshot {
  templateId: string;
  title: string;
  description: string;
  difficulty: DuelDifficulty;
  duelKind: DuelKind;
  duelVariant: DuelVariant;
  rankedEnabled: boolean;
  matchmakingEnabled: boolean;
  matchmakingVenuePolicy: MatchmakingVenuePolicy;
  totalPeriods: number;
  shotsPerPeriod: number;
  periodDurationMs: number;
  breakDurationMs: number;
  periodRules: DuelPeriodRule[];
  challengeTtlMs: number;
  readyDurationMs: number;
  readyNoShowCooldownMs: number;
  matchmakingTimeoutMs: number;
  rankedDailyLimit: number;
  rankedSameOpponentLimit: number;
  powerCap: number;
  goalieId: string;
  periodSpeedPresets: DailyPeriodSpeedPreset[];
  noInventoryTiming: {
    skates: DuelInventoryTiming;
    nutrition: DuelInventoryTiming;
  };
  stakeAmount: number;
  entryFeeAmount: number;
  requiredInventoryItemId: string | null;
  inventoryChargesPerPeriod: number;
  winPoints: number;
  drawPoints: number;
  winCurrencyReward: number;
  drawCurrencyReward: number;
  winStarReward: number;
}

interface DuelParticipantDTO {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  side: ParticipantSide;
  state: ParticipantState;
  current_period: number;
  shots_taken: number;
  goals: number;
  accuracy: number;
  active_duration_ms: number;
  active_duration_seconds: number;
  result_points: number;
  current_period_shots: number;
  current_period_goals: number;
  ready_at: string | null;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_ends_at: string | null;
  loadout: LoadoutSnapshot;
  inventory_available: InventoryAvailabilityItem[];
  inventory_report: InventoryPeriodReport[];
}

interface DuelMatchDTO {
  id: string;
  template_id: string | null;
  status: MatchStatus;
  source: AmateurDuelSource;
  ranked: boolean;
  season_key: string;
  duel_kind: DuelKind;
  home_user_id: string | null;
  venue_policy: MatchmakingVenuePolicy | 'direct_challenge';
  arena: {
    id: string;
    slug: string;
    title: string;
    artwork_url: string;
    thumbnail_url: string;
  };
  starts_at: string;
  ends_at: string;
  ready_expires_at: string | null;
  cooldown_user_id: string | null;
  cooldown_until: string | null;
  stake_amount: number;
  entry_fee_amount: number;
  bank_amount: number;
  winner_user_id: string | null;
  outcome: DuelOutcome | null;
  settled_reason: string | null;
  accepted_at: string | null;
  settled_at: string | null;
  created_at: string;
  server_now: string;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_ends_at: string | null;
  rules: DuelRulesSnapshot;
  me: DuelParticipantDTO;
  opponent: DuelParticipantDTO;
}

interface DuelMatchStateDTO extends DuelMatchDTO {
  match_seed: string | null;
  current_period_shots: number;
  current_period_goals: number;
  period_speed_presets: DailyPeriodSpeedPreset[];
  stick_effects: StickEffects;
  recent_periods: Array<{
    period_number: number;
    shots_taken: number;
    goals: number;
    duration_ms: number;
    closed_reason: 'quota' | 'timeout' | 'window_end';
    ended_at: string;
  }>;
  opponent_recent_periods: Array<{
    period_number: number;
    shots_taken: number;
    goals: number;
    duration_ms: number;
    closed_reason: 'quota' | 'timeout' | 'window_end';
    ended_at: string;
  }>;
}

interface RatingRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  matches_played: number;
  active_duration_seconds: number;
}

interface AmateurDuelInviteMessageMetadata extends Record<string, unknown> {
  type: 'amateur_duel_invite';
  matchId: string;
  templateTitle: string;
  challengerName: string;
  startsAt: string;
  endsAt: string;
  totalPeriods: number;
  shotsPerPeriod: number;
  periodDurationMs: number;
  breakDurationMs: number;
  stakeAmount: number;
  entryFeeAmount: number;
  bankAmount: number;
}

function numberFromUnknown(value: unknown, fallback = 0): number {
  const raw = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(raw) ? raw : fallback;
}

function puckSpeedPointsFromValues(points: unknown, delta: unknown): number {
  const rawPoints = numberFromUnknown(points);
  if (rawPoints !== 0) return Math.round(rawPoints);
  const rawDelta = numberFromUnknown(delta);
  return rawDelta !== 0 ? Math.round(rawDelta * 100) : 0;
}

function parsePeriodSpeedPresets(value: unknown): DailyPeriodSpeedPreset[] {
  const parsed = z.array(periodPresetSchema).safeParse(value);
  if (!parsed.success) {
    throw new AppError('server_error', 'invalid duel speed preset snapshot', 500);
  }
  return parsed.data.map((preset) => ({
    periodNumber: preset.periodNumber,
    goalFrequency: preset.goalFrequency,
    goalieFrequency: preset.goalieFrequency,
    shooterFrequency: preset.shooterFrequency,
    puckSpeedPerMs: preset.puckSpeedPerMs,
  }));
}

function effectsFromUnknown(value: unknown): InventoryItemEffects {
  const parsed = z
    .object({
      puckSpeedPoints: z.number().default(0),
      puckSpeedDelta: z.number().default(0),
      shooterFrequencyDelta: z.number().default(0),
      goalieFrequencyDelta: z.number().default(0),
      goalFrequencyDelta: z.number().default(0),
      shotZoneMultiplier: z.number().min(1).default(1),
      recoveryDelayMs: z.number().default(0),
      stumbleChance: z.number().default(0),
      stumbleMs: z.number().default(0),
      stumbleBlocksPerPeriod: z.number().default(0),
      stumbleIntervalMinRolls: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMinRolls),
      stumbleIntervalMaxRolls: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMaxRolls),
      stumbleIntervalMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMinMs),
      stumbleIntervalMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleIntervalMaxMs),
      stumbleDurationMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleDurationMinMs),
      stumbleDurationMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleDurationMaxMs),
      stumbleOffsetMinPx: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleOffsetMinPx),
      stumbleOffsetMaxPx: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleOffsetMaxPx),
      stumbleRecoveryMinMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleRecoveryMinMs),
      stumbleRecoveryMaxMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.stumbleRecoveryMaxMs),
      nutritionSlowdownMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.nutritionSlowdownMs),
      nutritionStopMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.nutritionStopMs),
      energyBaselineSpeed: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.energyBaselineSpeed),
      fatigueDelayMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueDelayMs),
      fatigueSpeedMultiplier: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSpeedMultiplier),
      fatigueGraceMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueGraceMs),
      fatigueSlowdownStartMs: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSlowdownStartMs),
      fatigueHeavySlowdownStartMs: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueHeavySlowdownStartMs),
      fatigueStopStartMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueStopStartMs),
      fatigueStopDurationMs: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueStopDurationMs),
      fatigueAfterRestMs: z.number().default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueAfterRestMs),
      fatigueSlowMultiplier: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueSlowMultiplier),
      fatigueHeavyMultiplier: z
        .number()
        .default(DEFAULT_DUEL_INVENTORY_TIMING.fatigueHeavyMultiplier),
    })
    .safeParse(value ?? {});
  if (!parsed.success) {
    return {
      puckSpeedPoints: 0,
      puckSpeedDelta: 0,
      shooterFrequencyDelta: 0,
      goalieFrequencyDelta: 0,
      goalFrequencyDelta: 0,
      shotZoneMultiplier: 1,
      recoveryDelayMs: 0,
      stumbleChance: 0,
      stumbleMs: 0,
      stumbleBlocksPerPeriod: 0,
      ...DEFAULT_DUEL_INVENTORY_TIMING,
    };
  }
  return parsed.data;
}

function emptyLoadout(powerCap = 0): LoadoutSnapshot {
  return { items: [], powerScore: 0, powerCap };
}

function loadoutFromUnknown(value: unknown, powerCap = 0): LoadoutSnapshot {
  const parsed = z
    .object({
      items: z
        .array(
          z.object({
            id: uuid,
            itemId: uuid.optional(),
            instanceId: uuid.nullable().optional(),
            kind: z.enum(['stick', 'skates', 'nutrition']),
            title: z.string(),
            rarity: z.enum(['common', 'rare', 'epic', 'legendary']).default('common'),
            powerScore: z.number().int().min(0).default(0),
            duelPeriodCost: z.number().int().min(0).default(0),
            chargesReserved: z.number().int().min(0).default(0),
            resourceUnit: duelInventoryResourceUnitSchema.default('period'),
            resourceAvailable: z.number().int().min(0).default(0),
            lowStockThreshold: z.number().int().min(0).default(0),
            effectPuckSpeedPoints: z.number().int().default(0),
            timing: duelInventoryTimingSchema.default(DEFAULT_DUEL_INVENTORY_TIMING),
            effects: z.unknown().optional(),
          }),
        )
        .default([]),
      powerScore: z.number().int().min(0).default(0),
      powerCap: z.number().int().min(0).default(powerCap),
    })
    .safeParse(value ?? {});
  if (!parsed.success) return emptyLoadout(powerCap);
  return {
    items: parsed.data.items.map((item) => {
      const effects = effectsFromUnknown(item.effects);
      const resourceUnit =
        item.kind === 'stick' && item.resourceUnit === 'period' ? 'shot' : item.resourceUnit;
      return {
        ...item,
        itemId: item.itemId ?? item.id,
        instanceId: item.instanceId ?? null,
        resourceUnit,
        effectPuckSpeedPoints: puckSpeedPointsFromValues(
          item.effectPuckSpeedPoints,
          effects.puckSpeedDelta,
        ),
        timing: { ...DEFAULT_DUEL_INVENTORY_TIMING, ...item.timing },
        effects,
      };
    }),
    powerScore: parsed.data.powerScore,
    powerCap: parsed.data.powerCap,
  };
}

function inventoryReportFromUnknown(value: unknown): InventoryPeriodReport[] {
  const parsed = z
    .array(
      z.object({
        periodNumber: z.number().int().min(1),
        consumed: z.array(
          z.object({
            id: uuid,
            itemId: uuid.optional(),
            instanceId: uuid.nullable().optional(),
            kind: z.enum(['stick', 'skates', 'nutrition']),
            title: z.string(),
            charges: z.number().min(0),
            remainingReserved: z.number().min(0),
          }),
        ),
      }),
    )
    .safeParse(value ?? []);
  if (!parsed.success) return [];
  return parsed.data.map((entry) => ({
    periodNumber: entry.periodNumber,
    consumed: entry.consumed.map((item) => ({
      id: item.id,
      ...(item.itemId !== undefined ? { itemId: item.itemId } : {}),
      ...(item.instanceId !== undefined ? { instanceId: item.instanceId } : {}),
      kind: item.kind,
      title: item.title,
      charges: item.charges,
      remainingReserved: item.remainingReserved,
    })),
  }));
}

function duelInventoryItemFromSnapshot(
  item: LoadoutItemSnapshot | undefined,
  resourceAvailableOverride?: number,
): DuelInventoryItemSnapshot | null {
  if (!item || item.resourceUnit === 'period') return null;
  return {
    id: item.id,
    title: item.title,
    resourceUnit: item.resourceUnit,
    resourceAvailable: Math.max(0, resourceAvailableOverride ?? item.resourceAvailable),
    effectPuckSpeedPoints: item.effectPuckSpeedPoints,
    timing: item.timing,
  };
}

function consumedForPeriodItem(
  report: InventoryPeriodReport[],
  periodNumber: number,
  itemId: string,
): number {
  return report
    .filter((entry) => entry.periodNumber === periodNumber)
    .flatMap((entry) => entry.consumed)
    .filter((entry) => entry.id === itemId)
    .reduce((sum, entry) => sum + entry.charges, 0);
}

function consumedBeforePeriodItem(
  report: InventoryPeriodReport[],
  periodNumber: number,
  itemId: string,
): number {
  return report
    .filter((entry) => entry.periodNumber < periodNumber)
    .flatMap((entry) => entry.consumed)
    .filter((entry) => entry.id === itemId)
    .reduce((sum, entry) => sum + entry.charges, 0);
}

function consumedForItem(report: InventoryPeriodReport[], itemId: string): number {
  return report
    .flatMap((entry) => entry.consumed)
    .filter((entry) => entry.id === itemId)
    .reduce((sum, entry) => sum + entry.charges, 0);
}

function conditionLoadoutFromSnapshot(
  loadout: LoadoutSnapshot,
  report: InventoryPeriodReport[],
  periodNumber: number,
  rules: DuelRulesSnapshot,
): DuelInventoryLoadoutSnapshot {
  const stick = loadout.items.find((item) => item.kind === 'stick');
  const skates = loadout.items.find((item) => item.kind === 'skates');
  const nutrition = loadout.items.find((item) => item.kind === 'nutrition');
  const stickConsumed = stick ? consumedForItem(report, stick.id) : 0;
  const skatesConsumedBeforePeriod = skates
    ? consumedBeforePeriodItem(report, periodNumber, skates.id)
    : 0;
  const nutritionConsumedBeforePeriod = nutrition
    ? consumedBeforePeriodItem(report, periodNumber, nutrition.id)
    : 0;
  return {
    stick: duelInventoryItemFromSnapshot(
      stick,
      Math.max(0, (stick?.resourceAvailable ?? 0) - stickConsumed),
    ),
    skates: duelInventoryItemFromSnapshot(
      skates,
      Math.max(0, (skates?.resourceAvailable ?? 0) - skatesConsumedBeforePeriod),
    ),
    nutrition: duelInventoryItemFromSnapshot(
      nutrition,
      Math.max(0, (nutrition?.resourceAvailable ?? 0) - nutritionConsumedBeforePeriod),
    ),
    fallbackSkatesTiming: rules.noInventoryTiming.skates,
    fallbackNutritionTiming: rules.noInventoryTiming.nutrition,
  };
}

function movementDistancePxForElapsed(elapsedMs: number, shooterFrequency: number): number {
  const safeElapsed = Math.max(0, elapsedMs);
  const safeFrequency = Math.max(0, shooterFrequency);
  return (safeElapsed * SHOOTER_AMPLITUDE * 4 * safeFrequency) / 1000;
}

function roundInventoryCharge(value: number): number {
  return Number(value.toFixed(4));
}

function combineEffects(items: LoadoutItemSnapshot[]): InventoryItemEffects {
  return items.reduce<InventoryItemEffects>(
    (acc, item) => ({
      ...acc,
      puckSpeedPoints: acc.puckSpeedPoints + item.effects.puckSpeedPoints,
      puckSpeedDelta: acc.puckSpeedDelta + item.effects.puckSpeedDelta,
      shooterFrequencyDelta: acc.shooterFrequencyDelta + item.effects.shooterFrequencyDelta,
      goalieFrequencyDelta: acc.goalieFrequencyDelta + item.effects.goalieFrequencyDelta,
      goalFrequencyDelta: acc.goalFrequencyDelta + item.effects.goalFrequencyDelta,
      shotZoneMultiplier: Math.max(acc.shotZoneMultiplier, item.effects.shotZoneMultiplier),
      recoveryDelayMs: acc.recoveryDelayMs + item.effects.recoveryDelayMs,
      stumbleChance: acc.stumbleChance + item.effects.stumbleChance,
      stumbleMs: acc.stumbleMs + item.effects.stumbleMs,
      stumbleBlocksPerPeriod: acc.stumbleBlocksPerPeriod + item.effects.stumbleBlocksPerPeriod,
      stumbleIntervalMinMs: Math.min(acc.stumbleIntervalMinMs, item.effects.stumbleIntervalMinMs),
      stumbleIntervalMaxMs: Math.max(acc.stumbleIntervalMaxMs, item.effects.stumbleIntervalMaxMs),
      stumbleDurationMinMs: Math.min(acc.stumbleDurationMinMs, item.effects.stumbleDurationMinMs),
      stumbleDurationMaxMs: Math.max(acc.stumbleDurationMaxMs, item.effects.stumbleDurationMaxMs),
      nutritionSlowdownMs: Math.max(acc.nutritionSlowdownMs, item.effects.nutritionSlowdownMs),
      nutritionStopMs: Math.max(acc.nutritionStopMs, item.effects.nutritionStopMs),
      fatigueDelayMs: Math.max(acc.fatigueDelayMs, item.effects.fatigueDelayMs),
      fatigueSpeedMultiplier: Math.min(
        acc.fatigueSpeedMultiplier,
        item.effects.fatigueSpeedMultiplier,
      ),
    }),
    effectsFromUnknown(null),
  );
}

function periodSpeedEffectsForLoadout(
  effects: InventoryItemEffects,
  loadout: LoadoutSnapshot,
): InventoryItemEffects {
  const shotResourcePuckSpeedDelta = loadout.items
    .filter((item) => item.resourceUnit === 'shot')
    .reduce((sum, item) => sum + item.effects.puckSpeedDelta, 0);
  return {
    ...effects,
    puckSpeedDelta: effects.puckSpeedDelta - shotResourcePuckSpeedDelta,
  };
}

function makeRulesSnapshot(
  template: DuelTemplateRow,
  settings: { amateur: { noInventoryTiming: DuelRulesSnapshot['noInventoryTiming'] } },
): DuelRulesSnapshot {
  const startsAt = template.starts_at.getTime();
  const endsAt = template.ends_at.getTime();
  if (!(startsAt < endsAt)) {
    throw new AppError('bad_request', 'duel template window is invalid', 400);
  }
  const totalPeriods = Number(template.total_periods);
  const presets = parsePeriodSpeedPresets(template.period_speed_presets);
  for (let period = 1; period <= totalPeriods; period += 1) {
    if (!presets.some((preset) => preset.periodNumber === period)) {
      throw new AppError('bad_request', `missing speed preset for period ${period}`, 400);
    }
  }
  const periodRules = parseTemplatePeriodRules(template.period_rules, {
    duelKind: template.duel_kind,
    totalPeriods,
    shotsPerPeriod: Number(template.shots_per_period),
    periodDurationMs: Number(template.period_duration_ms),
  });
  return {
    templateId: template.id,
    title: template.title,
    description: template.description,
    difficulty: template.difficulty,
    duelKind: template.duel_kind,
    duelVariant: template.duel_variant,
    rankedEnabled: template.ranked_enabled,
    matchmakingEnabled: template.matchmaking_enabled,
    matchmakingVenuePolicy: template.matchmaking_venue_policy,
    totalPeriods,
    shotsPerPeriod: Number(template.shots_per_period),
    periodDurationMs: Number(template.period_duration_ms),
    breakDurationMs: Number(template.break_duration_ms),
    periodRules,
    challengeTtlMs: Number(template.challenge_ttl_ms),
    readyDurationMs: Number(template.ready_duration_ms),
    readyNoShowCooldownMs: Number(template.ready_no_show_cooldown_ms),
    matchmakingTimeoutMs: Number(template.matchmaking_timeout_ms),
    rankedDailyLimit: Number(template.ranked_daily_limit),
    rankedSameOpponentLimit: Number(template.ranked_same_opponent_limit),
    powerCap: Number(template.power_cap),
    goalieId: template.goalie_id,
    periodSpeedPresets: presets,
    noInventoryTiming: settings.amateur.noInventoryTiming,
    stakeAmount: 0,
    entryFeeAmount: 0,
    requiredInventoryItemId: template.required_inventory_item_id,
    inventoryChargesPerPeriod: Number(template.inventory_charges_per_period),
    winPoints: Number(template.win_points),
    drawPoints: Number(template.draw_points),
    winCurrencyReward: Number(template.win_currency_reward),
    drawCurrencyReward: Number(template.draw_currency_reward),
    winStarReward: Number(template.win_star_reward),
  };
}

function defaultPeriodRules({
  duelKind,
  totalPeriods,
  shotsPerPeriod,
  periodDurationMs,
}: {
  duelKind: DuelKind;
  totalPeriods: number;
  shotsPerPeriod: number;
  periodDurationMs: number;
}): DuelPeriodRule[] {
  if (duelKind === 'express') {
    return [{ periodNumber: 1, mode: 'time_attack', durationMs: 180_000, shotsLimit: null }];
  }
  if (duelKind === 'express_plus') {
    return [
      { periodNumber: 1, mode: 'quota', durationMs: 180_000, shotsLimit: 30 },
      { periodNumber: 2, mode: 'time_attack', durationMs: 180_000, shotsLimit: null },
    ];
  }
  return Array.from({ length: totalPeriods }, (_, index) => ({
    periodNumber: index + 1,
    mode: 'quota' as const,
    durationMs: periodDurationMs,
    shotsLimit: shotsPerPeriod,
  }));
}

function parseTemplatePeriodRules(
  value: unknown,
  fallback: {
    duelKind: DuelKind;
    totalPeriods: number;
    shotsPerPeriod: number;
    periodDurationMs: number;
  },
): DuelPeriodRule[] {
  if (value === null || value === undefined) return defaultPeriodRules(fallback);
  const parsed = z.array(periodRuleSchema).min(1).max(9).safeParse(value);
  if (!parsed.success) throw new AppError('bad_request', 'invalid duel period rules', 400);
  const sorted = [...parsed.data].sort((a, b) => a.periodNumber - b.periodNumber);
  sorted.forEach((rule, index) => {
    if (rule.periodNumber !== index + 1) {
      throw new AppError('bad_request', 'duel period rules must be sequential', 400);
    }
  });
  return sorted;
}

function parseRulesSnapshot(value: unknown): DuelRulesSnapshot {
  const parsed = z
    .object({
      templateId: uuid,
      title: z.string(),
      description: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']).default('hard'),
      duelKind: z.enum(['express', 'express_plus', 'classic']).default('classic'),
      duelVariant: z.enum(['classic', 'time_attack']).default('classic'),
      rankedEnabled: z.boolean().default(true),
      matchmakingEnabled: z.boolean().default(true),
      matchmakingVenuePolicy: matchmakingVenuePolicySchema.default('neutral_default'),
      totalPeriods: z.number().int().min(1).max(9),
      shotsPerPeriod: z.number().int().min(1).max(100),
      periodDurationMs: z.number().int().min(1000).max(10_800_000),
      breakDurationMs: z.number().int().min(0).max(10_800_000),
      periodRules: z.array(periodRuleSchema).min(1).max(9).optional(),
      challengeTtlMs: z.number().int().min(1000).default(900_000),
      readyDurationMs: z.number().int().min(1000).default(900_000),
      readyNoShowCooldownMs: z.number().int().min(0).default(900_000),
      matchmakingTimeoutMs: z.number().int().min(1000).default(180_000),
      rankedDailyLimit: z.number().int().min(0).default(100),
      rankedSameOpponentLimit: z.number().int().min(0).default(100),
      powerCap: z.number().int().min(0).default(100),
      goalieId: z.string(),
      periodSpeedPresets: z.array(periodPresetSchema).min(1).max(9),
      noInventoryTiming: noInventoryTimingSchema,
      stakeAmount: z.number().int().min(0),
      entryFeeAmount: z.number().int().min(0),
      requiredInventoryItemId: uuid.nullable(),
      inventoryChargesPerPeriod: z.number().int().min(0),
      winPoints: z.number().int().min(0).default(3),
      drawPoints: z.number().int().min(0).default(1),
      winCurrencyReward: z.number().int().min(0).default(0),
      drawCurrencyReward: z.number().int().min(0).default(0),
      winStarReward: z.number().int().min(0).default(0),
    })
    .safeParse(value);
  if (!parsed.success) {
    throw new AppError('server_error', 'invalid duel rules snapshot', 500);
  }
  return {
    ...parsed.data,
    periodRules:
      parsed.data.periodRules ??
      defaultPeriodRules({
        duelKind: parsed.data.duelKind,
        totalPeriods: parsed.data.totalPeriods,
        shotsPerPeriod: parsed.data.shotsPerPeriod,
        periodDurationMs: parsed.data.periodDurationMs,
      }),
  };
}

function deterministicUnitFromSeed(seed: string, label: string): number {
  const prefix = createHash('sha256').update(`${seed}:${label}`).digest('hex').slice(0, 8);
  return Number.parseInt(prefix, 16) / 0xffffffff;
}

function arenaDtoFromSnapshot(snapshot: unknown): DuelMatchDTO['arena'] {
  const parsed = z
    .object({
      id: uuid,
      slug: z.string(),
      title: z.string(),
      artworkUrl: z.string(),
      thumbnailUrl: z.string(),
    })
    .safeParse(snapshot);
  if (!parsed.success) {
    throw new AppError('server_error', 'invalid duel arena snapshot', 500);
  }
  return {
    id: parsed.data.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    artwork_url: parsed.data.artworkUrl,
    thumbnail_url: parsed.data.thumbnailUrl,
  };
}

async function materializeLegacyVenueSnapshot(
  client: PoolClient,
  match: DuelMatchRow,
): Promise<DuelMatchRow> {
  if (
    match.arena_theme_id !== null &&
    match.arena_snapshot !== null &&
    match.venue_policy !== null
  ) {
    return match;
  }
  const { rows } = await client.query<{
    id: string;
    slug: string;
    title: string;
    artwork_url: string;
    thumbnail_url: string;
  }>(
    `select id, slug, title, artwork_url, thumbnail_url
       from arena_theme
      where slug = 'default'
      limit 1`,
  );
  const arena = rows[0];
  if (arena === undefined) {
    throw new AppError('arena_unavailable', 'home arena is unavailable', 503);
  }
  await client.query(
    `update amateur_duel_match
        set home_user_id = null,
            arena_theme_id = $2,
            arena_snapshot = $3::jsonb,
            venue_policy = 'neutral_default'
      where id = $1
        and (arena_theme_id is null or arena_snapshot is null or venue_policy is null)`,
    [
      match.id,
      arena.id,
      JSON.stringify({
        id: arena.id,
        slug: arena.slug,
        title: arena.title,
        artworkUrl: arena.artwork_url,
        thumbnailUrl: arena.thumbnail_url,
      }),
    ],
  );
  return fetchMatchForUpdate(client, match.id);
}

function getDuelPeriodRule(rules: DuelRulesSnapshot, periodNumber: number): DuelPeriodRule {
  return (
    rules.periodRules.find((rule) => rule.periodNumber === periodNumber) ?? {
      periodNumber,
      mode: rules.duelVariant === 'time_attack' ? 'time_attack' : 'quota',
      durationMs: rules.periodDurationMs,
      shotsLimit: rules.duelVariant === 'time_attack' ? null : rules.shotsPerPeriod,
    }
  );
}

function estimateDuelPlayWindowMs(rules: DuelRulesSnapshot): number {
  const periodDurationMs = Array.from({ length: rules.totalPeriods }, (_, index) =>
    getDuelPeriodRule(rules, index + 1),
  ).reduce((sum, rule) => sum + rule.durationMs, 0);
  const breakDurationMs = Math.max(0, rules.totalPeriods - 1) * rules.breakDurationMs;
  const continueGraceMs = Math.max(0, rules.totalPeriods - 1) * DUEL_INTERMISSION_CONTINUE_GRACE_MS;
  return Math.max(rules.readyDurationMs, periodDurationMs + breakDurationMs + continueGraceMs);
}

function clampSpeed(value: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, value)).toFixed(4));
}

function effectivePeriodSpeedPresets(
  rules: DuelRulesSnapshot,
  effects: InventoryItemEffects,
): DailyPeriodSpeedPreset[] {
  return rules.periodSpeedPresets.map((preset) => ({
    periodNumber: preset.periodNumber,
    goalFrequency: clampSpeed(preset.goalFrequency + effects.goalFrequencyDelta, 0.1, 3),
    goalieFrequency: clampSpeed(preset.goalieFrequency + effects.goalieFrequencyDelta, 0.1, 3),
    shooterFrequency: clampSpeed(preset.shooterFrequency + effects.shooterFrequencyDelta, 0.1, 3),
    puckSpeedPerMs: clampSpeed(preset.puckSpeedPerMs + effects.puckSpeedDelta, 0.2, 5),
  }));
}

function stickEffectsFromInventory(effects: InventoryItemEffects): StickEffects {
  return {
    ...STICK_NEUTRAL,
    shotZoneMultiplier: Math.max(1, effects.shotZoneMultiplier),
  };
}

function durationSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}

async function withTransaction<T>(
  app: { pg: { connect: () => Promise<PoolClient> } },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchTemplate(client: PoolClient, templateId: string): Promise<DuelTemplateRow> {
  const { rows } = await client.query<DuelTemplateRow>(
    `select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
            matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
            period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
            ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
            ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
            stake_amount, entry_fee_amount, required_inventory_item_id,
            inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
            win_star_reward, created_at, updated_at
       from amateur_duel_template
      where id = $1 and deleted_at is null`,
    [templateId],
  );
  const template = rows[0];
  if (!template) throw new AppError('not_found', 'duel template not found', 404);
  return template;
}

async function assertAmateurEligible(client: PoolClient, userId: string): Promise<void> {
  const settings = await getGameSettings(client);
  const { rows } = await client.query<{ level: number; lifetime_goals_total: number }>(
    `select level, lifetime_goals_total from users where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'user not found', 404);
  if (
    Number(row.level) < 2 &&
    Number(row.lifetime_goals_total) < settings.amateur.unlockGoalsRequired
  ) {
    throw new AppError('forbidden', 'amateur league is locked', 403);
  }
}

async function ensureCurrencyAccount(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [userId],
  );
}

async function applyCurrencyDelta(
  client: PoolClient,
  opts: {
    userId: string;
    availableDelta: number;
    reservedDelta: number;
    reason: string;
    matchId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ensureCurrencyAccount(client, opts.userId);
  const { rows } = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account
        set balance = balance + $2,
            reserved_balance = reserved_balance + $3,
            updated_at = now()
      where user_id = $1
        and balance + $2 >= 0
        and reserved_balance + $3 >= 0
      returning balance, reserved_balance`,
    [opts.userId, opts.availableDelta, opts.reservedDelta],
  );
  const account = rows[0];
  if (!account) {
    throw new AppError('conflict', 'not enough currency balance', 409);
  }
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after,
        duel_match_id, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.userId,
      opts.reason,
      opts.availableDelta,
      opts.reservedDelta,
      Number(account.balance),
      Number(account.reserved_balance),
      opts.matchId,
      JSON.stringify(opts.metadata ?? {}),
    ],
  );
}

async function buildLoadoutSnapshot(
  client: PoolClient,
  userId: string,
  selection: LoadoutSelection,
  rules: DuelRulesSnapshot,
): Promise<LoadoutSnapshot> {
  const hasExplicitSelection =
    selection.stick !== undefined ||
    selection.skates !== undefined ||
    selection.nutrition !== undefined;
  let resolvedSelection = selection;
  if (!hasExplicitSelection) {
    const { rows } = await client.query<{
      equipped_stick_item_id: string | null;
      equipped_skates_item_id: string | null;
      equipped_nutrition_item_id: string | null;
    }>(
      `select equipped_stick_item_id, equipped_skates_item_id, equipped_nutrition_item_id
         from user_equipment
        where user_id = $1`,
      [userId],
    );
    const equipment = rows[0];
    if (equipment) {
      resolvedSelection = {
        stick: equipment.equipped_stick_item_id,
        skates: equipment.equipped_skates_item_id,
        nutrition: equipment.equipped_nutrition_item_id,
      };
    }
  }

  const selectedIds = [
    resolvedSelection.stick ?? null,
    resolvedSelection.skates ?? null,
    resolvedSelection.nutrition ?? null,
  ].filter((id): id is string => id !== null);
  if (selectedIds.length === 0) return emptyLoadout(rules.powerCap);

  const { rows } = await client.query<{
    id: string;
    item_id: string;
    instance_id: string | null;
    title: string;
    item_kind: InventoryKind;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    power_score: number;
    duel_period_cost: number;
    resource_unit: DuelInventoryResourceUnit;
    low_stock_threshold: number;
    charges_available: number;
    effect_puck_speed_points: number;
    effect_puck_speed_delta: string | number;
    effect_shooter_frequency_delta: string | number;
    effect_goalie_frequency_delta: string | number;
    effect_goal_frequency_delta: string | number;
    effect_shot_zone_multiplier: string | number;
    effect_recovery_delay_ms: number;
    effect_stumble_chance: string | number;
    effect_stumble_ms: number;
    effect_stumble_blocks_per_period: number;
    effect_stumble_interval_min_rolls: string | number;
    effect_stumble_interval_max_rolls: string | number;
    effect_stumble_interval_min_ms: number;
    effect_stumble_interval_max_ms: number;
    effect_stumble_duration_min_ms: number;
    effect_stumble_duration_max_ms: number;
    effect_stumble_offset_min_px: number;
    effect_stumble_offset_max_px: number;
    effect_stumble_recovery_min_ms: number;
    effect_stumble_recovery_max_ms: number;
    effect_nutrition_slowdown_ms: number;
    effect_nutrition_stop_ms: number;
    effect_energy_baseline_speed: string | number;
    effect_fatigue_delay_ms: number;
    effect_fatigue_speed_multiplier: string | number;
    effect_fatigue_grace_ms: number;
    effect_fatigue_slowdown_start_ms: number;
    effect_fatigue_heavy_slowdown_start_ms: number;
    effect_fatigue_stop_start_ms: number;
    effect_fatigue_stop_duration_ms: number;
    effect_fatigue_after_rest_ms: number;
    effect_fatigue_slow_multiplier: string | number;
    effect_fatigue_heavy_multiplier: string | number;
  }>(
    `select coalesce(instance.id, i.id) as id,
            i.id as item_id,
            instance.id as instance_id,
            i.title, i.item_kind, i.rarity, i.power_score, i.duel_period_cost,
            i.resource_unit,
            i.low_stock_threshold,
            case
              when instance.id is not null then instance.charges_available
              else coalesce(legacy.charges_available, 0)
            end::int as charges_available,
            i.effect_puck_speed_points,
            i.effect_puck_speed_delta, i.effect_shooter_frequency_delta,
            i.effect_goalie_frequency_delta, i.effect_goal_frequency_delta,
            i.effect_shot_zone_multiplier, i.effect_recovery_delay_ms,
            i.effect_stumble_chance, i.effect_stumble_ms,
            i.effect_stumble_blocks_per_period,
            i.effect_stumble_interval_min_rolls, i.effect_stumble_interval_max_rolls,
            i.effect_stumble_interval_min_ms, i.effect_stumble_interval_max_ms,
            i.effect_stumble_duration_min_ms, i.effect_stumble_duration_max_ms,
            i.effect_stumble_offset_min_px, i.effect_stumble_offset_max_px,
            i.effect_stumble_recovery_min_ms, i.effect_stumble_recovery_max_ms,
            i.effect_nutrition_slowdown_ms, i.effect_nutrition_stop_ms,
            i.effect_energy_baseline_speed,
            i.effect_fatigue_delay_ms, i.effect_fatigue_speed_multiplier,
            i.effect_fatigue_grace_ms, i.effect_fatigue_slowdown_start_ms,
            i.effect_fatigue_heavy_slowdown_start_ms, i.effect_fatigue_stop_start_ms,
            i.effect_fatigue_stop_duration_ms, i.effect_fatigue_after_rest_ms,
            i.effect_fatigue_slow_multiplier, i.effect_fatigue_heavy_multiplier
       from admin_inventory_items i
       left join lateral (
         select owned.id, owned.charges_available
           from user_inventory_instance owned
          where owned.user_id = $1
            and owned.inventory_item_id = i.id
            and (owned.id = any($2::uuid[]) or i.id = any($2::uuid[]))
          order by case when owned.id = any($2::uuid[]) then 0 else 1 end,
                   case when owned.charges_available > 0 then 0 else 1 end,
                   owned.created_at,
                   owned.id
          limit 1
       ) instance on true
       left join user_inventory_item legacy
         on legacy.inventory_item_id = i.id and legacy.user_id = $1 and instance.id is null
      where (i.id = any($2::uuid[]) or instance.id = any($2::uuid[]))
        and i.deleted_at is null`,
    [userId, selectedIds],
  );

  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    byId.set(row.id, row);
    byId.set(row.item_id, row);
  }
  const requested: Array<{ kind: InventoryKind; id: string | null | undefined }> = [
    { kind: 'stick', id: resolvedSelection.stick },
    { kind: 'skates', id: resolvedSelection.skates },
    { kind: 'nutrition', id: resolvedSelection.nutrition },
  ];
  const items: LoadoutItemSnapshot[] = [];
  for (const requestedItem of requested) {
    if (!requestedItem.id) continue;
    const row = byId.get(requestedItem.id);
    if (!row || row.item_kind !== requestedItem.kind) {
      if (!hasExplicitSelection) continue;
      throw new AppError('conflict', `invalid ${requestedItem.kind} loadout item`, 409);
    }
    const chargesReserved = Number(row.duel_period_cost) * rules.totalPeriods;
    if (chargesReserved > 0 && Number(row.charges_available) < chargesReserved) {
      if (!hasExplicitSelection) continue;
      throw new AppError('conflict', 'not enough inventory charges for duel loadout', 409);
    }
    const resourceAvailable = Number(row.charges_available);
    const effectPuckSpeedDelta = numberFromUnknown(row.effect_puck_speed_delta);
    const effectPuckSpeedPoints = puckSpeedPointsFromValues(
      row.effect_puck_speed_points,
      effectPuckSpeedDelta,
    );
    const timing: DuelInventoryTiming = {
      stumbleIntervalMinRolls: Number(row.effect_stumble_interval_min_rolls),
      stumbleIntervalMaxRolls: Number(row.effect_stumble_interval_max_rolls),
      stumbleIntervalMinMs: Number(row.effect_stumble_interval_min_ms),
      stumbleIntervalMaxMs: Number(row.effect_stumble_interval_max_ms),
      stumbleDurationMinMs: Number(row.effect_stumble_duration_min_ms),
      stumbleDurationMaxMs: Number(row.effect_stumble_duration_max_ms),
      stumbleOffsetMinPx: Number(row.effect_stumble_offset_min_px),
      stumbleOffsetMaxPx: Number(row.effect_stumble_offset_max_px),
      stumbleRecoveryMinMs: Number(row.effect_stumble_recovery_min_ms),
      stumbleRecoveryMaxMs: Number(row.effect_stumble_recovery_max_ms),
      nutritionSlowdownMs: Number(row.effect_nutrition_slowdown_ms),
      nutritionStopMs: Number(row.effect_nutrition_stop_ms),
      energyBaselineSpeed: Number(row.effect_energy_baseline_speed),
      fatigueDelayMs: Number(row.effect_fatigue_delay_ms),
      fatigueSpeedMultiplier: Number(row.effect_fatigue_speed_multiplier),
      fatigueGraceMs: Number(row.effect_fatigue_grace_ms),
      fatigueSlowdownStartMs: Number(row.effect_fatigue_slowdown_start_ms),
      fatigueHeavySlowdownStartMs: Number(row.effect_fatigue_heavy_slowdown_start_ms),
      fatigueStopStartMs: Number(row.effect_fatigue_stop_start_ms),
      fatigueStopDurationMs: Number(row.effect_fatigue_stop_duration_ms),
      fatigueAfterRestMs: Number(row.effect_fatigue_after_rest_ms),
      fatigueSlowMultiplier: Number(row.effect_fatigue_slow_multiplier),
      fatigueHeavyMultiplier: Number(row.effect_fatigue_heavy_multiplier),
    };
    items.push({
      id: row.id,
      itemId: row.item_id,
      instanceId: row.instance_id,
      kind: row.item_kind,
      title: row.title,
      rarity: row.rarity,
      powerScore: Number(row.power_score),
      duelPeriodCost: Number(row.duel_period_cost),
      chargesReserved,
      resourceUnit: row.resource_unit,
      lowStockThreshold: Number(row.low_stock_threshold),
      resourceAvailable,
      effectPuckSpeedPoints,
      timing,
      effects: {
        puckSpeedPoints: effectPuckSpeedPoints,
        puckSpeedDelta: effectPuckSpeedDelta,
        shooterFrequencyDelta: numberFromUnknown(row.effect_shooter_frequency_delta),
        goalieFrequencyDelta: numberFromUnknown(row.effect_goalie_frequency_delta),
        goalFrequencyDelta: numberFromUnknown(row.effect_goal_frequency_delta),
        shotZoneMultiplier: numberFromUnknown(row.effect_shot_zone_multiplier, 1),
        recoveryDelayMs: Number(row.effect_recovery_delay_ms),
        stumbleChance: numberFromUnknown(row.effect_stumble_chance),
        stumbleMs: Number(row.effect_stumble_ms),
        stumbleBlocksPerPeriod: Number(row.effect_stumble_blocks_per_period),
        ...timing,
      },
    });
  }

  const powerScore = items.reduce((sum, item) => sum + item.powerScore, 0);
  if (rules.rankedEnabled && powerScore > rules.powerCap) {
    if (!hasExplicitSelection) return emptyLoadout(rules.powerCap);
    throw new AppError('conflict', 'duel loadout exceeds power cap', 409);
  }
  return { items, powerScore, powerCap: rules.powerCap };
}

function loadoutWithUpdatedShotStick(
  current: LoadoutSnapshot,
  stickOnly: LoadoutSnapshot,
  rules: DuelRulesSnapshot,
): LoadoutSnapshot {
  const currentStick = current.items.find((item) => item.kind === 'stick');
  if (currentStick && currentStick.chargesReserved > 0) {
    throw new AppError('conflict', 'cannot switch reserved duel stick between periods', 409);
  }
  const nextStick = stickOnly.items.find((item) => item.kind === 'stick');
  if (nextStick && nextStick.resourceUnit !== 'shot') {
    throw new AppError(
      'conflict',
      'only shot-resource sticks can be switched between periods',
      409,
    );
  }
  const items = [
    ...current.items.filter((item) => item.kind !== 'stick'),
    ...(nextStick ? [nextStick] : []),
  ];
  const powerScore = items.reduce((sum, item) => sum + item.powerScore, 0);
  if (rules.rankedEnabled && powerScore > rules.powerCap) {
    throw new AppError('conflict', 'duel loadout exceeds power cap', 409);
  }
  return { items, powerScore, powerCap: rules.powerCap };
}

function loadoutWithActiveShotStick(
  current: LoadoutSnapshot,
  stickOnly: LoadoutSnapshot,
  rules: DuelRulesSnapshot,
): LoadoutSnapshot {
  const nextStick = stickOnly.items.find((item) => item.kind === 'stick');
  if (nextStick) {
    if (nextStick.resourceUnit !== 'shot') {
      throw new AppError(
        'conflict',
        'only shot-resource sticks can be switched during a duel',
        409,
      );
    }
    if (nextStick.resourceAvailable <= 0) {
      throw new AppError('conflict', 'selected duel stick has no shots available', 409);
    }
  }
  const items = [
    ...current.items.filter((item) => item.kind !== 'stick'),
    ...(nextStick ? [nextStick] : []),
  ];
  const powerScore = items.reduce((sum, item) => sum + item.powerScore, 0);
  if (rules.rankedEnabled && powerScore > rules.powerCap) {
    throw new AppError('conflict', 'duel loadout exceeds power cap', 409);
  }
  return { items, powerScore, powerCap: rules.powerCap };
}

async function syncLegacyInventoryAggregate(
  client: PoolClient,
  userId: string,
  itemId: string,
): Promise<void> {
  const { rows } = await client.query<{ charges_available: number; charges_reserved: number }>(
    `select coalesce(sum(charges_available), 0)::int as charges_available,
            coalesce(sum(charges_reserved), 0)::int as charges_reserved
       from user_inventory_instance
      where user_id = $1 and inventory_item_id = $2`,
    [userId, itemId],
  );
  const aggregate = rows[0] ?? { charges_available: 0, charges_reserved: 0 };
  await client.query(
    `insert into user_inventory_item
       (user_id, inventory_item_id, charges_available, charges_reserved, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, inventory_item_id)
     do update
       set charges_available = excluded.charges_available,
           charges_reserved = excluded.charges_reserved,
           updated_at = now()`,
    [userId, itemId, Number(aggregate.charges_available), Number(aggregate.charges_reserved)],
  );
}

async function reserveLoadoutInventory(
  client: PoolClient,
  userId: string,
  matchId: string,
  loadout: LoadoutSnapshot,
): Promise<void> {
  for (const item of loadout.items) {
    if (item.chargesReserved <= 0) continue;
    if (item.instanceId) {
      const { rows } = await client.query<{ charges_available: number; charges_reserved: number }>(
        `update user_inventory_instance
            set charges_available = charges_available - $3,
                charges_reserved = charges_reserved + $3,
                updated_at = now()
          where user_id = $1
            and id = $2
            and charges_available >= $3
          returning charges_available, charges_reserved`,
        [userId, item.instanceId, item.chargesReserved],
      );
      if (!rows[0]) {
        throw new AppError('conflict', 'not enough inventory charges for duel loadout', 409);
      }
      await syncLegacyInventoryAggregate(client, userId, item.itemId);
    } else {
      const { rows } = await client.query<{ charges_available: number; charges_reserved: number }>(
        `update user_inventory_item
            set charges_available = charges_available - $3,
                charges_reserved = charges_reserved + $3,
                updated_at = now()
          where user_id = $1
            and inventory_item_id = $2
            and charges_available >= $3
          returning charges_available, charges_reserved`,
        [userId, item.itemId, item.chargesReserved],
      );
      if (!rows[0]) {
        throw new AppError('conflict', 'not enough inventory charges for duel loadout', 409);
      }
    }
    await appendEvent(client, userId, 'amateur_duel_inventory_reserved', {
      match_id: matchId,
      inventory_item_id: item.itemId,
      inventory_instance_id: item.instanceId,
      charges: item.chargesReserved,
    });
  }
}

async function consumeInventoryForPeriod(
  client: PoolClient,
  participant: DuelParticipantRow,
  rules: DuelRulesSnapshot,
): Promise<void> {
  const loadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
  const consumed: InventoryPeriodReport['consumed'] = [];
  if (loadout.items.length === 0) {
    return;
  }
  for (const item of loadout.items) {
    if (item.resourceUnit !== 'period') continue;
    if (item.duelPeriodCost <= 0) continue;
    if (item.instanceId) {
      await client.query(
        `update user_inventory_instance
            set charges_reserved = charges_reserved - $3,
                updated_at = now()
          where user_id = $1
            and id = $2
            and charges_reserved >= $3`,
        [participant.user_id, item.instanceId, item.duelPeriodCost],
      );
      await syncLegacyInventoryAggregate(client, participant.user_id, item.itemId);
    } else {
      await client.query(
        `update user_inventory_item
            set charges_reserved = charges_reserved - $3,
                updated_at = now()
          where user_id = $1
            and inventory_item_id = $2
            and charges_reserved >= $3`,
        [participant.user_id, item.itemId, item.duelPeriodCost],
      );
    }
    const alreadyConsumed = Number(participant.consumed_inventory_charges);
    const remainingReserved = Math.max(
      0,
      item.chargesReserved - alreadyConsumed - item.duelPeriodCost,
    );
    consumed.push({
      id: item.id,
      itemId: item.itemId,
      instanceId: item.instanceId,
      kind: item.kind,
      title: item.title,
      charges: item.duelPeriodCost,
      remainingReserved,
    });
  }
  const periodReport: InventoryPeriodReport = {
    periodNumber: participant.current_period + 1,
    consumed,
  };
  const report = [...inventoryReportFromUnknown(participant.inventory_report), periodReport];
  const consumedCharges = consumed.reduce((sum, item) => sum + item.charges, 0);
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = consumed_inventory_charges + $3,
            inventory_report = $4,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [participant.match_id, participant.user_id, consumedCharges, JSON.stringify(report)],
  );
}

async function consumeInventoryForShot(
  client: PoolClient,
  participant: DuelParticipantRow,
  loadout: LoadoutSnapshot,
  reportBeforeShot: InventoryPeriodReport[],
  consumedTotals: { skatesConsumed: number; nutritionConsumed: number },
): Promise<void> {
  const periodNumber = participant.current_period;
  const consumed: InventoryPeriodReport['consumed'] = [];
  let consumedInventoryChargesDelta = 0;

  for (const item of loadout.items) {
    if (item.resourceUnit === 'period') continue;
    const consumedBeforePeriod = consumedBeforePeriodItem(reportBeforeShot, periodNumber, item.id);
    const previous = consumedForPeriodItem(reportBeforeShot, periodNumber, item.id);
    const availableForPeriod = Math.max(0, item.resourceAvailable - consumedBeforePeriod);
    let target = previous;
    if (item.resourceUnit === 'shot') {
      target = previous < availableForPeriod ? previous + 1 : previous;
    } else if (item.resourceUnit === 'distance') {
      target = consumedTotals.skatesConsumed;
    } else if (item.resourceUnit === 'energy_ms') {
      target = consumedTotals.nutritionConsumed;
    }
    target = Math.min(availableForPeriod, Math.max(previous, target));
    const delta = roundInventoryCharge(target - previous);
    if (delta <= 0) continue;

    const integerBefore = Math.floor(previous);
    const integerAfter = Math.floor(target);
    const availableDelta =
      item.resourceUnit === 'shot' || item.resourceUnit === 'energy_ms'
        ? Math.ceil(delta)
        : Math.max(0, integerAfter - integerBefore);
    if (availableDelta > 0) {
      const { rowCount } = item.instanceId
        ? await client.query(
            `update user_inventory_instance
                set charges_available = charges_available - $3,
                    updated_at = now()
              where user_id = $1
                and id = $2
                and charges_available >= $3`,
            [participant.user_id, item.instanceId, availableDelta],
          )
        : await client.query(
            `update user_inventory_item
                set charges_available = charges_available - $3,
                    updated_at = now()
              where user_id = $1
                and inventory_item_id = $2
                and charges_available >= $3`,
            [participant.user_id, item.itemId, availableDelta],
          );
      if (rowCount === 0) {
        throw new AppError('conflict', 'not enough inventory resource for duel shot', 409);
      }
      if (item.instanceId) {
        await syncLegacyInventoryAggregate(client, participant.user_id, item.itemId);
      }
      consumedInventoryChargesDelta += availableDelta;
    }

    consumed.push({
      id: item.id,
      itemId: item.itemId,
      instanceId: item.instanceId,
      kind: item.kind,
      title: item.title,
      charges: delta,
      remainingReserved: roundInventoryCharge(
        Math.max(0, item.resourceAvailable - consumedBeforePeriod - target),
      ),
    });
  }

  if (consumed.length === 0) return;
  const nextReport = [
    ...reportBeforeShot,
    {
      periodNumber,
      consumed,
    },
  ];
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = consumed_inventory_charges + $3,
            inventory_report = $4,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [
      participant.match_id,
      participant.user_id,
      consumedInventoryChargesDelta,
      JSON.stringify(nextReport),
    ],
  );
}

function usesAccuracyTiebreaker(rules: DuelRulesSnapshot): boolean {
  return (
    rules.duelKind === 'express' || rules.periodRules.every((rule) => rule.mode === 'time_attack')
  );
}

function compareAccuracy(
  a: Pick<DuelParticipantRow, 'goals' | 'shots_taken'>,
  b: Pick<DuelParticipantRow, 'goals' | 'shots_taken'>,
): number {
  const aShots = Math.max(0, Number(a.shots_taken));
  const bShots = Math.max(0, Number(b.shots_taken));
  const aGoals = Math.max(0, Number(a.goals));
  const bGoals = Math.max(0, Number(b.goals));
  const left = aGoals * (bShots === 0 ? 1 : bShots);
  const right = bGoals * (aShots === 0 ? 1 : aShots);
  return Math.sign(left - right);
}

async function fetchMatchForUpdate(client: PoolClient, matchId: string): Promise<DuelMatchRow> {
  await lockTournamentForDuelMutation(client, matchId);
  const { rows } = await client.query<DuelMatchRow>(
    `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
            ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
       from amateur_duel_match m
       join users cu on cu.id = m.challenger_user_id
       join users ou on ou.id = m.opponent_user_id
      where m.id = $1
      for update of m`,
    [matchId],
  );
  const match = rows[0];
  if (!match) throw new AppError('not_found', 'duel match not found', 404);
  return match;
}

async function assertTournamentDuelVisible(
  client: PoolClient,
  match: DuelMatchRow,
): Promise<void> {
  if (match.source !== 'tournament') return;
  const feature = await client.query<{ enabled: boolean }>(
    `select coalesce((value #>> '{}')::boolean, false) as enabled
       from game_settings where key = 'tournaments.enabled'`,
  );
  if (feature.rows[0]?.enabled !== true) {
    throw new AppError('not_found', 'duel match not found', 404);
  }
}

async function fetchVisibleMatchForUpdate(
  client: PoolClient,
  matchId: string,
): Promise<DuelMatchRow> {
  const match = await fetchMatchForUpdate(client, matchId);
  await assertTournamentDuelVisible(client, match);
  return match;
}

async function fetchPlayableMatchForUpdate(
  client: PoolClient,
  matchId: string,
): Promise<DuelMatchRow> {
  const match = await fetchVisibleMatchForUpdate(client, matchId);
  if (match.source === 'tournament') {
    const playable = await client.query<{ playable: boolean }>(
      `select exists(
         select 1
           from tournament_fixture_segment segment
           join tournament_fixture fixture on fixture.id = segment.fixture_id
           join tournament on tournament.id = fixture.tournament_id
           left join tournament_playoff_series series on series.id = fixture.series_id
          where segment.duel_match_id = $1
            and segment.status in ('scheduled', 'active')
            and fixture.status in ('scheduled', 'open', 'active')
            and tournament.status in ('regular', 'playoff')
            and (series.id is null or series.status in ('scheduled', 'active'))
       ) as playable`,
      [match.id],
    );
    if (playable.rows[0]?.playable !== true) {
      throw new AppError('conflict', 'tournament duel is not playable', 409);
    }
  }
  return match;
}

async function fetchParticipants(
  client: PoolClient,
  matchId: string,
): Promise<DuelParticipantRow[]> {
  const { rows } = await client.query<DuelParticipantRow>(
    `select match_id, user_id, side, state, ready_at, loadout_snapshot, current_period,
            period_started_at, break_started_at, completed_at, shots_taken, goals, active_duration_ms,
            stake_reserved, entry_fee_paid, reserved_inventory_item_id,
            reserved_inventory_charges, consumed_inventory_charges,
            inventory_effects_snapshot, inventory_report, result_points, experience_snapshot
       from amateur_duel_participant
      where match_id = $1
      order by side`,
    [matchId],
  );
  return rows;
}

async function fetchCurrentPeriodStats(
  client: PoolClient,
  matchId: string,
  userId: string,
  periodNumber: number,
): Promise<{ shots: number; goals: number }> {
  const { rows } = await client.query<{ shots: string; goals: string }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals
       from shot_session
      where mode = 'amateur_duel'
        and amateur_duel_match_id = $1
        and user_id = $2
        and period_number = $3`,
    [matchId, userId, periodNumber],
  );
  return {
    shots: Number(rows[0]?.shots ?? 0),
    goals: Number(rows[0]?.goals ?? 0),
  };
}

async function fetchRecentPeriods(
  client: PoolClient,
  matchId: string,
  userId: string,
): Promise<PeriodLogRow[]> {
  const { rows } = await client.query<PeriodLogRow>(
    `select period_number, shots_taken, goals, duration_ms, closed_reason, ended_at
       from amateur_duel_period_log
      where match_id = $1 and user_id = $2
      order by period_number`,
    [matchId, userId],
  );
  return rows;
}

function periodLogDto(period: PeriodLogRow): DuelMatchStateDTO['recent_periods'][number] {
  return {
    period_number: period.period_number,
    shots_taken: period.shots_taken,
    goals: period.goals,
    duration_ms: period.duration_ms,
    closed_reason: period.closed_reason,
    ended_at: period.ended_at.toISOString(),
  };
}

async function closeParticipantPeriod(
  client: PoolClient,
  participant: DuelParticipantRow,
  rules: DuelRulesSnapshot,
  now: Date,
  reason: 'quota' | 'timeout' | 'window_end',
): Promise<boolean> {
  if (participant.period_started_at === null) return false;
  const stats = await fetchCurrentPeriodStats(
    client,
    participant.match_id,
    participant.user_id,
    participant.current_period,
  );
  const endedAt = now;
  const durationMs = Math.max(0, endedAt.getTime() - participant.period_started_at.getTime());
  await client.query(
    `insert into amateur_duel_period_log
       (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals,
        duration_ms, closed_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (match_id, user_id, period_number) do nothing`,
    [
      participant.match_id,
      participant.user_id,
      participant.current_period,
      participant.period_started_at,
      endedAt,
      stats.shots,
      stats.goals,
      durationMs,
      reason,
    ],
  );

  const periodRule = getDuelPeriodRule(rules, participant.current_period);
  const periodCompleted =
    reason === 'quota' || (reason === 'timeout' && periodRule.mode === 'time_attack');
  const completedByQuota = periodCompleted && participant.current_period >= rules.totalPeriods;
  const nextState: ParticipantState = completedByQuota
    ? 'completed'
    : periodCompleted
      ? 'break_active'
      : 'forfeit';
  const updated = await client.query(
    `update amateur_duel_participant
        set state = $3,
            period_started_at = null,
            break_started_at = case when $3 = 'break_active' then $4::timestamptz else null end,
            completed_at = case when $3 = 'completed' then $4::timestamptz else completed_at end,
            ready_at = null,
            shots_taken = shots_taken + $5,
            goals = goals + $6,
            active_duration_ms = active_duration_ms + $7,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [
      participant.match_id,
      participant.user_id,
      nextState,
      endedAt,
      stats.shots,
      stats.goals,
      durationMs,
    ],
  );
  return (updated.rowCount ?? 0) > 0;
}

async function markExpiredInvitedMatch(client: PoolClient, match: DuelMatchRow, now: Date) {
  await client.query(
    `update amateur_duel_match
        set status = 'expired',
            settled_reason = 'not_accepted',
            settled_at = $2,
            updated_at = now()
      where id = $1 and status = 'invited'`,
    [match.id, now],
  );
}

async function cancelReadyNoShow(
  client: PoolClient,
  match: DuelMatchRow,
  rules: DuelRulesSnapshot,
  now: Date,
): Promise<DuelMatchRow> {
  const participants = await fetchParticipants(client, match.id);
  const notReady = participants.filter((participant) => participant.state !== 'ready');
  const cooldownUserId = notReady.length === 1 ? notReady[0]!.user_id : null;
  const cooldownUntil =
    cooldownUserId !== null ? new Date(now.getTime() + rules.readyNoShowCooldownMs) : null;
  await client.query(
    `update amateur_duel_match
        set status = 'cancelled',
            settled_reason = 'ready_timeout',
            settled_at = $2,
            cooldown_user_id = $3,
            cooldown_until = $4,
            updated_at = now()
      where id = $1 and status = 'ready_check'`,
    [match.id, now, cooldownUserId, cooldownUntil],
  );
  await client.query(
    `update amateur_duel_participant
        set state = case when state = 'ready' then state else 'forfeit' end,
            updated_at = now()
      where match_id = $1`,
    [match.id],
  );
  return fetchMatchForUpdate(client, match.id);
}

async function settleMatchIfReady(
  client: PoolClient,
  match: DuelMatchRow,
  now: Date,
): Promise<ReconciledMatch> {
  if (match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled')
    return { match, changed: false };
  if (match.status === 'invited') {
    if (match.ready_expires_at !== null && now >= match.ready_expires_at) {
      await markExpiredInvitedMatch(client, match, now);
      return { match: await fetchMatchForUpdate(client, match.id), changed: true };
    }
    return { match, changed: false };
  }
  const rules = parseRulesSnapshot(match.rules_snapshot);
  const settlementPolicy = getDuelSettlementPolicy(match.source);
  if (
    match.status === 'ready_check' &&
    match.ready_expires_at !== null &&
    now >= match.ready_expires_at
  ) {
    return { match: await cancelReadyNoShow(client, match, rules, now), changed: true };
  }

  const participants = await fetchParticipants(client, match.id);
  const challenger = participants.find((p) => p.side === 'challenger');
  const opponent = participants.find((p) => p.side === 'opponent');
  if (!challenger || !opponent) {
    throw new AppError('server_error', 'duel match participants missing', 500);
  }

  const windowEnded = now >= match.ends_at;
  if (windowEnded) {
    const noParticipantStarted = participants.every(
      (participant) =>
        participant.state === 'accepted' &&
        participant.current_period === 0 &&
        Number(participant.shots_taken) === 0 &&
        Number(participant.goals) === 0 &&
        Number(participant.active_duration_ms) === 0 &&
        participant.period_started_at === null,
    );
    if (noParticipantStarted) {
      const stake = settlementPolicy.settleStake ? Number(match.stake_amount) : 0;
      const entryFee = settlementPolicy.settleStake ? Number(match.entry_fee_amount) : 0;
      for (const participant of participants) {
        if (stake > 0) {
          await applyCurrencyDelta(client, {
            userId: participant.user_id,
            availableDelta: stake,
            reservedDelta: -stake,
            reason: 'duel_stake_refund',
            matchId: match.id,
            metadata: { reason: 'no_play' },
          });
        }
        if (entryFee > 0) {
          await applyCurrencyDelta(client, {
            userId: participant.user_id,
            availableDelta: entryFee,
            reservedDelta: 0,
            reason: 'duel_stake_refund',
            matchId: match.id,
            metadata: { reason: 'no_play_entry_fee_refund' },
          });
        }
        await releaseRemainingDuelInventoryReserve(client, {
          matchId: participant.match_id,
          userId: participant.user_id,
          loadoutSnapshot: participant.loadout_snapshot,
          reservedInventoryCharges: Number(participant.reserved_inventory_charges),
          consumedInventoryCharges: Number(participant.consumed_inventory_charges),
        });
      }
      await client.query(
        `update amateur_duel_match
            set status = 'cancelled',
                settled_reason = 'no_play',
                settled_at = $2,
                updated_at = now()
          where id = $1 and status = 'active'`,
        [match.id, now],
      );
      return { match: await fetchMatchForUpdate(client, match.id), changed: true };
    }
    for (const participant of participants) {
      if (participant.state !== 'completed' && participant.state !== 'forfeit') {
        await client.query(
          `update amateur_duel_participant
              set state = 'forfeit',
                  period_started_at = null,
                  break_started_at = null,
                  updated_at = now()
            where match_id = $1 and user_id = $2`,
          [match.id, participant.user_id],
        );
      }
    }
  }

  const refreshed = await fetchParticipants(client, match.id);
  const a = refreshed.find((p) => p.side === 'challenger')!;
  const b = refreshed.find((p) => p.side === 'opponent')!;
  const aDone = a.state === 'completed';
  const bDone = b.state === 'completed';
  const aTerminal = aDone || a.state === 'forfeit';
  const bTerminal = bDone || b.state === 'forfeit';
  if (!windowEnded && !(aTerminal && bTerminal)) return { match, changed: false };

  let outcome: DuelOutcome;
  let winnerUserId: string | null = null;
  if (aDone && bDone) {
    if (a.goals > b.goals) {
      outcome = 'challenger_win';
      winnerUserId = a.user_id;
    } else if (b.goals > a.goals) {
      outcome = 'opponent_win';
      winnerUserId = b.user_id;
    } else {
      const accuracyComparison = usesAccuracyTiebreaker(rules) ? compareAccuracy(a, b) : 0;
      const aSeconds = durationSeconds(a.active_duration_ms);
      const bSeconds = durationSeconds(b.active_duration_ms);
      if (accuracyComparison > 0) {
        outcome = 'challenger_win';
        winnerUserId = a.user_id;
      } else if (accuracyComparison < 0) {
        outcome = 'opponent_win';
        winnerUserId = b.user_id;
      } else if (aSeconds < bSeconds) {
        outcome = 'challenger_win';
        winnerUserId = a.user_id;
      } else if (bSeconds < aSeconds) {
        outcome = 'opponent_win';
        winnerUserId = b.user_id;
      } else {
        outcome = 'draw';
      }
    }
  } else if (aDone && !bDone) {
    outcome = 'challenger_win';
    winnerUserId = a.user_id;
  } else if (bDone && !aDone) {
    outcome = 'opponent_win';
    winnerUserId = b.user_id;
  } else {
    outcome = 'double_loss';
  }

  // Coin and star rewards share the global users -> currency-account lock order.
  if (settlementPolicy.grantTemplateRewards && winnerUserId !== null && rules.winStarReward > 0) {
    await client.query('select id from users where id = $1 for update', [winnerUserId]);
  }

  const stake = settlementPolicy.settleStake ? Number(match.stake_amount) : 0;
  if (stake > 0) {
    if (outcome === 'draw') {
      for (const participant of refreshed) {
        await applyCurrencyDelta(client, {
          userId: participant.user_id,
          availableDelta: stake,
          reservedDelta: -stake,
          reason: 'duel_stake_refund',
          matchId: match.id,
        });
      }
    } else if (outcome === 'double_loss') {
      for (const participant of refreshed) {
        await applyCurrencyDelta(client, {
          userId: participant.user_id,
          availableDelta: 0,
          reservedDelta: -stake,
          reason: 'duel_stake_burn',
          matchId: match.id,
        });
      }
    } else {
      const winner = refreshed.find((p) => p.user_id === winnerUserId)!;
      const loser = refreshed.find((p) => p.user_id !== winnerUserId)!;
      await applyCurrencyDelta(client, {
        userId: winner.user_id,
        availableDelta: stake * 2,
        reservedDelta: -stake,
        reason: 'duel_stake_payout',
        matchId: match.id,
      });
      await applyCurrencyDelta(client, {
        userId: loser.user_id,
        availableDelta: 0,
        reservedDelta: -stake,
        reason: 'duel_stake_burn',
        matchId: match.id,
      });
    }
  }

  for (const participant of refreshed) {
    await releaseRemainingDuelInventoryReserve(client, {
      matchId: participant.match_id,
      userId: participant.user_id,
      loadoutSnapshot: participant.loadout_snapshot,
      reservedInventoryCharges: Number(participant.reserved_inventory_charges),
      consumedInventoryCharges: Number(participant.consumed_inventory_charges),
    });
  }

  if (settlementPolicy.grantTemplateRewards && outcome === 'draw' && rules.drawCurrencyReward > 0) {
    for (const participant of refreshed) {
      await applyCurrencyDelta(client, {
        userId: participant.user_id,
        availableDelta: rules.drawCurrencyReward,
        reservedDelta: 0,
        reason: 'duel_reward',
        matchId: match.id,
        metadata: { outcome, template_id: rules.templateId },
      });
    }
  } else if (
    settlementPolicy.grantTemplateRewards &&
    winnerUserId !== null &&
    rules.winCurrencyReward > 0
  ) {
    await applyCurrencyDelta(client, {
      userId: winnerUserId,
      availableDelta: rules.winCurrencyReward,
      reservedDelta: 0,
      reason: 'duel_reward',
      matchId: match.id,
      metadata: { outcome, template_id: rules.templateId },
    });
  }
  if (settlementPolicy.grantTemplateRewards && winnerUserId !== null && rules.winStarReward > 0) {
    await client.query(`update users set xp = xp + $2 where id = $1`, [
      winnerUserId,
      rules.winStarReward,
    ]);
    await appendEvent(client, winnerUserId, 'amateur_duel_star_reward', {
      match_id: match.id,
      outcome,
      template_id: rules.templateId,
      stars: rules.winStarReward,
    });
  }

  const aPoints =
    outcome === 'challenger_win' ? rules.winPoints : outcome === 'draw' ? rules.drawPoints : 0;
  const bPoints =
    outcome === 'opponent_win' ? rules.winPoints : outcome === 'draw' ? rules.drawPoints : 0;
  await client.query(
    `update amateur_duel_participant
        set result_points = case
              when user_id = $2 then $3
              when user_id = $4 then $5
              else result_points
            end,
            updated_at = now()
      where match_id = $1`,
    [match.id, a.user_id, aPoints, b.user_id, bPoints],
  );

  if (settlementPolicy.updateRating) {
    for (const participant of [
      { mine: a, other: b, points: aPoints },
      { mine: b, other: a, points: bPoints },
    ]) {
      await client.query(
        `insert into amateur_duel_rating
         (season_key, user_id, points, wins, draws, losses, goals_for, goals_against,
          matches_played, active_duration_seconds, updated_at)
       values (
         $1, $2, $3, case when $7::boolean then 1 else 0 end,
         case when $8::boolean then 1 else 0 end,
         case when $9::boolean then 1 else 0 end,
         $4, $5, 1, $6, now()
       )
       on conflict (season_key, user_id) do update
          set points = amateur_duel_rating.points + excluded.points,
              wins = amateur_duel_rating.wins + excluded.wins,
              draws = amateur_duel_rating.draws + excluded.draws,
              losses = amateur_duel_rating.losses + excluded.losses,
              goals_for = amateur_duel_rating.goals_for + excluded.goals_for,
              goals_against = amateur_duel_rating.goals_against + excluded.goals_against,
              matches_played = amateur_duel_rating.matches_played + 1,
              active_duration_seconds =
                amateur_duel_rating.active_duration_seconds + excluded.active_duration_seconds,
              updated_at = now()`,
        [
          match.season_key,
          participant.mine.user_id,
          participant.points,
          participant.mine.goals,
          participant.other.goals,
          durationSeconds(participant.mine.active_duration_ms),
          outcome !== 'draw' && participant.mine.user_id === winnerUserId,
          outcome === 'draw',
          outcome !== 'draw' && participant.mine.user_id !== winnerUserId,
        ],
      );
    }
  }

  const { rows } = await client.query<DuelMatchRow>(
    `update amateur_duel_match
        set status = 'settled',
            winner_user_id = $2,
            outcome = $3,
            settled_reason = case when $4::boolean then 'window_end' else 'completed' end,
            settled_at = $5,
            updated_at = now()
      where id = $1
      returning *`,
    [match.id, winnerUserId, outcome, windowEnded, now],
  );
  await appendEvent(client, match.challenger_user_id, 'amateur_duel_settled', {
    match_id: match.id,
    outcome,
    winner_user_id: winnerUserId,
  });
  if (match.source === 'tournament') {
    await settleTournamentSegmentForDuel(client, {
      duelMatchId: match.id,
      homeScore: Number(a.goals),
      awayScore: Number(b.goals),
      settledAt: now,
    });
  }
  if (settlementPolicy.evaluateAchievements) {
    await evaluateDuelSettledAchievements(client, { matchId: match.id, winnerUserId });
  }
  return { match: rows[0]!, changed: true };
}

async function fetchMatchmakingTemplates(
  client: PoolClient,
  duelKinds: DuelKind[],
  now: Date,
): Promise<DuelTemplateRow[]> {
  const { rows } = await client.query<DuelTemplateRow>(
    `with ranked_templates as (
       select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
              matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
              period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
              ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
              ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
              stake_amount, entry_fee_amount, required_inventory_item_id,
              inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
              win_star_reward, created_at, updated_at,
              row_number() over (partition by duel_kind order by starts_at asc, created_at desc, id asc) as template_rank
         from amateur_duel_template
        where deleted_at is null
          and is_active
          and matchmaking_enabled
          and ends_at > $2
          and duel_kind = any($1::text[])
      )
      select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
             matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
             period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
             ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
             ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
             stake_amount, entry_fee_amount, required_inventory_item_id,
             inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
             win_star_reward, created_at, updated_at
        from ranked_templates
       where template_rank = 1
       order by array_position($1::text[], duel_kind)`,
    [duelKinds, now],
  );
  return rows;
}

async function reconcileMatch(
  client: PoolClient,
  match: DuelMatchRow,
  now: Date,
): Promise<ReconciledMatch> {
  if (match.status === 'settled' || match.status === 'expired' || match.status === 'cancelled')
    return { match, changed: false };
  if (match.status === 'invited' || match.status === 'ready_check') {
    return settleMatchIfReady(client, match, now);
  }

  const rules = parseRulesSnapshot(match.rules_snapshot);
  const participants = await fetchParticipants(client, match.id);
  let changed = false;
  for (const participant of participants) {
    if (participant.state === 'period_active' && participant.period_started_at !== null) {
      const periodRule = getDuelPeriodRule(rules, participant.current_period);
      const timeoutAt = new Date(participant.period_started_at.getTime() + periodRule.durationMs);
      if (now >= match.ends_at) {
        changed =
          (await closeParticipantPeriod(client, participant, rules, match.ends_at, 'window_end')) ||
          changed;
      } else if (now >= timeoutAt) {
        changed =
          (await closeParticipantPeriod(client, participant, rules, timeoutAt, 'timeout')) ||
          changed;
      }
    }
    if (participant.state === 'break_active' && participant.break_started_at !== null) {
      const breakEndsAt = new Date(participant.break_started_at.getTime() + rules.breakDurationMs);
      if (now >= breakEndsAt) {
        const updated = await client.query(
          `update amateur_duel_participant
              set state = 'accepted',
                  break_started_at = null,
                  ready_at = $3,
                  updated_at = now()
            where match_id = $1 and user_id = $2 and state = 'break_active'`,
          [match.id, participant.user_id, breakEndsAt],
        );
        changed = (updated.rowCount ?? 0) > 0 || changed;
      }
    }
    if (
      participant.state === 'accepted' &&
      participant.current_period > 0 &&
      participant.ready_at !== null
    ) {
      const latestPeriod = await client.query<{ ended_at: Date }>(
        `select ended_at
           from amateur_duel_period_log
          where match_id = $1 and user_id = $2 and period_number = $3
          limit 1`,
        [match.id, participant.user_id, participant.current_period],
      );
      const latestEndedAt = latestPeriod.rows[0]?.ended_at ?? null;
      if (latestEndedAt !== null && participant.ready_at >= latestEndedAt) {
        const continueDeadline = new Date(
          participant.ready_at.getTime() + DUEL_INTERMISSION_CONTINUE_GRACE_MS,
        );
        if (now >= continueDeadline) {
          const updated = await client.query(
            `update amateur_duel_participant
                set state = 'forfeit',
                    period_started_at = null,
                    break_started_at = null,
                    updated_at = now()
              where match_id = $1 and user_id = $2 and state = 'accepted'`,
            [match.id, participant.user_id],
          );
          changed = (updated.rowCount ?? 0) > 0 || changed;
        }
      }
    }
  }
  const refreshed = await fetchMatchForUpdate(client, match.id);
  const settled = await settleMatchIfReady(client, refreshed, now);
  return { match: settled.match, changed: changed || settled.changed };
}

async function fetchAvailableInventory(
  client: PoolClient,
  userId: string,
): Promise<InventoryAvailabilityItem[]> {
  const { rows } = await client.query<{
    id: string;
    item_id: string;
    instance_id: string | null;
    title: string;
    description: string;
    image_url: string | null;
    item_kind: InventoryKind;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    power_score: number;
    duel_period_cost: number;
    resource_unit: DuelInventoryResourceUnit;
    low_stock_threshold: number;
    charges_available: number;
    charges_reserved: number;
  }>(
    `select coalesce(instance.id, i.id) as id,
            i.id as item_id,
            instance.id as instance_id,
            i.title, i.description, i.photo_url as image_url, i.item_kind, i.rarity,
            i.power_score, i.duel_period_cost, i.resource_unit, i.low_stock_threshold,
            case
              when instance.id is not null then instance.charges_available
              else coalesce(legacy.charges_available, 0)
            end::int as charges_available,
            case
              when instance.id is not null then instance.charges_reserved
              else coalesce(legacy.charges_reserved, 0)
            end::int as charges_reserved
       from admin_inventory_items i
       left join user_inventory_instance instance
         on instance.inventory_item_id = i.id and instance.user_id = $1
       left join user_inventory_item legacy
         on legacy.inventory_item_id = i.id and legacy.user_id = $1 and instance.id is null
      where i.deleted_at is null
        and i.item_kind in ('stick', 'skates', 'nutrition')
      order by i.item_kind, i.created_at desc, instance.created_at nulls first, instance.id`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    instanceId: row.instance_id,
    kind: row.item_kind,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    rarity: row.rarity,
    powerScore: Number(row.power_score),
    duelPeriodCost: Number(row.duel_period_cost),
    resourceUnit: row.resource_unit,
    lowStockThreshold: Number(row.low_stock_threshold),
    chargesAvailable: Number(row.charges_available),
    chargesReserved: Number(row.charges_reserved),
  }));
}

function participantDto(
  participant: DuelParticipantRow,
  match: DuelMatchRow,
  rules: DuelRulesSnapshot,
  inventoryAvailable: InventoryAvailabilityItem[] = [],
  liveStats: { shots: number; goals: number } | null = null,
): DuelParticipantDTO {
  const displayName =
    participant.side === 'challenger' ? (match.challenger_name ?? '') : (match.opponent_name ?? '');
  const avatarUrl =
    participant.side === 'challenger'
      ? (match.challenger_avatar_url ?? null)
      : (match.opponent_avatar_url ?? null);
  const shotsTaken = Number(participant.shots_taken) + (liveStats?.shots ?? 0);
  const goals = Number(participant.goals) + (liveStats?.goals ?? 0);
  const periodEndsAt =
    participant.state === 'period_active' && participant.period_started_at !== null
      ? new Date(
          participant.period_started_at.getTime() +
            getDuelPeriodRule(rules, participant.current_period).durationMs,
        ).toISOString()
      : null;
  const breakEndsAt =
    participant.state === 'break_active' && participant.break_started_at !== null
      ? new Date(participant.break_started_at.getTime() + rules.breakDurationMs).toISOString()
      : null;
  return {
    user_id: participant.user_id,
    display_name: displayName,
    avatar_url: avatarUrl,
    side: participant.side,
    state: participant.state,
    current_period: participant.current_period,
    shots_taken: shotsTaken,
    goals,
    accuracy: shotsTaken > 0 ? Math.round((goals / shotsTaken) * 100) : 0,
    active_duration_ms: Number(participant.active_duration_ms),
    active_duration_seconds: durationSeconds(Number(participant.active_duration_ms)),
    result_points: Number(participant.result_points),
    current_period_shots: liveStats?.shots ?? 0,
    current_period_goals: liveStats?.goals ?? 0,
    ready_at: participant.ready_at?.toISOString() ?? null,
    period_started_at: participant.period_started_at?.toISOString() ?? null,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    loadout: loadoutFromUnknown(participant.loadout_snapshot),
    inventory_available: inventoryAvailable,
    inventory_report: inventoryReportFromUnknown(participant.inventory_report),
  };
}

async function buildMatchDto(
  client: PoolClient,
  match: DuelMatchRow,
  currentUserId: string,
  now: Date,
): Promise<DuelMatchDTO> {
  match = await materializeLegacyVenueSnapshot(client, match);
  const participants = await fetchParticipants(client, match.id);
  const me = participants.find((participant) => participant.user_id === currentUserId);
  const opponent = participants.find((participant) => participant.user_id !== currentUserId);
  if (!me || !opponent) throw new AppError('forbidden', 'duel match access denied', 403);
  const rules = parseRulesSnapshot(match.rules_snapshot);
  const periodEndsAt =
    me.state === 'period_active' && me.period_started_at !== null
      ? new Date(
          me.period_started_at.getTime() + getDuelPeriodRule(rules, me.current_period).durationMs,
        ).toISOString()
      : null;
  const breakEndsAt =
    me.state === 'break_active' && me.break_started_at !== null
      ? new Date(me.break_started_at.getTime() + rules.breakDurationMs).toISOString()
      : null;
  const meCurrentStats =
    me.state === 'period_active'
      ? await fetchCurrentPeriodStats(client, match.id, currentUserId, me.current_period)
      : null;
  const opponentCurrentStats =
    opponent.state === 'period_active'
      ? await fetchCurrentPeriodStats(client, match.id, opponent.user_id, opponent.current_period)
      : null;
  return {
    id: match.id,
    template_id: match.template_id,
    status: match.status,
    source: match.source,
    ranked: match.ranked,
    season_key: match.season_key,
    duel_kind: match.duel_kind,
    home_user_id: match.home_user_id,
    venue_policy: match.venue_policy ?? 'neutral_default',
    arena: arenaDtoFromSnapshot(match.arena_snapshot),
    starts_at: match.starts_at.toISOString(),
    ends_at: match.ends_at.toISOString(),
    ready_expires_at: match.ready_expires_at?.toISOString() ?? null,
    cooldown_user_id: match.cooldown_user_id,
    cooldown_until: match.cooldown_until?.toISOString() ?? null,
    stake_amount: Number(match.stake_amount),
    entry_fee_amount: Number(match.entry_fee_amount),
    bank_amount: Number(match.bank_amount),
    winner_user_id: match.winner_user_id,
    outcome: match.outcome,
    settled_reason: match.settled_reason,
    accepted_at: match.accepted_at?.toISOString() ?? null,
    settled_at: match.settled_at?.toISOString() ?? null,
    created_at: match.created_at.toISOString(),
    server_now: now.toISOString(),
    period_started_at: me.period_started_at?.toISOString() ?? null,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    rules,
    me: participantDto(
      me,
      match,
      rules,
      await fetchAvailableInventory(client, currentUserId),
      meCurrentStats,
    ),
    opponent: participantDto(opponent, match, rules, [], opponentCurrentStats),
  };
}

async function buildMatchStateDto(
  client: PoolClient,
  match: DuelMatchRow,
  currentUserId: string,
  now: Date,
): Promise<DuelMatchStateDTO> {
  const dto = await buildMatchDto(client, match, currentUserId, now);
  const participants = await fetchParticipants(client, match.id);
  const me = participants.find((participant) => participant.user_id === currentUserId)!;
  const opponent = participants.find((participant) => participant.user_id !== currentUserId)!;
  const currentStats =
    me.state === 'period_active'
      ? await fetchCurrentPeriodStats(client, match.id, currentUserId, me.current_period)
      : { shots: 0, goals: 0 };
  const opponentCurrentStats =
    opponent.state === 'period_active'
      ? await fetchCurrentPeriodStats(client, match.id, opponent.user_id, opponent.current_period)
      : null;
  const rules = parseRulesSnapshot(match.rules_snapshot);
  const effects = effectsFromUnknown(me.inventory_effects_snapshot);
  const loadout = loadoutFromUnknown(me.loadout_snapshot, rules.powerCap);
  const periodEndsAt =
    me.state === 'period_active' && me.period_started_at !== null
      ? new Date(
          me.period_started_at.getTime() + getDuelPeriodRule(rules, me.current_period).durationMs,
        ).toISOString()
      : null;
  const breakEndsAt =
    me.state === 'break_active' && me.break_started_at !== null
      ? new Date(me.break_started_at.getTime() + rules.breakDurationMs).toISOString()
      : null;
  const recentPeriods = await fetchRecentPeriods(client, match.id, currentUserId);
  const opponentRecentPeriods = await fetchRecentPeriods(client, match.id, dto.opponent.user_id);
  return {
    ...dto,
    me: participantDto(
      me,
      match,
      rules,
      await fetchAvailableInventory(client, currentUserId),
      me.state === 'period_active' ? currentStats : null,
    ),
    opponent: participantDto(opponent, match, rules, [], opponentCurrentStats),
    server_now: now.toISOString(),
    match_seed:
      match.status === 'invited' || match.status === 'ready_check' || match.status === 'expired'
        ? null
        : match.match_seed,
    current_period_shots: currentStats.shots,
    current_period_goals: currentStats.goals,
    period_started_at: me.period_started_at?.toISOString() ?? null,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    period_speed_presets: effectivePeriodSpeedPresets(
      rules,
      periodSpeedEffectsForLoadout(effects, loadout),
    ),
    stick_effects: stickEffectsFromInventory(effects),
    recent_periods: recentPeriods.map(periodLogDto),
    opponent_recent_periods: opponentRecentPeriods.map(periodLogDto),
  };
}

async function notifyDuelMessage(
  app: Parameters<FastifyPluginAsync>[0],
  actorUserId: string,
  targetUserId: string,
  content: string,
  metadata?: Record<string, unknown>,
  options: { markReadForTarget?: boolean; silent?: boolean } = {},
): Promise<void> {
  const dm = await findOrCreateDM(app.pg, actorUserId, targetUserId);
  const sendOpts = {
    chatId: dm.chatId,
    senderId: actorUserId,
    content,
    ...(options.markReadForTarget === true ? { markReadForUserIds: [targetUserId] } : {}),
  };
  const dto = await sendMessage(
    app.pg,
    metadata !== undefined ? { ...sendOpts, metadata } : sendOpts,
  );
  await Promise.all([
    invalidateUnreadCache(app.redis, actorUserId),
    invalidateUnreadCache(app.redis, targetUserId),
  ]);
  await publishMessageNew(app.pg, app.realtime, dm.chatId, 'direct', dto, {
    silent: options.silent === true,
  });
}

async function fetchDisplayName(
  client: { query: PoolClient['query'] },
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ display_name: string }>(
    `select display_name from users where id = $1`,
    [userId],
  );
  return rows[0]?.display_name ?? 'Соперник';
}

function formatDuelInviteTtl(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function duelKindLabel(kind: DuelKind): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Экспресс+';
  return 'Классика';
}

function normalizeDuelKinds(kinds: DuelKind[]): DuelKind[] {
  const allowedOrder: DuelKind[] = ['express', 'express_plus', 'classic'];
  const selected = new Set(kinds);
  return allowedOrder.filter((kind) => selected.has(kind));
}

function duelKindsFromUnknown(value: unknown, fallback: DuelKind[]): DuelKind[] {
  const parsed = z.array(duelKindSchema).min(1).max(3).safeParse(value);
  return parsed.success ? normalizeDuelKinds(parsed.data) : fallback;
}

function buildDuelInviteMessage(
  matchId: string,
  challengerName: string,
  rules: DuelRulesSnapshot,
  startsAt: Date,
  replyByAt: Date,
): { content: string; metadata: AmateurDuelInviteMessageMetadata } {
  const bankAmount = rules.stakeAmount * 2;
  return {
    content: [
      `${challengerName} вызывает вас на дуэль.`,
      `Формат: ${duelKindLabel(rules.duelKind)}, ${rules.totalPeriods} период(а)`,
      `Ответить: в течение ${formatDuelInviteTtl(rules.challengeTtlMs)}`,
    ].join('\n'),
    metadata: {
      type: 'amateur_duel_invite',
      matchId,
      templateTitle: rules.title,
      challengerName,
      startsAt: startsAt.toISOString(),
      endsAt: replyByAt.toISOString(),
      totalPeriods: rules.totalPeriods,
      shotsPerPeriod: rules.shotsPerPeriod,
      periodDurationMs: rules.periodDurationMs,
      breakDurationMs: rules.breakDurationMs,
      stakeAmount: rules.stakeAmount,
      entryFeeAmount: rules.entryFeeAmount,
      bankAmount,
    },
  };
}

function resultTextFor(match: DuelMatchRow, userId: string): string {
  if (match.outcome === 'draw') return 'Ничья.';
  if (match.outcome === 'double_loss') return 'Оба игрока не завершили дуэль.';
  if (match.winner_user_id === userId) return 'Победа в дуэли!';
  return 'Поражение в дуэли. Можно взять реванш.';
}

function seasonKeyMoscow(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

async function assertRankedLimits(
  client: PoolClient,
  userIds: [string, string],
  rules: DuelRulesSnapshot,
  now: Date,
): Promise<void> {
  if (!rules.rankedEnabled) return;
  const since = new Date(now.getTime() - 86_400_000);
  for (const userId of userIds) {
    const { rows } = await client.query<{ total: number }>(
      `select count(*)::int as total
         from amateur_duel_match
        where ranked
          and status in ('active', 'settled')
          and accepted_at >= $2
          and (challenger_user_id = $1 or opponent_user_id = $1)`,
      [userId, since],
    );
    if (Number(rows[0]?.total ?? 0) >= rules.rankedDailyLimit) {
      throw new AppError('conflict', 'ranked duel daily limit reached', 409);
    }
  }
  const { rows } = await client.query<{ total: number }>(
    `select count(*)::int as total
       from amateur_duel_match
      where ranked
        and status in ('active', 'settled')
        and accepted_at >= $3
        and least(challenger_user_id, opponent_user_id) = least($1::uuid, $2::uuid)
        and greatest(challenger_user_id, opponent_user_id) = greatest($1::uuid, $2::uuid)`,
    [userIds[0], userIds[1], since],
  );
  if (Number(rows[0]?.total ?? 0) >= rules.rankedSameOpponentLimit) {
    throw new AppError('conflict', 'ranked duel opponent limit reached', 409);
  }
}

async function assertOpenDuelSlots(client: PoolClient, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const { rows } = await client.query<{ total: string }>(
      `select count(*)::text as total
         from amateur_duel_match
        where status in ('invited', 'ready_check', 'active')
          and (challenger_user_id = $1 or opponent_user_id = $1)`,
      [userId],
    );
    if (Number(rows[0]?.total ?? 0) >= MAX_OPEN_DUEL_SLOTS) {
      throw new AppError('conflict', 'open duel slot limit reached', 409);
    }
  }
}

async function createOpenMatch(
  client: PoolClient,
  opts: {
    template: DuelTemplateRow;
    challengerUserId: string;
    opponentUserId: string;
    now: Date;
    source: AmateurDuelSource;
    startsAt?: Date;
    endsAt?: Date;
  },
): Promise<{ match: DuelMatchRow; rules: DuelRulesSnapshot }> {
  const settings = await getGameSettings(client);
  const baseRules = makeRulesSnapshot(opts.template, settings);
  const rules: DuelRulesSnapshot =
    opts.source === 'tournament'
      ? {
          ...baseRules,
          rankedEnabled: false,
          matchmakingEnabled: false,
          stakeAmount: 0,
          entryFeeAmount: 0,
          winCurrencyReward: 0,
          drawCurrencyReward: 0,
          winStarReward: 0,
        }
      : baseRules;
  if (opts.source !== 'tournament') {
    const duplicate = await client.query<{ id: string }>(
      `select id
         from amateur_duel_match
        where least(challenger_user_id, opponent_user_id) = least($1::uuid, $2::uuid)
          and greatest(challenger_user_id, opponent_user_id) = greatest($1::uuid, $2::uuid)
          and status in ('invited', 'ready_check', 'active')
          and source <> 'tournament'
        limit 1`,
      [opts.challengerUserId, opts.opponentUserId],
    );
    if (duplicate.rows[0]) {
      throw new AppError('conflict', 'open duel already exists for this opponent', 409);
    }
    await assertOpenDuelSlots(client, [opts.challengerUserId, opts.opponentUserId]);
  }
  const inviteExpiresAt =
    opts.source === 'challenge'
      ? new Date(opts.now.getTime() + rules.challengeTtlMs)
      : new Date(opts.now.getTime() + rules.readyDurationMs);
  const status: MatchStatus = opts.source === 'challenge' ? 'invited' : 'ready_check';
  const challengerState: ParticipantState =
    opts.source === 'challenge' ? 'loadout_pending' : 'loadout_pending';
  const opponentState: ParticipantState =
    opts.source === 'challenge' ? 'invited' : 'loadout_pending';
  const seedBasis = `${opts.challengerUserId}:${opts.opponentUserId}:${opts.template.id}:${opts.now.toISOString()}`;
  const { rows } = await client.query<DuelMatchRow>(
    `insert into amateur_duel_match
      (template_id, challenger_user_id, opponent_user_id, status, source, ranked, season_key,
        duel_kind, rules_snapshot, match_seed, starts_at, ends_at, ready_expires_at, stake_amount,
        entry_fee_amount, bank_amount, game_core_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, greatest($11::timestamptz, $12::timestamptz),
             $13, $14, $15, $16, 0, $17)
     returning *`,
    [
      opts.template.id,
      opts.challengerUserId,
      opts.opponentUserId,
      status,
      opts.source,
      opts.source === 'tournament' ? false : rules.rankedEnabled,
      seasonKeyMoscow(opts.now),
      rules.duelKind,
      JSON.stringify(rules),
      seedBasis,
      opts.startsAt ?? opts.template.starts_at,
      opts.now,
      opts.endsAt ?? opts.template.ends_at,
      inviteExpiresAt,
      rules.stakeAmount,
      rules.entryFeeAmount,
      GAME_CORE_VERSION,
    ],
  );
  const createdMatch = rows[0]!;
  const venue = await resolveDuelVenue(client, {
    source: opts.source,
    policy:
      opts.source === 'challenge' || opts.source === 'tournament'
        ? 'neutral_default'
        : opts.template.matchmaking_venue_policy,
    challengerUserId: opts.challengerUserId,
    opponentUserId: opts.opponentUserId,
    randomUnit: deterministicUnitFromSeed(seedBasis, 'venue'),
  });
  const { rows: venueRows } = await client.query<DuelMatchRow>(
    `update amateur_duel_match
        set home_user_id = $2,
            arena_theme_id = $3,
            arena_snapshot = $4::jsonb,
            venue_policy = $5
      where id = $1
      returning *`,
    [
      createdMatch.id,
      venue.homeUserId,
      venue.arenaThemeId,
      JSON.stringify(venue.arena),
      venue.policy,
    ],
  );
  const match = venueRows[0]!;
  await client.query(
    `insert into amateur_duel_participant (match_id, user_id, side, state)
     values ($1, $2, 'challenger', $4), ($1, $3, 'opponent', $5)`,
    [match.id, opts.challengerUserId, opts.opponentUserId, challengerState, opponentState],
  );
  return { match, rules };
}

export async function createTournamentDuelMatch(
  client: PoolClient,
  input: {
    templateId: string;
    homeUserId: string;
    awayUserId: string;
    startsAt: Date;
    endsAt: Date;
    now: Date;
  },
): Promise<{ matchId: string }> {
  const template = await fetchTemplate(client, input.templateId);
  const { match } = await createOpenMatch(client, {
    template,
    challengerUserId: input.homeUserId,
    opponentUserId: input.awayUserId,
    now: input.now,
    source: 'tournament',
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  return { matchId: match.id };
}

async function activateReadyMatch(
  client: PoolClient,
  match: DuelMatchRow,
  rules: DuelRulesSnapshot,
  now: Date,
  duelSeedSecret: string,
): Promise<DuelMatchRow> {
  const participants = await fetchParticipants(client, match.id);
  if (participants.some((participant) => participant.state !== 'ready')) return match;
  await assertRankedLimits(client, [match.challenger_user_id, match.opponent_user_id], rules, now);
  const acceptedAtIso = now.toISOString();
  const matchSeed = deriveAmateurDuelSeed(
    match.id,
    match.challenger_user_id,
    match.opponent_user_id,
    acceptedAtIso,
    duelSeedSecret,
  );
  const activeEndsAt = new Date(
    Math.min(match.ends_at.getTime(), now.getTime() + estimateDuelPlayWindowMs(rules)),
  );

  for (const participant of participants) {
    const loadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
    const totalReserved = loadout.items.reduce((sum, item) => sum + item.chargesReserved, 0);
    if (rules.entryFeeAmount > 0) {
      await applyCurrencyDelta(client, {
        userId: participant.user_id,
        availableDelta: -rules.entryFeeAmount,
        reservedDelta: 0,
        reason: 'duel_entry_fee',
        matchId: match.id,
      });
    }
    if (rules.stakeAmount > 0) {
      await applyCurrencyDelta(client, {
        userId: participant.user_id,
        availableDelta: -rules.stakeAmount,
        reservedDelta: rules.stakeAmount,
        reason: 'duel_stake_hold',
        matchId: match.id,
      });
    }
    await reserveLoadoutInventory(client, participant.user_id, match.id, loadout);
    await client.query(
      `update amateur_duel_participant
          set state = 'accepted',
              stake_reserved = $3,
              entry_fee_paid = $4,
              reserved_inventory_charges = $5,
              inventory_effects_snapshot = $6,
              experience_snapshot = coalesce((select experience from users where id = $2), 0),
              updated_at = now()
        where match_id = $1 and user_id = $2`,
      [
        match.id,
        participant.user_id,
        rules.stakeAmount,
        rules.entryFeeAmount,
        totalReserved,
        JSON.stringify(combineEffects(loadout.items)),
      ],
    );
  }

  const { rows } = await client.query<DuelMatchRow>(
    `update amateur_duel_match
        set status = 'active',
            rules_snapshot = $2,
            match_seed = $3,
            duel_kind = $8,
            stake_amount = $4,
            entry_fee_amount = $5,
            bank_amount = $4 * 2,
            game_core_version = $6,
            accepted_at = $7,
            ends_at = $9,
            ready_expires_at = null,
            updated_at = now()
      where id = $1
      returning *`,
    [
      match.id,
      JSON.stringify(rules),
      matchSeed,
      rules.stakeAmount,
      rules.entryFeeAmount,
      GAME_CORE_VERSION,
      now,
      rules.duelKind,
      activeEndsAt,
    ],
  );
  return rows[0]!;
}

async function notifySettlement(app: Parameters<FastifyPluginAsync>[0], matchId: string) {
  const { rows } = await app.pg.query<DuelMatchRow>(
    `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
            ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
       from amateur_duel_match m
       join users cu on cu.id = m.challenger_user_id
       join users ou on ou.id = m.opponent_user_id
      where m.id = $1 and m.status = 'settled'`,
    [matchId],
  );
  const match = rows[0];
  if (!match) return;
  if (match.source === 'tournament') return;
  for (const userId of [match.challenger_user_id, match.opponent_user_id]) {
    const text = resultTextFor(match, userId);
    void enqueueDuelPush(app.pg, {
      userId,
      eventType: 'duel.result_ready',
      eventKey: `duel:result:${match.id}:${userId}`,
      variables: { resultText: text, matchId: match.id },
      fallback: {
        title: 'Дуэль завершена',
        body: text,
        url: '/?view=amateur',
      },
      tag: `ultimate-hockey-duel-result-${match.id}`,
    }).catch((err) => app.log.warn({ err, matchId: match.id }, 'duel result push failed'));
  }
}

async function publishDuelFixtureProgress(
  app: Parameters<FastifyPluginAsync>[0],
  duelMatchId: string,
): Promise<void> {
  await publishTournamentFixtureProgress(app.pg, app.realtime, app.log, {
    duelMatchId,
    sequence: Date.now(),
  });
}

async function isSettled(client: PoolClient, matchId: string): Promise<boolean> {
  const { rows } = await client.query<{ status: MatchStatus }>(
    `select status from amateur_duel_match where id = $1`,
    [matchId],
  );
  return rows[0]?.status === 'settled';
}

export const amateurDuelRoutes: FastifyPluginAsync<{ duelSeedSecret: string }> = async (
  app,
  opts,
) => {
  app.get('/duel/amateur/templates', { preHandler: [app.authenticate] }, async () => {
    const { rows } = await app.pg.query<DuelTemplateRow>(
      `with ranked_templates as (
         select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
                matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
                period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
                ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
                ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
                stake_amount, entry_fee_amount, required_inventory_item_id,
                inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
                win_star_reward, created_at, updated_at,
                row_number() over (partition by duel_kind order by starts_at asc, created_at desc, id asc) as template_rank
           from amateur_duel_template
          where deleted_at is null and is_active
       )
       select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
              matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
              period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
              ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
              ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
              stake_amount, entry_fee_amount, required_inventory_item_id,
              inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
              win_star_reward, created_at, updated_at
         from ranked_templates
        where template_rank = 1
        order by starts_at asc, created_at desc`,
    );
    return {
      templates: rows.map((template) => ({
        id: template.id,
        title: template.title,
        description: template.description,
        difficulty: template.difficulty,
        duel_kind: template.duel_kind,
        duel_variant: template.duel_variant,
        ranked_enabled: template.ranked_enabled,
        matchmaking_enabled: template.matchmaking_enabled,
        matchmaking_venue_policy: template.matchmaking_venue_policy,
        starts_at: template.starts_at.toISOString(),
        ends_at: template.ends_at.toISOString(),
        total_periods: Number(template.total_periods),
        shots_per_period: Number(template.shots_per_period),
        period_duration_ms: Number(template.period_duration_ms),
        break_duration_ms: Number(template.break_duration_ms),
        challenge_ttl_ms: Number(template.challenge_ttl_ms),
        ready_duration_ms: Number(template.ready_duration_ms),
        ready_no_show_cooldown_ms: Number(template.ready_no_show_cooldown_ms),
        matchmaking_timeout_ms: Number(template.matchmaking_timeout_ms),
        ranked_daily_limit: Number(template.ranked_daily_limit),
        ranked_same_opponent_limit: Number(template.ranked_same_opponent_limit),
        power_cap: Number(template.power_cap),
        goalie_id: template.goalie_id,
        period_speed_presets: parsePeriodSpeedPresets(template.period_speed_presets),
        period_rules: parseTemplatePeriodRules(template.period_rules, {
          duelKind: template.duel_kind,
          totalPeriods: Number(template.total_periods),
          shotsPerPeriod: Number(template.shots_per_period),
          periodDurationMs: Number(template.period_duration_ms),
        }),
        stake_amount: Number(template.stake_amount),
        entry_fee_amount: Number(template.entry_fee_amount),
        required_inventory_item_id: template.required_inventory_item_id,
        inventory_charges_per_period: Number(template.inventory_charges_per_period),
        win_points: Number(template.win_points),
        draw_points: Number(template.draw_points),
        win_currency_reward: Number(template.win_currency_reward),
        draw_currency_reward: Number(template.draw_currency_reward),
        win_star_reward: Number(template.win_star_reward),
      })),
    };
  });

  app.get('/duel/amateur/opponents', { preHandler: [app.authenticate] }, async (req) => {
    const query = z
      .object({
        q: z.string().trim().max(100).default(''),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    return withTransaction(app, async (client) => {
      await assertAmateurEligible(client, req.user.id);
      const settings = await getGameSettings(client);
      const { rows } = await client.query<{
        id: string;
        display_name: string;
        avatar_url: string | null;
        last_seen_at: Date | null;
        lifetime_goals_total: number;
        level: number;
      }>(
        `select id, display_name, avatar_url, last_seen_at, lifetime_goals_total, level
           from users
          where id <> $1
            and (level >= 2 or lifetime_goals_total >= $4)
            and ($2 = '' or display_name ilike '%' || $2 || '%')
          order by last_seen_at desc nulls last, display_name asc
          limit $3`,
        [req.user.id, query.q, query.limit, settings.amateur.unlockGoalsRequired],
      );
      return {
        users: rows.map((row) => ({
          userId: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          lastSeenAt: row.last_seen_at?.toISOString() ?? null,
        })),
      };
    });
  });

  app.get('/duel/amateur/matches', { preHandler: [app.authenticate] }, async (req) => {
    const response = await withTransaction(app, async (client) => {
      const now = new Date();
      const { rows } = await client.query<DuelMatchRow>(
        `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
                ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
           from amateur_duel_match m
           join users cu on cu.id = m.challenger_user_id
           join users ou on ou.id = m.opponent_user_id
	          where (m.challenger_user_id = $1 or m.opponent_user_id = $1)
	            and m.status in ('invited', 'ready_check', 'active', 'settled')
	            and (
	              m.source <> 'tournament'
	              or coalesce((select (value #>> '{}')::boolean from game_settings
	                            where key = 'tournaments.enabled'), false)
	            )
	          order by case when m.status in ('invited', 'ready_check', 'active') then 0 else 1 end,
	                   m.created_at desc
	          limit 50`,
        [req.user.id],
      );
      const matches: DuelMatchDTO[] = [];
      const changedMatchIds = new Set<string>();
      for (const row of rows) {
        const reconciled =
          row.status === 'settled'
            ? { match: await fetchVisibleMatchForUpdate(client, row.id), changed: false }
            : await reconcileMatch(
                client,
                await fetchPlayableMatchForUpdate(client, row.id),
                now,
              );
        if (reconciled.changed) changedMatchIds.add(reconciled.match.id);
        const match = reconciled.match;
        if (
          match.status === 'invited' ||
          match.status === 'ready_check' ||
          match.status === 'active' ||
          match.status === 'settled'
        ) {
          matches.push(await buildMatchDto(client, match, req.user.id, now));
        }
      }
      return { matches, changedMatchIds: [...changedMatchIds] };
    });
    for (const matchId of response.changedMatchIds) {
      await publishDuelFixtureProgress(app, matchId);
    }
    return { matches: response.matches };
  });

  app.get('/duel/amateur/history', { preHandler: [app.authenticate] }, async (req) => {
    const query = duelHistoryQuerySchema.parse(req.query);
    return withTransaction(app, async (client) => {
      const now = new Date();
      const seasonFilterSql = query.season_key ? `and m.season_key = $2` : '';
      const listParams = query.season_key
        ? [req.user.id, query.season_key, query.limit, query.offset]
        : [req.user.id, query.limit, query.offset];
      const limitParam = query.season_key ? '$3' : '$2';
      const offsetParam = query.season_key ? '$4' : '$3';
      const { rows } = await client.query<DuelMatchRow>(
        `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
	                ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
	           from amateur_duel_match m
	           join users cu on cu.id = m.challenger_user_id
	           join users ou on ou.id = m.opponent_user_id
	          where (m.challenger_user_id = $1 or m.opponent_user_id = $1)
	            and m.status = 'settled'
	            and (
	              m.source <> 'tournament'
	              or coalesce((select (value #>> '{}')::boolean from game_settings
	                            where key = 'tournaments.enabled'), false)
	            )
	            ${seasonFilterSql}
	          order by coalesce(m.settled_at, m.created_at) desc, m.created_at desc
	          limit ${limitParam}
	         offset ${offsetParam}`,
        listParams,
      );
      const statsParams = query.season_key ? [req.user.id, query.season_key] : [req.user.id];
      const { rows: statsRows } = await client.query<{
        duels: number;
        wins: number;
        points: number;
      }>(
        `select count(*)::int as duels,
	                count(*) filter (where m.winner_user_id = $1)::int as wins,
	                coalesce(sum(p.result_points), 0)::int as points
	           from amateur_duel_match m
	           join amateur_duel_participant p on p.match_id = m.id and p.user_id = $1
	          where m.status = 'settled'
	            and (
	              m.source <> 'tournament'
	              or coalesce((select (value #>> '{}')::boolean from game_settings
	                            where key = 'tournaments.enabled'), false)
	            )
	            ${seasonFilterSql}`,
        statsParams,
      );
      const { rows: seasonRows } = await client.query<{ season_key: string }>(
        `select distinct season_key
	           from (
	             select m.season_key
	               from amateur_duel_match m
	              where (m.challenger_user_id = $1 or m.opponent_user_id = $1)
	                and m.status = 'settled'
	                and (
	                  m.source <> 'tournament'
	                  or coalesce((select (value #>> '{}')::boolean from game_settings
	                                where key = 'tournaments.enabled'), false)
	                )
	             union
	             select r.season_key
	               from amateur_duel_rating r
	              where r.user_id = $1
	           ) seasons
	          order by season_key desc`,
        [req.user.id],
      );
      const ratingPlace = query.season_key
        ? await client
            .query<{ rank: number }>(
              `select ranked.rank::int as rank
	                 from (
	                   select r.user_id,
	                          row_number() over (
	                            order by r.points desc, r.wins desc, r.active_duration_seconds asc,
	                                     u.display_name asc
	                          ) as rank
	                     from amateur_duel_rating r
	                     join users u on u.id = r.user_id
	                    where r.season_key = $1
	                 ) ranked
	                where ranked.user_id = $2`,
              [query.season_key, req.user.id],
            )
            .then((result) => result.rows[0]?.rank ?? null)
        : null;
      const matches: DuelMatchDTO[] = [];
      for (const row of rows) {
        matches.push(await buildMatchDto(client, row, req.user.id, now));
      }
      return {
        season_key: query.season_key ?? null,
        seasons: seasonRows.map((row) => row.season_key),
        rating_place: ratingPlace,
        stats: statsRows[0] ?? { duels: 0, wins: 0, points: 0 },
        matches,
      };
    });
  });

  app.get('/duel/amateur/events', { preHandler: [app.authenticate] }, async (req) => {
    const response = await withTransaction(app, async (client) => {
      const now = new Date();
      const { rows } = await client.query<DuelMatchRow>(
        `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
                ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
           from amateur_duel_match m
           join users cu on cu.id = m.challenger_user_id
           join users ou on ou.id = m.opponent_user_id
          where (m.challenger_user_id = $1 or m.opponent_user_id = $1)
            and m.status in ('invited', 'ready_check', 'active')
            and (
              m.source <> 'tournament'
              or coalesce((select (value #>> '{}')::boolean from game_settings
                            where key = 'tournaments.enabled'), false)
            )
          order by m.starts_at asc, m.created_at desc
          limit 10`,
        [req.user.id],
      );
      const events: DuelMatchDTO[] = [];
      const changedMatchIds = new Set<string>();
      for (const row of rows) {
        const reconciled = await reconcileMatch(
          client,
          await fetchPlayableMatchForUpdate(client, row.id),
          now,
        );
        if (reconciled.changed) changedMatchIds.add(reconciled.match.id);
        const match = reconciled.match;
        if (
          match.status === 'invited' ||
          match.status === 'ready_check' ||
          match.status === 'active'
        ) {
          events.push(await buildMatchDto(client, match, req.user.id, now));
        }
      }
      return { events, changedMatchIds: [...changedMatchIds] };
    });
    for (const matchId of response.changedMatchIds) {
      await publishDuelFixtureProgress(app, matchId);
    }
    return { events: response.events };
  });

  app.post('/duel/amateur/challenge', { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ template_id: uuid, opponent_user_id: uuid }).safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid duel challenge payload', 400);
    const { template_id: templateId, opponent_user_id: opponentUserId } = body.data;
    if (opponentUserId === req.user.id) {
      throw new AppError('bad_request', 'cannot challenge yourself', 400);
    }

    const result = await withTransaction(app, async (client) => {
      const now = new Date();
      await assertAmateurEligible(client, req.user.id);
      await assertAmateurEligible(client, opponentUserId);
      const template = await fetchTemplate(client, templateId);
      if (!template.is_active) throw new AppError('conflict', 'duel template is inactive', 409);
      if (now >= template.ends_at)
        throw new AppError('conflict', 'duel template window is closed', 409);
      const { match, rules } = await createOpenMatch(client, {
        template,
        challengerUserId: req.user.id,
        opponentUserId,
        now,
        source: 'challenge',
      });
      await appendEvent(client, req.user.id, 'amateur_duel_challenge_created', {
        match_id: match.id,
        template_id: template.id,
        opponent_user_id: opponentUserId,
      });
      return {
        matchId: match.id,
        title: rules.title,
        rules,
        startsAt: match.starts_at,
        replyByAt: match.ready_expires_at ?? match.ends_at,
      };
    });

    const challengerName = await fetchDisplayName(app.pg, req.user.id);
    const inviteMessage = buildDuelInviteMessage(
      result.matchId,
      challengerName,
      result.rules,
      result.startsAt,
      result.replyByAt,
    );
    await notifyDuelMessage(
      app,
      req.user.id,
      opponentUserId,
      inviteMessage.content,
      inviteMessage.metadata,
      { markReadForTarget: true, silent: true },
    ).catch((err) => app.log.warn({ err, matchId: result.matchId }, 'duel DM notification failed'));
    void enqueueDuelPush(app.pg, {
      userId: opponentUserId,
      eventType: 'duel.challenge_received',
      eventKey: `duel:challenge:${result.matchId}`,
      variables: { challengerName, matchId: result.matchId },
      fallback: {
        title: 'Вас вызвали на дуэль',
        body: `${challengerName} ждёт ответа в любительской лиге.`,
        url: '/?view=amateur',
      },
      tag: `ultimate-hockey-duel-challenge-${result.matchId}`,
    }).catch((err) => app.log.warn({ err, matchId: result.matchId }, 'duel push failed'));

    const match = await withTransaction(app, async (client) => {
      const row = await fetchMatchForUpdate(client, result.matchId);
      return buildMatchDto(client, row, req.user.id, new Date());
    });
    return { match };
  });

  app.post(
    '/duel/amateur/matches/:matchId/accept',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const accepted = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = await fetchPlayableMatchForUpdate(client, params.matchId);
        if (match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'only challenged player can accept duel', 403);
        }
        if (match.status !== 'invited') {
          throw new AppError('conflict', 'duel challenge is not pending', 409);
        }
        await assertAmateurEligible(client, match.challenger_user_id);
        await assertAmateurEligible(client, match.opponent_user_id);
        const template = match.template_id ? await fetchTemplate(client, match.template_id) : null;
        if (!template || !template.is_active) {
          throw new AppError('conflict', 'duel template is inactive', 409);
        }
        if (now >= template.ends_at) throw new AppError('conflict', 'duel window is closed', 409);
        const settings = await getGameSettings(client);
        const rules = makeRulesSnapshot(template, settings);
        const readyExpiresAt = new Date(now.getTime() + rules.readyDurationMs);
        const { rows } = await client.query<DuelMatchRow>(
          `update amateur_duel_match
            set status = 'ready_check',
                rules_snapshot = $2,
                duel_kind = $10,
                starts_at = greatest($3::timestamptz, $4::timestamptz),
                ends_at = $5,
                ready_expires_at = $6,
                stake_amount = $7,
                entry_fee_amount = $8,
                game_core_version = $9,
                updated_at = now()
          where id = $1
          returning *`,
          [
            match.id,
            JSON.stringify(rules),
            template.starts_at,
            now,
            template.ends_at,
            readyExpiresAt,
            rules.stakeAmount,
            rules.entryFeeAmount,
            GAME_CORE_VERSION,
            rules.duelKind,
          ],
        );
        match = rows[0]!;
        await client.query(
          `update amateur_duel_participant
              set state = 'loadout_pending',
                  updated_at = now()
            where match_id = $1`,
          [match.id],
        );
        await appendEvent(client, req.user.id, 'amateur_duel_challenge_accepted', {
          match_id: match.id,
          challenger_user_id: match.challenger_user_id,
        });
        return {
          matchId: match.id,
          challengerUserId: match.challenger_user_id,
          title: rules.title,
        };
      });
      await publishDuelFixtureProgress(app, accepted.matchId);

      const opponentName = await fetchDisplayName(app.pg, req.user.id);
      await notifyDuelMessage(
        app,
        req.user.id,
        accepted.challengerUserId,
        `${opponentName} принял дуэль «${accepted.title}».`,
        undefined,
        { markReadForTarget: true, silent: true },
      ).catch((err) =>
        app.log.warn({ err, matchId: accepted.matchId }, 'duel accept DM notification failed'),
      );

      return withTransaction(app, async (client) => {
        const match = await fetchMatchForUpdate(client, accepted.matchId);
        return { match: await buildMatchStateDto(client, match, req.user.id, new Date()) };
      });
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/decline',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const declined = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = await fetchPlayableMatchForUpdate(client, params.matchId);
        if (match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'only challenged player can decline duel', 403);
        }
        match = (await reconcileMatch(client, match, now)).match;
        if (match.status !== 'invited') {
          throw new AppError('conflict', 'duel challenge is not pending', 409);
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        await client.query(
          `update amateur_duel_match
            set status = 'cancelled',
                settled_reason = 'declined',
                settled_at = $2,
                updated_at = now()
          where id = $1 and status = 'invited'`,
          [match.id, now],
        );
        await client.query(
          `update amateur_duel_participant
            set state = case when user_id = $2 then 'forfeit' else state end,
                updated_at = now()
          where match_id = $1`,
          [match.id, req.user.id],
        );
        await appendEvent(client, req.user.id, 'amateur_duel_challenge_declined', {
          match_id: match.id,
          challenger_user_id: match.challenger_user_id,
        });
        const updated = await fetchMatchForUpdate(client, match.id);
        return {
          matchId: match.id,
          challengerUserId: match.challenger_user_id,
          title: rules.title,
          match: await buildMatchStateDto(client, updated, req.user.id, now),
        };
      });

      const opponentName = await fetchDisplayName(app.pg, req.user.id);
      await notifyDuelMessage(
        app,
        req.user.id,
        declined.challengerUserId,
        `${opponentName} отклонил приглашение на дуэль «${declined.title}».`,
      ).catch((err) =>
        app.log.warn({ err, matchId: declined.matchId }, 'duel decline DM notification failed'),
      );

      return { match: declined.match };
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/cancel',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const cancelled = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = (
          await reconcileMatch(
            client,
            await fetchPlayableMatchForUpdate(client, params.matchId),
            now,
          )
        ).match;
        if (match.challenger_user_id !== req.user.id) {
          throw new AppError('forbidden', 'only challenger can cancel duel', 403);
        }
        if (match.status !== 'invited') {
          throw new AppError('conflict', 'only unanswered duel can be cancelled', 409);
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        await client.query(
          `update amateur_duel_match
              set status = 'cancelled',
                  settled_reason = 'cancelled_by_challenger',
                  settled_at = $2,
                  updated_at = now()
            where id = $1 and status = 'invited'`,
          [match.id, now],
        );
        match = await fetchMatchForUpdate(client, match.id);
        await appendEvent(client, req.user.id, 'amateur_duel_challenge_cancelled', {
          match_id: match.id,
          opponent_user_id: match.opponent_user_id,
        });
        return {
          matchId: match.id,
          opponentUserId: match.opponent_user_id,
          title: rules.title,
          match: await buildMatchStateDto(client, match, req.user.id, now),
        };
      });

      const challengerName = await fetchDisplayName(app.pg, req.user.id);
      await notifyDuelMessage(
        app,
        req.user.id,
        cancelled.opponentUserId,
        `${challengerName} отменил дуэль «${cancelled.title}».`,
      ).catch((err) =>
        app.log.warn({ err, matchId: cancelled.matchId }, 'duel cancel DM notification failed'),
      );
      return { match: cancelled.match };
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/ready',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const parsed = readyBodySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError('bad_request', 'invalid duel ready payload', 400);
      const response = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = (
          await reconcileMatch(
            client,
            await fetchPlayableMatchForUpdate(client, params.matchId),
            now,
          )
        ).match;
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        if (match.status !== 'ready_check') {
          throw new AppError('conflict', `cannot ready in duel status '${match.status}'`, 409);
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        const loadout = await buildLoadoutSnapshot(client, req.user.id, parsed.data.loadout, rules);
        await client.query(
          `update amateur_duel_participant
              set state = 'ready',
                  ready_at = $3,
                  loadout_snapshot = $4,
                  updated_at = now()
            where match_id = $1
              and user_id = $2
              and state in ('loadout_pending', 'ready')`,
          [match.id, req.user.id, now, JSON.stringify(loadout)],
        );
        match = await activateReadyMatch(
          client,
          await fetchMatchForUpdate(client, match.id),
          rules,
          now,
          opts.duelSeedSecret,
        );
        return { match: await buildMatchStateDto(client, match, req.user.id, now) };
      });
      await publishDuelFixtureProgress(app, response.match.id);
      return response;
    },
  );

  app.post('/duel/amateur/matchmaking/join', { preHandler: [app.authenticate] }, async (req) => {
    const body = matchmakingJoinSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid matchmaking payload', 400);
    return withTransaction(app, async (client) => {
      const now = new Date();
      await assertAmateurEligible(client, req.user.id);
      const templateFromLegacyPayload = body.data.template_id
        ? await fetchTemplate(client, body.data.template_id)
        : null;
      const requestedKinds = normalizeDuelKinds(
        body.data.duel_kinds ??
          (templateFromLegacyPayload ? [templateFromLegacyPayload.duel_kind] : []),
      );
      if (requestedKinds.length === 0) {
        throw new AppError('bad_request', 'matchmaking duel kinds are required', 400);
      }
      const templates = await fetchMatchmakingTemplates(client, requestedKinds, now);
      if (templates.length === 0) {
        throw new AppError('conflict', 'matchmaking is unavailable for selected duels', 409);
      }
      await assertOpenDuelSlots(client, [req.user.id]);
      const templatesByKind = new Map(templates.map((template) => [template.duel_kind, template]));
      await client.query(
        `update amateur_duel_matchmaking_ticket
            set status = 'expired', updated_at = now()
          where status = 'queued' and expires_at <= $1`,
        [now],
      );
      const existing = await client.query<{ id: string; expires_at: Date; duel_kinds: unknown }>(
        `select id, expires_at, duel_kinds
           from amateur_duel_matchmaking_ticket
          where user_id = $1 and status = 'queued'
          limit 1`,
        [req.user.id],
      );
      if (existing.rows[0]) {
        return {
          ticket: {
            id: existing.rows[0].id,
            status: 'queued',
            expires_at: existing.rows[0].expires_at.toISOString(),
            duel_kinds: duelKindsFromUnknown(existing.rows[0].duel_kinds, requestedKinds),
          },
        };
      }
      const opponent = await client.query<{ id: string; user_id: string; duel_kinds: unknown }>(
        `select id, user_id, duel_kinds
           from amateur_duel_matchmaking_ticket
          where user_id <> $1
            and status = 'queued'
            and expires_at > $2
          order by created_at asc
          limit 20
          for update skip locked`,
        [req.user.id, now],
      );
      const opponentTicket = opponent.rows.find((ticket) => {
        const opponentKinds = duelKindsFromUnknown(ticket.duel_kinds, requestedKinds);
        return requestedKinds.some(
          (kind) => opponentKinds.includes(kind) && templatesByKind.has(kind),
        );
      });
      if (!opponentTicket) {
        const expiresAt = new Date(now.getTime() + MATCHMAKING_TIMEOUT_MS);
        const primaryTemplate = templates[0]!;
        const { rows } = await client.query<{
          id: string;
          status: string;
          expires_at: Date;
          duel_kinds: unknown;
        }>(
          `insert into amateur_duel_matchmaking_ticket (template_id, user_id, expires_at, duel_kinds)
           values ($1, $2, $3, $4)
           returning id, status, expires_at, duel_kinds`,
          [primaryTemplate.id, req.user.id, expiresAt, JSON.stringify(requestedKinds)],
        );
        return {
          ticket: {
            id: rows[0]!.id,
            status: rows[0]!.status,
            expires_at: rows[0]!.expires_at.toISOString(),
            duel_kinds: duelKindsFromUnknown(rows[0]!.duel_kinds, requestedKinds),
          },
        };
      }
      const opponentKinds = duelKindsFromUnknown(opponentTicket.duel_kinds, requestedKinds);
      const matchedKind = requestedKinds.find(
        (kind) => opponentKinds.includes(kind) && templatesByKind.has(kind),
      );
      if (!matchedKind) throw new AppError('conflict', 'matchmaking opponent is unavailable', 409);
      const template = templatesByKind.get(matchedKind)!;
      await assertAmateurEligible(client, opponentTicket.user_id);
      const { match } = await createOpenMatch(client, {
        template,
        challengerUserId: opponentTicket.user_id,
        opponentUserId: req.user.id,
        now,
        source: 'matchmaking',
      });
      await client.query(
        `update amateur_duel_matchmaking_ticket
            set status = 'matched', matched_match_id = $2, updated_at = now()
          where id = $1`,
        [opponentTicket.id, match.id],
      );
      return { match: await buildMatchDto(client, match, req.user.id, now) };
    });
  });

  app.post('/duel/amateur/matchmaking/leave', { preHandler: [app.authenticate] }, async (req) => {
    const body = matchmakingLeaveSchema.safeParse(req.body ?? {});
    if (!body.success) throw new AppError('bad_request', 'invalid matchmaking payload', 400);
    const templateId = body.data?.template_id;
    await app.pg.query(
      `update amateur_duel_matchmaking_ticket
          set status = 'cancelled', updated_at = now()
        where user_id = $1 and status = 'queued'
          and ($2::uuid is null or template_id = $2)`,
      [req.user.id, templateId ?? null],
    );
    return { ok: true };
  });

  app.get('/duel/amateur/matches/:matchId', { preHandler: [app.authenticate] }, async (req) => {
    const params = z.object({ matchId: uuid }).parse(req.params);
    const response = await withTransaction(app, async (client) => {
      const now = new Date();
      const reconciled = await reconcileMatch(
        client,
        await fetchVisibleMatchForUpdate(client, params.matchId),
        now,
      );
      const match = reconciled.match;
      if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
        throw new AppError('forbidden', 'duel match access denied', 403);
      }
      return {
        match: await buildMatchStateDto(client, match, req.user.id, now),
        changed: reconciled.changed,
      };
    });
    if (response.changed) await publishDuelFixtureProgress(app, response.match.id);
    return { match: response.match };
  });

  app.patch(
    '/duel/amateur/matches/:matchId/loadout',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const parsed = activeLoadoutBodySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError('bad_request', 'invalid duel loadout payload', 400);
      const response = await withTransaction(app, async (client) => {
        const now = new Date();
        const reconciled = await reconcileMatch(
          client,
          await fetchPlayableMatchForUpdate(client, params.matchId),
          now,
        );
        let match = reconciled.match;
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        if (match.status !== 'active') {
          throw new AppError(
            'conflict',
            `cannot update loadout in duel status '${match.status}'`,
            409,
          );
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        const participants = await fetchParticipants(client, match.id);
        const participant = participants.find((p) => p.user_id === req.user.id);
        if (!participant) throw new AppError('forbidden', 'duel match access denied', 403);
        if (participant.state !== 'period_active') {
          throw new AppError(
            'conflict',
            `cannot update loadout in state '${participant.state}'`,
            409,
          );
        }
        const currentLoadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
        const stickOnly = await buildLoadoutSnapshot(
          client,
          req.user.id,
          { stick: parsed.data.loadout.stick },
          rules,
        );
        const nextLoadout = loadoutWithActiveShotStick(currentLoadout, stickOnly, rules);
        await client.query(
          `update amateur_duel_participant
              set loadout_snapshot = $3,
                  updated_at = now()
            where match_id = $1 and user_id = $2`,
          [match.id, req.user.id, JSON.stringify(nextLoadout)],
        );
        match = await fetchMatchForUpdate(client, match.id);
        return {
          match: await buildMatchStateDto(client, match, req.user.id, now),
          changed: reconciled.changed,
        };
      });
      if (response.changed) await publishDuelFixtureProgress(app, response.match.id);
      return { match: response.match };
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/period/start',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const parsed = startPeriodBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new AppError('bad_request', 'invalid duel period payload', 400);
      const response = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = (
          await reconcileMatch(
            client,
            await fetchPlayableMatchForUpdate(client, params.matchId),
            now,
          )
        ).match;
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        if (match.status !== 'active') {
          throw new AppError(
            'conflict',
            `cannot start period in duel status '${match.status}'`,
            409,
          );
        }
        if (now < match.starts_at || now >= match.ends_at) {
          throw new AppError('conflict', 'duel is outside its play window', 409);
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        const participants = await fetchParticipants(client, match.id);
        const participant = participants.find((p) => p.user_id === req.user.id);
        if (!participant) throw new AppError('forbidden', 'duel match access denied', 403);
        if (participant.state !== 'accepted') {
          throw new AppError(
            'conflict',
            `cannot start period in state '${participant.state}'`,
            409,
          );
        }
        if (participant.current_period >= rules.totalPeriods) {
          throw new AppError('conflict', 'all duel periods completed', 409);
        }
        if (parsed.data.loadout !== undefined) {
          const currentLoadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
          const stickOnly = await buildLoadoutSnapshot(
            client,
            req.user.id,
            { stick: parsed.data.loadout.stick ?? null },
            rules,
          );
          const nextLoadout = loadoutWithUpdatedShotStick(currentLoadout, stickOnly, rules);
          participant.loadout_snapshot = nextLoadout;
          await client.query(
            `update amateur_duel_participant
                set loadout_snapshot = $3,
                    updated_at = now()
              where match_id = $1 and user_id = $2`,
            [match.id, req.user.id, JSON.stringify(nextLoadout)],
          );
        }
        await consumeInventoryForPeriod(client, participant, rules);
        await client.query(
          `update amateur_duel_participant
              set state = 'period_active',
                  current_period = current_period + 1,
                  period_started_at = $3,
                  break_started_at = null,
                  ready_at = null,
                  updated_at = now()
            where match_id = $1 and user_id = $2`,
          [match.id, req.user.id, now],
        );
        match = await fetchMatchForUpdate(client, match.id);
        return { match: await buildMatchStateDto(client, match, req.user.id, now) };
      });
      await publishDuelFixtureProgress(app, response.match.id);
      return response;
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/shot',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const parsed = shotBodySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError('bad_request', 'invalid duel shot payload', 400);
      const body = parsed.data;

      const response = await withTransaction(app, async (client) => {
        const now = new Date();
        let match = (
          await reconcileMatch(
            client,
            await fetchPlayableMatchForUpdate(client, params.matchId),
            now,
          )
        ).match;
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        if (match.status !== 'active') {
          throw new AppError(
            'conflict',
            `cannot submit shot in duel status '${match.status}'`,
            409,
          );
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        const participants = await fetchParticipants(client, match.id);
        const participant = participants.find((p) => p.user_id === req.user.id);
        if (!participant) throw new AppError('forbidden', 'duel match access denied', 403);
        if (participant.state !== 'period_active' || participant.period_started_at === null) {
          throw new AppError('conflict', `cannot submit shot in state '${participant.state}'`, 409);
        }
        const cur = await fetchCurrentPeriodStats(
          client,
          match.id,
          req.user.id,
          participant.current_period,
        );
        const periodRule = getDuelPeriodRule(rules, participant.current_period);
        const expectedShotIndex = cur.shots + 1;
        if (body.shot_index !== expectedShotIndex) {
          throw new AppError(
            'conflict',
            `shot_index mismatch: expected ${expectedShotIndex}, got ${body.shot_index}`,
            409,
          );
        }
        if (
          periodRule.mode === 'quota' &&
          periodRule.shotsLimit !== null &&
          cur.shots >= periodRule.shotsLimit
        ) {
          throw new AppError('conflict', 'shot quota for this duel period exhausted', 409);
        }
        assertDuelTapTimeFresh(participant, cur.shots, body.input.tapTime, now);

        const loadout = loadoutFromUnknown(participant.loadout_snapshot, rules.powerCap);
        const inventoryReport = inventoryReportFromUnknown(participant.inventory_report);
        const effects = effectsFromUnknown(participant.inventory_effects_snapshot);
        const basePeriodSpeeds = rules.periodSpeedPresets.find(
          (preset) => preset.periodNumber === participant.current_period,
        );
        if (!basePeriodSpeeds)
          throw new AppError('server_error', 'missing base period speeds', 500);
        const periodSpeeds = effectivePeriodSpeedPresets(
          rules,
          periodSpeedEffectsForLoadout(effects, loadout),
        ).find((preset) => preset.periodNumber === participant.current_period);
        if (!periodSpeeds)
          throw new AppError('server_error', 'missing effective period speeds', 500);
        const elapsedMs = Math.max(0, body.input.tapTime);
        const condition = getDuelPlayerCondition({
          seed: match.match_seed,
          userId: participant.user_id,
          periodNumber: participant.current_period,
          elapsedMs,
          movementDistancePx: movementDistancePxForElapsed(
            elapsedMs,
            periodSpeeds.shooterFrequency,
          ),
          baseLaneWidthPx: SHOOTER_AMPLITUDE * 2,
          baselineShooterSpeed: basePeriodSpeeds.shooterFrequency,
          currentShooterSpeed: periodSpeeds.shooterFrequency,
          loadout: conditionLoadoutFromSnapshot(
            loadout,
            inventoryReport,
            participant.current_period,
            rules,
          ),
        });
        if (!condition.canShoot) {
          throw new AppError(
            'conflict',
            `player cannot shoot during duel inventory status '${condition.status}'`,
            409,
          );
        }
        const effectiveShooterFrequency = clampSpeed(
          periodSpeeds.shooterFrequency * condition.shooterSpeedMultiplier,
          0.1,
          3,
        );
        const shotInput = {
          tapTime: body.input.tapTime,
          ...(body.input.shooterTapTime !== undefined
            ? { shooterTapTime: body.input.shooterTapTime }
            : {}),
          puckSpeedPerMs: clampSpeed(
            periodSpeeds.puckSpeedPerMs + condition.puckSpeedDelta,
            0.2,
            5,
          ),
          shooterFrequency: effectiveShooterFrequency,
          goalieFrequency: periodSpeeds.goalieFrequency,
          goalFrequency: periodSpeeds.goalFrequency,
        };
        const shotSeed = deriveShotSeed(
          match.match_seed,
          participant.current_period,
          body.shot_index,
        );
        const result = resolvePerspectiveCourtShot(
          shotInput,
          getGoalie(rules.goalieId),
          shotSeed,
          body.shot_index,
          stickEffectsFromInventory(effects),
          getSessionPhaseOffsets(match.match_seed),
        );
        const serverResult: DuelShotResult = result.type;

        await client.query(
          `insert into shot_session
           (user_id, mode, amateur_duel_match_id, period_number, shot_index, seed,
            input_payload, server_result, game_core_version)
         values ($1, 'amateur_duel', $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            match.id,
            participant.current_period,
            body.shot_index,
            shotSeed,
            JSON.stringify(shotInput),
            serverResult,
            match.game_core_version,
          ],
        );

        if (body.claimed_result !== serverResult) {
          await appendEvent(client, req.user.id, 'shot_mismatch', {
            mode: 'amateur_duel',
            amateur_duel_match_id: match.id,
            period_number: participant.current_period,
            shot_index: body.shot_index,
            claimed_result: body.claimed_result,
            server_result: serverResult,
          });
        }

        await consumeInventoryForShot(client, participant, loadout, inventoryReport, {
          skatesConsumed: condition.skatesConsumed,
          nutritionConsumed: condition.nutritionConsumed,
        });

        if (
          periodRule.mode === 'quota' &&
          periodRule.shotsLimit !== null &&
          body.shot_index >= periodRule.shotsLimit
        ) {
          await closeParticipantPeriod(client, participant, rules, now, 'quota');
        }
        match = (await reconcileMatch(client, await fetchMatchForUpdate(client, match.id), now))
          .match;
        return {
          matchId: match.id,
          settled: match.status === 'settled',
          server_result: serverResult,
          match: await buildMatchStateDto(client, match, req.user.id, now),
        };
      });
      await publishDuelFixtureProgress(app, response.matchId);
      if (response.settled) void notifySettlement(app, response.matchId);
      return response;
    },
  );

  app.post(
    '/duel/amateur/matches/:matchId/settle',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      const response = await withTransaction(app, async (client) => {
        const now = new Date();
        const visibleMatch = await fetchVisibleMatchForUpdate(client, params.matchId);
        const match = (
          await reconcileMatch(
            client,
            visibleMatch.status === 'settled'
              ? visibleMatch
              : await fetchPlayableMatchForUpdate(client, params.matchId),
            now,
          )
        ).match;
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        return {
          settled: await isSettled(client, match.id),
          matchId: match.id,
          match: await buildMatchStateDto(client, match, req.user.id, now),
        };
      });
      await publishDuelFixtureProgress(app, response.matchId);
      if (response.settled) void notifySettlement(app, response.matchId);
      return { match: response.match };
    },
  );

  app.get('/duel/amateur/rating', { preHandler: [app.authenticate] }, async (req) => {
    const query = duelRatingQuerySchema.parse(req.query);
    const seasonKey = query.season_key ?? seasonKeyMoscow(new Date());
    const { rows } = await app.pg.query<RatingRow>(
      `select r.user_id, u.display_name, u.avatar_url, r.points, r.wins, r.draws, r.losses,
	              r.goals_for, r.goals_against, r.matches_played, r.active_duration_seconds
	         from amateur_duel_rating r
         join users u on u.id = r.user_id
        where r.season_key = $1
        order by r.points desc, r.wins desc, r.active_duration_seconds asc, u.display_name asc
	        limit 100`,
      [seasonKey],
    );
    const { rows: rankRows } = await app.pg.query<{ rank: number }>(
      `select ranked.rank::int as rank
	         from (
	           select r.user_id,
	                  row_number() over (
	                    order by r.points desc, r.wins desc, r.active_duration_seconds asc, u.display_name asc
	                  ) as rank
	             from amateur_duel_rating r
	             join users u on u.id = r.user_id
	            where r.season_key = $1
	         ) ranked
	        where ranked.user_id = $2`,
      [seasonKey, req.user.id],
    );
    return { season_key: seasonKey, rating: rows, me_rank: rankRows[0]?.rank ?? null };
  });

  app.get(
    '/admin/duels/history',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async (req) => {
      const query = adminDuelHistoryQuerySchema.parse(req.query);
      const { rows } = await app.pg.query<{
        id: string;
        template_id: string | null;
        template_title: string | null;
        status: MatchStatus;
        source: AmateurDuelSource;
        ranked: boolean;
        duel_kind: DuelKind;
        outcome: DuelOutcome | null;
        winner_user_id: string | null;
        settled_reason: string | null;
        challenger_user_id: string;
        challenger_name: string;
        challenger_avatar_url: string | null;
        opponent_user_id: string;
        opponent_name: string;
        opponent_avatar_url: string | null;
        challenger_goals: number;
        challenger_shots: number;
        challenger_state: ParticipantState;
        challenger_result_points: number;
        opponent_goals: number;
        opponent_shots: number;
        opponent_state: ParticipantState;
        opponent_result_points: number;
        created_at: Date;
        accepted_at: Date | null;
        settled_at: Date | null;
        starts_at: Date;
        ends_at: Date;
        total_count: number;
      }>(
        `with filtered as (
           select m.*
             from amateur_duel_match m
             join users cu on cu.id = m.challenger_user_id
             join users ou on ou.id = m.opponent_user_id
            where ($1::text = 'all' or m.status = $1)
              and ($2::timestamptz is null or m.created_at >= $2::timestamptz)
              and ($3::timestamptz is null or m.created_at <= $3::timestamptz)
              and (
                $4::text = ''
                or cu.display_name ilike '%' || $4 || '%'
                or ou.display_name ilike '%' || $4 || '%'
              )
         )
         select f.id,
                f.template_id,
                coalesce(t.title, f.rules_snapshot->>'title') as template_title,
                f.status,
                f.source,
                f.ranked,
                f.duel_kind,
                f.outcome,
                f.winner_user_id,
                f.settled_reason,
                f.challenger_user_id,
                cu.display_name as challenger_name,
                cu.avatar_url as challenger_avatar_url,
                f.opponent_user_id,
                ou.display_name as opponent_name,
                ou.avatar_url as opponent_avatar_url,
                cp.goals as challenger_goals,
                cp.shots_taken as challenger_shots,
                cp.state as challenger_state,
                cp.result_points as challenger_result_points,
                op.goals as opponent_goals,
                op.shots_taken as opponent_shots,
                op.state as opponent_state,
                op.result_points as opponent_result_points,
                f.created_at,
                f.accepted_at,
                f.settled_at,
                f.starts_at,
                f.ends_at,
                count(*) over()::int as total_count
           from filtered f
           left join amateur_duel_template t on t.id = f.template_id
           join users cu on cu.id = f.challenger_user_id
           join users ou on ou.id = f.opponent_user_id
           left join amateur_duel_participant cp
             on cp.match_id = f.id and cp.side = 'challenger'
           left join amateur_duel_participant op
             on op.match_id = f.id and op.side = 'opponent'
          order by f.created_at desc
          limit $5 offset $6`,
        [query.status, query.from ?? null, query.to ?? null, query.q, query.limit, query.offset],
      );
      return {
        duels: rows.map((row) => ({
          id: row.id,
          templateId: row.template_id,
          templateTitle: row.template_title ?? 'Без шаблона',
          status: row.status,
          source: row.source,
          ranked: row.ranked,
          duelKind: row.duel_kind,
          outcome: row.outcome,
          winnerUserId: row.winner_user_id,
          settledReason: row.settled_reason,
          challenger: {
            userId: row.challenger_user_id,
            displayName: row.challenger_name,
            avatarUrl: row.challenger_avatar_url,
            goals: Number(row.challenger_goals ?? 0),
            shots: Number(row.challenger_shots ?? 0),
            state: row.challenger_state,
            resultPoints: Number(row.challenger_result_points ?? 0),
          },
          opponent: {
            userId: row.opponent_user_id,
            displayName: row.opponent_name,
            avatarUrl: row.opponent_avatar_url,
            goals: Number(row.opponent_goals ?? 0),
            shots: Number(row.opponent_shots ?? 0),
            state: row.opponent_state,
            resultPoints: Number(row.opponent_result_points ?? 0),
          },
          createdAt: row.created_at.toISOString(),
          acceptedAt: row.accepted_at?.toISOString() ?? null,
          settledAt: row.settled_at?.toISOString() ?? null,
          startsAt: row.starts_at.toISOString(),
          endsAt: row.ends_at.toISOString(),
        })),
        total: rows.length > 0 ? Number(rows[0]!.total_count) : 0,
        limit: query.limit,
        offset: query.offset,
      };
    },
  );

  app.get(
    '/admin/duel-templates',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async () => {
      const { rows } = await app.pg.query<DuelTemplateRow>(
        `select id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
              matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
              period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
              ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
              ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
              stake_amount, entry_fee_amount, required_inventory_item_id,
              inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
              win_star_reward, created_at, updated_at
         from amateur_duel_template
        where deleted_at is null
        order by created_at desc`,
      );
      return { templates: rows.map(mapAdminTemplate) };
    },
  );

  app.post(
    '/admin/duel-templates',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async (req) => {
      const body = createTemplateSchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid duel template', 400);
      const data = body.data;
      let rows: DuelTemplateRow[];
      try {
        ({ rows } = await app.pg.query<DuelTemplateRow>(
          `insert into amateur_duel_template
           (title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
            matchmaking_enabled, starts_at, ends_at, total_periods, shots_per_period,
            period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
            ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
            ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
            stake_amount, entry_fee_amount, required_inventory_item_id, inventory_charges_per_period,
            win_points, draw_points, win_currency_reward, draw_currency_reward, win_star_reward,
            matchmaking_venue_policy)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                 $28, $29, $30, $31, $32, $33)
         returning id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
                   matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
                   period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
                   ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
                   ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
                   stake_amount, entry_fee_amount, required_inventory_item_id,
                   inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
                   win_star_reward, created_at, updated_at`,
          [
            data.title,
            data.description,
            data.isActive,
            data.difficulty,
            data.duelKind,
            data.duelVariant,
            data.rankedEnabled,
            data.matchmakingEnabled,
            data.startsAt,
            data.endsAt,
            data.totalPeriods,
            data.shotsPerPeriod,
            data.periodDurationMs,
            data.breakDurationMs,
            data.challengeTtlMs,
            data.readyDurationMs,
            data.readyNoShowCooldownMs,
            data.matchmakingTimeoutMs,
            data.rankedDailyLimit,
            data.rankedSameOpponentLimit,
            data.powerCap,
            data.goalieId,
            JSON.stringify(data.periodSpeedPresets),
            data.periodRules ? JSON.stringify(data.periodRules) : null,
            data.stakeAmount,
            data.entryFeeAmount,
            data.requiredInventoryItemId,
            data.inventoryChargesPerPeriod,
            data.winPoints,
            data.drawPoints,
            data.winCurrencyReward,
            data.drawCurrencyReward,
            data.winStarReward,
            data.matchmakingVenuePolicy,
          ],
        ));
      } catch (err) {
        if (isActiveDuelTemplateKindConflict(err)) {
          throw new AppError('conflict', 'active duel template for kind already exists', 409);
        }
        throw err;
      }
      await appendEvent(app.pg, req.user.id, 'admin_duel_template_created', {
        template_id: rows[0]!.id,
      });
      return { template: mapAdminTemplate(rows[0]!) };
    },
  );

  app.patch(
    '/admin/duel-templates/:templateId',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async (req) => {
      const params = z.object({ templateId: uuid }).parse(req.params);
      const body = updateTemplateSchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid duel template patch', 400);
      const assignments: string[] = [];
      const values: unknown[] = [];
      addPatch(assignments, values, 'title', body.data.title);
      addPatch(assignments, values, 'description', body.data.description);
      addPatch(assignments, values, 'is_active', body.data.isActive);
      addPatch(assignments, values, 'difficulty', body.data.difficulty);
      addPatch(assignments, values, 'duel_kind', body.data.duelKind);
      addPatch(assignments, values, 'duel_variant', body.data.duelVariant);
      addPatch(assignments, values, 'ranked_enabled', body.data.rankedEnabled);
      addPatch(assignments, values, 'matchmaking_enabled', body.data.matchmakingEnabled);
      addPatch(assignments, values, 'matchmaking_venue_policy', body.data.matchmakingVenuePolicy);
      addPatch(assignments, values, 'starts_at', body.data.startsAt);
      addPatch(assignments, values, 'ends_at', body.data.endsAt);
      addPatch(assignments, values, 'total_periods', body.data.totalPeriods);
      addPatch(assignments, values, 'shots_per_period', body.data.shotsPerPeriod);
      addPatch(assignments, values, 'period_duration_ms', body.data.periodDurationMs);
      addPatch(assignments, values, 'break_duration_ms', body.data.breakDurationMs);
      addPatch(assignments, values, 'challenge_ttl_ms', body.data.challengeTtlMs);
      addPatch(assignments, values, 'ready_duration_ms', body.data.readyDurationMs);
      addPatch(assignments, values, 'ready_no_show_cooldown_ms', body.data.readyNoShowCooldownMs);
      addPatch(assignments, values, 'matchmaking_timeout_ms', body.data.matchmakingTimeoutMs);
      addPatch(assignments, values, 'ranked_daily_limit', body.data.rankedDailyLimit);
      addPatch(
        assignments,
        values,
        'ranked_same_opponent_limit',
        body.data.rankedSameOpponentLimit,
      );
      addPatch(assignments, values, 'power_cap', body.data.powerCap);
      addPatch(assignments, values, 'goalie_id', body.data.goalieId);
      addPatch(
        assignments,
        values,
        'period_speed_presets',
        body.data.periodSpeedPresets ? JSON.stringify(body.data.periodSpeedPresets) : undefined,
      );
      addPatch(
        assignments,
        values,
        'period_rules',
        body.data.periodRules !== undefined
          ? body.data.periodRules === null
            ? null
            : JSON.stringify(body.data.periodRules)
          : undefined,
      );
      addPatch(assignments, values, 'stake_amount', body.data.stakeAmount);
      addPatch(assignments, values, 'entry_fee_amount', body.data.entryFeeAmount);
      addPatch(
        assignments,
        values,
        'required_inventory_item_id',
        body.data.requiredInventoryItemId,
      );
      addPatch(
        assignments,
        values,
        'inventory_charges_per_period',
        body.data.inventoryChargesPerPeriod,
      );
      addPatch(assignments, values, 'win_points', body.data.winPoints);
      addPatch(assignments, values, 'draw_points', body.data.drawPoints);
      addPatch(assignments, values, 'win_currency_reward', body.data.winCurrencyReward);
      addPatch(assignments, values, 'draw_currency_reward', body.data.drawCurrencyReward);
      addPatch(assignments, values, 'win_star_reward', body.data.winStarReward);
      values.push(params.templateId);
      let rows: DuelTemplateRow[];
      try {
        ({ rows } = await app.pg.query<DuelTemplateRow>(
          `update amateur_duel_template
              set ${assignments.join(', ')},
                  updated_at = now()
            where id = $${values.length} and deleted_at is null
            returning id, title, description, is_active, difficulty, duel_kind, duel_variant, ranked_enabled,
                      matchmaking_enabled, matchmaking_venue_policy, starts_at, ends_at, total_periods, shots_per_period,
                      period_duration_ms, break_duration_ms, challenge_ttl_ms, ready_duration_ms,
                      ready_no_show_cooldown_ms, matchmaking_timeout_ms, ranked_daily_limit,
                      ranked_same_opponent_limit, power_cap, goalie_id, period_speed_presets, period_rules,
                      stake_amount, entry_fee_amount, required_inventory_item_id,
                      inventory_charges_per_period, win_points, draw_points, win_currency_reward, draw_currency_reward,
                      win_star_reward, created_at, updated_at`,
          values,
        ));
      } catch (err) {
        if (isActiveDuelTemplateKindConflict(err)) {
          throw new AppError('conflict', 'active duel template for kind already exists', 409);
        }
        throw err;
      }
      if (!rows[0]) throw new AppError('not_found', 'duel template not found', 404);
      await appendEvent(app.pg, req.user.id, 'admin_duel_template_updated', {
        template_id: params.templateId,
        fields: Object.keys(body.data),
      });
      return { template: mapAdminTemplate(rows[0]!) };
    },
  );

  app.delete(
    '/admin/duel-templates/:templateId',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async (req) => {
      const params = z.object({ templateId: uuid }).parse(req.params);
      const { rowCount } = await app.pg.query(
        `update amateur_duel_template
            set deleted_at = now(),
                updated_at = now()
          where id = $1 and deleted_at is null`,
        [params.templateId],
      );
      if (rowCount === 0) throw new AppError('not_found', 'duel template not found', 404);
      await appendEvent(app.pg, req.user.id, 'admin_duel_template_deleted', {
        template_id: params.templateId,
      });
      return { ok: true };
    },
  );

  app.patch(
    '/admin/inventory/:itemId/gameplay',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async (req) => {
      const params = z.object({ itemId: uuid }).parse(req.params);
      const body = inventoryItemPatchSchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid inventory gameplay patch', 400);
      const assignments: string[] = [];
      const values: unknown[] = [];
      addPatch(assignments, values, 'item_kind', body.data.itemKind);
      addPatch(assignments, values, 'rarity', body.data.rarity);
      addPatch(assignments, values, 'currency_price', body.data.currencyPrice);
      addPatch(assignments, values, 'charges_per_purchase', body.data.chargesPerPurchase);
      addPatch(assignments, values, 'low_stock_threshold', body.data.lowStockThreshold);
      addPatch(assignments, values, 'duel_period_cost', body.data.duelPeriodCost);
      addPatch(assignments, values, 'power_score', body.data.powerScore);
      addPatch(assignments, values, 'resource_unit', body.data.resourceUnit);
      addPatch(assignments, values, 'effect_puck_speed_points', body.data.effectPuckSpeedPoints);
      addPatch(assignments, values, 'effect_puck_speed_delta', body.data.effectPuckSpeedDelta);
      addPatch(
        assignments,
        values,
        'effect_shooter_frequency_delta',
        body.data.effectShooterFrequencyDelta,
      );
      addPatch(
        assignments,
        values,
        'effect_goalie_frequency_delta',
        body.data.effectGoalieFrequencyDelta,
      );
      addPatch(
        assignments,
        values,
        'effect_goal_frequency_delta',
        body.data.effectGoalFrequencyDelta,
      );
      addPatch(
        assignments,
        values,
        'effect_shot_zone_multiplier',
        body.data.effectShotZoneMultiplier,
      );
      addPatch(assignments, values, 'effect_recovery_delay_ms', body.data.effectRecoveryDelayMs);
      addPatch(assignments, values, 'effect_stumble_chance', body.data.effectStumbleChance);
      addPatch(assignments, values, 'effect_stumble_ms', body.data.effectStumbleMs);
      addPatch(
        assignments,
        values,
        'effect_stumble_blocks_per_period',
        body.data.effectStumbleBlocksPerPeriod,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_interval_min_rolls',
        body.data.effectStumbleIntervalMinRolls,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_interval_max_rolls',
        body.data.effectStumbleIntervalMaxRolls,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_interval_min_ms',
        body.data.effectStumbleIntervalMinMs,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_interval_max_ms',
        body.data.effectStumbleIntervalMaxMs,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_duration_min_ms',
        body.data.effectStumbleDurationMinMs,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_duration_max_ms',
        body.data.effectStumbleDurationMaxMs,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_offset_min_px',
        body.data.effectStumbleOffsetMinPx,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_offset_max_px',
        body.data.effectStumbleOffsetMaxPx,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_recovery_min_ms',
        body.data.effectStumbleRecoveryMinMs,
      );
      addPatch(
        assignments,
        values,
        'effect_stumble_recovery_max_ms',
        body.data.effectStumbleRecoveryMaxMs,
      );
      addPatch(
        assignments,
        values,
        'effect_energy_baseline_speed',
        body.data.effectEnergyBaselineSpeed,
      );
      addPatch(
        assignments,
        values,
        'effect_nutrition_slowdown_ms',
        body.data.effectNutritionSlowdownMs,
      );
      addPatch(assignments, values, 'effect_nutrition_stop_ms', body.data.effectNutritionStopMs);
      addPatch(assignments, values, 'effect_fatigue_delay_ms', body.data.effectFatigueDelayMs);
      addPatch(
        assignments,
        values,
        'effect_fatigue_speed_multiplier',
        body.data.effectFatigueSpeedMultiplier,
      );
      addPatch(assignments, values, 'effect_fatigue_grace_ms', body.data.effectFatigueGraceMs);
      addPatch(
        assignments,
        values,
        'effect_fatigue_slowdown_start_ms',
        body.data.effectFatigueSlowdownStartMs,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_heavy_slowdown_start_ms',
        body.data.effectFatigueHeavySlowdownStartMs,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_stop_start_ms',
        body.data.effectFatigueStopStartMs,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_stop_duration_ms',
        body.data.effectFatigueStopDurationMs,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_after_rest_ms',
        body.data.effectFatigueAfterRestMs,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_slow_multiplier',
        body.data.effectFatigueSlowMultiplier,
      );
      addPatch(
        assignments,
        values,
        'effect_fatigue_heavy_multiplier',
        body.data.effectFatigueHeavyMultiplier,
      );
      values.push(params.itemId);
      const { rowCount } = await app.pg.query(
        `update admin_inventory_items
            set ${assignments.join(', ')},
                updated_at = now()
          where id = $${values.length} and deleted_at is null`,
        values,
      );
      if (rowCount === 0) throw new AppError('not_found', 'inventory item not found', 404);
      await appendEvent(app.pg, req.user.id, 'admin_inventory_item_updated', {
        item_id: params.itemId,
        fields: Object.keys(body.data),
      });
      return { ok: true };
    },
  );
};

function assertDuelTapTimeFresh(
  participant: DuelParticipantRow,
  previousShots: number,
  tapTime: number,
  now: Date,
): void {
  if (!Number.isFinite(tapTime) || tapTime < 0) {
    throw new AppError('bad_request', 'invalid duel shot tapTime', 400);
  }
  if (participant.period_started_at === null) {
    throw new AppError('conflict', 'active duel period has no start timestamp', 409);
  }
  const elapsedMs = Math.max(0, now.getTime() - participant.period_started_at.getTime());
  const futureLimit = elapsedMs + TAP_TIME_FUTURE_TOLERANCE_MS;
  const staleLimit = Math.max(
    0,
    elapsedMs - TAP_TIME_STALE_TOLERANCE_MS - previousShots * TAP_TIME_PAUSE_ALLOWANCE_PER_SHOT_MS,
  );
  if (tapTime > futureLimit || tapTime < staleLimit) {
    throw new AppError('conflict', 'duel shot tapTime is stale', 409);
  }
}

function requireAdmin(app: Parameters<FastifyPluginAsync>[0]) {
  return async (req: FastifyRequest): Promise<void> => {
    await assertAdminUser(app.pg, req.user.id);
  };
}

function addPatch(assignments: string[], values: unknown[], column: string, value: unknown): void {
  if (value === undefined) return;
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

function isActiveDuelTemplateKindConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'constraint' in err &&
    err.code === '23505' &&
    err.constraint === 'amateur_duel_template_one_active_kind_idx'
  );
}

function mapAdminTemplate(template: DuelTemplateRow) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    isActive: template.is_active,
    difficulty: template.difficulty,
    duelKind: template.duel_kind,
    duelVariant: template.duel_variant,
    rankedEnabled: template.ranked_enabled,
    matchmakingEnabled: template.matchmaking_enabled,
    matchmakingVenuePolicy: template.matchmaking_venue_policy,
    startsAt: template.starts_at.toISOString(),
    endsAt: template.ends_at.toISOString(),
    totalPeriods: Number(template.total_periods),
    shotsPerPeriod: Number(template.shots_per_period),
    periodDurationMs: Number(template.period_duration_ms),
    breakDurationMs: Number(template.break_duration_ms),
    challengeTtlMs: Number(template.challenge_ttl_ms),
    readyDurationMs: Number(template.ready_duration_ms),
    readyNoShowCooldownMs: Number(template.ready_no_show_cooldown_ms),
    matchmakingTimeoutMs: Number(template.matchmaking_timeout_ms),
    rankedDailyLimit: Number(template.ranked_daily_limit),
    rankedSameOpponentLimit: Number(template.ranked_same_opponent_limit),
    powerCap: Number(template.power_cap),
    goalieId: template.goalie_id,
    periodSpeedPresets: parsePeriodSpeedPresets(template.period_speed_presets),
    periodRules: parseTemplatePeriodRules(template.period_rules, {
      duelKind: template.duel_kind,
      totalPeriods: Number(template.total_periods),
      shotsPerPeriod: Number(template.shots_per_period),
      periodDurationMs: Number(template.period_duration_ms),
    }),
    stakeAmount: Number(template.stake_amount),
    entryFeeAmount: Number(template.entry_fee_amount),
    requiredInventoryItemId: template.required_inventory_item_id,
    inventoryChargesPerPeriod: Number(template.inventory_charges_per_period),
    winPoints: Number(template.win_points),
    drawPoints: Number(template.draw_points),
    winCurrencyReward: Number(template.win_currency_reward),
    drawCurrencyReward: Number(template.draw_currency_reward),
    winStarReward: Number(template.win_star_reward),
    createdAt: template.created_at.toISOString(),
    updatedAt: template.updated_at.toISOString(),
  };
}
