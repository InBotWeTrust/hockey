import type { Pool } from 'pg';
import type { Character, ConversationTurn } from './conversationRoutes.js';
import type { ConflictState } from './conflict.js';
import { AppError } from '../plugins/errors.js';
import { assertBarAccess,startOlegFight } from './olegFightService.js';
export function physicalEffect(state:ConflictState) {
 return {warnings:Math.min(100,state.warnings+1),intervening:!state.intervening,kind:state.intervening?'fight' as const:'intervention' as const};
}
export async function recordPhysicalIncident(pool:Pool,user:string,character:Character,eventId:string) {
 const db=await pool.connect();
 try {
  await db.query('begin');
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`bar-conversation:${user}`]);
  const old=await db.query<{character_id:string}>('select character_id from bar_physical_incidents where user_id=$1 and event_id=$2',[user,eventId]);
  if(old.rows.length) {
   if(old.rows[0]!.character_id!==character)throw new AppError('incident_conflict','Это нажатие уже обработано.',409);
   await db.query('commit');return;
  }
  await assertBarAccess(db,user);
  const pending=await db.query('select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',[user]);
  if(pending.rows.length)throw new AppError('conversation_busy','Дождись ответа и попробуй ещё раз.',409);
  const row=(await db.query<ConflictState & {day:string}>(`select (now() at time zone coalesce(u.timezone,'UTC'))::date::text as day,
   case when c.day=(now() at time zone coalesce(u.timezone,'UTC'))::date then c.warnings else 0 end as warnings,
   coalesce(c.day=(now() at time zone coalesce(u.timezone,'UTC'))::date and c.intervening,false) as intervening
   from users u left join bar_conflicts c on c.user_id=u.id where u.id=$1`,[user])).rows[0];
  if(!row)throw new AppError('unauthorized','Войди в игру.',401);
  const effect=physicalEffect(row);
  const prefix=effect.kind==='fight'?'fight-':character==='oleg'?'touch-oleg-':['maria','daria','veronika'].includes(character)?'touch-woman-':'touch-man-';
  const phrase=(await db.query<{content:string}>('select content from bar_oleg_phrases where starts_with(id,$1) order by random() limit 1',[prefix])).rows[0];
  if(!phrase)throw new Error('oleg_phrase_unavailable');
  await db.query(`insert into bar_conflicts(user_id,day,warnings,intervening) values($1,$2,$3,$4)
   on conflict(user_id) do update set day=excluded.day,warnings=excluded.warnings,intervening=excluded.intervening,updated_at=now()`,[user,row.day,effect.warnings,effect.intervening]);
  const turn:ConversationTurn={id:eventId,user:'',assistant:phrase.content,createdAt:new Date().toISOString(),speaker:'oleg',intervention:effect.kind,event:'physical'};
  if(effect.kind==='fight')turn.fightId=await startOlegFight(db,user,eventId);
  await db.query(`insert into bar_conversations(user_id,character_id,revision,turns) values($1,$2,1,$3::jsonb)
   on conflict(user_id,character_id) do update set revision=bar_conversations.revision+1,turns=bar_conversations.turns||excluded.turns`,[user,character,JSON.stringify([turn])]);
  await db.query('insert into bar_physical_incidents(user_id,event_id,character_id) values($1,$2,$3)',[user,eventId,character]);
  await db.query('commit');
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}
