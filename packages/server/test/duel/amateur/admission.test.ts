import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { duelLimitUsage } from '../../../src/duel/amateur/admission.js';

describe('duelLimitUsage', () => {
  it('returns server-configured limits and zero-filled period usage by format', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { duel_kind: 'express', daily: 1, weekly: 2, monthly: 4 },
      { duel_kind: 'classic', daily: 0, weekly: 1, monthly: 3 },
    ] });
    const limits = await duelLimitUsage(
      { query } as unknown as PoolClient,
      'user-id',
      { daily: 8, weekly: 40, monthly: 129, perFormatMonthly: 43, outgoingInvites: 2 },
      new Date('2026-09-23T12:00:00Z'),
    );
    expect(limits).toEqual({
      daily: { used: 1, limit: 8, reset_at: '2026-09-23T21:00:00.000Z', by_format: { express: 1, express_plus: 0, classic: 0 } },
      weekly: { used: 3, limit: 40, reset_at: '2026-09-27T21:00:00.000Z', by_format: { express: 2, express_plus: 0, classic: 1 } },
      monthly: { used: 7, limit: 129, format_limit: 43,
        reset_at: '2026-09-30T21:00:00.000Z',
        by_format: { express: 4, express_plus: 0, classic: 3 } },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('released_at is null'), [
      'user-id',
      new Date('2026-09-22T21:00:00.000Z'),
      new Date('2026-09-20T21:00:00.000Z'),
      new Date('2026-08-31T21:00:00.000Z'),
    ]);
  });
});
