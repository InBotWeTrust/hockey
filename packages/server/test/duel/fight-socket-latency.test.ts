import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { FightDuelAdapter } from '../../src/duel/amateur/fight/routes.js';
import { AppError } from '../../src/plugins/errors.js';
import { registerFightSocket } from '../../src/duel/amateur/fight/ws.js';
vi.mock('../../src/auth/jwt.js', () => ({
  verifyAccessToken: async () => ({ sub: 'synthetic-user' }),
}));
vi.mock('../../src/duel/amateur/fight/service.js', () => ({ advancePersistedFight: vi.fn() }));
const admit = vi.hoisted(() => vi.fn(async () => ({ accepted: true, seq: 1 })));
vi.mock('../../src/duel/amateur/fight/commands.js', () => ({
  fightActionSchema: { parse: (v: unknown) => v },
  admitFightCommand: admit,
}));
it.each(['hockey-fight-v1', 'hockey-fight-v2'])(
  'acknowledges %s input without waiting for the full inventory/score snapshot',
  async (protocol) => {
    const app = Fastify();
    await app.register(websocket);
    app.decorate('pg', { query: async () => ({ rows: [] }) });
    app.decorate('realtime', { subscribe: async () => async () => {} });
    let release: () => void = () => {};
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    let snapshots = 0;
    const adapter = {
      transact: async (work: (c: PoolClient) => Promise<unknown>) => work({} as PoolClient),
      prepare: async () => ({}),
      snapshot: async () => {
        if (++snapshots > 1) await blocked;
        return { id: 'match', fight: { id: 'fight' } };
      },
    } as unknown as FightDuelAdapter;
    adapter.liveSnapshot = async () => ({
      type: 'fight:snapshot',
      matchId: 'match',
      fight: { id: 'fight' },
    });
    registerFightSocket(app, adapter, 'synthetic-test-secret');
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socket = new WebSocket(
      address.replace('http:', 'ws:') + '/duel/amateur/matches/match/ws',
      [protocol],
      { headers: { authorization: 'Bearer synthetic' } },
    );
    const messages: Array<{ type: string }> = [];
    socket.on('message', (data) => messages.push(JSON.parse(String(data))));
    try {
      await vi.waitFor(() =>
        expect(messages.some((m) => m.type === 'connection:ready')).toBe(true),
      );
      socket.send(JSON.stringify({ actionId: 'test' }));
      await vi.waitFor(() => expect(messages.some((m) => m.type === 'fight:ack')).toBe(true), {
        timeout: 300,
      });
      if (protocol === 'hockey-fight-v2') {
        await vi.waitFor(() =>
          expect(messages.some((m) => m.type === 'fight:snapshot')).toBe(true),
        );
        expect(snapshots).toBe(1);
      }
    } finally {
      release();
      socket.terminate();
      await app.close();
    }
  },
);

it('correlates a rejection to the fight and action that failed', async () => {
  const app = Fastify();
  await app.register(websocket);
  app.decorate('pg', { query: async () => ({ rows: [] }) });
  app.decorate('realtime', { subscribe: async () => async () => {} });
  const adapter = {
    transact: async (work: (c: PoolClient) => Promise<unknown>) => work({} as PoolClient),
    prepare: async () => ({}),
    snapshot: async () => ({ id: 'match' }),
  } as unknown as FightDuelAdapter;
  registerFightSocket(app, adapter, 'synthetic');
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const socket = new WebSocket(
    address.replace('http:', 'ws:') + '/duel/amateur/matches/match/ws',
    ['hockey-fight-v2'],
    { headers: { authorization: 'Bearer synthetic' } },
  );
  const messages: Array<Record<string, unknown>> = [];
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  try {
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'connection:ready')).toBe(true));
    admit.mockRejectedValueOnce(
      new AppError('conflict', 'unavailable', 409, { reason: 'unknown_fight' }),
    );
    socket.send(JSON.stringify({ fightId: 'old', actionId: 'action', seq: 4 }));
    await vi.waitFor(() =>
      expect(messages.find((m) => m.type === 'fight:error')).toMatchObject({
        reason: 'unknown_fight',
        fightId: 'old',
        actionId: 'action',
        seq: 4,
      }),
    );
  } finally {
    socket.terminate();
    await app.close();
  }
});

