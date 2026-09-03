import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export interface PeriodLoadoutSelection {
  stick?: string | null;
  skates?: string | null;
  nutrition?: string | null;
}

export interface PeriodLoadoutItemSnapshot {
  id: string;
  itemId: string;
  instanceId: string | null;
  kind: 'stick' | 'skates' | 'nutrition';
  title: string;
  imageUrl: string | null;
  chargesConsumed: number;
  effects: {
    puckSpeedDelta: number;
    shooterFrequencyDelta: number;
    goalieFrequencyDelta: number;
    goalFrequencyDelta: number;
    shotZoneMultiplier: number;
    recoveryDelayMs: number;
  };
}

export interface PeriodLoadoutSnapshot {
  items: PeriodLoadoutItemSnapshot[];
}

function number(value: string | number | null, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function syncLegacyAggregate(
  client: PoolClient,
  userId: string,
  itemId: string,
): Promise<void> {
  await client.query(
    `insert into user_inventory_item
       (user_id, inventory_item_id, charges_available, charges_reserved, updated_at)
     select $1, $2, coalesce(sum(charges_available), 0)::int,
            coalesce(sum(charges_reserved), 0)::int, now()
       from user_inventory_instance
      where user_id = $1 and inventory_item_id = $2
     on conflict (user_id, inventory_item_id) do update
       set charges_available = excluded.charges_available,
           charges_reserved = excluded.charges_reserved,
           updated_at = now()`,
    [userId, itemId],
  );
}

export function hasPeriodLoadoutSelection(selection: PeriodLoadoutSelection | undefined): boolean {
  return Boolean(selection?.stick || selection?.skates || selection?.nutrition);
}

export async function consumePeriodLoadout(
  client: PoolClient,
  input: {
    userId: string;
    attemptId: string;
    periodNumber: number;
    selection: PeriodLoadoutSelection;
    now: Date;
  },
): Promise<PeriodLoadoutSnapshot> {
  const requested = [
    { kind: 'stick' as const, id: input.selection.stick ?? null },
    { kind: 'skates' as const, id: input.selection.skates ?? null },
    { kind: 'nutrition' as const, id: input.selection.nutrition ?? null },
  ].filter((entry): entry is { kind: 'stick' | 'skates' | 'nutrition'; id: string } =>
    Boolean(entry.id),
  );
  if (requested.length === 0) {
    const snapshot: PeriodLoadoutSnapshot = { items: [] };
    await client.query(
      `insert into bonus_game_period_loadout
         (attempt_id, period_number, selection, snapshot, consumed_at, created_at)
       values ($1, $2, $3::jsonb, $4::jsonb, $5, $5)`,
      [input.attemptId, input.periodNumber, JSON.stringify(input.selection), JSON.stringify(snapshot), input.now],
    );
    return snapshot;
  }

  const ids = requested.map((entry) => entry.id);
  const { rows } = await client.query<{
    id: string;
    item_id: string;
    instance_id: string | null;
    item_kind: 'stick' | 'skates' | 'nutrition';
    title: string;
    image_url: string | null;
    duel_period_cost: number;
    charges_available: number;
    effect_puck_speed_delta: string | number;
    effect_shooter_frequency_delta: string | number;
    effect_goalie_frequency_delta: string | number;
    effect_goal_frequency_delta: string | number;
    effect_shot_zone_multiplier: string | number;
    effect_recovery_delay_ms: number;
  }>(
    `select coalesce(instance.id, item.id) as id,
            item.id as item_id, instance.id as instance_id, item.item_kind,
            item.title, item.photo_url as image_url, item.duel_period_cost,
            case when instance.id is not null then instance.charges_available
                 else coalesce(legacy.charges_available, 0) end::int as charges_available,
            item.effect_puck_speed_delta, item.effect_shooter_frequency_delta,
            item.effect_goalie_frequency_delta, item.effect_goal_frequency_delta,
            item.effect_shot_zone_multiplier, item.effect_recovery_delay_ms
       from admin_inventory_items item
       left join lateral (
         select owned.id, owned.charges_available
           from user_inventory_instance owned
          where owned.user_id = $1
            and owned.inventory_item_id = item.id
            and (owned.id = any($2::uuid[]) or item.id = any($2::uuid[]))
          order by case when owned.id = any($2::uuid[]) then 0 else 1 end,
                   owned.created_at, owned.id
          limit 1
       ) instance on true
       left join user_inventory_item legacy
         on legacy.user_id = $1 and legacy.inventory_item_id = item.id and instance.id is null
      where (item.id = any($2::uuid[]) or instance.id = any($2::uuid[]))
        and item.deleted_at is null`,
    [input.userId, ids],
  );
  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    byId.set(row.id, row);
    byId.set(row.item_id, row);
  }

  const items: PeriodLoadoutItemSnapshot[] = [];
  for (const requestedItem of requested) {
    const row = byId.get(requestedItem.id);
    if (!row || row.item_kind !== requestedItem.kind) {
      throw new AppError('bonus_inventory_invalid', 'invalid bonus inventory selection', 409);
    }
    const cost = Math.max(1, Number(row.duel_period_cost));
    if (Number(row.charges_available) < cost) {
      throw new AppError('bonus_inventory_insufficient', 'not enough bonus inventory charges', 409);
    }
    const update = row.instance_id
      ? await client.query(
          `update user_inventory_instance
              set charges_available = charges_available - $3, updated_at = $4
            where user_id = $1 and id = $2 and charges_available >= $3`,
          [input.userId, row.instance_id, cost, input.now],
        )
      : await client.query(
          `update user_inventory_item
              set charges_available = charges_available - $3, updated_at = $4
            where user_id = $1 and inventory_item_id = $2 and charges_available >= $3`,
          [input.userId, row.item_id, cost, input.now],
        );
    if (update.rowCount !== 1) {
      throw new AppError('bonus_inventory_insufficient', 'not enough bonus inventory charges', 409);
    }
    if (row.instance_id) await syncLegacyAggregate(client, input.userId, row.item_id);
    items.push({
      id: row.id,
      itemId: row.item_id,
      instanceId: row.instance_id,
      kind: row.item_kind,
      title: row.title,
      imageUrl: row.image_url,
      chargesConsumed: cost,
      effects: {
        puckSpeedDelta: number(row.effect_puck_speed_delta),
        shooterFrequencyDelta: number(row.effect_shooter_frequency_delta),
        goalieFrequencyDelta: number(row.effect_goalie_frequency_delta),
        goalFrequencyDelta: number(row.effect_goal_frequency_delta),
        shotZoneMultiplier: number(row.effect_shot_zone_multiplier, 1),
        recoveryDelayMs: Number(row.effect_recovery_delay_ms),
      },
    });
  }

  const snapshot: PeriodLoadoutSnapshot = { items };
  await client.query(
    `insert into bonus_game_period_loadout
       (attempt_id, period_number, selection, snapshot, consumed_at, created_at)
     values ($1, $2, $3::jsonb, $4::jsonb, $5, $5)`,
    [input.attemptId, input.periodNumber, JSON.stringify(input.selection), JSON.stringify(snapshot), input.now],
  );
  return snapshot;
}
