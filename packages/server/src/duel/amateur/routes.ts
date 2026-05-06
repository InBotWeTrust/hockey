import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  type DailyPeriodSpeedPreset,
  type StickEffects,
} from '@hockey/game-core';
import { assertAdminUser } from '../../chat/channel.js';
import { invalidateUnreadCache } from '../../chat/cache.js';
import { publishMessageNew } from '../../chat/events.js';
import { findOrCreateDM, sendMessage } from '../../chat/service.js';
import { AppError } from '../../plugins/errors.js';
import { enqueueDuelPush } from '../../push/duel.js';
import { appendEvent } from '../eventLog.js';
import { deriveAmateurDuelSeed, deriveShotSeed } from '../seed.js';

type MatchStatus = 'pending' | 'scheduled' | 'active' | 'settled' | 'expired';
type ParticipantState =
  | 'invited'
  | 'accepted'
  | 'period_active'
  | 'break_active'
  | 'completed'
  | 'forfeit';
type ParticipantSide = 'challenger' | 'opponent';
type DuelOutcome = 'challenger_win' | 'opponent_win' | 'draw' | 'double_loss';
type DuelShotResult = 'goal' | 'save' | 'miss';

const TAP_TIME_FUTURE_TOLERANCE_MS = 2500;
const TAP_TIME_STALE_TOLERANCE_MS = 12_000;
const TAP_TIME_PAUSE_ALLOWANCE_PER_SHOT_MS = 2_000;

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

const periodPresetSchema = z.object({
  periodNumber: z.number().int().min(1).max(9),
  goalFrequency: z.number().min(0.1).max(3),
  goalieFrequency: z.number().min(0.1).max(3),
  shooterFrequency: z.number().min(0.1).max(3),
  puckSpeedPerMs: z.number().min(0.2).max(5),
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
  startsAt: isoDate,
  endsAt: isoDate,
  totalPeriods: z.number().int().min(1).max(9).default(3),
  shotsPerPeriod: z.number().int().min(1).max(100).default(30),
  periodDurationMs: z.number().int().min(1000).max(10_800_000).default(1_200_000),
  breakDurationMs: z.number().int().min(0).max(10_800_000).default(900_000),
  goalieId: z.string().trim().min(1).max(80).default('rookie'),
  periodSpeedPresets: z.array(periodPresetSchema).min(1).max(9),
  stakeAmount: z.number().int().min(0).max(9_000_000_000).default(0),
  entryFeeAmount: z.number().int().min(0).max(9_000_000_000).default(0),
  requiredInventoryItemId: uuid.nullable().default(null),
  inventoryChargesPerPeriod: z.number().int().min(0).max(1000).default(0),
});

const updateTemplateSchema = createTemplateSchema.partial().refine((value) => {
  return Object.keys(value).length > 0;
}, 'no changes');

const inventoryItemPatchSchema = z
  .object({
    itemKind: z.enum(['bundle', 'stick', 'skates', 'nutrition', 'consumable']).optional(),
    currencyPrice: z.number().int().min(0).max(9_000_000_000).optional(),
    chargesPerPurchase: z.number().int().min(0).max(100_000).optional(),
    duelPeriodCost: z.number().int().min(0).max(100_000).optional(),
    effectPuckSpeedDelta: z.number().min(-5).max(5).optional(),
    effectShooterFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectGoalieFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectGoalFrequencyDelta: z.number().min(-3).max(3).optional(),
    effectShotZoneMultiplier: z.number().min(1).max(5).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'no changes');

interface DuelTemplateRow {
  id: string;
  title: string;
  description: string;
  is_active: boolean;
  starts_at: Date;
  ends_at: Date;
  total_periods: number;
  shots_per_period: number;
  period_duration_ms: number;
  break_duration_ms: number;
  goalie_id: string;
  period_speed_presets: unknown;
  stake_amount: number;
  entry_fee_amount: number;
  required_inventory_item_id: string | null;
  inventory_charges_per_period: number;
  created_at: Date;
  updated_at: Date;
}

interface DuelMatchRow {
  id: string;
  template_id: string | null;
  challenger_user_id: string;
  opponent_user_id: string;
  status: MatchStatus;
  rules_snapshot: unknown;
  match_seed: string;
  starts_at: Date;
  ends_at: Date;
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

interface DuelParticipantRow {
  match_id: string;
  user_id: string;
  side: ParticipantSide;
  state: ParticipantState;
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
  result_points: number;
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
  puckSpeedDelta: number;
  shooterFrequencyDelta: number;
  goalieFrequencyDelta: number;
  goalFrequencyDelta: number;
  shotZoneMultiplier: number;
}

interface DuelRulesSnapshot {
  templateId: string;
  title: string;
  description: string;
  totalPeriods: number;
  shotsPerPeriod: number;
  periodDurationMs: number;
  breakDurationMs: number;
  goalieId: string;
  periodSpeedPresets: DailyPeriodSpeedPreset[];
  stakeAmount: number;
  entryFeeAmount: number;
  requiredInventoryItemId: string | null;
  inventoryChargesPerPeriod: number;
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
}

interface DuelMatchDTO {
  id: string;
  template_id: string | null;
  status: MatchStatus;
  starts_at: string;
  ends_at: string;
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
      puckSpeedDelta: z.number().default(0),
      shooterFrequencyDelta: z.number().default(0),
      goalieFrequencyDelta: z.number().default(0),
      goalFrequencyDelta: z.number().default(0),
      shotZoneMultiplier: z.number().min(1).default(1),
    })
    .safeParse(value ?? {});
  if (!parsed.success) {
    return {
      puckSpeedDelta: 0,
      shooterFrequencyDelta: 0,
      goalieFrequencyDelta: 0,
      goalFrequencyDelta: 0,
      shotZoneMultiplier: 1,
    };
  }
  return parsed.data;
}

