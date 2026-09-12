import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { listStatRating } from '../../src/profile/statRating.js';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  display_name: 'Игрок',
  avatar_url: null,
  goals: 1200,
  shots: 2000,
  accuracy: '0.6',
  current_days: 8,
  record_days: 8,
  place: 2,
};

describe('listStatRating', () => {
  it('returns percentage accuracy and eligibility progress', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ goals: 1200 }] });
    const result = await listStatRating({ query } as unknown as Pool, row.id, 'accuracy', {
      limit: 30,
    });
    expect(result.rows[0]).toMatchObject({ accuracy: 60, goals: 1200, shots: 2000 });
    expect(result.eligibility).toEqual({ eligible: true, goals: 1200, requiredGoals: 1000 });
    expect(String(query.mock.calls[0]?.[0])).toContain('u.lifetime_goals_total >= 1000');
  });

  it('does not invent a rank for an ineligible accuracy viewer', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ goals: 640 }] });
    const result = await listStatRating({ query } as unknown as Pool, row.id, 'accuracy', {
      limit: 30,
    });
    expect(result.currentUser).toBeNull();
    expect(result.eligibility).toEqual({ eligible: false, goals: 640, requiredGoals: 1000 });
  });

  it('ranks streaks by the greater of historical and current streak', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ goals: 1200 }] });
    await listStatRating({ query } as unknown as Pool, row.id, 'streak', { limit: 30 });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('greatest(coalesce(hs.best_days, 0), coalesce(cs.current_days, 0))');
    expect(sql).toContain('record_days desc, current_days desc, id asc');
  });
});
