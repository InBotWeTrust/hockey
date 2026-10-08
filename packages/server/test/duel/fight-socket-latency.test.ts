import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { FightDuelAdapter } from '../../src/duel/amateur/fight/routes.js';
import { registerFightSocket } from '../../src/duel/amateur/fight/ws.js';
vi.mock('../../src/auth/jwt.js', () => ({ verifyAccessToken: async () => ({ sub: 'synthetic-user' }) }));
vi.mock('../../src/duel/amateur/fight/service.js', () => ({ advancePersistedFight: vi.fn() }));
vi.mock('../../src/duel/amateur/fight/commands.js', () => ({ fightActionSchema: { parse: (v: unknown) => v }, admitFightCommand: async () => ({ accepted: true, seq: 1 }) }));
it.each(['hockey-fight-v1','hockey-fight-v2'])('acknowledges %s input without waiting for the full inventory/score snapshot', async (protocol) => {
 const app=Fastify(); await app.register(websocket);
 app.decorate('pg',{query:async()=>({rows:[]})}); app.decorate('realtime',{subscribe:async()=>async()=>{}});
 let release:()=>void=()=>{}; const blocked=new Promise<void>(r=>{release=r;}); let snapshots=0;
 const adapter={transact:async(work:(c:PoolClient)=>Promise<unknown>)=>work({} as PoolClient),prepare:async()=>({}),snapshot:async()=>{if(++snapshots>1)await blocked;return {id:'match'};}} as unknown as FightDuelAdapter;
 adapter.liveSnapshot=async()=>({type:'fight:snapshot',matchId:'match',fight:{id:'fight'}});
 registerFightSocket(app,adapter,'synthetic-test-secret');
 const address=await app.listen({host:'127.0.0.1',port:0}); const socket=new WebSocket(address.replace('http:','ws:')+'/duel/amateur/matches/match/ws',[protocol],{headers:{authorization:'Bearer synthetic'}});
 const messages:Array<{type:string}>=[];socket.on('message',data=>messages.push(JSON.parse(String(data))));
 try {await vi.waitFor(()=>expect(messages.some(m=>m.type==='connection:ready')).toBe(true));
 socket.send(JSON.stringify({actionId:'test'}));
 await vi.waitFor(()=>expect(messages.some(m=>m.type==='fight:ack')).toBe(true),{timeout:300});
 if(protocol==='hockey-fight-v2'){await vi.waitFor(()=>expect(messages.some(m=>m.type==='fight:snapshot')).toBe(true));expect(snapshots).toBe(1);}
 }finally{release();socket.terminate();await app.close();}
});
