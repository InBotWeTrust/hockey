import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

/** Called inside the completion transaction while the user's row is locked. */
export async function grantAmateurStarterSet(
  client: PoolClient,
  userId: string,
  runId: string,
): Promise<void> {
  const receipt = await client.query(
    `insert into amateur_onboarding_starter_grant (user_id, run_id, granted_at)
     values ($1, $2, now()) on conflict (user_id) do nothing returning user_id`,
    [userId, runId],
  );
  if (receipt.rowCount === 0) return;

  const items = await client.query<{
    id: string;
    item_kind: string;
    charges_per_purchase: number;
  }>(
    `select id, item_kind, charges_per_purchase from admin_inventory_items
      where deleted_at is null and rarity = 'rare'
        and item_kind in ('stick', 'skates', 'nutrition')
      order by item_kind for share`,
  );
  if (
    items.rows.length !== 3 ||
    new Set(items.rows.map(item => item.item_kind)).size !== 3 ||
    items.rows.some(item => item.charges_per_purchase <= 0)
  ) {
    throw new AppError('starter_set_unavailable', 'Стартовый набор пока недоступен. Попробуйте позже.', 409);
  }

  const grants: Array<{ itemId: string; instanceId: string; charges: number }> = [];
  for (const item of items.rows) {
    const instance = await client.query<{ id: string }>(
      `insert into user_inventory_instance (user_id, inventory_item_id, charges_available)
       values ($1, $2, $3) returning id`,
      [userId, item.id, item.charges_per_purchase],
    );
    await client.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available, charges_reserved)
       select $1, $2, coalesce(sum(charges_available), 0), coalesce(sum(charges_reserved), 0)
         from user_inventory_instance where user_id = $1 and inventory_item_id = $2
       on conflict (user_id, inventory_item_id) do update
         set charges_available = excluded.charges_available,
             charges_reserved = excluded.charges_reserved, updated_at = now()`,
      [userId, item.id],
    );
    grants.push({ itemId: item.id, instanceId: instance.rows[0]!.id, charges: item.charges_per_purchase });
  }
  await client.query(
    'update amateur_onboarding_starter_grant set items = $2::jsonb where user_id = $1',
    [userId, JSON.stringify(grants)],
  );
}
