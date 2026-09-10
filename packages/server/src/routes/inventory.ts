import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import {
  getGameplayLockState,
  getRecentGameplayRecovery,
  lockUserGameplay,
  toGameplayLockDto,
  type GameplayAction,
} from '../duel/gameplayLocks.js';
import { assertFullAmateurAccess } from '../profile/amateurAccess.js';

type EquipmentKind = 'stick' | 'skates' | 'nutrition';
type InventoryKind = EquipmentKind | 'recovery';
type ResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';
type DbClient = Pick<PoolClient, 'query'>;

interface InventoryItemRow {
  id: string;
  item_id: string;
  instance_id: string | null;
  item_kind: InventoryKind;
  title: string;
  description: string;
  photo_url: string | null;
  currency_price: number;
  charges_per_purchase: number;
  low_stock_threshold: number;
  resource_unit: ResourceUnit;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  power_score: number;
  duel_period_cost: number;
  effect_puck_speed_points: number;
  effect_stumble_interval_min_ms: number;
  effect_stumble_interval_max_ms: number;
  effect_stumble_duration_min_ms: number;
  effect_stumble_duration_max_ms: number;
  effect_nutrition_slowdown_ms: number;
  effect_nutrition_stop_ms: number;
  effect_fatigue_delay_ms: number;
  effect_fatigue_speed_multiplier: string | number;
  effect_recovery_minutes: number;
  charges_available: number;
  charges_reserved: number;
}

interface InventoryState {
  balances: {
    tokens: number;
    stars: number;
  };
  equipped: {
    stickItemId: string | null;
    skatesItemId: string | null;
    nutritionItemId: string | null;
  };
  items: Record<InventoryKind, InventoryItemDto[]>;
}

interface InventoryItemDto {
  id: string;
  itemId: string;
  instanceId: string | null;
  kind: InventoryKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  chargesPerPurchase: number;
  lowStockThreshold: number;
  resourceUnit: ResourceUnit;
  resourceLabel: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  effectPuckSpeedPoints: number;
  effectRecoveryMinutes: number;
  timing: {
    stumbleIntervalMinMs: number;
    stumbleIntervalMaxMs: number;
    stumbleDurationMinMs: number;
    stumbleDurationMaxMs: number;
    nutritionSlowdownMs: number;
    nutritionStopMs: number;
    fatigueDelayMs: number;
    fatigueSpeedMultiplier: number;
  };
  chargesAvailable: number;
  chargesReserved: number;
}

interface BankPurchaseDto {
  id: string;
  title: string;
  amountRub: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';
  createdAt: string;
  paidAt: string | null;
}

type TransactionCurrency = 'coin' | 'star' | 'experience' | 'ruble';
type TransactionCategory = 'inventory' | 'bank' | 'reward' | 'duel' | 'adjustment' | 'other';
type TransactionFlow = 'credit' | 'debit' | 'neutral';

interface InventoryTransactionAmountDto {
  currency: TransactionCurrency;
  value: number;
}

interface InventoryTransactionDto {
  id: string;
  title: string;
  subtitle: string;
  category: TransactionCategory;
  flow: TransactionFlow;
  amounts: InventoryTransactionAmountDto[];
  createdAt: string;
}