function makeRulesSnapshot(template: DuelTemplateRow): DuelRulesSnapshot {
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
  return {
    templateId: template.id,
    title: template.title,
    description: template.description,
    totalPeriods,
    shotsPerPeriod: Number(template.shots_per_period),
    periodDurationMs: Number(template.period_duration_ms),
    breakDurationMs: Number(template.break_duration_ms),
    goalieId: template.goalie_id,
    periodSpeedPresets: presets,
    stakeAmount: Number(template.stake_amount),
    entryFeeAmount: Number(template.entry_fee_amount),
    requiredInventoryItemId: template.required_inventory_item_id,
    inventoryChargesPerPeriod: Number(template.inventory_charges_per_period),
  };
}

function parseRulesSnapshot(value: unknown): DuelRulesSnapshot {
  const parsed = z
    .object({
      templateId: uuid,
      title: z.string(),
      description: z.string(),
      totalPeriods: z.number().int().min(1).max(9),
      shotsPerPeriod: z.number().int().min(1).max(100),
      periodDurationMs: z.number().int().min(1000).max(10_800_000),
      breakDurationMs: z.number().int().min(0).max(10_800_000),
      goalieId: z.string(),
      periodSpeedPresets: z.array(periodPresetSchema).min(1).max(9),
      stakeAmount: z.number().int().min(0),
      entryFeeAmount: z.number().int().min(0),
      requiredInventoryItemId: uuid.nullable(),
      inventoryChargesPerPeriod: z.number().int().min(0),
    })
    .safeParse(value);
  if (!parsed.success) {
    throw new AppError('server_error', 'invalid duel rules snapshot', 500);
  }
  return parsed.data;
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
    `select id, title, description, is_active, starts_at, ends_at, total_periods,
            shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
            period_speed_presets, stake_amount, entry_fee_amount,
            required_inventory_item_id, inventory_charges_per_period, created_at, updated_at
       from amateur_duel_template
      where id = $1 and deleted_at is null`,
    [templateId],
  );
  const template = rows[0];
  if (!template) throw new AppError('not_found', 'duel template not found', 404);
  return template;
}

