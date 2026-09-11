import { describe, expect, it } from 'vitest';
import { EXISTING_USER_INVENTORY_GRANT_TIERS } from '../../src/ops/existingUserInventoryGrant.js';

describe('existing-user inventory grant tiers', () => {
  it('grants the second inventory tier and the medium recovery kit', () => {
    expect(EXISTING_USER_INVENTORY_GRANT_TIERS).toEqual({
      stick: 'rare',
      skates: 'rare',
      nutrition: 'rare',
      recovery: 'rare',
    });
  });
});
