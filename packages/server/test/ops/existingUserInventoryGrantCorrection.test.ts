import { describe, expect, it } from 'vitest';
import {
  buildExistingUserInventoryGrantCorrectionPlan,
  EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
} from '../../src/ops/existingUserInventoryGrantCorrection.js';

const FIRST_USER_ID = '00000000-0000-4000-8000-000000000301';
const SECOND_USER_ID = '00000000-0000-4000-8000-000000000302';

describe('existing-user inventory grant correction', () => {
  it('replaces only the three mistaken common tiers and preserves the medium recovery kit', () => {
    const plan = buildExistingUserInventoryGrantCorrectionPlan({
      operationKey: '2026-09-11-existing-user-inventory-grant-v1',
      applied: true,
      alreadyApplied: false,
      startedAt: '2026-09-11T09:33:37.844Z',
      recipientCount: 2,
      grantedInstanceCount: 8,
      recipients: [
        { id: FIRST_USER_ID, displayName: 'First' },
        { id: SECOND_USER_ID, displayName: 'Second' },
      ],
      grants: [
        { instanceId: '00000000-0000-4000-8000-000000000401', userId: FIRST_USER_ID, itemId: 'stick-common' },
        { instanceId: '00000000-0000-4000-8000-000000000402', userId: FIRST_USER_ID, itemId: 'skates-common' },
        { instanceId: '00000000-0000-4000-8000-000000000403', userId: FIRST_USER_ID, itemId: 'nutrition-common' },
        { instanceId: '00000000-0000-4000-8000-000000000404', userId: FIRST_USER_ID, itemId: 'recovery-rare' },
        { instanceId: '00000000-0000-4000-8000-000000000405', userId: SECOND_USER_ID, itemId: 'stick-common' },
        { instanceId: '00000000-0000-4000-8000-000000000406', userId: SECOND_USER_ID, itemId: 'skates-common' },
        { instanceId: '00000000-0000-4000-8000-000000000407', userId: SECOND_USER_ID, itemId: 'nutrition-common' },
        { instanceId: '00000000-0000-4000-8000-000000000408', userId: SECOND_USER_ID, itemId: 'recovery-rare' },
      ],
      items: [
        { id: 'stick-common', title: 'Ультимейт Ван 1', itemKind: 'stick', rarity: 'common', chargesPerInstance: 1800 },
        { id: 'skates-common', title: 'Старт', itemKind: 'skates', rarity: 'common', chargesPerInstance: 7200 },
        { id: 'nutrition-common', title: 'Изотоник Тест', itemKind: 'nutrition', rarity: 'common', chargesPerInstance: 4500000 },
        { id: 'recovery-rare', title: 'Набор для восстановления', itemKind: 'recovery', rarity: 'rare', chargesPerInstance: 1 },
      ],
    });

    expect(EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY).toBe(
      '2026-09-11-existing-user-inventory-grant-v1-correction-v1',
    );
    expect(plan.userIds).toEqual([FIRST_USER_ID, SECOND_USER_ID]);
    expect(plan.wrongGrants.map((grant) => ({ instanceId: grant.instanceId, itemKind: grant.itemKind }))).toEqual([
      { instanceId: '00000000-0000-4000-8000-000000000401', itemKind: 'stick' },
      { instanceId: '00000000-0000-4000-8000-000000000402', itemKind: 'skates' },
      { instanceId: '00000000-0000-4000-8000-000000000403', itemKind: 'nutrition' },
      { instanceId: '00000000-0000-4000-8000-000000000405', itemKind: 'stick' },
      { instanceId: '00000000-0000-4000-8000-000000000406', itemKind: 'skates' },
      { instanceId: '00000000-0000-4000-8000-000000000407', itemKind: 'nutrition' },
    ]);
    expect(plan.replacementKinds).toEqual(['nutrition', 'skates', 'stick']);
  });
});
