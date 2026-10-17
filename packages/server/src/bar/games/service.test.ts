import { afterEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { barBattleship as sea } from '@hockey/game-core';
import { createMatch, type BarGameId } from '@hockey/game-core';
import { readGame, actGame, startComputer } from './service.js';
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

it('preserves the current round pause when starting a private character game', async () => {
  let stored: { runtime: { engineVersion: number; game: { roundPauseMs?: number } } } | undefined;
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('insert into bar_game_matches')) stored = JSON.parse(args[5] as string);
    return { rows: [] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  await startComputer(pool, 'a', 'grigory', 'new-private-match');
  expect(stored?.runtime.engineVersion).toBe(19);
  expect(stored?.runtime.game.roundPauseMs).toBe(3000);
});
it('keeps enemy placement private in the API until completion, then reveals it to either player', async () => {
  const { pool, row } = fixture('battleship');
  const game = row.data.runtime.game as unknown as sea.State;
  game.phase = 'battle';
  const hidden = await readGame(pool, 'a', 'match');
  expect(hidden.runtime.game).not.toHaveProperty('enemyReveal');
  game.winner = 0;
  for (const [user, enemy] of [['a', 1], ['b', 0]] as const) {
    const result = await readGame(pool, user, 'match');
    expect((result.runtime.game as sea.View).enemyReveal?.ships).toEqual(game.fleets[enemy]);
    expect(result.runtime.game).not.toHaveProperty('submarineHistory');
  }
});

it.each(['darts', 'billiards', 'checkers', 'ochko', 'armwrestling', 'battleship'] as const)('freezes %s character games while rules are open, resumes and survives rereads', async kind => {
  const { pool, row } = fixture(kind);
  Object.assign(row, { character: 'timofey', player_b: null });
  row.data.runtime.computer = true;
  const initial = await readGame(pool, 'a', 'match');
  const pause = { requestId: 'pause', revision: initial.runtime.revision, action: { type: 'rules-pause', paused: true } } as const;
  const frozen = await actGame(pool, 'a', 'match', pause);
  vi.setSystemTime(121000);
  const reread = await readGame(pool, 'a', 'match');
  expect(reread.runtime).toEqual(frozen.runtime);
  expect(reread.serverNow).toBe(frozen.serverNow);
  expect(reread.rulesPaused).toBe(true);
  await actGame(pool, 'a', 'match', pause);
  const resumed = await actGame(pool, 'a', 'match', { requestId: 'resume', revision: reread.runtime.revision, action: { type: 'rules-pause', paused: false } });
  expect(resumed.serverNow).toBe(frozen.serverNow);
  expect(resumed.rulesPaused).toBe(false);
  vi.setSystemTime(122000);
  expect((await readGame(pool, 'a', 'match')).serverNow).toBe(frozen.serverNow + 1000);
});
it('rejects rules pauses in online matches', async () => {
  const { pool } = fixture();
  await expect(actGame(pool, 'a', 'match', { requestId: 'pause', revision: 0, action: { type: 'rules-pause', paused: true } })).rejects.toMatchObject({ statusCode: 409 });
});
it('preserves readiness time and rejects gameplay while reading rules',async()=>{
 const {pool,row}=fixture();Object.assign(row,{character:'daria',player_b:null});row.data.runtime.computer=true;
 Object.assign(row.data,{ready:{players:[1],startsAt:null,expiresAt:61000,cancelled:false}});
 await actGame(pool,'a','match',{requestId:'p',revision:0,action:{type:'rules-pause',paused:true}});
 vi.setSystemTime(121000);
 expect((await readGame(pool,'a','match')).ready?.cancelled).toBe(false);
 await expect(actGame(pool,'a','match',{requestId:'r',revision:1,action:{type:'ready'}})).rejects.toMatchObject({statusCode:409});
 await actGame(pool,'a','match',{requestId:'u',revision:1,action:{type:'rules-pause',paused:false}});
 const ready=await actGame(pool,'a','match',{requestId:'r2',revision:2,action:{type:'ready'}});
 expect(ready.ready?.startsAt).toBe(6000);
 vi.setSystemTime(126000);
 expect((await readGame(pool,'a','match')).ready).toBeNull();
});
it('holds the character shot until its remaining thinking time elapses after resume',async()=>{
 const {pool,row}=fixture();Object.assign(row,{character:'daria',player_b:null});
 row.data.runtime=createMatch('darts',1,1000,true,5);
 const due=row.data.runtime.animationUntil;
 const frozen=await actGame(pool,'a','match',{requestId:'p',revision:0,action:{type:'rules-pause',paused:true}});
 vi.setSystemTime(121000);
 await expect(actGame(pool,'a','match',{requestId:'shot',revision:frozen.runtime.revision,action:{type:'dart',gesture:{dx:0,dy:-0.5,durationMs:400}}})).rejects.toMatchObject({statusCode:409});
 const resumed=await actGame(pool,'a','match',{requestId:'u',revision:frozen.runtime.revision,action:{type:'rules-pause',paused:false}});
 vi.setSystemTime(120000+due-1);expect((await readGame(pool,'a','match')).runtime.revision).toBe(resumed.runtime.revision);
 vi.setSystemTime(120000+due);expect((await readGame(pool,'a','match')).runtime.revision).toBeGreaterThan(resumed.runtime.revision);
});
it('rejects a delayed resume from an older revision without releasing the newer pause',async()=>{
 const {pool,row}=fixture();Object.assign(row,{character:'daria',player_b:null});row.data.runtime.computer=true;
 await actGame(pool,'a','match',{requestId:'p1',revision:0,action:{type:'rules-pause',paused:true}});
 const newer=await actGame(pool,'a','match',{requestId:'p2',revision:1,action:{type:'rules-pause',paused:true}});
 vi.setSystemTime(121000);
 await expect(actGame(pool,'a','match',{requestId:'old-resume',revision:0,action:{type:'rules-pause',paused:false}})).rejects.toMatchObject({statusCode:409});
 expect((await readGame(pool,'a','match')).rulesPaused).toBe(true);
 const resumed=await actGame(pool,'a','match',{requestId:'resume',revision:newer.runtime.revision,action:{type:'rules-pause',paused:false}});
 expect(resumed.rulesPaused).toBe(false);
});