const equipmentPatchSchema = z
  .object({
    stickItemId: z.string().uuid().nullable().optional(),
    skatesItemId: z.string().uuid().nullable().optional(),
    nutritionItemId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.stickItemId !== undefined ||
      value.skatesItemId !== undefined ||
      value.nutritionItemId !== undefined,
    'no changes',
  );

const itemParamsSchema = z.object({
  itemId: z.string().uuid(),
});

const useRecoveryKitSchema = z.object({
  itemId: z.string().uuid(),
  action: z.enum(['start_daily_period', 'start_classic']),
  buyIfNeeded: z.boolean().default(false),
  idempotencyKey: z.string().uuid(),
});

const transactionHistoryQuerySchema = z.object({
  filter: z.enum(['all', 'credit', 'debit', 'ruble']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).optional(),
});

interface TransactionHistoryCursor {
  createdAt: string;
  id: string;
}

function encodeTransactionCursor(cursor: TransactionHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeTransactionCursor(value: string | undefined): TransactionHistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const result = z
      .object({ createdAt: z.string().datetime(), id: z.string().min(1).max(100) })
      .safeParse(parsed);
    if (!result.success) throw new Error('invalid cursor');
    return result.data;
  } catch {
    throw new AppError('bad_request', 'invalid transaction cursor', 400);
  }
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(value) % 100;
  const mod10 = Math.abs(value) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function resourceLabel(unit: ResourceUnit, chargesAvailable: number): string {
  if (unit === 'shot') {
    return `${chargesAvailable} ${pluralRu(chargesAvailable, 'бросок', 'броска', 'бросков')}`;
  }
  if (unit === 'energy_ms') {
    const minutes = chargesAvailable > 0 ? Math.ceil(chargesAvailable / 60000) : 0;
    return `${minutes} ${pluralRu(minutes, 'минута', 'минуты', 'минут')} энергии`;
  }
  if (unit === 'distance') {
    return `${chargesAvailable} ${pluralRu(chargesAvailable, 'прокат', 'проката', 'прокатов')}`;
  }
  return `${chargesAvailable} ${pluralRu(chargesAvailable, 'заряд', 'заряда', 'зарядов')}`;
}

function defaultResourceUnitForKind(kind: string | null): ResourceUnit | null {
  if (kind === 'stick') return 'shot';
  if (kind === 'skates') return 'distance';
  if (kind === 'nutrition') return 'energy_ms';
  if (kind === 'recovery') return 'period';
  return null;
}

function numberMetadata(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function transactionFlow(amounts: InventoryTransactionAmountDto[]): TransactionFlow {
  if (amounts.some((amount) => amount.value > 0)) return 'credit';
  if (amounts.some((amount) => amount.value < 0)) return 'debit';
  return 'neutral';
}

function transactionCategory(reason: string): TransactionCategory {
  if (reason === 'inventory_purchase' || reason === 'recovery_kit_use') return 'inventory';
  if (
    reason === 'weekly_challenge_reward' ||
    reason === 'duel_reward' ||
    reason === 'achievement_reward' ||
    reason === 'bonus_game_reward' ||
    reason === 'tournament_reward'
  )
    return 'reward';
  if (reason.startsWith('duel_')) return 'duel';
  if (reason === 'admin_adjustment') return 'adjustment';
  return 'other';
}

export function transactionTitle(reason: string, metadata: Record<string, unknown>): string {
  const title = stringMetadata(metadata, 'title');
  if (title) return title;
  if (reason === 'inventory_purchase') return 'Покупка инвентаря';
  if (reason === 'purchase') return 'Пополнение баланса';
  if (reason === 'recovery_kit_use') return 'Использование восстановления';
  if (reason === 'weekly_challenge_reward') return 'Недельная награда';
  if (reason === 'bonus_game_reward') return 'Награда за бонусную игру';
  if (reason === 'tournament_reward') return 'Награда за турнир';
  if (reason === 'tournament_entry_fee') return 'Взнос за турнир';
  if (reason === 'tournament_entry_refund') return 'Возврат взноса за турнир';
  if (reason === 'duel_reward') return 'Награда за дуэль';
  if (reason === 'achievement_reward') return 'Награда за достижение';
  if (reason === 'duel_stake_hold') return 'Ставка дуэли заморожена';
  if (reason === 'duel_entry_fee') return 'Взнос за дуэль';
  if (reason === 'duel_stake_refund') return 'Возврат ставки';
  if (reason === 'duel_stake_payout') return 'Выигрыш ставки';
  if (reason === 'duel_stake_burn') return 'Ставка списана';
  if (reason === 'admin_adjustment') return 'Корректировка баланса';
  return 'Другая операция';
}

function transactionSubtitle(
  createdAt: Date,
  reason: string,
  metadata: Record<string, unknown>,
): string {
  const parts = [createdAt.toISOString()];
  if (reason === 'inventory_purchase') {
    const itemKind = stringMetadata(metadata, 'item_kind');
    const chargesAdded = numberMetadata(metadata, 'charges_added');
    parts.push('товар');
    const resourceUnit = defaultResourceUnitForKind(itemKind);
    if (resourceUnit && chargesAdded > 0) {
      parts.push(resourceLabel(resourceUnit, chargesAdded));
    }
  } else if (reason === 'recovery_kit_use') {
    parts.push('восстановление');
    const recoveryMinutes = numberMetadata(metadata, 'recovery_minutes');
    if (recoveryMinutes > 0) parts.push(`−${recoveryMinutes} минут`);
  } else if (
    reason === 'weekly_challenge_reward' ||
    reason === 'achievement_reward' ||
    reason === 'bonus_game_reward' ||
    reason === 'tournament_reward'
  ) {
    parts.push('награда');
  } else if (reason === 'tournament_entry_fee') {
    parts.push('турнирный взнос');
  } else if (reason === 'tournament_entry_refund') {
    parts.push('возврат турнирного взноса');
  } else if (reason.startsWith('duel_')) {
    parts.push('дуэль');
  } else if (reason === 'admin_adjustment') {
    parts.push('корректировка');
  } else {
    parts.push('операция');
  }
  return parts.join(' · ');
}

function bankTransactionFlow(status: BankPurchaseDto['status']): TransactionFlow {
  if (status === 'refunded') return 'credit';
  if (status === 'paid') return 'debit';
  return 'neutral';
}

function bankStatusText(status: BankPurchaseDto['status']): string {
  if (status === 'paid') return 'Оплачено';
  if (status === 'pending') return 'Ожидает оплаты';
  if (status === 'failed') return 'Ошибка оплаты';
  if (status === 'refunded') return 'Возврат';
  return 'Отменено';
}

function bankTransactionAmount(row: {
  amount_rub: number;
  status: BankPurchaseDto['status'];
}): number {
  const amount = Number(row.amount_rub);
  if (row.status === 'refunded') return amount;
  if (row.status === 'paid') return -amount;
  return amount;
}

async function ensureInventoryRows(client: DbClient, userId: string): Promise<void> {
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [userId],
  );
  await client.query(`insert into user_equipment (user_id) values ($1) on conflict do nothing`, [
    userId,
  ]);
}

async function syncLegacyInventoryAggregate(
  client: DbClient,
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

async function resolveEquippableInventorySelection(
  client: DbClient,
  userId: string,
  kind: EquipmentKind,
  selectionId: string,
): Promise<{ instanceId: string | null; itemId: string }> {
  const instance = await client.query<{ instance_id: string; item_id: string }>(
    `select instance.id as instance_id, item.id as item_id
       from user_inventory_instance instance
       join admin_inventory_items item on item.id = instance.inventory_item_id
      where instance.user_id = $1
        and instance.id = $2
        and item.item_kind = $3
        and item.deleted_at is null
        and instance.charges_available > 0
      limit 1`,
    [userId, selectionId, kind],
  );
  if (instance.rows[0]) {
    return { instanceId: instance.rows[0].instance_id, itemId: instance.rows[0].item_id };
  }

  const fallback = await client.query<{ instance_id: string | null; item_id: string }>(
    `select instance.id as instance_id, item.id as item_id
       from admin_inventory_items item
       left join lateral (
         select owned.id
           from user_inventory_instance owned
          where owned.user_id = $1
            and owned.inventory_item_id = item.id
            and owned.charges_available > 0
          order by owned.created_at, owned.id
          limit 1
       ) instance on true
       left join user_inventory_item legacy
         on legacy.user_id = $1 and legacy.inventory_item_id = item.id
      where item.id = $2
        and item.item_kind = $3
        and item.deleted_at is null
        and instance.id is not null`,
    [userId, selectionId, kind],
  );
  if (fallback.rows[0]) {
    return { instanceId: fallback.rows[0].instance_id, itemId: fallback.rows[0].item_id };
  }

  const legacy = await client.query<{ item_id: string }>(
    `select item.id as item_id
       from admin_inventory_items item
       join user_inventory_item legacy
         on legacy.inventory_item_id = item.id and legacy.user_id = $1
      where item.id = $2
        and item.item_kind = $3
        and item.deleted_at is null
        and legacy.charges_available > 0
      limit 1`,
    [userId, selectionId, kind],
  );
  if (legacy.rows[0]) return { instanceId: null, itemId: legacy.rows[0].item_id };

  throw new AppError('conflict', `invalid ${kind} equipment item`, 409);
}

async function fetchInventoryState(client: DbClient, userId: string): Promise<InventoryState> {
  await ensureInventoryRows(client, userId);
  const { rows: accountRows } = await client.query<{
    balance: number;
    stars: number;
    equipped_stick_id: string | null;
    equipped_skates_id: string | null;
    equipped_nutrition_id: string | null;
  }>(
    `select coalesce(c.balance, 0)::int as balance,
            coalesce(u.xp, 0)::int as stars,
            coalesce(e.equipped_stick_instance_id, e.equipped_stick_item_id) as equipped_stick_id,
            coalesce(e.equipped_skates_instance_id, e.equipped_skates_item_id) as equipped_skates_id,
            coalesce(e.equipped_nutrition_instance_id, e.equipped_nutrition_item_id) as equipped_nutrition_id
       from users u
       left join user_currency_account c on c.user_id = u.id
       left join user_equipment e on e.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const account = accountRows[0];
  if (!account) throw new AppError('not_found', 'user not found', 404);

  const { rows } = await client.query<InventoryItemRow>(
    `select coalesce(instance.id, i.id) as id,
            i.id as item_id,
            instance.id as instance_id,
            i.item_kind, i.title, i.description, i.photo_url, i.currency_price,
            i.charges_per_purchase, i.low_stock_threshold, i.resource_unit, i.rarity,
            i.power_score, i.duel_period_cost,
            i.effect_puck_speed_points,
            i.effect_stumble_interval_min_ms, i.effect_stumble_interval_max_ms,
            i.effect_stumble_duration_min_ms, i.effect_stumble_duration_max_ms,
            i.effect_nutrition_slowdown_ms, i.effect_nutrition_stop_ms,
            i.effect_fatigue_delay_ms, i.effect_fatigue_speed_multiplier,
            i.effect_recovery_minutes,
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
        and i.item_kind in ('stick', 'skates', 'nutrition', 'recovery')
      order by i.item_kind, i.currency_price, i.title, instance.created_at nulls first, instance.id`,
    [userId],
  );

  const items: Record<InventoryKind, InventoryItemDto[]> = {
    stick: [],
    skates: [],
    nutrition: [],
    recovery: [],
  };
  for (const row of rows) {
    const chargesAvailable = Number(row.charges_available);
    items[row.item_kind].push({
      id: row.id,
      itemId: row.item_id,
      instanceId: row.instance_id,
      kind: row.item_kind,
      title: row.title,
      description: row.description,
      imageUrl: row.photo_url,
      currencyPrice: Number(row.currency_price),
      chargesPerPurchase: Number(row.charges_per_purchase),
      lowStockThreshold: Number(row.low_stock_threshold),
      resourceUnit: row.resource_unit,
      resourceLabel: resourceLabel(row.resource_unit, chargesAvailable),
      rarity: row.rarity,
      powerScore: Number(row.power_score),
      duelPeriodCost: Number(row.duel_period_cost),
      effectPuckSpeedPoints: Number(row.effect_puck_speed_points),
      effectRecoveryMinutes: Number(row.effect_recovery_minutes),
      timing: {
        stumbleIntervalMinMs: Number(row.effect_stumble_interval_min_ms),
        stumbleIntervalMaxMs: Number(row.effect_stumble_interval_max_ms),
        stumbleDurationMinMs: Number(row.effect_stumble_duration_min_ms),
        stumbleDurationMaxMs: Number(row.effect_stumble_duration_max_ms),
        nutritionSlowdownMs: Number(row.effect_nutrition_slowdown_ms),
        nutritionStopMs: Number(row.effect_nutrition_stop_ms),
        fatigueDelayMs: Number(row.effect_fatigue_delay_ms),
        fatigueSpeedMultiplier: Number(row.effect_fatigue_speed_multiplier),
      },
      chargesAvailable,
      chargesReserved: Number(row.charges_reserved),
    });
  }

  const activeEquipmentId = (kind: EquipmentKind, selectedId: string | null): string | null => {
    if (!selectedId) return null;
    const active = items[kind].find(
      (item) => (item.id === selectedId || item.itemId === selectedId) && item.chargesAvailable > 0,
    );
    return active?.id ?? null;
  };

  return {
    balances: {
      tokens: Number(account.balance),
      stars: Number(account.stars),
    },
    equipped: {
      stickItemId: activeEquipmentId('stick', account.equipped_stick_id),
      skatesItemId: activeEquipmentId('skates', account.equipped_skates_id),
      nutritionItemId: activeEquipmentId('nutrition', account.equipped_nutrition_id),
    },
    items,
  };
}

async function fetchTransactionHistory(
  client: DbClient,
  userId: string,
  filter: 'all' | 'credit' | 'debit' | 'ruble',
  limit: number,
  cursor: TransactionHistoryCursor | null,
): Promise<{ transactions: InventoryTransactionDto[]; nextCursor: string | null }> {
  const { rows } = await client.query<{
    id: string;
    source: 'ledger' | 'bank';
    created_at: Date;
    reason: string | null;
    available_delta: number | null;
    metadata: Record<string, unknown> | null;
    title: string | null;
    amount_rub: number | null;
    status: BankPurchaseDto['status'] | null;
    paid_at: Date | null;
  }>(
    `with history as (
       select 'ledger-' || id::text as id,
              'ledger'::text as source,
              created_at,
              reason,
              available_delta,
              metadata,
              null::text as title,
              null::int as amount_rub,
              null::text as status,
              null::timestamptz as paid_at,
              coalesce(case when jsonb_typeof(metadata -> 'stars') = 'number' then (metadata ->> 'stars')::numeric else 0 end, 0) as stars_delta,
              coalesce(case when jsonb_typeof(metadata -> 'experience') = 'number' then (metadata ->> 'experience')::numeric else 0 end, 0) as experience_delta
         from currency_ledger
        where user_id = $1
       union all
       select 'payment-' || id::text,
              'bank'::text,
              created_at,
              null::text,
              null::int,
              null::jsonb,
              title,
              amount_rub,
              status,
              paid_at,
              0::numeric,
              0::numeric
         from payments
        where user_id = $1
     )
     select id, source, created_at, reason, available_delta, metadata, title,
            amount_rub, status, paid_at
       from history
      where (source = 'bank' or available_delta <> 0 or stars_delta <> 0 or experience_delta <> 0)
        and (
        $2 = 'all'
        or ($2 = 'ruble' and source = 'bank')
        or ($2 = 'credit' and (
          (source = 'ledger' and (available_delta > 0 or stars_delta > 0 or experience_delta > 0))
          or (source = 'bank' and status = 'refunded')
        ))
        or ($2 = 'debit' and source = 'ledger'
          and available_delta <= 0 and stars_delta <= 0 and experience_delta <= 0
          and (available_delta < 0 or stars_delta < 0 or experience_delta < 0))
      )
        and ($3::timestamptz is null or (created_at, id) < ($3::timestamptz, $4::text))
      order by created_at desc, id desc
      limit $5`,
    [userId, filter, cursor?.createdAt ?? null, cursor?.id ?? '', limit + 1],
  );

  const pageRows = rows.slice(0, limit);
  const transactions = pageRows.map((row): InventoryTransactionDto => {
    if (row.source === 'ledger') {
      const metadata = row.metadata ?? {};
      const amounts: InventoryTransactionAmountDto[] = [];
      const coinDelta = Number(row.available_delta);
      if (coinDelta !== 0) amounts.push({ currency: 'coin', value: coinDelta });
      const stars = numberMetadata(metadata, 'stars');
      if (stars !== 0) amounts.push({ currency: 'star', value: stars });
      const experience = numberMetadata(metadata, 'experience');
      if (experience !== 0) amounts.push({ currency: 'experience', value: experience });
      return {
        id: row.id,
        title: transactionTitle(row.reason ?? '', metadata),
        subtitle: transactionSubtitle(row.created_at, row.reason ?? '', metadata),
        category: transactionCategory(row.reason ?? ''),
        flow: transactionFlow(amounts),
        amounts,
        createdAt: row.created_at.toISOString(),
      };
    }
    const status = row.status ?? 'canceled';
    return {
      id: row.id,
      title: row.title ?? 'Операция банка',
      subtitle: `${row.created_at.toISOString()} · банк · ${bankStatusText(status)}`,
      category: 'bank',
      flow: bankTransactionFlow(status),
      amounts: [
        {
          currency: 'ruble',
          value: bankTransactionAmount({ amount_rub: row.amount_rub ?? 0, status }),
        },
      ],
      createdAt: row.created_at.toISOString(),
    };
  });
  const last = pageRows[pageRows.length - 1];
  return {
    transactions,
    nextCursor:
      rows.length > limit && last
        ? encodeTransactionCursor({ createdAt: last.created_at.toISOString(), id: last.id })
        : null,
  };
}

async function purchaseInventoryItem(
  client: PoolClient,
  userId: string,
  itemId: string,
): Promise<InventoryState> {
  await ensureInventoryRows(client, userId);

  const { rows: itemRows } = await client.query<{
    id: string;
    title: string;
    item_kind: InventoryKind;
    currency_price: number;
    charges_per_purchase: number;
  }>(
    `select id, title, item_kind, currency_price, charges_per_purchase
       from admin_inventory_items
      where id = $1
        and deleted_at is null
        and item_kind in ('stick', 'skates', 'nutrition', 'recovery')`,
    [itemId],
  );
  const item = itemRows[0];
  if (!item) throw new AppError('not_found', 'inventory item not found', 404);

  const price = Number(item.currency_price);
  const charges = Number(item.charges_per_purchase);
  if (charges <= 0) {
    throw new AppError('conflict', 'inventory item is not purchasable', 409);
  }

  const { rows: accountRows } = await client.query<{
    balance: number;
    reserved_balance: number;
  }>(
    `update user_currency_account
        set balance = balance - $2,
            updated_at = now()
      where user_id = $1
        and balance >= $2
      returning balance, reserved_balance`,
    [userId, price],
  );
  const account = accountRows[0];
  if (!account) throw new AppError('conflict', 'not enough currency balance', 409);

  const { rows: instanceRows } = await client.query<{ id: string }>(
    `insert into user_inventory_instance
       (user_id, inventory_item_id, charges_available, updated_at)
     values ($1, $2, $3, now())
     returning id`,
    [userId, item.id, charges],
  );
  const instanceId = instanceRows[0]?.id ?? null;
  await syncLegacyInventoryAggregate(client, userId, item.id);

  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'inventory_purchase', $2, 0, $3, $4, $5)`,
    [
      userId,
      -price,
      Number(account.balance),
      Number(account.reserved_balance),
      JSON.stringify({
        inventory_item_id: item.id,
        inventory_instance_id: instanceId,
        title: item.title,
        item_kind: item.item_kind,
        charges_added: charges,
      }),
    ],
  );

  return fetchInventoryState(client, userId);
}

async function useRecoveryKit(
  client: PoolClient,
  userId: string,
  input: z.infer<typeof useRecoveryKitSchema>,
): Promise<{
  inventory: InventoryState;
  gameplayLock: ReturnType<typeof toGameplayLockDto>;
  appliedMinutes: number;
}> {
  await ensureInventoryRows(client, userId);
  await lockUserGameplay(client, userId);

  const replay = await client.query<{ recovery_minutes: number }>(
    `select recovery_minutes
       from recovery_kit_application
      where user_id = $1 and idempotency_key = $2`,
    [userId, input.idempotencyKey],
  );
  if (replay.rows[0]) {
    const lock = await getGameplayLockState(client, {
      userId,
      action: input.action as GameplayAction,
      now: new Date(),
    });
    return {
      inventory: await fetchInventoryState(client, userId),
      gameplayLock: toGameplayLockDto(lock),
      appliedMinutes: Number(replay.rows[0].recovery_minutes),
    };
  }

  const now = new Date();
  const lock = await getGameplayLockState(client, {
    userId,
    action: input.action as GameplayAction,
    now,
  });
  if (!lock.blocked || lock.reason !== 'recent_gameplay') {
    throw new AppError('conflict', 'recovery kit cannot be used for this lock', 409);
  }
  const recovery = await getRecentGameplayRecovery(client, {
    userId,
    action: input.action as GameplayAction,
    now,
  });
  if (recovery === null || recovery.endsAt.getTime() <= now.getTime()) {
    throw new AppError('conflict', 'gameplay recovery already finished', 409);
  }

  const itemResult = await client.query<{
    id: string;
    title: string;
    effect_recovery_minutes: number;
  }>(
    `select id, title, effect_recovery_minutes
       from admin_inventory_items
      where id = $1
        and item_kind = 'recovery'
        and deleted_at is null
        and effect_recovery_minutes > 0
      for update`,
    [input.itemId],
  );
  const item = itemResult.rows[0];
  if (!item) throw new AppError('not_found', 'recovery kit not found', 404);

  const findInstance = async (): Promise<string | null> => {
    const result = await client.query<{ id: string }>(
      `select id
         from user_inventory_instance
        where user_id = $1
          and inventory_item_id = $2
          and charges_available > 0
        order by created_at, id
        limit 1
        for update`,
      [userId, item.id],
    );
    return result.rows[0]?.id ?? null;
  };

  let instanceId = await findInstance();
  if (instanceId === null && input.buyIfNeeded) {
    await purchaseInventoryItem(client, userId, item.id);
    instanceId = await findInstance();
  }
  if (instanceId === null) throw new AppError('conflict', 'recovery kit is not owned', 409);

  const consumed = await client.query<{ id: string }>(
    `update user_inventory_instance
        set charges_available = charges_available - 1,
            updated_at = now()
      where id = $1 and user_id = $2 and charges_available > 0
      returning id`,
    [instanceId, userId],
  );
  if (!consumed.rows[0]) throw new AppError('conflict', 'recovery kit is not owned', 409);

  const appliedMinutes = Number(item.effect_recovery_minutes);
  await client.query(
    `insert into recovery_kit_application
       (user_id, shot_session_id, inventory_item_id, inventory_instance_id,
        recovery_minutes, idempotency_key)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      recovery.shotSessionId,
      item.id,
      instanceId,
      appliedMinutes,
      input.idempotencyKey,
    ],
  );
  await syncLegacyInventoryAggregate(client, userId, item.id);

  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `select balance, reserved_balance from user_currency_account where user_id = $1`,
    [userId],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'recovery_kit_use', 0, 0, $2, $3, $4)`,
    [
      userId,
      Number(account.rows[0]?.balance ?? 0),
      Number(account.rows[0]?.reserved_balance ?? 0),
      JSON.stringify({
        title: 'Использован набор для восстановления',
        inventory_item_id: item.id,
        item_kind: 'recovery',
        recovery_minutes: appliedMinutes,
        shot_session_id: recovery.shotSessionId,
      }),
    ],
  );

  const nextLock = await getGameplayLockState(client, {
    userId,
    action: input.action as GameplayAction,
    now,
  });
  return {
    inventory: await fetchInventoryState(client, userId),
    gameplayLock: toGameplayLockDto(nextLock),
    appliedMinutes,
  };
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/inventory/me', { preHandler: [app.authenticate] }, async (req) => {
    return fetchInventoryState(app.pg, req.user.id);
  });

  app.get('/inventory/transactions', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = transactionHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new AppError('bad_request', 'invalid transaction history query', 400);
    return fetchTransactionHistory(
      app.pg,
      req.user.id,
      parsed.data.filter,
      parsed.data.limit,
      decodeTransactionCursor(parsed.data.cursor),
    );
  });

  app.post('/inventory/items/:itemId/purchase', { preHandler: [app.authenticate] }, async (req) => {
    const params = itemParamsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid inventory item id', 400);

    const client = await app.pg.connect();
    try {
      await client.query('begin');
      const state = await purchaseInventoryItem(client, req.user.id, params.data.itemId);
      await client.query('commit');
      return state;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/inventory/recovery/use', { preHandler: [app.authenticate] }, async (req) => {
    const body = useRecoveryKitSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid recovery kit payload', 400);

    const client = await app.pg.connect();
    try {
      await client.query('begin');
      if (body.data.action === 'start_classic') {
        await assertFullAmateurAccess(client, req.user.id);
      }
      const result = await useRecoveryKit(client, req.user.id, body.data);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  app.patch('/inventory/equipment', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = equipmentPatchSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('bad_request', 'invalid equipment payload', 400);

    const client = await app.pg.connect();
    try {
      await client.query('begin');
      await ensureInventoryRows(client, req.user.id);

      const assignments: string[] = [];
      const values: unknown[] = [req.user.id];
      const addAssignment = (column: string, value: string | null): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (parsed.data.stickItemId !== undefined) {
        const resolved =
          parsed.data.stickItemId === null
            ? null
            : await resolveEquippableInventorySelection(
                client,
                req.user.id,
                'stick',
                parsed.data.stickItemId,
              );
        addAssignment('equipped_stick_instance_id', resolved?.instanceId ?? null);
        addAssignment('equipped_stick_item_id', resolved?.itemId ?? null);
      }
      if (parsed.data.skatesItemId !== undefined) {
        const resolved =
          parsed.data.skatesItemId === null
            ? null
            : await resolveEquippableInventorySelection(
                client,
                req.user.id,
                'skates',
                parsed.data.skatesItemId,
              );
        addAssignment('equipped_skates_instance_id', resolved?.instanceId ?? null);
        addAssignment('equipped_skates_item_id', resolved?.itemId ?? null);
      }
      if (parsed.data.nutritionItemId !== undefined) {
        const resolved =
          parsed.data.nutritionItemId === null
            ? null
            : await resolveEquippableInventorySelection(
                client,
                req.user.id,
                'nutrition',
                parsed.data.nutritionItemId,
              );
        addAssignment('equipped_nutrition_instance_id', resolved?.instanceId ?? null);
        addAssignment('equipped_nutrition_item_id', resolved?.itemId ?? null);
      }

      await client.query(
        `update user_equipment
            set ${assignments.join(', ')}
          where user_id = $1`,
        values,
      );
      const state = await fetchInventoryState(client, req.user.id);
      await client.query('commit');
      return state;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
};
