import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { runExistingUserInventoryGrant } from '../../src/ops/existingUserInventoryGrant.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

const FIRST_USER_ID = '00000000-0000-4000-8000-000000000201';
const SECOND_USER_ID = '00000000-0000-4000-8000-000000000202';
const FUTURE_USER_ID = '00000000-0000-4000-8000-000000000203';

describe.skipIf(!hasIntegrationEnv)('existing-user inventory grant operation', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'First', 'Europe/Moscow'), ($2, 'Second', 'Europe/Moscow')`,
      [FIRST_USER_ID, SECOND_USER_ID],
    );

    const commonStick = await pool.query<{ id: string; charges_per_purchase: number }>(
      `select id, charges_per_purchase
         from admin_inventory_items
        where item_kind = 'stick' and rarity = 'common' and deleted_at is null`,
    );
    await pool.query(
      `insert into user_inventory_instance (user_id, inventory_item_id, charges_available)
       values ($1, $2, $3)`,
      [FIRST_USER_ID, commonStick.rows[0]!.id, commonStick.rows[0]!.charges_per_purchase - 17],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('dry-runs and grants one fresh package of each selected item exactly once', async () => {
    const dryRun = await runExistingUserInventoryGrant(pool, { apply: false });
    expect(dryRun).toMatchObject({
      applied: false,
      alreadyApplied: false,
      recipientCount: 2,
      grantedInstanceCount: 8,
    });
    expect(
      (await pool.query('select count(*)::int as count from user_inventory_instance')).rows,
    ).toEqual([{ count: 1 }]);

    const applied = await runExistingUserInventoryGrant(pool, { apply: true });
    expect(applied).toMatchObject({
      applied: true,
      alreadyApplied: false,
      recipientCount: 2,
      grantedInstanceCount: 8,
    });
    expect(applied.grants).toHaveLength(8);
    expect(applied.items).toEqual([
      expect.objectContaining({ itemKind: 'nutrition', rarity: 'common' }),
      expect.objectContaining({ itemKind: 'recovery', rarity: 'rare', chargesPerInstance: 1 }),
      expect.objectContaining({ itemKind: 'skates', rarity: 'common' }),
      expect.objectContaining({ itemKind: 'stick', rarity: 'common' }),
    ]);

    const balances = await pool.query<{
      user_id: string;
      item_kind: string;
      rarity: string;
      charges_available: number;
    }>(
      `select instance.user_id, item.item_kind, item.rarity, instance.charges_available
         from user_inventory_instance instance
         join admin_inventory_items item on item.id = instance.inventory_item_id
        where instance.user_id = any($1::uuid[])
        order by instance.user_id, item.item_kind, instance.created_at, instance.id`,
      [[FIRST_USER_ID, SECOND_USER_ID]],
    );
    expect(balances.rows).toHaveLength(9);
    for (const userId of [FIRST_USER_ID, SECOND_USER_ID]) {
      const owned = balances.rows.filter((row) => row.user_id === userId);
      for (const item of applied.items) {
        expect(
          owned.filter(
            (row) =>
              row.item_kind === item.itemKind &&
              row.rarity === item.rarity &&
              row.charges_available === item.chargesPerInstance,
          ),
        ).toHaveLength(1);
      }
    }

    const repeated = await runExistingUserInventoryGrant(pool, { apply: true });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true });
    expect(
      (await pool.query('select count(*)::int as count from user_inventory_instance')).rows,
    ).toEqual([{ count: 9 }]);

    await pool.query(
      `insert into users (id, display_name, timezone) values ($1, 'Future', 'Europe/Moscow')`,
      [FUTURE_USER_ID],
    );
    expect(
      (
        await pool.query(
          'select count(*)::int as count from user_inventory_instance where user_id = $1',
          [FUTURE_USER_ID],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
});
