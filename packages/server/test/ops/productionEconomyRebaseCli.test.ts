import { describe, expect, it } from 'vitest';
import { parseProductionEconomyRebaseArgs } from '../../src/ops/productionEconomyRebaseCli.js';

describe('production economy rebase CLI arguments', () => {
  it('defaults to rollback-only dry-run in production', () => {
    expect(parseProductionEconomyRebaseArgs([], 'production')).toEqual({ apply: false });
  });

  it('requires the explicit apply flag for mutation', () => {
    expect(parseProductionEconomyRebaseArgs(['--apply'], 'production')).toEqual({ apply: true });
  });

  it('rejects non-production environments and unknown arguments', () => {
    expect(() => parseProductionEconomyRebaseArgs([], 'development')).toThrow(
      'NODE_ENV=production',
    );
    expect(() => parseProductionEconomyRebaseArgs(['--force'], 'production')).toThrow(
      'unknown argument',
    );
  });
});
