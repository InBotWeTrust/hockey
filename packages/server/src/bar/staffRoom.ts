import {refreshElinaPresence,ensureOfficeDay} from './elinaPresence.js';
import {randomInt} from 'node:crypto';
import type {Pool} from 'pg';
import {officeDayMode,type OfficeDayMode} from './officeSchedule.js';
import {AppError} from '../plugins/errors.js';
import {readBarAccess,startOlegFight} from './olegFightService.js';
export const EMPTY_OFFICE_PHRASES=[
 'Здесь уже никого нет. Пойдём обратно в зал.',
 'Элина ушла. В кабинете без неё оставаться нельзя. Пойдём.',
 'Приём окончен. Давай вернёмся в бар.',
 'Хозяйки нет. Подождёшь её в зале.',
 'Ну всё, кабинет закрываем. Пойдём, провожу.',
] as const;
export const STAFF_ROOM_WARNING='Это кабинет директора. Без приглашения сюда не заходят. В следующий раз выведу тебя сам.';
export const canWarn=(current:string|null,entry:string,start:number,now:number,delay=3000)=>current===entry&&now-start>=delay;
export const staffRoomPhase=(warned:boolean,fight:string|null,outcome:string|null)=>fight&&outcome==='win'?'empty':warned?'fight':'scene';
export type StaffRoomResult={phase:'scene'|'seated'|'warning'|'fight'|'empty'|'escorted';conversationRevision?:number;fightId?:string;entryId?:string;warnAfterMs?:number;day?:string};
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
  await ensureOfficeDay(db,user,clock.day);
  const row=(await db.query<Row>('select s.*,f.outcome from bar_staff_room_state s left join bar_oleg_fights f on f.id=s.fight_id and f.user_id=s.user_id where s.user_id=$1',[user])).rows[0]!;
  const phase=staffRoomPhase(!!row.warned_at,row.fight_id,row.outcome);
  const scheduled=schedule(user,clock.day);
  const presence=scheduled==='scene'?'scene':await refreshElinaPresence(db,user,clock.day,Date.parse(clock.now),false);
  const mode=phase==='empty'||row.departed_at?'empty':presence;
  const delay=mode==='scene'?3000:mode==='empty'?15000:0;
  if(action==='leave'){
   await db.query('delete from bar_staff_room_entries where user_id=$1 and entry_id=$2',[user,entry]);
   await db.query('commit');return {phase:'scene'};
  }
  if(action==='warn'){
   if(!delay)throw new AppError('staff_room_not_ready','Разговор не ограничен таймером.',409);
   const visit=(await db.query<{entered_at:string;empty_since:string|null;escorted_at:string|null}>(
    'select entered_at::text,empty_since::text,escorted_at::text from bar_staff_room_entries where user_id=$1 and entry_id=$2 and day=$3',[user,entry,clock.day])).rows[0];
   if(visit?.escorted_at){await db.query('commit');return {phase:'escorted'};}
   if(mode==='scene'&&row.warned_at){await db.query('commit');return {phase:'warning'};}
   const start=mode==='empty'?visit?.empty_since:visit?.entered_at;
   if(!start||!canWarn(entry,entry,Date.parse(start),Date.parse(clock.now),delay))throw new AppError('staff_room_not_ready','Предупреждение пока недоступно.',409);
   if((await db.query('select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',[user])).rows.length)throw new AppError('conversation_busy','Дождись ответа собеседника.',409);
   const empty=mode==='empty';
   const turn={id:entry,user:'',assistant:empty?EMPTY_OFFICE_PHRASES[randomInt(EMPTY_OFFICE_PHRASES.length)]:STAFF_ROOM_WARNING,createdAt:new Date(clock.now).toISOString(),speaker:'oleg',intervention:empty?'office-escort':'staff-room',emotion:empty?'neutral':'displeasure'};
   await db.query(`insert into bar_conversations(user_id,character_id,revision,turns) values($1,'oleg',1,$2::jsonb)
    on conflict(user_id,character_id) do update set revision=bar_conversations.revision+1,turns=bar_conversations.turns||excluded.turns`,[user,JSON.stringify([turn])]);
   if(empty)await db.query('update bar_staff_room_entries set escorted_at=clock_timestamp() where user_id=$1 and entry_id=$2',[user,entry]);
   else await db.query('update bar_staff_room_state set warned_at=now() where user_id=$1',[user]);
   await db.query('commit');return {phase:empty?'escorted':'warning'};
  }
  if(phase==='fight'&&mode!=='empty'){
   if((await db.query('select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',[user])).rows.length)throw new AppError('conversation_busy','Дождись ответа собеседника.',409);
   const fightId=await startOlegFight(db,user);
   await db.query('update bar_staff_room_state set fight_id=$2 where user_id=$1',[user,fightId]);
   await db.query('commit');return {phase:'fight',fightId};
  }
  // A refreshed page or another tab reuses the same active visit and deadline.
  const existing=(await db.query<{entry_id:string}>(`select entry_id from bar_staff_room_entries where user_id=$1 and day=$2
   and (entry_id=$3 or last_seen_at>clock_timestamp()-interval '2 minutes' and escorted_at is null) order by entered_at desc limit 1`,[user,clock.day,entry])).rows[0];
  const activeEntry=existing?.entry_id??entry;
  await db.query(`insert into bar_staff_room_entries(user_id,entry_id,day,last_seen_at,empty_since)
   values($1,$2,$3,clock_timestamp(),case when $4 then clock_timestamp() else null end)
   on conflict(user_id,entry_id) do update set last_seen_at=excluded.last_seen_at,day=excluded.day,
   entered_at=case when bar_staff_room_entries.day<>excluded.day then excluded.entered_at else bar_staff_room_entries.entered_at end,
   escorted_at=case when bar_staff_room_entries.day<>excluded.day then null else bar_staff_room_entries.escorted_at end,
   empty_since=case when $4 then case when bar_staff_room_entries.day<>excluded.day then clock_timestamp() else coalesce(bar_staff_room_entries.empty_since,clock_timestamp()) end else null end`,[user,activeEntry,clock.day,mode==='empty']);
  const visit=(await db.query<{remaining:number;escorted_at:unknown}>(`select greatest(0,15000-extract(epoch from (clock_timestamp()-empty_since))*1000)::int as remaining,escorted_at
   from bar_staff_room_entries where user_id=$1 and entry_id=$2`,[user,activeEntry])).rows[0]!;
  const revision=(await db.query<{revision:number}>("select revision from bar_conversations where user_id=$1 and character_id='elina'",[user])).rows[0]?.revision??0;
  await db.query('commit');return {phase:visit.escorted_at?'escorted':mode,entryId:activeEntry,warnAfterMs:mode==='empty'?visit.remaining:delay,day:clock.day,conversationRevision:revision};
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
