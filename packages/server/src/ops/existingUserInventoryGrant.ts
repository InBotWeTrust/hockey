import type { Pool } from 'pg';

export const EXISTING_USER_INVENTORY_GRANT_KEY =
  '2026-09-11-existing-user-inventory-grant-v1';

interface RecipientRow {
  id: string;
  display_name: string;
}

interface ItemRow {
  id: string;
  title: string;
  item_kind: 'stick' | 'skates' | 'nutrition' | 'recovery';
  rarity: 'common' | 'rare';
  charges_per_purchase: number;
}

export interface ExistingUserInventoryGrantReport {
  operationKey: string;
  applied: boolean;
  alreadyApplied: boolean;
  startedAt: string;
  recipientCount: number;
  grantedInstanceCount: number;
  recipients: Array<{ id: string; displayName: string }>;
  grants: Array<{ instanceId: string; userId: string; itemId: string }>;
  items: Array<{
    id: string;
    title: string;
    itemKind: ItemRow['item_kind'];
    rarity: ItemRow['rarity'];
    chargesPerInstance: number;
  }>;
}

export async function runExistingUserInventoryGrant(
  pool: Pool,
  options: { apply: boolean },
): Promise<ExistingUserInventoryGrantReport> {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      EXISTING_USER_INVENTORY_GRANT_KEY,
    ]);

    const previous = await client.query<{ payload: ExistingUserInventoryGrantReport }>(
      'select payload from production_data_operations where operation_key = $1',
      [EXISTING_USER_INVENTORY_GRANT_KEY],
    );
    if (previous.rows[0]) {
      await client.query('rollback');
      transactionOpen = false;
      return {
        ...previous.rows[0].payload,
        applied: false,
        alreadyApplied: true,
      };
    }

    await client.query('lock table users in share row exclusive mode');
    const startedAtResult = await client.query<{ started_at: string }>(
      `select transaction_timestamp()::text as started_at`,
    );
    const recipients = await client.query<RecipientRow>(
      'select id, display_name from users order by id',
    );
    const items = await client.query<ItemRow>(
      `select id, title, item_kind, rarity, charges_per_purchase
         from admin_inventory_items
        where deleted_at is null
          and (
            (item_kind = 'stick' and rarity = 'common')
            or (item_kind = 'skates' and rarity = 'common')
            or (item_kind = 'nutrition' and rarity = 'common')
            or (item_kind = 'recovery' and rarity = 'rare')
          )
        order by item_kind
        for share`,
    );
    if (items.rows.length !== 4) {
      throw new Error(`expected exactly 4 inventory grant items, found ${items.rows.length}`);
    }
    for (const item of items.rows) {
      if (Number(item.charges_per_purchase) <= 0) {
        throw new Error(`inventory grant item ${item.id} has no positive stock`);
      }
    }

    const inserted = await client.query<{
      instance_id: string;
      user_id: string;
      inventory_item_id: string;
    }>(
      `insert into user_inventory_instance
         (user_id, inventory_item_id, charges_available, charges_reserved)
       select recipient.id, item.id, item.charges, 0
         from unnest($1::uuid[]) recipient(id)
         cross join unnest($2::uuid[], $3::int[]) item(id, charges)
       returning id as instance_id, user_id, inventory_item_id`,
      [
        recipients.rows.map((recipient) => recipient.id),
        items.rows.map((item) => item.id),
        items.rows.map((item) => Number(item.charges_per_purchase)),
      ],
    );

    const report: ExistingUserInventoryGrantReport = {
      operationKey: EXISTING_USER_INVENTORY_GRANT_KEY,
      applied: options.apply,
      alreadyApplied: false,
      startedAt: startedAtResult.rows[0]!.started_at,
      recipientCount: recipients.rows.length,
      grantedInstanceCount: inserted.rowCount ?? 0,
      recipients: recipients.rows.map((recipient) => ({
        id: recipient.id,
        displayName: recipient.display_name,
      })),
      grants: inserted.rows.map((grant) => ({
        instanceId: grant.instance_id,
        userId: grant.user_id,
        itemId: grant.inventory_item_id,
      })),
      items: items.rows.map((item) => ({
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
        [EXISTING_USER_INVENTORY_GRANT_KEY, JSON.stringify(report)],
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
