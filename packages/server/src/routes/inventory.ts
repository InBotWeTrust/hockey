import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

type EquipmentKind = 'stick' | 'skates' | 'nutrition';
type ResourceUnit = 'period' | 'shot' | 'distance' | 'energy_ms';
type DbClient = Pick<PoolClient, 'query'>;

interface InventoryItemRow {
  id: string;
  item_kind: EquipmentKind;
  title: string;
  description: string;
  photo_url: string | null;
  currency_price: number;
  charges_per_purchase: number;
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
  items: Record<EquipmentKind, InventoryItemDto[]>;
  purchaseHistory: InventoryPurchaseDto[];
  bankHistory: BankPurchaseDto[];
  transactionHistory: InventoryTransactionDto[];
}

interface InventoryItemDto {
  id: string;
  kind: EquipmentKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  chargesPerPurchase: number;
  resourceUnit: ResourceUnit;
  resourceLabel: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  effectPuckSpeedPoints: number;
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

interface InventoryPurchaseDto {
  id: string;
  itemId: string | null;
  title: string;
  kind: EquipmentKind | null;
  tokensSpent: number;
  chargesAdded: number;
  createdAt: string;
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
  if (reason === 'inventory_purchase') return 'inventory';
  if (reason === 'weekly_challenge_reward' || reason === 'duel_reward') return 'reward';
  if (reason.startsWith('duel_')) return 'duel';
  if (reason === 'admin_adjustment') return 'adjustment';
  return 'other';
}

function transactionTitle(reason: string, metadata: Record<string, unknown>): string {
  const title = stringMetadata(metadata, 'title');
  if (title) return title;
  if (reason === 'inventory_purchase') return 'Покупка инвентаря';
  if (reason === 'weekly_challenge_reward') return 'Недельная награда';
  if (reason === 'duel_reward') return 'Награда за дуэль';
  if (reason === 'duel_stake_hold') return 'Ставка дуэли заморожена';
  if (reason === 'duel_entry_fee') return 'Взнос за дуэль';
  if (reason === 'duel_stake_refund') return 'Возврат ставки';
  if (reason === 'duel_stake_payout') return 'Выигрыш ставки';
  if (reason === 'duel_stake_burn') return 'Ставка списана';
  if (reason === 'admin_adjustment') return 'Корректировка баланса';
  return 'Операция';
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
  } else if (reason === 'weekly_challenge_reward') {
    parts.push('награда');
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

async function fetchInventoryState(client: DbClient, userId: string): Promise<InventoryState> {
  await ensureInventoryRows(client, userId);
  const { rows: accountRows } = await client.query<{
    balance: number;
    stars: number;
    equipped_stick_item_id: string | null;
    equipped_skates_item_id: string | null;
    equipped_nutrition_item_id: string | null;
  }>(
    `select coalesce(c.balance, 0)::int as balance,
            coalesce(u.xp, 0)::int as stars,
            e.equipped_stick_item_id,
            e.equipped_skates_item_id,
            e.equipped_nutrition_item_id
       from users u
       left join user_currency_account c on c.user_id = u.id
       left join user_equipment e on e.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const account = accountRows[0];
  if (!account) throw new AppError('not_found', 'user not found', 404);

  const { rows } = await client.query<InventoryItemRow>(
    `select i.id, i.item_kind, i.title, i.description, i.photo_url, i.currency_price,
            i.charges_per_purchase, i.resource_unit, i.rarity, i.power_score, i.duel_period_cost,
            i.effect_puck_speed_points,
            i.effect_stumble_interval_min_ms, i.effect_stumble_interval_max_ms,
            i.effect_stumble_duration_min_ms, i.effect_stumble_duration_max_ms,
            i.effect_nutrition_slowdown_ms, i.effect_nutrition_stop_ms,
            i.effect_fatigue_delay_ms, i.effect_fatigue_speed_multiplier,
            coalesce(ui.charges_available, 0)::int as charges_available,
            coalesce(ui.charges_reserved, 0)::int as charges_reserved
       from admin_inventory_items i
       left join user_inventory_item ui
         on ui.inventory_item_id = i.id and ui.user_id = $1
      where i.deleted_at is null
        and i.item_kind in ('stick', 'skates', 'nutrition')
      order by i.item_kind, i.currency_price, i.title`,
    [userId],
  );

  const items: Record<EquipmentKind, InventoryItemDto[]> = {
    stick: [],
    skates: [],
    nutrition: [],
  };
  for (const row of rows) {
    const chargesAvailable = Number(row.charges_available);
    items[row.item_kind].push({
      id: row.id,
      kind: row.item_kind,
      title: row.title,
      description: row.description,
      imageUrl: row.photo_url,
      currencyPrice: Number(row.currency_price),
      chargesPerPurchase: Number(row.charges_per_purchase),
      resourceUnit: row.resource_unit,
      resourceLabel: resourceLabel(row.resource_unit, chargesAvailable),
      rarity: row.rarity,
      powerScore: Number(row.power_score),
      duelPeriodCost: Number(row.duel_period_cost),
      effectPuckSpeedPoints: Number(row.effect_puck_speed_points),
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

  const { rows: historyRows } = await client.query<{
    id: string;
    available_delta: number;
    created_at: Date;
    metadata: {
      inventory_item_id?: string;
      title?: string;
      item_kind?: EquipmentKind;
      charges_added?: number;
    };
  }>(
    `select id::text, available_delta, created_at, metadata
       from currency_ledger
      where user_id = $1
        and reason = 'inventory_purchase'
      order by created_at desc, id desc
      limit 10`,
    [userId],
  );

  const { rows: bankHistoryRows } = await client.query<{
    id: string;
    title: string;
    amount_rub: number;
    status: BankPurchaseDto['status'];
    created_at: Date;
    paid_at: Date | null;
  }>(
    `select id::text, title, amount_rub, status, created_at, paid_at
       from payments
      where user_id = $1
      order by created_at desc, id desc
      limit 20`,
    [userId],
  );

  const { rows: transactionRows } = await client.query<{
    id: string;
    reason: string;
    available_delta: number;
    created_at: Date;
    metadata: Record<string, unknown>;
  }>(
    `select id::text, reason, available_delta, created_at, metadata
       from currency_ledger
      where user_id = $1
      order by created_at desc, id desc
      limit 30`,
    [userId],
  );

  const ledgerTransactions: InventoryTransactionDto[] = transactionRows
    .map((row) => {
      const metadata = row.metadata ?? {};
      const amounts: InventoryTransactionAmountDto[] = [];
      const coinDelta = Number(row.available_delta);
      if (coinDelta !== 0) amounts.push({ currency: 'coin', value: coinDelta });
      const stars = numberMetadata(metadata, 'stars');
      if (stars !== 0) amounts.push({ currency: 'star', value: stars });
      const experience = numberMetadata(metadata, 'experience');
      if (experience !== 0) amounts.push({ currency: 'experience', value: experience });
      if (amounts.length === 0) return null;
      return {
        id: `ledger-${row.id}`,
        title: transactionTitle(row.reason, metadata),
        subtitle: transactionSubtitle(row.created_at, row.reason, metadata),
        category: transactionCategory(row.reason),
        flow: transactionFlow(amounts),
        amounts,
        createdAt: row.created_at.toISOString(),
      };
    })
    .filter((item): item is InventoryTransactionDto => item !== null);

  const bankTransactions: InventoryTransactionDto[] = bankHistoryRows.map((row) => ({
    id: `payment-${row.id}`,
    title: row.title,
    subtitle: `${row.created_at.toISOString()} · банк · ${bankStatusText(row.status)}`,
    category: 'bank',
    flow: bankTransactionFlow(row.status),
    amounts: [{ currency: 'ruble', value: bankTransactionAmount(row) }],
    createdAt: row.created_at.toISOString(),
  }));

  const transactionHistory = [...ledgerTransactions, ...bankTransactions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);

  return {
    balances: {
      tokens: Number(account.balance),
      stars: Number(account.stars),
    },
    equipped: {
      stickItemId: account.equipped_stick_item_id,
      skatesItemId: account.equipped_skates_item_id,
      nutritionItemId: account.equipped_nutrition_item_id,
    },
    items,
    purchaseHistory: historyRows.map((row) => ({
      id: row.id,
      itemId: row.metadata.inventory_item_id ?? null,
      title: row.metadata.title ?? 'Покупка инвентаря',
      kind: row.metadata.item_kind ?? null,
      tokensSpent: Math.abs(Number(row.available_delta)),
      chargesAdded: Number(row.metadata.charges_added ?? 0),
      createdAt: row.created_at.toISOString(),
    })),
    bankHistory: bankHistoryRows.map((row) => ({
      id: row.id,
      title: row.title,
      amountRub: Number(row.amount_rub),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      paidAt: row.paid_at?.toISOString() ?? null,
    })),
    transactionHistory,
  };
}

async function assertCanEquipItem(
  client: DbClient,
  userId: string,
  kind: EquipmentKind,
  itemId: string,
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `select i.id
       from admin_inventory_items i
       join user_inventory_item ui
         on ui.inventory_item_id = i.id and ui.user_id = $1
      where i.id = $2
        and i.item_kind = $3
        and i.deleted_at is null
        and ui.charges_available + ui.charges_reserved > 0`,
    [userId, itemId, kind],
  );
  if (!rows[0]) {
    throw new AppError('conflict', `invalid ${kind} equipment item`, 409);
  }
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
    item_kind: EquipmentKind;
    currency_price: number;
    charges_per_purchase: number;
  }>(
    `select id, title, item_kind, currency_price, charges_per_purchase
       from admin_inventory_items
      where id = $1
        and deleted_at is null
        and item_kind in ('stick', 'skates', 'nutrition')`,
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

  await client.query(
    `insert into user_inventory_item
       (user_id, inventory_item_id, charges_available, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id, inventory_item_id)
     do update
       set charges_available = user_inventory_item.charges_available + excluded.charges_available,
           updated_at = now()`,
    [userId, item.id, charges],
  );

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
        title: item.title,
        item_kind: item.item_kind,
        charges_added: charges,
      }),
    ],
  );

  return fetchInventoryState(client, userId);
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/inventory/me', { preHandler: [app.authenticate] }, async (req) => {
    return fetchInventoryState(app.pg, req.user.id);
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

  app.patch('/inventory/equipment', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = equipmentPatchSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('bad_request', 'invalid equipment payload', 400);

    const client = await app.pg.connect();
    try {
      await client.query('begin');
      await ensureInventoryRows(client, req.user.id);
      if (parsed.data.stickItemId) {
        await assertCanEquipItem(client, req.user.id, 'stick', parsed.data.stickItemId);
      }
      if (parsed.data.skatesItemId) {
        await assertCanEquipItem(client, req.user.id, 'skates', parsed.data.skatesItemId);
      }
      if (parsed.data.nutritionItemId) {
        await assertCanEquipItem(client, req.user.id, 'nutrition', parsed.data.nutritionItemId);
      }

      const assignments: string[] = [];
      const values: unknown[] = [req.user.id];
      const addAssignment = (column: string, value: string | null): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (parsed.data.stickItemId !== undefined) {
        addAssignment('equipped_stick_item_id', parsed.data.stickItemId);
      }
      if (parsed.data.skatesItemId !== undefined) {
        addAssignment('equipped_skates_item_id', parsed.data.skatesItemId);
      }
      if (parsed.data.nutritionItemId !== undefined) {
        addAssignment('equipped_nutrition_item_id', parsed.data.nutritionItemId);
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
