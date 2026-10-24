import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { fetchPlayStreakStats } from '../../src/profile/summary.js';
import { ACTIVITY_STREAK_CTES, USER_ACTIVITY_STREAK_CTES } from '../../src/profile/activityStreak.js';

describe('single-player profile activity', () => {
  it('limits both activity and day anchors to the requested player', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ current_days: 3, best_days: 7 }] });
    expect(await fetchPlayStreakStats({ query } as unknown as Pool, 'player', 'UTC'))
      .toEqual({ currentDays: 3, bestDays: 7 });
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('s.user_id = $1');
    expect(sql).toMatch(/from users u left join activity_days a on a.user_id = u.id\s+where u.id = \$1/);
    expect(params).toEqual(['player']);
  });

  it('keeps the global ranking query separate from the scoped observer', () => {
    expect(USER_ACTIVITY_STREAK_CTES).toContain('s.user_id = $1');
    expect(ACTIVITY_STREAK_CTES).not.toContain('$1');
  });
});
