import type {FastifyPluginAsync} from 'fastify';
import {z} from 'zod';
import {staffRoomEvent} from './staffRoom.js';
export const staffRoomRoutes:FastifyPluginAsync=async app=>{
 app.post('/bar/staff-room',{preHandler:[app.authenticate]},async req=>{
  const body=z.object({action:z.enum(['enter','warn','leave']),entryId:z.string().uuid()}).strict().parse(req.body);
  return staffRoomEvent(app.pg,req.user.id,body.action,body.entryId);
 });
};
