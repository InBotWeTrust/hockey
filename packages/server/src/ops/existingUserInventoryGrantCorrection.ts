import type { Pool } from 'pg';
import {
  EXISTING_USER_INVENTORY_GRANT_KEY,
  type ExistingUserInventoryGrantReport,
} from './existingUserInventoryGrant.js';

export const EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY =
  '2026-09-11-existing-user-inventory-grant-v1-correction-v1';

const REPLACEMENT_KINDS = ['nutrition', 'skates', 'stick'] as const;
type ReplacementKind = (typeof REPLACEMENT_KINDS)[number];

export interface ExistingUserInventoryGrantCorrectionPlan {
  userIds: string[];
  wrongGrants: Array<{
    instanceId: string;
    userId: string;
    itemId: string;
    itemKind: ReplacementKind;
  }>;
  replacementKinds: ReplacementKind[];
  expectedChargesByItemId: Map<string, number>;
}

export interface ExistingUserInventoryGrantCorrectionReport {
  operationKey: string;
  sourceOperationKey: string;
  applied: boolean;
  alreadyApplied: boolean;
  recipientCount: number;
  removedInstanceCount: number;
  grantedInstanceCount: number;
  removedInstanceIds: string[];
  grants: Array<{ instanceId: string; userId: string; itemId: string }>;
  items: Array<{
    id: string;
    title: string;
    itemKind: ReplacementKind;
    rarity: 'rare';
    chargesPerInstance: number;
  }>;
}

export function buildExistingUserInventoryGrantCorrectionPlan(
  source: ExistingUserInventoryGrantReport,
): ExistingUserInventoryGrantCorrectionPlan {
  if (source.operationKey !== EXISTING_USER_INVENTORY_GRANT_KEY) {
    throw new Error('inventory grant correction requires the original inventory grant payload');
  }
  const userIds = [...new Set(source.recipients.map((recipient) => recipient.id))].sort();
  if (userIds.length !== source.recipientCount || userIds.length === 0) {
    throw new Error('original inventory grant recipient list is invalid');
  }

  const wrongItemIds = new Map<ReplacementKind, string>();
  const wrongItemKindsById = new Map<string, ReplacementKind>();
  const expectedChargesByItemId = new Map<string, number>();
  for (const kind of REPLACEMENT_KINDS) {
    const matches = source.items.filter((item) => item.itemKind === kind);
    if (matches.length !== 1 || matches[0]?.rarity !== 'common') {
      throw new Error(`original inventory grant must contain exactly one common ${kind} item`);
    }
    const item = matches[0];
    if (!item || item.chargesPerInstance <= 0) {
      throw new Error(`original inventory grant ${kind} item has invalid stock`);
    }
    wrongItemIds.set(kind, item.id);
    wrongItemKindsById.set(item.id, kind);
    expectedChargesByItemId.set(item.id, item.chargesPerInstance);
  }
  const recoveryItems = source.items.filter((item) => item.itemKind === 'recovery');
  if (recoveryItems.length !== 1 || recoveryItems[0]?.rarity !== 'rare') {
    throw new Error('original inventory grant must preserve exactly one rare recovery item');
  }

  const wrongItemIdSet = new Set(wrongItemIds.values());
  const wrongGrants = source.grants
    .filter((grant) => wrongItemIdSet.has(grant.itemId))
    .map((grant) => {
      const itemKind = wrongItemKindsById.get(grant.itemId);
      if (!itemKind) throw new Error('original inventory grant has an unknown replacement item');
      return { ...grant, itemKind };
    });
  if (wrongGrants.length !== userIds.length * REPLACEMENT_KINDS.length) {
    throw new Error('original inventory grant does not contain every replaceable instance');
  }
  for (const userId of userIds) {
    const grantsForUser = wrongGrants.filter((grant) => grant.userId === userId);
    if (grantsForUser.length !== REPLACEMENT_KINDS.length) {
      throw new Error(`original inventory grant has an invalid replacement set for user ${userId}`);
    }
    for (const itemId of wrongItemIdSet) {
      if (grantsForUser.filter((grant) => grant.itemId === itemId).length !== 1) {
        throw new Error(`original inventory grant has duplicate or missing replacement items for user ${userId}`);
      }
    }
  }

  return {
    userIds,
    wrongGrants,
    replacementKinds: [...REPLACEMENT_KINDS],
    expectedChargesByItemId,
  };
}

