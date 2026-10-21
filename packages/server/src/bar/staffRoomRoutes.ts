import {refreshElinaPresence} from './elinaPresence.js';
import {assertBarAccess} from './olegFightService.js';
import type {FastifyPluginAsync} from 'fastify';
import {z} from 'zod';
import {staffRoomEvent} from './staffRoom.js';
export const staffRoomRoutes:FastifyPluginAsync=async app=>{
 app.post('/bar/office-presence',{preHandler:[app.authenticate]},async req=>{
  const user=req.user.id,db=await app.pg.connect();
  try{
   await db.query('begin');
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`bar-conversation:${user}`]);
   await assertBarAccess(db,user);
   const clock=(await db.query<{day:string;now:string}>("select (now() at time zone coalesce(timezone,'UTC'))::date::text as day,clock_timestamp()::text as now from users where id=$1",[user])).rows[0]!;
   await refreshElinaPresence(db,user,clock.day,Date.parse(clock.now));
   await db.query('commit');return {ok:true};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 });
 app.post('/bar/staff-room',{preHandler:[app.authenticate]},async req=>{
  const body=z.object({action:z.enum(['enter','warn','leave']),entryId:z.string().uuid()}).strict().parse(req.body);
  return staffRoomEvent(app.pg,req.user.id,body.action,body.entryId);
 });
};
