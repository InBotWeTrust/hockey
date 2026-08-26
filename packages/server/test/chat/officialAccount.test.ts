import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { validateOfficialAccount } from '../../src/chat/officialAccount.js';

describe('official account startup validation', () => {
  it('accepts only the configured official user', async () => {
    const officialPool = {
      query: vi.fn(async () => ({ rows: [{ account_kind: 'official' }] })),
    } as unknown as Pool;
    await expect(
      validateOfficialAccount(officialPool, '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBeUndefined();

    const playerPool = {
      query: vi.fn(async () => ({ rows: [{ account_kind: 'player' }] })),
    } as unknown as Pool;
    await expect(
      validateOfficialAccount(playerPool, '22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow('SYSTEM_USER_ID must reference a user with account_kind=official');
  });
});
