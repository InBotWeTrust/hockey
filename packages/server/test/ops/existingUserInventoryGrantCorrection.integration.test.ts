import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  EXISTING_USER_INVENTORY_GRANT_KEY,
  type ExistingUserInventoryGrantReport,
} from '../../src/ops/existingUserInventoryGrant.js';
import {
  EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
  runExistingUserInventoryGrantCorrection,
} from '../../src/ops/existingUserInventoryGrantCorrection.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

const FIRST_USER_ID = '00000000-0000-4000-8000-000000000501';
const SECOND_USER_ID = '00000000-0000-4000-8000-000000000502';

type ReplacementKind = 'stick' | 'skates' | 'nutrition';
type SeededGrant = { instanceId: string; userId: string; itemId: string; itemKind: ReplacementKind | 'recovery' };
type InventoryItem = {
  id: string;
  title: string;
  item_kind: ReplacementKind | 'recovery';
  rarity: 'common' | 'rare';
  charges_per_purchase: number;
};

async function seedOriginalWrongGrant(pool: Pool): Promise<{
  commonGrants: SeededGrant[];
}> {
  const items = await pool.query<InventoryItem>(
    `select id, title, item_kind, rarity, charges_per_purchase
       from admin_inventory_items
      where deleted_at is null
        and (
          (item_kind in ('stick', 'skates', 'nutrition') and rarity = 'common')
          or (item_kind = 'recovery' and rarity = 'rare')
        )
      order by item_kind`,
  );
  expect(items.rows).toHaveLength(4);
  const userIds = [FIRST_USER_ID, SECOND_USER_ID];
  const grants: SeededGrant[] = [];
  for (const userId of userIds) {
    for (const item of items.rows) {
      const instance = await pool.query<{ id: string }>(
        `insert into user_inventory_instance (user_id, inventory_item_id, charges_available)
         values ($1, $2, $3)
         returning id`,
        [userId, item.id, item.charges_per_purchase],
      );
      grants.push({
        instanceId: instance.rows[0]!.id,
        userId,
        itemId: item.id,
        itemKind: item.item_kind,
      });
    }
  }
  const source: ExistingUserInventoryGrantReport = {
    operationKey: EXISTING_USER_INVENTORY_GRANT_KEY,
    applied: true,
    alreadyApplied: false,
    startedAt: '2026-09-11T09:33:37.844Z',
    recipientCount: userIds.length,
    grantedInstanceCount: grants.length,
    recipients: [
      { id: FIRST_USER_ID, displayName: 'First' },
      { id: SECOND_USER_ID, displayName: 'Second' },
    ],
    grants: grants.map(({ instanceId, userId, itemId }) => ({ instanceId, userId, itemId })),
    items: items.rows.map((item) => ({
      id: item.id,
      title: item.title,
      itemKind: item.item_kind,
      rarity: item.rarity,
      chargesPerInstance: item.charges_per_purchase,
    })),
  };
  await pool.query(
    'insert into production_data_operations (operation_key, payload) values ($1, $2)',
    [EXISTING_USER_INVENTORY_GRANT_KEY, JSON.stringify(source)],
  );
  return { commonGrants: grants.filter((grant) => grant.itemKind !== 'recovery') };
}

