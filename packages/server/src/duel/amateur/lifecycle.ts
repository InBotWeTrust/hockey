import type { PoolClient } from 'pg';
import { z } from 'zod';

export type AmateurDuelSource = 'challenge' | 'matchmaking' | 'tournament';

export interface DuelSettlementPolicy {
  settleStake: boolean;
  grantTemplateRewards: boolean;
  updateRating: boolean;
  evaluateAchievements: boolean;
}

const STANDARD_SETTLEMENT_POLICY: DuelSettlementPolicy = {
  settleStake: true,
  grantTemplateRewards: true,
  updateRating: true,
  evaluateAchievements: true,
};

const TOURNAMENT_SETTLEMENT_POLICY: DuelSettlementPolicy = {
  settleStake: false,
  grantTemplateRewards: false,
  updateRating: false,
  evaluateAchievements: false,
};

interface DuelInventoryReservationParticipant {
  matchId: string;
  userId: string;
  loadoutSnapshot: unknown;
  reservedInventoryCharges: number;
  consumedInventoryCharges: number;
}

interface TournamentDuelReservationRow {
  match_id: string;
  user_id: string;
  loadout_snapshot: unknown;
  reserved_inventory_charges: number;
  consumed_inventory_charges: number;
}

const reservationLoadoutSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        itemId: z.string().uuid().optional(),
        instanceId: z.string().uuid().nullable().optional(),
        kind: z.enum(['stick', 'skates', 'nutrition']),
        title: z.string(),
        duelPeriodCost: z.number().int().min(0).default(0),
        chargesReserved: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

function reservationItemsFromSnapshot(value: unknown) {
  const parsed = reservationLoadoutSchema.safeParse(value ?? {});
  if (!parsed.success) return [];
  return parsed.data.items.map((item) => ({
    itemId: item.itemId ?? item.id,
    instanceId: item.instanceId ?? null,
    chargesReserved: item.chargesReserved,
    duelPeriodCost: item.duelPeriodCost,
  }));
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

/**
 * Preserves the duel inventory contract: consumed charges stay spent, while the unused reserve returns.
 * The participant marker is advanced to its full reservation so duplicate terminal cleanup is a no-op.
 */
export async function releaseRemainingDuelInventoryReserve(
  client: PoolClient,
  participant: DuelInventoryReservationParticipant,
): Promise<void> {
  const items = reservationItemsFromSnapshot(participant.loadoutSnapshot);
  const reserveCostPerPeriod = items.reduce((sum, item) => sum + item.duelPeriodCost, 0);
  const periodsConsumed = Math.floor(
    Number(participant.consumedInventoryCharges) / Math.max(1, reserveCostPerPeriod),
  );
  for (const item of items) {
    const consumedForItem = Math.min(
      item.chargesReserved,
      periodsConsumed * item.duelPeriodCost,
    );
    const remaining = Math.max(0, item.chargesReserved - consumedForItem);
    if (remaining <= 0) continue;
    if (item.instanceId !== null) {
      await client.query(
        `update user_inventory_instance
            set charges_available = charges_available + $3,
                charges_reserved = greatest(0, charges_reserved - $3),
                updated_at = now()
          where user_id = $1 and id = $2`,
        [participant.userId, item.instanceId, remaining],
      );
      await syncLegacyInventoryAggregate(client, participant.userId, item.itemId);
    } else {
      await client.query(
        `update user_inventory_item
            set charges_available = charges_available + $3,
                charges_reserved = greatest(0, charges_reserved - $3),
                updated_at = now()
          where user_id = $1 and inventory_item_id = $2`,
        [participant.userId, item.itemId, remaining],
      );
    }
  }
  await client.query(
    `update amateur_duel_participant
        set consumed_inventory_charges = reserved_inventory_charges,
            updated_at = now()
      where match_id = $1 and user_id = $2`,
    [participant.matchId, participant.userId],
  );
}

/**
 * Cancels an opened tournament duel without ordinary result settlement: no rating, stakes,
 * template rewards, or achievement processing. The caller must already hold the tournament boundary.
 */
export async function cancelTournamentDuel(
  client: PoolClient,
  input: { duelMatchId: string; reason: string },
): Promise<boolean> {
  const matchResult = await client.query<{ id: string; status: string }>(
    `select id, status
       from amateur_duel_match
      where id = $1 and source = 'tournament'
      for update`,
    [input.duelMatchId],
  );
  const match = matchResult.rows[0];
  if (!match || !['invited', 'ready_check', 'active'].includes(match.status)) return false;

  const participants = await client.query<TournamentDuelReservationRow>(
    `select match_id, user_id, loadout_snapshot, reserved_inventory_charges,
            consumed_inventory_charges
       from amateur_duel_participant
      where match_id = $1
      order by side
      for update`,
    [match.id],
  );
  for (const participant of participants.rows) {
    await releaseRemainingDuelInventoryReserve(client, {
      matchId: participant.match_id,
      userId: participant.user_id,
      loadoutSnapshot: participant.loadout_snapshot,
      reservedInventoryCharges: Number(participant.reserved_inventory_charges),
      consumedInventoryCharges: Number(participant.consumed_inventory_charges),
    });
  }
  await client.query(
    `update amateur_duel_participant
        set state = case when state in ('completed', 'forfeit') then state else 'forfeit' end,
            period_started_at = null,
            break_started_at = null,
            updated_at = now()
      where match_id = $1`,
    [match.id],
  );
  await client.query(
    `update amateur_duel_match
        set status = 'cancelled',
            settled_reason = $2,
            settled_at = now(),
            updated_at = now()
      where id = $1`,
    [match.id, input.reason],
  );
  return true;
}

export function getDuelSettlementPolicy(source: AmateurDuelSource): DuelSettlementPolicy {
  return source === 'tournament' ? TOURNAMENT_SETTLEMENT_POLICY : STANDARD_SETTLEMENT_POLICY;
}
