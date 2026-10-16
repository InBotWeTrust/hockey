import Fastify from 'fastify';
import {expect,it,vi,afterEach} from 'vitest';
import {staffRoomRoutes} from './staffRoomRoutes.js';
import {staffRoomEvent} from './staffRoom.js';
vi.mock('./staffRoom.js',()=>({staffRoomEvent:vi.fn(async()=>({phase:'scene'}))}));
afterEach(()=>{vi.clearAllMocks();});
const app=async()=>{
 const server=Fastify();server.decorate('authenticate',async(req,reply)=>{
  if(!req.headers['x-test-user'])return reply.code(401).send({error:'unauthorized'});
  Object.assign(req,{user:{id:req.headers['x-test-user']}});
 });
 await server.register(staffRoomRoutes);return server;
};
it('requires authentication before accessing room state',async()=>{
 const server=await app();try{const r=await server.inject({method:'POST',url:'/bar/staff-room',payload:{action:'enter',entryId:crypto.randomUUID()}});expect(r.statusCode).toBe(401);expect(staffRoomEvent).not.toHaveBeenCalled();}finally{await server.close();}
});
it('uses the authenticated owner and rejects body owner overrides',async()=>{
 const server=await app();const entryId=crypto.randomUUID();try{
  await server.inject({method:'POST',url:'/bar/staff-room',headers:{'x-test-user':'owner'},payload:{action:'enter',entryId}});
  expect(staffRoomEvent).toHaveBeenCalledWith(undefined,'owner','enter',entryId);
  vi.mocked(staffRoomEvent).mockClear();
  await server.inject({method:'POST',url:'/bar/staff-room',headers:{'x-test-user':'owner'},payload:{action:'enter',entryId,userId:'other'}});
  expect(staffRoomEvent).not.toHaveBeenCalled();
 }finally{await server.close();}
});
