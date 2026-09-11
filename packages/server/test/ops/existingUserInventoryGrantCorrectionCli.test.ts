import { describe, expect, it } from 'vitest';
import { EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY } from '../../src/ops/existingUserInventoryGrantCorrection.js';
import { parseExistingUserInventoryGrantCorrectionArgs } from '../../src/ops/existingUserInventoryGrantCorrectionCli.js';

describe('existing-user inventory grant correction CLI', () => {
  it('defaults to a dry run and requires the correction confirmation key', () => {
    expect(parseExistingUserInventoryGrantCorrectionArgs([], undefined)).toEqual({ apply: false });
    expect(() => parseExistingUserInventoryGrantCorrectionArgs(['--apply'], undefined)).toThrow(
      'confirmation key',
    );
    expect(
      parseExistingUserInventoryGrantCorrectionArgs(
        ['--apply'],
        EXISTING_USER_INVENTORY_GRANT_CORRECTION_KEY,
      ),
    ).toEqual({ apply: true });
  });
});
