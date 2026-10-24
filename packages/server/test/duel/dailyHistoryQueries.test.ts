import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { fetchDailyHistoryStats } from '../../src/duel/daily/routes.js';

it('loads periods once for the visible history page and derives identical totals', async () => {
  const pools = Array.from({length: 21}, (_, i) => ({id: `pool-${i}`, day_date: `2026-10-${i + 1}`}));
  const period = {period_number: 1, shots_taken: 4, goals: 2, closed_reason: 'timeout', started_at: new Date(1000), ended_at: new Date(4000)};
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('with user_days')) return {rows: [{possible_games: 30, played_games: 21, completed_games: 21, total_shots: 84, total_goals: 42}]};
    if (sql.includes('from day_pool')) return {rows: pools};
    if (sql.includes('sum(shots_taken)')) return {rows: [{shots: 4, goals: 2}]};
    if (sql.includes('from period_log')) return {rows: Array.isArray(params[0]) ? params[0].map(id => ({...period, day_pool_id: id})) : [period]};
    throw new Error('Unexpected query');
  });
  const result = await fetchDailyHistoryStats({query} as unknown as PoolClient, 'viewer', 20, 0, '2026-10-24', 3);
  expect(result.games).toHaveLength(20);
  expect(result.games[0]).toMatchObject({total_shots: 4, total_goals: 2, total_duration_ms: 3000});
  expect(result).toMatchObject({hasMore: true, nextOffset: 20});
  expect(query.mock.calls.filter(([sql]) => sql.includes('from period_log'))).toHaveLength(1);
  expect(query.mock.calls.find(([sql]) => sql.includes('from period_log'))?.[1]).toEqual([pools.slice(0,20).map(p => p.id)]);
});
