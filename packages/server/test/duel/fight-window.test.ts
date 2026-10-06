import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { FightDuelContext } from '../../src/duel/amateur/fight/routes.js';
import { createChallenge, respondChallenge, resumeDuel, advancePersistedFight } from '../../src/duel/amateur/fight/service.js';

function context(elapsedMs: number, remainingMs: number, opponentElapsed = elapsedMs, opponentRemaining = remainingMs): FightDuelContext {
  return { id: 'match', source: 'challenge', status: 'active', nowMs: 1000000,
    endsAtMs: 2000000, paused: false, canExtend: true,
    participants: [
      { userId: 'me', state: 'period_active', totalActiveMs: elapsedMs, periodElapsedMs: elapsedMs, remainingMs, running: remainingMs > 0 },
      { userId: 'other', state: 'period_active', totalActiveMs: opponentElapsed, periodElapsedMs: opponentElapsed, remainingMs: opponentRemaining, running: opponentRemaining > 0 },
    ],
  } as FightDuelContext;
}
function database(existing: unknown = null) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('select * from amateur_duel_fight ')) {
      const rows = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
      return { rows: sql.includes('initiator_user_id=$2') ? rows.filter((r: {initiator_user_id:string}) => r.initiator_user_id === values?.[1]) : rows };
    }
    if (sql.includes('from game_settings')) return { rows: [{ enabled: true }] };
    if (sql.includes('from amateur_duel_fight_presence')) return { rows: [{ user_id: 'me', compensation_ms: 0 }, { user_id: 'other', compensation_ms: 0 }] };
    if (sql.includes('insert into amateur_duel_fight(')) return { rows: [{ response_deadline_at: values![4] }] };
    if (sql.includes('returning state_revision')) return { rows: [{ state_revision: '1' }] };
    return { rows: [] };
  });
  return { client: { query } as unknown as PoolClient, query };
}
describe('fight period windows', () => {
  it.each([[0,180000], [44999,135001], [135000,45000], [179999,1], [46000,14000], [10000,80000]])('allows a call at elapsed=%i remaining=%i', async (elapsed, remaining) => {
    const { client } = database();
    await expect(createChallenge(client, context(elapsed, remaining), 'me', 'request')).resolves.toBeDefined();
  });
  it.each([[45000,135000], [134999,45001], [180000,0]])('rejects a call outside the windows at elapsed=%i remaining=%i', async (elapsed, remaining) => {
    const { client, query } = database();
    await expect(createChallenge(client, context(elapsed, remaining), 'me', 'request')).rejects.toMatchObject({ details: { reason: 'outside_fight_window' } });
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into amateur_duel_fight('))).toBe(false);
  });
  it('requires the opponent to be in a window too', async () => {
    const { client } = database();
    await expect(createChallenge(client, context(20000,160000,60000,120000), 'me', 'request')).rejects.toMatchObject({ details: { reason: 'outside_fight_window' } });
  });
  it('checks the window again when accepting', async () => {
    const { client } = database({ id: 'fight', initiator_user_id: 'me', status: 'offered', response_deadline_at: new Date(1003000) });
    await expect(respondChallenge(client, context(45000,135000), 'other', 'fight', 'accept', 'request')).rejects.toMatchObject({ details: { reason: 'outside_fight_window' } });
  });
  it('gives ten seconds to reply when the window permits', async () => {
    const { client } = database();
    const fight = await createChallenge(client, context(20000,160000), 'me', 'request');
    expect(fight.response_deadline_at.getTime()).toBe(1010000);
  });
  it('caps the reply deadline at the end of the intersecting windows', async () => {
    const { client } = database();
    const fight = await createChallenge(client, context(43000,137000,44000,136000), 'me', 'request');
    expect(fight.response_deadline_at.getTime()).toBe(1001000);
  });
});

describe('fight recovery stays in the current period', () => {
  it.each([[3000, 'period_active', 3000], [10000, 'period_active', 5000], [0, 'period_active', 0], [3000, 'break_active', 0]])(
    'caps recovery with %i ms remaining in %s', async (remaining, state, expectedRecovery) => {
      const ctx = context(177000, remaining);
      ctx.participants[1]!.state = state;
      const { client, query } = database();
      await resumeDuel(client, ctx, ctx.nowMs, 'other', 5000);
      const recoveryUpdate = query.mock.calls.find(([sql]) => sql.includes('set recovery_until='));
      expect(recoveryUpdate?.[1]?.[3]).toBe(expectedRecovery);
    },
  );
});

describe('fight reward history', () => {
  it('records both rewards once alongside the balance update', async () => {
    const ctx = context(20000,160000);
    const engine = createFightState(DEFAULT_FIGHT_RULES,ctx.nowMs-16000);
    engine.hp=[2,1]; engine.deadlineMs=ctx.nowMs-1000;
    const fight = {id:'fight',match_id:ctx.id,initiator_user_id:'me',request_id:'request',response_decision:'accept',
      status:'fighting',offered_at:new Date(ctx.nowMs-17000),response_deadline_at:new Date(ctx.nowMs-16000),
      starts_at:new Date(ctx.nowMs-16000),rules:DEFAULT_FIGHT_RULES,compensation_ms:[0,0],engine_state:engine,
      winner_user_id:null,resolved_at:null};
    const db = database(fight);
    const baseQuery = db.query.getMockImplementation()!;
    const rewarded = new Set<unknown>();
    db.query.mockImplementation(async (sql, values) => {
      if (sql.includes('insert into amateur_duel_fight_reward')) {
        const already = rewarded.has(values![1]); rewarded.add(values![1]);
        return {rows:[],rowCount:already?0:1};
      }
      return baseQuery(sql, values);
    });
    await advancePersistedFight(db.client,ctx);
    await advancePersistedFight(db.client,ctx);
    const rows = db.query.mock.calls.filter(([sql]) => sql.includes('insert into currency_ledger'));
    expect(rows).toHaveLength(2);
    expect(rows.map(([,values]) => JSON.parse(String(values![2])))).toEqual([
      expect.objectContaining({stars:1,experience:1,won:true,fight_id:'fight'}),
      expect.objectContaining({stars:0,experience:1,won:false,fight_id:'fight'}),
    ]);
  });
});

 describe('one challenge per participant', () => {
  it('allows the acceptor to initiate after the first fight', async () => {
    const {client} = database({id:'first',initiator_user_id:'other',request_id:'old',status:'resolved'});
    await expect(createChallenge(client,context(20000,160000),'me','new')).resolves.toBeDefined();
  });
  it('does not allow a second initiating attempt after an opponent fight', async () => {
    const {client} = database([{id:'second',initiator_user_id:'other',request_id:'other',status:'resolved'}, {id:'first',initiator_user_id:'me',request_id:'old',status:'declined'}]);
    await expect(createChallenge(client,context(20000,160000),'me','new')).rejects.toMatchObject({details:{reason:'attempt_used'}});
  });
  it('replays an old request without creating another challenge', async () => {
    const first = {id:'first',initiator_user_id:'me',request_id:'old',status:'resolved'};
    const {client} = database([{id:'second',initiator_user_id:'other',request_id:'other',status:'resolved'},first]);
    await expect(createChallenge(client,context(20000,160000),'me','old')).resolves.toEqual(first);
  });
  it('rejects a new challenge while a fight is running', async () => {
    const {client} = database({id:'first',initiator_user_id:'other',request_id:'old',status:'fighting'});
    await expect(createChallenge(client,context(20000,160000),'me','new')).rejects.toMatchObject({details:{reason:'unavailable'}});
  });
});
