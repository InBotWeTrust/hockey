import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { advanceFight, createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { advancePersistedFight } from '../../src/duel/amateur/fight/service.js';
import type { FightDuelContext } from '../../src/duel/amateur/fight/routes.js';

it('does not publish another completion when polling a cancelled fight', async () => {
  const main = advanceFight(createFightState(DEFAULT_FIGHT_RULES, 0), [], 20150).state;
  const engine = advanceFight(main, [], main.deadlineMs + 150).state;
  expect(engine.status).toBe('cancelled');
  const fight = { id: 'fight', status: 'cancelled', engine_state: engine, starts_at: new Date(0), rules: engine.rules };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith('select * from amateur_duel_fight') ? [fight] : [], rowCount: 0,
  }));
  const client = { query } as unknown as PoolClient;
  const ctx = { id: 'match', status: 'active', paused: false, nowMs: 40000, participants: [] } as unknown as FightDuelContext;
  for (let i = 0; i < 4; i++) await advancePersistedFight(client, ctx);
  expect(query.mock.calls.filter(([sql]) => sql.startsWith('update amateur_duel_fight set'))).toHaveLength(0);
  expect(query.mock.calls.filter(([sql]) => sql.includes('insert into amateur_duel_fight_outbox'))).toHaveLength(0);
});
