import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

type EquipmentKind = 'stick' | 'skates' | 'nutrition';
type DbClient = Pick<PoolClient, 'query'>;

interface InventoryItemRow {
  id: string;
  item_kind: EquipmentKind;
  title: string;
  description: string;
  photo_url: string | null;
  currency_price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  power_score: number;
  duel_period_cost: number;
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
}

interface InventoryItemDto {
  id: string;
  kind: EquipmentKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  chargesAvailable: number;
  chargesReserved: number;
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
            i.rarity, i.power_score, i.duel_period_cost,
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
    items[row.item_kind].push({
      id: row.id,
      kind: row.item_kind,
      title: row.title,
      description: row.description,
      imageUrl: row.photo_url,
      currencyPrice: Number(row.currency_price),
      rarity: row.rarity,
      powerScore: Number(row.power_score),
      duelPeriodCost: Number(row.duel_period_cost),
      chargesAvailable: Number(row.charges_available),
      chargesReserved: Number(row.charges_reserved),
    });
  }

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

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/inventory/me', { preHandler: [app.authenticate] }, async (req) => {
    return fetchInventoryState(app.pg, req.user.id);
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