describe.skipIf(!hasIntegrationEnv)('existing-user inventory grant correction operation', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool ??= createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'First', 'Europe/Moscow'), ($2, 'Second', 'Europe/Moscow')`,
      [FIRST_USER_ID, SECOND_USER_ID],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('replaces only untouched mistaken instances and keeps the selected loadout on the rare replacements', async () => {
    const { commonGrants } = await seedOriginalWrongGrant(pool);
    const firstUserCommon = commonGrants.filter((grant) => grant.userId === FIRST_USER_ID);
    const oldStick = firstUserCommon.find((grant) => grant.itemKind === 'stick')!;
    const oldSkates = firstUserCommon.find((grant) => grant.itemKind === 'skates')!;
    const oldNutrition = firstUserCommon.find((grant) => grant.itemKind === 'nutrition')!;
    await pool.query(
      `insert into user_equipment
         (user_id, equipped_stick_instance_id, equipped_skates_instance_id, equipped_nutrition_instance_id)
       values ($1, $2, $3, $4)`,
      [FIRST_USER_ID, oldStick.instanceId, oldSkates.instanceId, oldNutrition.instanceId],
    );

    const dryRun = await runExistingUserInventoryGrantCorrection(pool, { apply: false });
    expect(dryRun).toMatchObject({
      applied: false,
      alreadyApplied: false,
      recipientCount: 2,
      removedInstanceCount: 6,
      grantedInstanceCount: 6,
    });
    expect(
      (await pool.query('select count(*)::int as count from production_data_operations where operation_key = $1', [
        EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
      ])).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (await pool.query('select count(*)::int as count from user_inventory_instance')).rows,
    ).toEqual([{ count: 8 }]);

    const applied = await runExistingUserInventoryGrantCorrection(pool, { apply: true });
    expect(applied).toMatchObject({
      applied: true,
      alreadyApplied: false,
      recipientCount: 2,
      removedInstanceCount: 6,
      grantedInstanceCount: 6,
    });
    const inventory = await pool.query<{
      id: string;
      user_id: string;
      item_kind: string;
      rarity: string;
    }>(
      `select instance.id, instance.user_id, item.item_kind, item.rarity
         from user_inventory_instance instance
         join admin_inventory_items item on item.id = instance.inventory_item_id
        order by instance.user_id, item.item_kind`,
    );
    expect(inventory.rows).toHaveLength(8);
    for (const userId of [FIRST_USER_ID, SECOND_USER_ID]) {
      expect(inventory.rows.filter((row) => row.user_id === userId)).toEqual([
        expect.objectContaining({ item_kind: 'nutrition', rarity: 'rare' }),
        expect.objectContaining({ item_kind: 'recovery', rarity: 'rare' }),
        expect.objectContaining({ item_kind: 'skates', rarity: 'rare' }),
        expect.objectContaining({ item_kind: 'stick', rarity: 'rare' }),
      ]);
    }
    expect(inventory.rows.map((row) => row.id)).not.toContain(oldStick.instanceId);
    const newFirstUser = applied.grants.filter((grant) => grant.userId === FIRST_USER_ID);
    const itemById = new Map(applied.items.map((item) => [item.id, item]));
    const newInstanceIdFor = (itemKind: ReplacementKind): string =>
      newFirstUser.find((grant) => itemById.get(grant.itemId)?.itemKind === itemKind)!.instanceId;
    expect(
      (
        await pool.query<{
          equipped_stick_instance_id: string;
          equipped_skates_instance_id: string;
          equipped_nutrition_instance_id: string;
        }>(
          `select equipped_stick_instance_id, equipped_skates_instance_id, equipped_nutrition_instance_id
             from user_equipment
            where user_id = $1`,
          [FIRST_USER_ID],
        )
      ).rows,
    ).toEqual([
      {
        equipped_stick_instance_id: newInstanceIdFor('stick'),
        equipped_skates_instance_id: newInstanceIdFor('skates'),
        equipped_nutrition_instance_id: newInstanceIdFor('nutrition'),
      },
    ]);

    const repeated = await runExistingUserInventoryGrantCorrection(pool, { apply: true });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true });
    expect(repeated.grants).toHaveLength(6);
  });

  it('refuses the full correction when any mistaken instance was used', async () => {
    const { commonGrants } = await seedOriginalWrongGrant(pool);
    await pool.query(
      `update user_inventory_instance
          set charges_available = charges_available - 1
        where id = $1`,
      [commonGrants[0]!.instanceId],
    );

    await expect(runExistingUserInventoryGrantCorrection(pool, { apply: true })).rejects.toThrow(
      'mistaken inventory was used',
    );
    expect(
      (await pool.query('select count(*)::int as count from user_inventory_instance')).rows,
    ).toEqual([{ count: 8 }]);
    expect(
      (await pool.query('select count(*)::int as count from production_data_operations where operation_key = $1', [
        EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
      ])).rows,
    ).toEqual([{ count: 0 }]);
  });
});
