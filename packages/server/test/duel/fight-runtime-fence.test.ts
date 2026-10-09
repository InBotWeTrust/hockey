import { expect, it, vi } from 'vitest';
import { renewRuntimeLease } from '../../src/duel/amateur/fight/runtime/persistence.js';
import type { PoolClient } from 'pg';
it('requires the live owner generation and does not revive an expired lease', async () => {
  const query = vi.fn(async () => ({ rowCount: 0 }));
  expect(await renewRuntimeLease({ query } as unknown as PoolClient, 'fight', 'owner', 2)).toBe(
    false,
  );
  expect(query.mock.calls[0]?.[0]).toContain('runtime_generation=$3');
  expect(query.mock.calls[0]?.[0]).toContain('runtime_lease_until>clock_timestamp()');
});