it('publishes full match state when the latest fight changes on an existing socket', async () => {
  const app = Fastify();
  await app.register(websocket);
  let notify: () => void = () => {};
  app.decorate('pg', { query: async () => ({ rows: [] }) });
  app.decorate('realtime', {
    subscribe: async (_channel: string, callback: () => void) => {
      notify = callback;
      return async () => {};
    },
  });
  let id = 'first';
  const adapter = {
    transact: async (work: (c: PoolClient) => Promise<unknown>) => work({} as PoolClient),
    prepare: async () => ({}),
    snapshot: async () => ({ id: 'match', fight: { id } }),
    liveSnapshot: async () => ({ type: 'fight:snapshot', matchId: 'match', fight: { id } }),
  } as unknown as FightDuelAdapter;
  registerFightSocket(app, adapter, 'synthetic');
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const socket = new WebSocket(
    address.replace('http:', 'ws:') + '/duel/amateur/matches/match/ws',
    ['hockey-fight-v2'],
    { headers: { authorization: 'Bearer synthetic' } },
  );
  const messages: Array<{ type: string; match?: { fight: { id: string } } }> = [];
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  try {
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'connection:ready')).toBe(true));
    id = 'second';
    notify();
    await vi.waitFor(() =>
      expect(
        messages.some((m) => m.type === 'duel:snapshot' && m.match?.fight.id === 'second'),
      ).toBe(true),
    );
  } finally {
    socket.terminate();
    await app.close();
  }
});

it.each([false,true])('notifies the other player after commit and tolerates publish failure=%s', async fail => {
  const app=Fastify(); await app.register(websocket);
  app.decorate('pg',{query:async()=>({rows:[]})});
  const published=vi.fn(async()=>{if(fail)throw Error('synthetic unavailable');});
  app.decorate('realtime',{subscribe:async()=>async()=>{},publish:published});
  let release!:()=>void;
  const committed=new Promise<void>(resolve=>{release=resolve;});
  let commandStarted=false;
  const adapter={
    transact:async(work:(c:PoolClient)=>Promise<unknown>)=>{const result=await work({} as PoolClient);if(commandStarted)await committed;return result;},
    prepare:async()=>({}),snapshot:async()=>({id:'match',fight:{id:'fight'}}),
    liveSnapshot:async()=>({type:'fight:snapshot',matchId:'match',fight:{id:'fight'}}),
  } as unknown as FightDuelAdapter;
  registerFightSocket(app,adapter,'synthetic');
  const address=await app.listen({host:'127.0.0.1',port:0});
  const socket=new WebSocket(address.replace('http:','ws:')+'/duel/amateur/matches/match/ws',['hockey-fight-v2'],{headers:{authorization:'Bearer synthetic'}});
  const messages:Array<{type:string;ack?:Record<string,unknown>}> = [];
  socket.on('message',data=>messages.push(JSON.parse(String(data))));
  try{
    await vi.waitFor(()=>expect(messages.some(m=>m.type==='connection:ready')).toBe(true));
    admit.mockImplementationOnce(async()=>{commandStarted=true;return {accepted:true,seq:1,notificationRevision:17};});
    socket.send(JSON.stringify({actionId:'notify'}));
    await vi.waitFor(()=>expect(commandStarted).toBe(true));
    expect(published).not.toHaveBeenCalled();
    expect(messages.some(m=>m.type==='fight:ack')).toBe(false);
    release();
    await vi.waitFor(()=>expect(published).toHaveBeenCalledWith('duel:fight:match',{type:'duel:fight_update',matchId:'match',revision:17}));
    await vi.waitFor(()=>expect(messages.some(m=>m.type==='fight:ack')).toBe(true));
    expect(messages.some(m=>m.type==='fight:error')).toBe(false);
    expect(messages.find(m=>m.type==='fight:ack')?.ack).not.toHaveProperty('notificationRevision');
  }finally{release();socket.terminate();await app.close();}
});

it('sends the live runtime sequence before reconnect is allowed to submit input', async () => {
  const app=Fastify();await app.register(websocket);
  app.decorate('pg',{query:async()=>({rows:[]})});
  app.decorate('realtime',{subscribe:async()=>async()=>{}});
  const adapter={
    transact:async(work:(c:PoolClient)=>Promise<unknown>)=>work({} as PoolClient),
    prepare:async()=>({}),
    snapshot:async()=>({id:'match',fight:{id:'fight',revision:1,engine_state:{lastSeq:[0,0]}}}),
    liveSnapshot:async()=>({type:'fight:snapshot',matchId:'match',fight:{id:'fight',revision:9,engine_state:{lastSeq:[2,1]}}}),
  } as unknown as FightDuelAdapter;
  registerFightSocket(app,adapter,'synthetic');
  const address=await app.listen({host:'127.0.0.1',port:0});
  const socket=new WebSocket(address.replace('http:','ws:')+'/duel/amateur/matches/match/ws',['hockey-fight-v3'],{headers:{authorization:'Bearer synthetic'}});
  const messages:Array<{type:string;fight?:{engine_state:{lastSeq:number[]}}}>=[];
  socket.on('message',data=>messages.push(JSON.parse(String(data))));
  try{
    await vi.waitFor(()=>expect(messages.some(m=>m.type==='connection:ready')).toBe(true));
    const ready=messages.findIndex(m=>m.type==='connection:ready');
    expect(messages.slice(0,ready).find(m=>m.type==='fight:snapshot')?.fight?.engine_state.lastSeq).toEqual([2,1]);
  }finally{socket.terminate();await app.close();}
});
