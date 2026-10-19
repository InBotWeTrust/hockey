import type {Pool,PoolClient} from 'pg';
import {AppError} from '../plugins/errors.js';
import {officeDayMode} from './officeSchedule.js';
export interface ElinaOfficeAccess {day:string;warnings:number}
export async function requireElinaOffice(db:Pick<Pool,'query'>|PoolClient,user:string,activeVisit=true):Promise<ElinaOfficeAccess>{
 const row=(await db.query<{day:string;state_day:string|null;office_warnings:number|null;departed_at:unknown;warned_at:unknown;visiting:boolean;fight_id:string|null}>(
  `select (now() at time zone coalesce(u.timezone,'UTC'))::date::text as day,s.day::text as state_day,
   s.office_warnings,s.departed_at,s.warned_at,s.fight_id,
   exists(select 1 from bar_staff_room_entries e where e.user_id=u.id and e.day=s.day and e.last_seen_at>clock_timestamp()-interval '2 minutes') as visiting
   from users u left join bar_staff_room_state s on s.user_id=u.id where u.id=$1`,[user])).rows[0];
 if(!row||row.state_day!==row.day||officeDayMode(user,row.day)!=='seated'||row.departed_at||row.warned_at||row.fight_id||(activeVisit&&!row.visiting))
  throw new AppError('elina_unavailable','Элины сейчас нет в кабинете.',409);
 return {day:row.day,warnings:row.office_warnings??0};
}
export async function recordOfficeConversationIncident(db:PoolClient,user:string,eject:boolean){
 await db.query(`update bar_staff_room_state set office_warnings=office_warnings+1,
  departed_at=case when $2 then clock_timestamp() else departed_at end where user_id=$1`,[user,eject]);
}
export function elinaIntervention(warnings:number){
 return warnings>0
  ? {intervention:'office-eject',text:'На сегодня разговор окончен. Пойдём, я провожу тебя в бар.'}
  : {intervention:'office-warning',text:'Элина попросила не мешать ей. Давай спокойно, без давления. Это предупреждение.'};
}
