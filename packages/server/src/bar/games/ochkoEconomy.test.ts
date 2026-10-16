import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { chooseStake, ochkoPayout, settleOchko } from './ochkoEconomy.js';
it('bounds random offers by balance and 30 and rejects an empty wallet', () => {
  for (const balance of [1, 20, 30, 100])
    for (const sample of [0, 0.5, 0.999999]) {
      const n = chooseStake(balance, sample);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(Math.min(balance, 30));
      expect(Number.isInteger(n)).toBe(true);
    }
  expect(() => chooseStake(0, 0)).toThrow();
});
it('calculates returned funds after the debit', () => {
  expect(ochkoPayout(50, 0)).toBe(100);
  expect(ochkoPayout(50, 'draw')).toBe(50);
  expect(ochkoPayout(50, 1)).toBe(0);
  expect(ochkoPayout(50, 'technical')).toBe(50);
});
it('credits a settled stake only once and leaves free matches alone', async () => {
  let settled = false;
  const query = vi.fn(async (sql: string, _args: unknown[] = []) => {
    if (sql.startsWith('select')) return { rows: settled ? [] : [{ amount: 20, user_id: 'u' }] };
    if (sql.startsWith('update bar_game_stakes')) {
      if (settled) return { rows: [] };
      settled = true;
      return { rows: [{ amount: 20, user_id: 'u' }] };
    }
    return { rows: [] };
  });
  const row = { id: 'm', kind: 'ochko', player_a: 'u', data: { runtime: { game: { winner: 0 } } } };
  await settleOchko({ query } as unknown as PoolClient, row as never, 100);
  await settleOchko({ query } as unknown as PoolClient, row as never, 101);
  expect(query.mock.calls.filter(([s]) => s.startsWith('update users'))).toHaveLength(1);
  expect(query.mock.calls.find(([s]) => s.startsWith('update users'))?.[1]).toEqual(['u', 40]);
});
