import { afterEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createMatch, type BarGameId } from '@hockey/game-core';
import { readGame, actGame } from './service.js';
afterEach(() => {
  vi.useRealTimers();
});
function fixture(kind: BarGameId = 'darts') {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const row = {
    id: 'match',
    player_a: 'a',
    player_b: 'b',
    character: null,
    kind,
    data: { runtime: createMatch(kind, 0, 1000, false, 5), ready: null },
    ended_at: null,
  };
  const receipts = new Map<string, { user_id: string; payload: string }>();
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('select * from bar_game_matches where id'))
      return { rows: [structuredClone(row)] };
    if (sql.startsWith('select * from bar_game_commands'))
      return { rows: receipts.has(args[1] as string) ? [receipts.get(args[1] as string)] : [] };
    if (sql.startsWith('insert into bar_game_commands'))
      receipts.set(args[1] as string, { user_id: args[2] as string, payload: args[3] as string });
    if (sql.startsWith('update bar_game_matches set data')) {
      row.data = JSON.parse(args[1] as string);
      row.ended_at = args[2] as null;
    }
    if (sql.startsWith('select id,display_name'))
      return {
        rows: [
          { id: 'a', display_name: 'A', avatar_url: null },
          { id: 'b', display_name: 'B', avatar_url: null },
        ],
      };
    return { rows: [] };
  });
  return {
    row,
    query,
    pool: { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool,
  };
}
it('rejects nonparticipants and stale revisions without applying an action', async () => {
  const { pool, row } = fixture();
  await expect(readGame(pool, 'c', 'match')).rejects.toMatchObject({ statusCode: 404 });
  await expect(
    actGame(pool, 'b', 'match', {
      requestId: 'x',
      revision: 0,
      action: { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(row.data.runtime.game.turn).toBe(0);
});
it('applies an identical retried command once and rejects key reuse with a changed payload', async () => {
  const { pool, row } = fixture();
  const command = {
    requestId: 'x',
    revision: 0,
    action: { type: 'dart' as const, gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
  };
  await actGame(pool, 'a', 'match', command);
  const revision = row.data.runtime.revision;
  await actGame(pool, 'a', 'match', command);
  expect(row.data.runtime.revision).toBe(revision);
  await expect(
    actGame(pool, 'a', 'match', { ...command, action: { type: 'surrender' } }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('reconciles timeout before accepting a command at the deadline', async () => {
  const { pool } = fixture();
  vi.setSystemTime(41000);
  await expect(
    actGame(pool, 'a', 'match', {
      requestId: 'x',
      revision: 0,
      action: { type: 'dart', gesture: { dx: 0, dy: -0.5, durationMs: 400 } },
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});

it('accepts simultaneous arm inputs with stale global revision and limits command floods', async () => {
  const { pool, row } = fixture('armwrestling');
  const action = {
    type: 'arm-input' as const,
    seq: 1,
    supportHeld: true,
    support: 0.5,
    pressing: true,
    wrist: 'straight' as const,
  };
  await actGame(pool, 'a', 'match', { requestId: 'a1', revision: 0, action });
  await actGame(pool, 'b', 'match', { requestId: 'b1', revision: 0, action });
  expect(row.data.runtime.game.kind).toBe('armwrestling');
  if (row.data.runtime.game.kind === 'armwrestling')
    expect(row.data.runtime.game.lastSeq).toEqual([1, 1]);
  for (let seq = 2; seq <= 12; seq++)
    await actGame(pool, 'a', 'match', {
      requestId: 'a' + seq,
      revision: 0,
      action: { ...action, seq },
    });
  await expect(
    actGame(pool, 'a', 'match', { requestId: 'a13', revision: 0, action: { ...action, seq: 13 } }),
  ).rejects.toMatchObject({ statusCode: 429 });
});
it('can surrender a real-time match after time advances since the last snapshot', async () => {
  const { pool } = fixture('armwrestling');
  vi.setSystemTime(1010);
  const result = await actGame(pool, 'a', 'match', {
    requestId: 'surrender',
    revision: 0,
    action: { type: 'surrender' },
  });
  expect(result.runtime.reason).toBe('surrender');
});
it('keeps initial ochko cards and early golden results hidden before readiness', async () => {
  const { pool, row } = fixture('ochko');
  Object.assign(row.data, {
    ready: { players: [], startsAt: null, expiresAt: 61000, cancelled: false },
  });
  row.data.runtime.game = { ...row.data.runtime.game, winner: 0 };
  const result = await readGame(pool, 'a', 'match');
  await actGame(pool, 'a', 'match', {
    requestId: 'ready-golden',
    revision: result.runtime.revision,
    action: { type: 'ready' },
  });
  expect(row.ended_at).toBeNull();
  expect(result.runtime.game.winner).toBeNull();
  if (result.runtime.game.kind === 'ochko') {
    expect(result.runtime.game.hands.flat().every((card) => card === -1)).toBe(true);
    expect(result.runtime.game.scores).toEqual([-1, -1]);
  }
});
it('allows leaving the ready table even if its unused initial deal had golden ochko', async () => {
  const { pool, row } = fixture('ochko');
  Object.assign(row.data, {
    ready: { players: [], startsAt: null, expiresAt: 61000, cancelled: false },
  });
  row.data.runtime.game = { ...row.data.runtime.game, winner: 0 };
  const result = await actGame(pool, 'a', 'match', {
    requestId: 'leave-ready',
    revision: 0,
    action: { type: 'surrender' },
  });
  expect(result.ready).toBeNull();
  expect(result.runtime.game.winner).toBe(1);
  expect(row.ended_at).not.toBeNull();
});
it('does not discard an arm surrender merely because a heartbeat won the race',async()=>{
 const {pool}=fixture('armwrestling');
 await actGame(pool,'a','match',{requestId:'held',revision:0,action:{type:'arm-input',seq:1,supportHeld:true,support:0.5,pressing:true,wrist:'straight'}});
 const result=await actGame(pool,'a','match',{requestId:'leave',revision:0,action:{type:'surrender'}});
 expect(result.runtime.reason).toBe('surrender');expect(result.runtime.game.winner).toBe(1);
});
