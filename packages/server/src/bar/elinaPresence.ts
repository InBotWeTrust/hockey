import {randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {officeDayMode} from './officeSchedule.js';
import {resolvePresence,type Presence} from './elinaMeeting.js';
export async function ensureOfficeDay(db:PoolClient,user:string,day:string){
 await db.query(`insert into bar_staff_room_state(user_id,day) values($1,$2)
 on conflict(user_id) do update set day=excluded.day,warned_at=null,fight_id=null,office_warnings=0,departed_at=null
 where bar_staff_room_state.day<>excluded.day`,[user,day]);
}
// Caller holds the visitor conversation lock. Only bar entry redraws an expired period.
export async function refreshElinaPresence(db:PoolClient,user:string,day:string,now:number,redraw=true){
 await ensureOfficeDay(db,user,day);
 const row=(await db.query<{presence_mode:'seated'|'empty'|null;presence_until:Date|null;absent_until:Date|null}>(
 'select presence_mode,presence_until,absent_until from bar_staff_room_state where user_id=$1',[user])).rows[0]!;
 const previous:Presence|null=row.presence_mode&&row.presence_until?{mode:row.presence_mode,until:new Date(row.presence_until).getTime(),absentUntil:row.absent_until?new Date(row.absent_until).getTime():0}:null;
 const special=officeDayMode(user,day)==='scene';
 const next=!redraw&&previous&&!special?{...previous,mode:previous.absentUntil>now?'empty' as const:previous.mode}:resolvePresence(previous,now,special,randomInt(1000000)/1000000);
 if(next.mode!=='scene')await db.query(`update bar_staff_room_state set presence_mode=$2,presence_until=$3,absent_until=$4 where user_id=$1`,
 [user,next.mode,new Date(next.until),next.absentUntil?new Date(next.absentUntil):null]);
 return next.mode;
}
