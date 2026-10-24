import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { performancePlugin } from '../../src/plugins/performance.js';
it('emits opt-in timing and pool pressure without logging account IDs or request parameters',async()=>{
 const app=Fastify();const info=vi.spyOn(app.log,'info');
 app.decorate('pg',{totalCount:4,idleCount:1,waitingCount:2});
 await app.register(performancePlugin,{enabled:true});
 app.get('/users/:userId',async()=>({ok:true}));
 try{
  const response=await app.inject('/users/private-player-id?token=private-token');
  expect(response.headers['server-timing']).toMatch(/^app;dur=/);
  const metrics=info.mock.calls.find(call=>call[1]==='request performance')?.[0];
  expect(metrics).toMatchObject({group:'public-profile',poolActive:3,poolWaiting:2});
  expect(JSON.stringify(metrics)).not.toMatch(/private-player-id|private-token/);
 }finally{await app.close();}
});
it('does not add timing headers when diagnostics are disabled',async()=>{
 const app=Fastify();await app.register(performancePlugin,{enabled:false});app.get('/',async()=>({ok:true}));
 try{expect((await app.inject('/')).headers['server-timing']).toBeUndefined();}finally{await app.close();}
});
