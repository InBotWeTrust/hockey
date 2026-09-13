import { describe, expect, it } from 'vitest';
import { EXISTING_USER_INVENTORY_GRANT_KEY } from '../../src/ops/existingUserInventoryGrant.js';
import { parseExistingUserInventoryGrantArgs } from '../../src/ops/existingUserInventoryGrantCli.js';

describe('existing-user inventory grant CLI', () => {
  it('defaults to dry-run and requires the explicit apply flag to commit', () => {
    expect(parseExistingUserInventoryGrantArgs([], undefined)).toEqual({ apply: false });
    expect(() => parseExistingUserInventoryGrantArgs(['--apply'], undefined)).toThrow(
      'confirmation key',
    );
    expect(
      parseExistingUserInventoryGrantArgs(['--apply'], EXISTING_USER_INVENTORY_GRANT_KEY),
    ).toEqual({ apply: true });
    expect(() => parseExistingUserInventoryGrantArgs(['--force'], undefined)).toThrow(
      'unknown argument',
    );
  });
});
