import type {Pool} from 'pg';
import {officeDayMode,type OfficeDayMode} from './officeSchedule.js';
import {AppError} from '../plugins/errors.js';
import {readBarAccess,startOlegFight} from './olegFightService.js';
export const STAFF_ROOM_WARNING='Это кабинет директора. Без приглашения сюда не заходят. В следующий раз выведу тебя сам.';
export const canWarn=(current:string|null,entry:string,start:number,now:number,delay=3000)=>current===entry&&now-start>=delay;
export const staffRoomPhase=(warned:boolean,fight:string|null,outcome:string|null)=>fight&&outcome==='win'?'empty':warned?'fight':'scene';
export type StaffRoomResult={phase:'scene'|'seated'|'warning'|'fight'|'empty';fightId?:string;entryId?:string;warnAfterMs?:number;day?:string};
interface Row {warned_at:string|null;fight_id:string|null;outcome:string|null;departed_at?:string|null}
export async function staffRoomEvent(pool:Pool,user:string,action:'enter'|'warn'|'leave',entry:string,schedule:(user:string,day:string)=>OfficeDayMode=officeDayMode):Promise<StaffRoomResult> {
 const db=await pool.connect();
 try{
  await db.query('begin');
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`bar-conversation:${user}`]);
  const clock=(await db.query<{day:string;now:string}>("select (now() at time zone coalesce(timezone,'UTC'))::date::text as day,clock_timestamp()::text as now from users where id=$1",[user])).rows[0];
  if(!clock)throw new AppError('unauthorized','Войди в игру.',401);
  const access=await readBarAccess(db,user);
  if(access.blockedUntil)throw new AppError('bar_closed','На сегодня бар закрыт для тебя.',403,access);
  if(access.fightId){await db.query('commit');return {phase:'fight',fightId:access.fightId};}
  await db.query(`insert into bar_staff_room_state(user_id,day) values($1,$2)
   on conflict(user_id) do update set day=excluded.day,warned_at=null,fight_id=null,office_warnings=0,departed_at=null
   where bar_staff_room_state.day<>excluded.day`,[user,clock.day]);
  const row=(await db.query<Row>('select s.*,f.outcome from bar_staff_room_state s left join bar_oleg_fights f on f.id=s.fight_id and f.user_id=s.user_id where s.user_id=$1',[user])).rows[0]!;
  const phase=staffRoomPhase(!!row.warned_at,row.fight_id,row.outcome);
  if(phase==='empty'){await db.query('commit');return {phase,warnAfterMs:0,day:clock.day};}
  const mode=row.departed_at?'empty':schedule(user,clock.day);
  const delay=mode==='scene'?3000:mode==='empty'?30000:0;
  if(action==='leave'){
   await db.query('delete from bar_staff_room_entries where user_id=$1 and entry_id=$2',[user,entry]);
   await db.query('commit');return {phase:'scene'};
  }
  if(action==='warn'){
   if(!delay)throw new AppError('staff_room_not_ready','Разговор не ограничен таймером.',409);
   if(row.warned_at){await db.query('commit');return {phase:'warning'};}
   const visit=(await db.query<{entered_at:string}>('select entered_at::text from bar_staff_room_entries where user_id=$1 and entry_id=$2 and day=$3',[user,entry,clock.day])).rows[0];
   if(!visit||!canWarn(entry,entry,Date.parse(visit.entered_at),Date.parse(clock.now),delay))throw new AppError('staff_room_not_ready','Предупреждение пока недоступно.',409);
   // Serialize against the same conversation lock used by chat and physical incidents.
   if((await db.query('select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',[user])).rows.length)throw new AppError('conversation_busy','Дождись ответа собеседника.',409);
   const turn={id:entry,user:'',assistant:STAFF_ROOM_WARNING,createdAt:new Date(clock.now).toISOString(),speaker:'oleg',intervention:'staff-room',emotion:'displeasure'};
   await db.query(`insert into bar_conversations(user_id,character_id,revision,turns) values($1,'oleg',1,$2::jsonb)
    on conflict(user_id,character_id) do update set revision=bar_conversations.revision+1,turns=bar_conversations.turns||excluded.turns`,[user,JSON.stringify([turn])]);
   await db.query('update bar_staff_room_state set warned_at=now() where user_id=$1',[user]);
   await db.query('commit');return {phase:'warning'};
  }
  if(phase==='fight'){
   if((await db.query('select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',[user])).rows.length)throw new AppError('conversation_busy','Дождись ответа собеседника.',409);
   const fightId=await startOlegFight(db,user);
   await db.query('update bar_staff_room_state set fight_id=$2 where user_id=$1',[user,fightId]);
   await db.query('commit');return {phase:'fight',fightId};
  }
  await db.query('delete from bar_staff_room_entries where user_id=$1 and day<>$2',[user,clock.day]);
  await db.query('insert into bar_staff_room_entries(user_id,entry_id,day,last_seen_at) values($1,$2,$3,clock_timestamp()) on conflict(user_id,entry_id) do update set last_seen_at=excluded.last_seen_at',[user,entry,clock.day]);
  await db.query('commit');return {phase:mode,entryId:entry,warnAfterMs:delay,day:clock.day};
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
