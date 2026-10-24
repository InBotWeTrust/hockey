import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { getUserPublicProfile } from '../../src/chat/service.js';

describe('compact public profile', () => {
  it('reads stored counters without achievement grants, catalogue or trophy history', async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('from users u') && sql.includes('account_kind')) return { rowCount: 1, rows: [{
        id: 'player', display_name: 'Игрок', avatar_url: null, level: 2, timezone: 'UTC',
        lifetime_shots_total: 100, lifetime_goals_total: 50, currency_balance: 10,
        star_balance: 5, experience_balance: 20, created_at: new Date('2026-01-01'), last_seen_at: null,
      }] };
      if (sql.includes('from game_settings')) return { rows: [] };
      if (sql.includes('current_streaks.current_days')) return { rows: [{ current_days: 2, best_days: 5 }] };
      if (sql.includes('from user_achievements')) return {rows:[{count:3}]};
      if (sql.includes('achievement_catalog_summary')) return { rows: [{
        completed_tasks: 10, total_tasks: 53, completed_levels: 120, total_levels: 281,
      }] };
      if (sql.includes('with playoff_finals')) return { rows: [{
        regular_season_wins: 1, tournament_championships: 0, tournament_podiums: 0, completed_challenges: 0,
      }] };
      throw new Error(`Unexpected public profile query: ${sql.slice(0, 90)}`);
    });
    const result = await getUserPublicProfile({ query } as unknown as Pool, 'player', { summary: true, countersOnly: true });
    expect(result?.achievementSummary).toEqual({ completed: 10, total: 53, levels: { completed: 120, total: 281 } });
    expect(result?.achievements).toEqual([]);
    expect(result?.stats).toMatchObject({ goals: 50, accuracy: 50, playStreakDays: 2 });
    expect(calls.some(sql=>sql.includes('from user_achievements'))).toBe(true);
    expect(result?.trophyDetails).toBeUndefined();
    expect(calls).toHaveLength(6);
    expect(calls.every(sql => !/\b(insert|update|delete)\b/i.test(sql))).toBe(true);
  });
});
