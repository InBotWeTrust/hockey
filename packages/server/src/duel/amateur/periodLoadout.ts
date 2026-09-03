import type { PoolClient } from 'pg';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';

export interface PeriodReservationItem {
  itemId: string;
  instanceId: string | null;
  chargesReserved: number;
}

function reservationKey(item: Pick<PeriodReservationItem, 'itemId' | 'instanceId'>): string {
  return item.instanceId ?? item.itemId;
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

/** Adjusts only the unused reserve held for the not-yet-started tournament period. */
export async function adjustTournamentPeriodReservation(
  client: PoolClient,
  input: {
    userId: string;
    matchId: string;
    previous: readonly PeriodReservationItem[];
    next: readonly PeriodReservationItem[];
  },
): Promise<number> {
  const previousByKey = new Map(input.previous.map((item) => [reservationKey(item), item]));
  const nextByKey = new Map(input.next.map((item) => [reservationKey(item), item]));
  const keys = new Set([...previousByKey.keys(), ...nextByKey.keys()]);
  let totalDelta = 0;

  for (const key of keys) {
    const previous = previousByKey.get(key);
    const next = nextByKey.get(key);
    const item = next ?? previous!;
    const delta = Math.max(0, next?.chargesReserved ?? 0) - Math.max(0, previous?.chargesReserved ?? 0);
    if (delta === 0) continue;

    const result = item.instanceId
      ? await client.query(
          `update user_inventory_instance
              set charges_available = charges_available - $3,
                  charges_reserved = charges_reserved + $3,
                  updated_at = now()
            where user_id = $1 and id = $2
              and charges_available - $3 >= 0
              and charges_reserved + $3 >= 0
            returning charges_available, charges_reserved`,
          [input.userId, item.instanceId, delta],
        )
      : await client.query(
          `update user_inventory_item
              set charges_available = charges_available - $3,
                  charges_reserved = charges_reserved + $3,
                  updated_at = now()
            where user_id = $1 and inventory_item_id = $2
              and charges_available - $3 >= 0
              and charges_reserved + $3 >= 0
            returning charges_available, charges_reserved`,
          [input.userId, item.itemId, delta],
        );
    if ((result.rowCount ?? 0) === 0) {
      throw new AppError('conflict', 'not enough inventory charges for tournament period loadout', 409);
    }
    if (item.instanceId) await syncLegacyInventoryAggregate(client, input.userId, item.itemId);
    totalDelta += delta;
    await appendEvent(client, input.userId, 'amateur_duel_inventory_reserved', {
      match_id: input.matchId,
      inventory_item_id: item.itemId,
      inventory_instance_id: item.instanceId,
      charges: delta,
      reservation_action: 'tournament_period_adjustment',
    });
  }
  return totalDelta;
}