export async function runExistingUserInventoryGrantCorrection(
  pool: Pool,
  options: { apply: boolean },
): Promise<ExistingUserInventoryGrantCorrectionReport> {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
    ]);
    const previous = await client.query<{ payload: ExistingUserInventoryGrantCorrectionReport }>(
      'select payload from production_data_operations where operation_key = $1',
      [EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY],
    );
    if (previous.rows[0]) {
      await client.query('rollback');
      transactionOpen = false;
      return { ...previous.rows[0].payload, applied: false, alreadyApplied: true };
    }

    const sourceResult = await client.query<{ payload: ExistingUserInventoryGrantReport }>(
      'select payload from production_data_operations where operation_key = $1 for share',
      [EXISTING_USER_INVENTORY_GRANT_KEY],
    );
    const source = sourceResult.rows[0]?.payload;
    if (!source) throw new Error('original inventory grant operation was not found');
    const plan = buildExistingUserInventoryGrantCorrectionPlan(source);

    const existing = await client.query<{
      id: string;
      user_id: string;
      inventory_item_id: string;
      charges_available: number;
      charges_reserved: number;
    }>(
      `select id, user_id, inventory_item_id, charges_available, charges_reserved
         from user_inventory_instance
        where id = any($1::uuid[])
        for update`,
      [plan.wrongGrants.map((grant) => grant.instanceId)],
    );
    if (existing.rows.length !== plan.wrongGrants.length) {
      throw new Error('one or more mistaken inventory instances are missing');
    }
    const expectedByInstanceId = new Map(plan.wrongGrants.map((grant) => [grant.instanceId, grant]));
    for (const instance of existing.rows) {
      const expected = expectedByInstanceId.get(instance.id);
      const expectedCharges = expected
        ? plan.expectedChargesByItemId.get(expected.itemId)
        : undefined;
      if (
        !expected ||
        expectedCharges === undefined ||
        instance.user_id !== expected.userId ||
        instance.inventory_item_id !== expected.itemId ||
        Number(instance.charges_available) !== expectedCharges ||
        Number(instance.charges_reserved) !== 0
      ) {
        throw new Error('mistaken inventory was used, reserved, or no longer matches the original grant');
      }
    }

    const replacements = await client.query<{
      id: string;
      title: string;
      item_kind: ReplacementKind;
      rarity: 'rare';
      charges_per_purchase: number;
    }>(
      `select id, title, item_kind, rarity, charges_per_purchase
         from admin_inventory_items
        where deleted_at is null
          and item_kind = any($1::text[])
          and rarity = 'rare'
        order by item_kind
        for share`,
      [plan.replacementKinds],
    );
    if (replacements.rows.length !== plan.replacementKinds.length) {
      throw new Error('expected exactly one rare replacement item for every inventory kind');
    }
    for (const item of replacements.rows) {
      if (Number(item.charges_per_purchase) <= 0) {
        throw new Error(`replacement inventory item ${item.id} has no positive stock`);
      }
    }

    const inserted = await client.query<{ instance_id: string; user_id: string; inventory_item_id: string }>(
      `insert into user_inventory_instance
         (user_id, inventory_item_id, charges_available, charges_reserved)
       select recipient.id, item.id, item.charges, 0
         from unnest($1::uuid[]) recipient(id)
         cross join unnest($2::uuid[], $3::int[]) item(id, charges)
       returning id as instance_id, user_id, inventory_item_id`,
      [
        plan.userIds,
        replacements.rows.map((item) => item.id),
        replacements.rows.map((item) => Number(item.charges_per_purchase)),
      ],
    );
    if (inserted.rowCount !== plan.userIds.length * plan.replacementKinds.length) {
      throw new Error('failed to add every replacement inventory instance');
    }

    const replacementKindByItemId = new Map(
      replacements.rows.map((item) => [item.id, item.item_kind] as const),
    );
    const wrongGrantByUserAndKind = new Map(
      plan.wrongGrants.map((grant) => [`${grant.userId}:${grant.itemKind}`, grant] as const),
    );
    const replacementRows = inserted.rows.map((grant) => {
      const itemKind = replacementKindByItemId.get(grant.inventory_item_id);
      const wrongGrant = itemKind
        ? wrongGrantByUserAndKind.get(`${grant.user_id}:${itemKind}`)
        : undefined;
      if (!itemKind || !wrongGrant) {
        throw new Error('replacement inventory does not match the original grant');
      }
      return {
        userId: grant.user_id,
        itemKind,
        wrongInstanceId: wrongGrant.instanceId,
        replacementInstanceId: grant.instance_id,
      };
    });
    await client.query(
      `with replacement_rows as (
         select *
           from unnest($1::uuid[], $2::text[], $3::uuid[], $4::uuid[])
                as row(user_id, item_kind, old_instance_id, new_instance_id)
       ), per_user as (
         select user_id,
                (array_agg(old_instance_id) filter (where item_kind = 'stick'))[1] as old_stick,
                (array_agg(new_instance_id) filter (where item_kind = 'stick'))[1] as new_stick,
                (array_agg(old_instance_id) filter (where item_kind = 'skates'))[1] as old_skates,
                (array_agg(new_instance_id) filter (where item_kind = 'skates'))[1] as new_skates,
                (array_agg(old_instance_id) filter (where item_kind = 'nutrition'))[1] as old_nutrition,
                (array_agg(new_instance_id) filter (where item_kind = 'nutrition'))[1] as new_nutrition
           from replacement_rows
          group by user_id
       )
       update user_equipment equipment
          set equipped_stick_instance_id = case
                when equipment.equipped_stick_instance_id = plan.old_stick then plan.new_stick
                else equipment.equipped_stick_instance_id
              end,
              equipped_skates_instance_id = case
                when equipment.equipped_skates_instance_id = plan.old_skates then plan.new_skates
                else equipment.equipped_skates_instance_id
              end,
              equipped_nutrition_instance_id = case
                when equipment.equipped_nutrition_instance_id = plan.old_nutrition then plan.new_nutrition
                else equipment.equipped_nutrition_instance_id
              end
         from per_user plan
        where equipment.user_id = plan.user_id
          and (
            equipment.equipped_stick_instance_id = plan.old_stick
            or equipment.equipped_skates_instance_id = plan.old_skates
            or equipment.equipped_nutrition_instance_id = plan.old_nutrition
          )`,
      [
        replacementRows.map((row) => row.userId),
        replacementRows.map((row) => row.itemKind),
        replacementRows.map((row) => row.wrongInstanceId),
        replacementRows.map((row) => row.replacementInstanceId),
      ],
    );

    const removed = await client.query<{ id: string }>(
      'delete from user_inventory_instance where id = any($1::uuid[]) returning id',
      [plan.wrongGrants.map((grant) => grant.instanceId)],
    );
    if (removed.rowCount !== plan.wrongGrants.length) {
      throw new Error('failed to remove every mistaken inventory instance');
    }

    const report: ExistingUserInventoryGrantCorrectionReport = {
      operationKey: EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
      sourceOperationKey: EXISTING_USER_INVENTORY_GRANT_KEY,
      applied: options.apply,
      alreadyApplied: false,
      recipientCount: plan.userIds.length,
      removedInstanceCount: removed.rowCount ?? 0,
      grantedInstanceCount: inserted.rowCount ?? 0,
      removedInstanceIds: removed.rows.map((instance) => instance.id),
      grants: inserted.rows.map((grant) => ({
        instanceId: grant.instance_id,
        userId: grant.user_id,
        itemId: grant.inventory_item_id,
      })),
      items: replacements.rows.map((item) => ({
        id: item.id,
        title: item.title,
        itemKind: item.item_kind,
        rarity: item.rarity,
        chargesPerInstance: Number(item.charges_per_purchase),
      })),
    };
    if (options.apply) {
      await client.query(
        'insert into production_data_operations (operation_key, payload) values ($1, $2)',
        [EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY, JSON.stringify(report)],
      );
      await client.query('commit');
    } else {
      await client.query('rollback');
    }
    transactionOpen = false;
    return report;
  } catch (error) {
    if (transactionOpen) await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