async function assertAmateurEligible(client: PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query<{ level: number; lifetime_goals_total: number }>(
    `select level, lifetime_goals_total from users where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'user not found', 404);
  if (Number(row.level) < 2 && Number(row.lifetime_goals_total) < 1000) {
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

async function fetchInventoryEffects(
  client: PoolClient,
  inventoryItemId: string,
): Promise<InventoryItemEffects> {
  const { rows } = await client.query<{
    effect_puck_speed_delta: string | number;
    effect_shooter_frequency_delta: string | number;
    effect_goalie_frequency_delta: string | number;
    effect_goal_frequency_delta: string | number;
    effect_shot_zone_multiplier: string | number;
  }>(
    `select effect_puck_speed_delta, effect_shooter_frequency_delta,
            effect_goalie_frequency_delta, effect_goal_frequency_delta,
            effect_shot_zone_multiplier
       from admin_inventory_items
      where id = $1 and deleted_at is null`,
    [inventoryItemId],
  );
  const row = rows[0];
  if (!row) throw new AppError('conflict', 'required inventory item is unavailable', 409);
  return {
    puckSpeedDelta: numberFromUnknown(row.effect_puck_speed_delta),
    shooterFrequencyDelta: numberFromUnknown(row.effect_shooter_frequency_delta),
    goalieFrequencyDelta: numberFromUnknown(row.effect_goalie_frequency_delta),
    goalFrequencyDelta: numberFromUnknown(row.effect_goal_frequency_delta),
    shotZoneMultiplier: numberFromUnknown(row.effect_shot_zone_multiplier, 1),
  };
}

async function reserveInventory(
  client: PoolClient,
  userId: string,
  matchId: string,
  rules: DuelRulesSnapshot,
): Promise<{ itemId: string | null; charges: number; effects: InventoryItemEffects | null }> {
  if (rules.requiredInventoryItemId === null || rules.inventoryChargesPerPeriod <= 0) {
    return { itemId: null, charges: 0, effects: null };
  }
  const requiredCharges = rules.totalPeriods * rules.inventoryChargesPerPeriod;
  const { rows } = await client.query<{ charges_available: number; charges_reserved: number }>(
    `update user_inventory_item
        set charges_available = charges_available - $3,
            charges_reserved = charges_reserved + $3,
            updated_at = now()
      where user_id = $1
        and inventory_item_id = $2
        and charges_available >= $3
      returning charges_available, charges_reserved`,
    [userId, rules.requiredInventoryItemId, requiredCharges],
  );
  if (!rows[0]) {
    throw new AppError('conflict', 'not enough inventory charges for duel', 409);
  }
  const effects = await fetchInventoryEffects(client, rules.requiredInventoryItemId);
  await appendEvent(client, userId, 'amateur_duel_inventory_reserved', {
    match_id: matchId,
    inventory_item_id: rules.requiredInventoryItemId,
    charges: requiredCharges,
  });
  return { itemId: rules.requiredInventoryItemId, charges: requiredCharges, effects };
}

async function consumeInventoryForPeriod(
  client: PoolClient,
  participant: DuelParticipantRow,
  rules: DuelRulesSnapshot,
): Promise<void> {
  if (participant.reserved_inventory_item_id === null || rules.inventoryChargesPerPeriod <= 0) {
    return;
  }
  await client.query(
    `update user_inventory_item
        set charges_reserved = charges_reserved - $3,
            updated_at = now()
      where user_id = $1
        and inventory_item_id = $2
        and charges_reserved >= $3`,
    [participant.user_id, participant.reserved_inventory_item_id, rules.inventoryChargesPerPeriod],
  );
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = consumed_inventory_charges + $3,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [participant.match_id, participant.user_id, rules.inventoryChargesPerPeriod],
  );
}

async function burnRemainingInventoryReserve(
  client: PoolClient,
  participant: DuelParticipantRow,
): Promise<void> {
  if (participant.reserved_inventory_item_id === null) return;
  const remaining = Math.max(
    0,
    Number(participant.reserved_inventory_charges) - Number(participant.consumed_inventory_charges),
  );
  if (remaining <= 0) return;
  await client.query(
    `update user_inventory_item
        set charges_reserved = greatest(0, charges_reserved - $3),
            updated_at = now()
      where user_id = $1 and inventory_item_id = $2`,
    [participant.user_id, participant.reserved_inventory_item_id, remaining],
  );
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = reserved_inventory_charges,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [participant.match_id, participant.user_id],
  );
}

async function fetchMatchForUpdate(client: PoolClient, matchId: string): Promise<DuelMatchRow> {
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

async function fetchParticipants(
  client: PoolClient,
  matchId: string,
): Promise<DuelParticipantRow[]> {
  const { rows } = await client.query<DuelParticipantRow>(
    `select match_id, user_id, side, state, current_period, period_started_at,
            break_started_at, completed_at, shots_taken, goals, active_duration_ms,
            stake_reserved, entry_fee_paid, reserved_inventory_item_id,
            reserved_inventory_charges, consumed_inventory_charges,
            inventory_effects_snapshot, result_points
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

async function closeParticipantPeriod(
  client: PoolClient,
  participant: DuelParticipantRow,
  rules: DuelRulesSnapshot,
  now: Date,
  reason: 'quota' | 'timeout' | 'window_end',
): Promise<void> {
  if (participant.period_started_at === null) return;
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

  const completedByQuota =
    reason === 'quota' &&
    stats.shots >= rules.shotsPerPeriod &&
    participant.current_period >= rules.totalPeriods;
  const nextState: ParticipantState = completedByQuota
    ? 'completed'
    : reason === 'quota'
      ? 'break_active'
      : 'forfeit';
  await client.query(
    `update amateur_duel_participant
        set state = $3,
            period_started_at = null,
            break_started_at = case when $3 = 'break_active' then $4::timestamptz else null end,
            completed_at = case when $3 = 'completed' then $4::timestamptz else completed_at end,
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
}

async function markExpiredPendingMatch(client: PoolClient, match: DuelMatchRow, now: Date) {
  await client.query(
    `update amateur_duel_match
        set status = 'expired',
            settled_reason = 'not_accepted',
            settled_at = $2,
            updated_at = now()
      where id = $1 and status = 'pending'`,
    [match.id, now],
  );
}

async function settleMatchIfReady(
  client: PoolClient,
  match: DuelMatchRow,
  now: Date,
): Promise<DuelMatchRow> {
  if (match.status === 'settled' || match.status === 'expired') return match;
  if (match.status === 'pending') {
    if (now >= match.ends_at) {
      await markExpiredPendingMatch(client, match, now);
      return fetchMatchForUpdate(client, match.id);
    }
    return match;
  }

  const participants = await fetchParticipants(client, match.id);
  const challenger = participants.find((p) => p.side === 'challenger');
  const opponent = participants.find((p) => p.side === 'opponent');
  if (!challenger || !opponent) {
    throw new AppError('server_error', 'duel match participants missing', 500);
  }

  const windowEnded = now >= match.ends_at;
  if (windowEnded) {
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
  if (!windowEnded && !(aTerminal && bTerminal)) return match;

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
      const aSeconds = durationSeconds(a.active_duration_ms);
      const bSeconds = durationSeconds(b.active_duration_ms);
      if (aSeconds < bSeconds) {
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

  const stake = Number(match.stake_amount);
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
    await burnRemainingInventoryReserve(client, participant);
  }

  const aPoints = outcome === 'challenger_win' ? 3 : outcome === 'draw' ? 1 : 0;
  const bPoints = outcome === 'opponent_win' ? 3 : outcome === 'draw' ? 1 : 0;
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

  for (const participant of [
    { mine: a, other: b, points: aPoints },
    { mine: b, other: a, points: bPoints },
  ]) {
    await client.query(
      `insert into amateur_duel_rating
         (user_id, points, wins, draws, losses, goals_for, goals_against,
          matches_played, active_duration_seconds, updated_at)
       values (
         $1, $2, case when $2 = 3 then 1 else 0 end,
         case when $2 = 1 then 1 else 0 end,
         case when $2 = 0 then 1 else 0 end,
         $3, $4, 1, $5, now()
       )
       on conflict (user_id) do update
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
        participant.mine.user_id,
        participant.points,
        participant.mine.goals,
        participant.other.goals,
        durationSeconds(participant.mine.active_duration_ms),
      ],
    );
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
  return rows[0]!;
}

async function reconcileMatch(
  client: PoolClient,
  match: DuelMatchRow,
  now: Date,
): Promise<DuelMatchRow> {
  if (match.status === 'settled' || match.status === 'expired') return match;
  if (match.status === 'pending') {
    return settleMatchIfReady(client, match, now);
  }

  const rules = parseRulesSnapshot(match.rules_snapshot);
  const participants = await fetchParticipants(client, match.id);
  for (const participant of participants) {
    if (participant.state === 'period_active' && participant.period_started_at !== null) {
      const timeoutAt = new Date(participant.period_started_at.getTime() + rules.periodDurationMs);
      if (now >= match.ends_at) {
        await closeParticipantPeriod(client, participant, rules, match.ends_at, 'window_end');
      } else if (now >= timeoutAt) {
        await closeParticipantPeriod(client, participant, rules, timeoutAt, 'timeout');
      }
    }
    if (participant.state === 'break_active' && participant.break_started_at !== null) {
      const breakEndsAt = new Date(participant.break_started_at.getTime() + rules.breakDurationMs);
      if (now >= breakEndsAt) {
        await client.query(
          `update amateur_duel_participant
              set state = 'accepted',
                  break_started_at = null,
                  updated_at = now()
            where match_id = $1 and user_id = $2 and state = 'break_active'`,
          [match.id, participant.user_id],
        );
      }
    }
  }

  if (match.status === 'scheduled' && now >= match.starts_at && now < match.ends_at) {
    await client.query(
      `update amateur_duel_match
          set status = 'active', updated_at = now()
        where id = $1 and status = 'scheduled'`,
      [match.id],
    );
  }

  const refreshed = await fetchMatchForUpdate(client, match.id);
  return settleMatchIfReady(client, refreshed, now);
}

function participantDto(participant: DuelParticipantRow, match: DuelMatchRow): DuelParticipantDTO {
  const displayName =
    participant.side === 'challenger' ? (match.challenger_name ?? '') : (match.opponent_name ?? '');
  const avatarUrl =
    participant.side === 'challenger'
      ? (match.challenger_avatar_url ?? null)
      : (match.opponent_avatar_url ?? null);
  return {
    user_id: participant.user_id,
    display_name: displayName,
    avatar_url: avatarUrl,
    side: participant.side,
    state: participant.state,
    current_period: participant.current_period,
    shots_taken: Number(participant.shots_taken),
    goals: Number(participant.goals),
    accuracy:
      Number(participant.shots_taken) > 0
        ? Math.round((Number(participant.goals) / Number(participant.shots_taken)) * 100)
        : 0,
    active_duration_ms: Number(participant.active_duration_ms),
    active_duration_seconds: durationSeconds(Number(participant.active_duration_ms)),
    result_points: Number(participant.result_points),
  };
}

async function buildMatchDto(
  client: PoolClient,
  match: DuelMatchRow,
  currentUserId: string,
  now: Date,
): Promise<DuelMatchDTO> {
  const participants = await fetchParticipants(client, match.id);
  const me = participants.find((participant) => participant.user_id === currentUserId);
  const opponent = participants.find((participant) => participant.user_id !== currentUserId);
  if (!me || !opponent) throw new AppError('forbidden', 'duel match access denied', 403);
  const rules = parseRulesSnapshot(match.rules_snapshot);
  const periodEndsAt =
    me.state === 'period_active' && me.period_started_at !== null
      ? new Date(me.period_started_at.getTime() + rules.periodDurationMs).toISOString()
      : null;
  const breakEndsAt =
    me.state === 'break_active' && me.break_started_at !== null
      ? new Date(me.break_started_at.getTime() + rules.breakDurationMs).toISOString()
      : null;
  return {
    id: match.id,
    template_id: match.template_id,
    status: match.status,
    starts_at: match.starts_at.toISOString(),
    ends_at: match.ends_at.toISOString(),
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
    me: participantDto(me, match),
    opponent: participantDto(opponent, match),
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
  const currentStats =
    me.state === 'period_active'
      ? await fetchCurrentPeriodStats(client, match.id, currentUserId, me.current_period)
      : { shots: 0, goals: 0 };
  const rules = parseRulesSnapshot(match.rules_snapshot);
  const effects = effectsFromUnknown(me.inventory_effects_snapshot);
  const periodEndsAt =
    me.state === 'period_active' && me.period_started_at !== null
      ? new Date(me.period_started_at.getTime() + rules.periodDurationMs).toISOString()
      : null;
  const breakEndsAt =
    me.state === 'break_active' && me.break_started_at !== null
      ? new Date(me.break_started_at.getTime() + rules.breakDurationMs).toISOString()
      : null;
  const recentPeriods = await fetchRecentPeriods(client, match.id, currentUserId);
  return {
    ...dto,
    server_now: now.toISOString(),
    match_seed: match.status === 'pending' || match.status === 'expired' ? null : match.match_seed,
    current_period_shots: currentStats.shots,
    current_period_goals: currentStats.goals,
    period_started_at: me.period_started_at?.toISOString() ?? null,
    period_ends_at: periodEndsAt,
    break_ends_at: breakEndsAt,
    period_speed_presets: effectivePeriodSpeedPresets(rules, effects),
    stick_effects: stickEffectsFromInventory(effects),
    recent_periods: recentPeriods.map((period) => ({
      period_number: period.period_number,
      shots_taken: period.shots_taken,
      goals: period.goals,
      duration_ms: period.duration_ms,
      closed_reason: period.closed_reason,
      ended_at: period.ended_at.toISOString(),
    })),
  };
}

async function notifyDuelMessage(
  app: Parameters<FastifyPluginAsync>[0],
  actorUserId: string,
  targetUserId: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const dm = await findOrCreateDM(app.pg, actorUserId, targetUserId);
  const sendOpts = { chatId: dm.chatId, senderId: actorUserId, content };
  const dto = await sendMessage(
    app.pg,
    metadata !== undefined ? { ...sendOpts, metadata } : sendOpts,
  );
  await Promise.all([
    invalidateUnreadCache(app.redis, actorUserId),
    invalidateUnreadCache(app.redis, targetUserId),
  ]);
  await publishMessageNew(app.pg, app.realtime, dm.chatId, 'direct', dto);
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

function formatDuelMessageDate(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuelMoney(amount: number): string {
  return amount > 0 ? String(amount) : 'нет';
}

function buildDuelInviteMessage(
  matchId: string,
  challengerName: string,
  rules: DuelRulesSnapshot,
  startsAt: Date,
  endsAt: Date,
): { content: string; metadata: AmateurDuelInviteMessageMetadata } {
  const bankAmount = rules.stakeAmount * 2;
  return {
    content: [
      `${challengerName} вызывает вас на дуэль «${rules.title}».`,
      `Формат: ${rules.totalPeriods}×${rules.shotsPerPeriod}`,
      `Окно: ${formatDuelMessageDate(startsAt)} — ${formatDuelMessageDate(endsAt)}`,
      `Ставка: ${formatDuelMoney(rules.stakeAmount)}, банк: ${formatDuelMoney(bankAmount)}`,
      `Взнос: ${formatDuelMoney(rules.entryFeeAmount)}`,
    ].join('\n'),
    metadata: {
      type: 'amateur_duel_invite',
      matchId,
      templateTitle: rules.title,
      challengerName,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
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
  if (match.outcome === 'draw') return 'Ничья. Ставка возвращена.';
  if (match.outcome === 'double_loss') return 'Оба игрока не завершили дуэль. Банк сгорел.';
  if (match.winner_user_id === userId) return 'Победа в дуэли! Банк уже ваш.';
  return 'Поражение в дуэли. Можно взять реванш.';
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
      `select id, title, description, is_active, starts_at, ends_at, total_periods,
              shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
              period_speed_presets, stake_amount, entry_fee_amount,
              required_inventory_item_id, inventory_charges_per_period, created_at, updated_at
         from amateur_duel_template
        where deleted_at is null and is_active
        order by starts_at asc, created_at desc`,
    );
    return {
      templates: rows.map((template) => ({
        id: template.id,
        title: template.title,
        description: template.description,
        starts_at: template.starts_at.toISOString(),
        ends_at: template.ends_at.toISOString(),
        total_periods: Number(template.total_periods),
        shots_per_period: Number(template.shots_per_period),
        period_duration_ms: Number(template.period_duration_ms),
        break_duration_ms: Number(template.break_duration_ms),
        goalie_id: template.goalie_id,
        period_speed_presets: parsePeriodSpeedPresets(template.period_speed_presets),
        stake_amount: Number(template.stake_amount),
        entry_fee_amount: Number(template.entry_fee_amount),
        required_inventory_item_id: template.required_inventory_item_id,
        inventory_charges_per_period: Number(template.inventory_charges_per_period),
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
    const { rows } = await app.pg.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      lifetime_goals_total: number;
      level: number;
    }>(
      `select id, display_name, avatar_url, lifetime_goals_total, level
         from users
        where id <> $1
          and (level >= 2 or lifetime_goals_total >= 1000)
          and ($2 = '' or display_name ilike '%' || $2 || '%')
        order by last_seen_at desc nulls last, display_name asc
        limit $3`,
      [req.user.id, query.q, query.limit],
    );
    return {
      users: rows.map((row) => ({
        userId: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      })),
    };
  });

  app.get('/duel/amateur/matches', { preHandler: [app.authenticate] }, async (req) => {
    return withTransaction(app, async (client) => {
      const now = new Date();
      const { rows } = await client.query<DuelMatchRow>(
        `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
                ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
           from amateur_duel_match m
           join users cu on cu.id = m.challenger_user_id
           join users ou on ou.id = m.opponent_user_id
          where m.challenger_user_id = $1 or m.opponent_user_id = $1
          order by case when m.status in ('pending', 'scheduled', 'active') then 0 else 1 end,
                   m.created_at desc
          limit 50`,
        [req.user.id],
      );
      const matches: DuelMatchDTO[] = [];
      for (const row of rows) {
        const match = await reconcileMatch(client, row, now);
        matches.push(await buildMatchDto(client, match, req.user.id, now));
      }
      return { matches };
    });
  });

  app.get('/duel/amateur/events', { preHandler: [app.authenticate] }, async (req) => {
    return withTransaction(app, async (client) => {
      const now = new Date();
      const { rows } = await client.query<DuelMatchRow>(
        `select m.*, cu.display_name as challenger_name, cu.avatar_url as challenger_avatar_url,
                ou.display_name as opponent_name, ou.avatar_url as opponent_avatar_url
           from amateur_duel_match m
           join users cu on cu.id = m.challenger_user_id
           join users ou on ou.id = m.opponent_user_id
          where (m.challenger_user_id = $1 or m.opponent_user_id = $1)
            and m.status in ('pending', 'scheduled', 'active')
          order by m.starts_at asc, m.created_at desc
          limit 10`,
        [req.user.id],
      );
      const events: DuelMatchDTO[] = [];
      for (const row of rows) {
        const match = await reconcileMatch(client, row, now);
        if (
          match.status === 'pending' ||
          match.status === 'scheduled' ||
          match.status === 'active'
        ) {
          events.push(await buildMatchDto(client, match, req.user.id, now));
        }
      }
      return { events };
    });
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
      const rules = makeRulesSnapshot(template);
      const duplicate = await client.query<{ id: string }>(
        `select id
           from amateur_duel_match
          where template_id = $1
            and least(challenger_user_id, opponent_user_id) = least($2::uuid, $3::uuid)
            and greatest(challenger_user_id, opponent_user_id) = greatest($2::uuid, $3::uuid)
            and status in ('pending', 'scheduled', 'active')
          limit 1`,
        [template.id, req.user.id, opponentUserId],
      );
      if (duplicate.rows[0]) {
        throw new AppError(
          'conflict',
          'open duel already exists for this opponent and template',
          409,
        );
      }
      const seedBasis = `${req.user.id}:${opponentUserId}:${template.id}:${now.toISOString()}`;
      const { rows } = await client.query<DuelMatchRow>(
        `insert into amateur_duel_match
           (template_id, challenger_user_id, opponent_user_id, status, rules_snapshot,
            match_seed, starts_at, ends_at, stake_amount, entry_fee_amount, bank_amount,
            game_core_version)
         values ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, 0, $10)
         returning *`,
        [
          template.id,
          req.user.id,
          opponentUserId,
          JSON.stringify(rules),
          seedBasis,
          template.starts_at,
          template.ends_at,
          rules.stakeAmount,
          rules.entryFeeAmount,
          GAME_CORE_VERSION,
        ],
      );
      const match = rows[0]!;
      await client.query(
        `insert into amateur_duel_participant (match_id, user_id, side, state)
         values ($1, $2, 'challenger', 'accepted'), ($1, $3, 'opponent', 'invited')`,
        [match.id, req.user.id, opponentUserId],
      );
      await appendEvent(client, req.user.id, 'amateur_duel_challenge_created', {
        match_id: match.id,
        template_id: template.id,
        opponent_user_id: opponentUserId,
      });
      return {
        matchId: match.id,
        title: rules.title,
        rules,
        startsAt: template.starts_at,
        endsAt: template.ends_at,
      };
    });

    const challengerName = await fetchDisplayName(app.pg, req.user.id);
    const inviteMessage = buildDuelInviteMessage(
      result.matchId,
      challengerName,
      result.rules,
      result.startsAt,
      result.endsAt,
    );
    await notifyDuelMessage(
      app,
      req.user.id,
      opponentUserId,
      inviteMessage.content,
      inviteMessage.metadata,
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
        let match = await fetchMatchForUpdate(client, params.matchId);
        if (match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'only challenged player can accept duel', 403);
        }
        if (match.status !== 'pending') {
          throw new AppError('conflict', 'duel challenge is not pending', 409);
        }
        await assertAmateurEligible(client, match.challenger_user_id);
        await assertAmateurEligible(client, match.opponent_user_id);
        const template = match.template_id ? await fetchTemplate(client, match.template_id) : null;
        if (!template || !template.is_active) {
          throw new AppError('conflict', 'duel template is inactive', 409);
        }
        if (now >= template.ends_at) throw new AppError('conflict', 'duel window is closed', 409);
        const rules = makeRulesSnapshot(template);
        const acceptedAtIso = now.toISOString();
        const matchSeed = deriveAmateurDuelSeed(
          match.id,
          match.challenger_user_id,
          match.opponent_user_id,
          acceptedAtIso,
          opts.duelSeedSecret,
        );

        for (const userId of [match.challenger_user_id, match.opponent_user_id]) {
          await applyCurrencyDelta(client, {
            userId,
            availableDelta: -rules.entryFeeAmount,
            reservedDelta: 0,
            reason: 'duel_entry_fee',
            matchId: match.id,
          });
          await applyCurrencyDelta(client, {
            userId,
            availableDelta: -rules.stakeAmount,
            reservedDelta: rules.stakeAmount,
            reason: 'duel_stake_hold',
            matchId: match.id,
          });
          const inventory = await reserveInventory(client, userId, match.id, rules);
          await client.query(
            `update amateur_duel_participant
              set state = 'accepted',
                  stake_reserved = $3,
                  entry_fee_paid = $4,
                  reserved_inventory_item_id = $5,
                  reserved_inventory_charges = $6,
                  inventory_effects_snapshot = $7,
                  updated_at = now()
            where match_id = $1 and user_id = $2`,
            [
              match.id,
              userId,
              rules.stakeAmount,
              rules.entryFeeAmount,
              inventory.itemId,
              inventory.charges,
              inventory.effects ? JSON.stringify(inventory.effects) : null,
            ],
          );
        }

        const nextStatus: MatchStatus = now < template.starts_at ? 'scheduled' : 'active';
        const { rows } = await client.query<DuelMatchRow>(
          `update amateur_duel_match
            set status = $2,
                rules_snapshot = $3,
                match_seed = $4,
                starts_at = $5,
                ends_at = $6,
                stake_amount = $7,
                entry_fee_amount = $8,
                bank_amount = $7 * 2,
                game_core_version = $9,
                accepted_at = $10,
                updated_at = now()
          where id = $1
          returning *`,
          [
            match.id,
            nextStatus,
            JSON.stringify(rules),
            matchSeed,
            template.starts_at,
            template.ends_at,
            rules.stakeAmount,
            rules.entryFeeAmount,
            GAME_CORE_VERSION,
            now,
          ],
        );
        match = rows[0]!;
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

      const opponentName = await fetchDisplayName(app.pg, req.user.id);
      await notifyDuelMessage(
        app,
        req.user.id,
        accepted.challengerUserId,
        `${opponentName} принял дуэль «${accepted.title}».`,
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
        let match = await fetchMatchForUpdate(client, params.matchId);
        if (match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'only challenged player can decline duel', 403);
        }
        match = await reconcileMatch(client, match, now);
        if (match.status !== 'pending') {
          throw new AppError('conflict', 'duel challenge is not pending', 409);
        }
        const rules = parseRulesSnapshot(match.rules_snapshot);
        await client.query(
          `update amateur_duel_match
            set status = 'expired',
                settled_reason = 'declined',
                settled_at = $2,
                updated_at = now()
          where id = $1 and status = 'pending'`,
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
        `${opponentName} отказался от дуэли «${declined.title}».`,
      ).catch((err) =>
        app.log.warn({ err, matchId: declined.matchId }, 'duel decline DM notification failed'),
      );

      return { match: declined.match };
    },
  );

  app.get('/duel/amateur/matches/:matchId', { preHandler: [app.authenticate] }, async (req) => {
    const params = z.object({ matchId: uuid }).parse(req.params);
    return withTransaction(app, async (client) => {
      const now = new Date();
      const match = await reconcileMatch(
        client,
        await fetchMatchForUpdate(client, params.matchId),
        now,
      );
      if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
        throw new AppError('forbidden', 'duel match access denied', 403);
      }
      return { match: await buildMatchStateDto(client, match, req.user.id, now) };
    });
  });

  app.post(
    '/duel/amateur/matches/:matchId/period/start',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = z.object({ matchId: uuid }).parse(req.params);
      return withTransaction(app, async (client) => {
        const now = new Date();
        let match = await reconcileMatch(
          client,
          await fetchMatchForUpdate(client, params.matchId),
          now,
        );
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
        await consumeInventoryForPeriod(client, participant, rules);
        await client.query(
          `update amateur_duel_participant
              set state = 'period_active',
                  current_period = current_period + 1,
                  period_started_at = $3,
                  break_started_at = null,
                  updated_at = now()
            where match_id = $1 and user_id = $2`,
          [match.id, req.user.id, now],
        );
        match = await fetchMatchForUpdate(client, match.id);
        return { match: await buildMatchStateDto(client, match, req.user.id, now) };
      });
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
        let match = await reconcileMatch(
          client,
          await fetchMatchForUpdate(client, params.matchId),
          now,
        );
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
        const expectedShotIndex = cur.shots + 1;
        if (body.shot_index !== expectedShotIndex) {
          throw new AppError(
            'conflict',
            `shot_index mismatch: expected ${expectedShotIndex}, got ${body.shot_index}`,
            409,
          );
        }
        if (cur.shots >= rules.shotsPerPeriod) {
          throw new AppError('conflict', 'shot quota for this duel period exhausted', 409);
        }
        assertDuelTapTimeFresh(participant, cur.shots, body.input.tapTime, now);

        const effects = effectsFromUnknown(participant.inventory_effects_snapshot);
        const periodSpeeds = effectivePeriodSpeedPresets(rules, effects).find(
          (preset) => preset.periodNumber === participant.current_period,
        );
        if (!periodSpeeds)
          throw new AppError('server_error', 'missing effective period speeds', 500);
        const shotInput = {
          tapTime: body.input.tapTime,
          ...(body.input.shooterTapTime !== undefined
            ? { shooterTapTime: body.input.shooterTapTime }
            : {}),
          puckSpeedPerMs: periodSpeeds.puckSpeedPerMs,
          shooterFrequency: periodSpeeds.shooterFrequency,
          goalieFrequency: periodSpeeds.goalieFrequency,
          goalFrequency: periodSpeeds.goalFrequency,
        };
        const shotSeed = deriveShotSeed(
          match.match_seed,
          participant.current_period,
          body.shot_index,
        );
        const result = resolveShot(
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

        if (body.shot_index >= rules.shotsPerPeriod) {
          await closeParticipantPeriod(client, participant, rules, now, 'quota');
        }
        match = await reconcileMatch(client, await fetchMatchForUpdate(client, match.id), now);
        return {
          matchId: match.id,
          settled: match.status === 'settled',
          server_result: serverResult,
          match: await buildMatchStateDto(client, match, req.user.id, now),
        };
      });
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
        const match = await reconcileMatch(
          client,
          await fetchMatchForUpdate(client, params.matchId),
          now,
        );
        if (match.challenger_user_id !== req.user.id && match.opponent_user_id !== req.user.id) {
          throw new AppError('forbidden', 'duel match access denied', 403);
        }
        return {
          settled: await isSettled(client, match.id),
          matchId: match.id,
          match: await buildMatchStateDto(client, match, req.user.id, now),
        };
      });
      if (response.settled) void notifySettlement(app, response.matchId);
      return { match: response.match };
    },
  );

  app.get('/duel/amateur/rating', { preHandler: [app.authenticate] }, async () => {
    const { rows } = await app.pg.query<RatingRow>(
      `select r.user_id, u.display_name, u.avatar_url, r.points, r.wins, r.draws, r.losses,
              r.goals_for, r.goals_against, r.matches_played, r.active_duration_seconds
         from amateur_duel_rating r
         join users u on u.id = r.user_id
        order by r.points desc, r.wins desc, r.active_duration_seconds asc, u.display_name asc
        limit 100`,
    );
    return { rating: rows };
  });

  app.get(
    '/admin/duel-templates',
    { preHandler: [app.authenticate, requireAdmin(app)] },
    async () => {
      const { rows } = await app.pg.query<DuelTemplateRow>(
        `select id, title, description, is_active, starts_at, ends_at, total_periods,
              shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
              period_speed_presets, stake_amount, entry_fee_amount,
              required_inventory_item_id, inventory_charges_per_period, created_at, updated_at
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
      const { rows } = await app.pg.query<DuelTemplateRow>(
        `insert into amateur_duel_template
         (title, description, is_active, starts_at, ends_at, total_periods, shots_per_period,
          period_duration_ms, break_duration_ms, goalie_id, period_speed_presets,
          stake_amount, entry_fee_amount, required_inventory_item_id, inventory_charges_per_period)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       returning id, title, description, is_active, starts_at, ends_at, total_periods,
                 shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
                 period_speed_presets, stake_amount, entry_fee_amount,
                 required_inventory_item_id, inventory_charges_per_period, created_at, updated_at`,
        [
          data.title,
          data.description,
          data.isActive,
          data.startsAt,
          data.endsAt,
          data.totalPeriods,
          data.shotsPerPeriod,
          data.periodDurationMs,
          data.breakDurationMs,
          data.goalieId,
          JSON.stringify(data.periodSpeedPresets),
          data.stakeAmount,
          data.entryFeeAmount,
          data.requiredInventoryItemId,
          data.inventoryChargesPerPeriod,
        ],
      );
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
      addPatch(assignments, values, 'starts_at', body.data.startsAt);
      addPatch(assignments, values, 'ends_at', body.data.endsAt);
      addPatch(assignments, values, 'total_periods', body.data.totalPeriods);
      addPatch(assignments, values, 'shots_per_period', body.data.shotsPerPeriod);
      addPatch(assignments, values, 'period_duration_ms', body.data.periodDurationMs);
      addPatch(assignments, values, 'break_duration_ms', body.data.breakDurationMs);
      addPatch(assignments, values, 'goalie_id', body.data.goalieId);
      addPatch(
        assignments,
        values,
        'period_speed_presets',
        body.data.periodSpeedPresets ? JSON.stringify(body.data.periodSpeedPresets) : undefined,
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
      values.push(params.templateId);
      const { rows } = await app.pg.query<DuelTemplateRow>(
        `update amateur_duel_template
            set ${assignments.join(', ')},
                updated_at = now()
          where id = $${values.length} and deleted_at is null
          returning id, title, description, is_active, starts_at, ends_at, total_periods,
                    shots_per_period, period_duration_ms, break_duration_ms, goalie_id,
                    period_speed_presets, stake_amount, entry_fee_amount,
                    required_inventory_item_id, inventory_charges_per_period, created_at, updated_at`,
        values,
      );
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
      addPatch(assignments, values, 'currency_price', body.data.currencyPrice);
      addPatch(assignments, values, 'charges_per_purchase', body.data.chargesPerPurchase);
      addPatch(assignments, values, 'duel_period_cost', body.data.duelPeriodCost);
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

function mapAdminTemplate(template: DuelTemplateRow) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    isActive: template.is_active,
    startsAt: template.starts_at.toISOString(),
    endsAt: template.ends_at.toISOString(),
    totalPeriods: Number(template.total_periods),
    shotsPerPeriod: Number(template.shots_per_period),
    periodDurationMs: Number(template.period_duration_ms),
    breakDurationMs: Number(template.break_duration_ms),
    goalieId: template.goalie_id,
    periodSpeedPresets: parsePeriodSpeedPresets(template.period_speed_presets),
    stakeAmount: Number(template.stake_amount),
    entryFeeAmount: Number(template.entry_fee_amount),
    requiredInventoryItemId: template.required_inventory_item_id,
    inventoryChargesPerPeriod: Number(template.inventory_charges_per_period),
    createdAt: template.created_at.toISOString(),
    updatedAt: template.updated_at.toISOString(),
  };
}
