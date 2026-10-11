import type { Pool } from 'pg';
import type { Character } from './conversationRoutes.js';
import { safeMemoryText } from './dialogueSafety.js';
export type PrivacyAction = {type:'enabled';enabled:boolean}|{type:'clear';revision:number}|{type:'delete';id:string;version:number}|{type:'edit';id:string;version:number;content:string};
export interface PrivateNote {id:string;kind:string;content:string;sourceTurnId:string;quote:string;version:number;provenance:string;updatedAt:string}
export interface MemoryView {enabled:boolean;revision:number;facts:PrivateNote[]}
export interface DialoguePrivacy {read(user:string,character:Character):Promise<MemoryView>;change(user:string,character:Character,action:PrivacyAction):Promise<boolean>}
export class SqlDialoguePrivacy implements DialoguePrivacy {
  constructor(private readonly pool: Pool) {}
  async read(user:string,character:Character):Promise<MemoryView> {
    const [settings,facts]=await Promise.all([
      this.pool.query('select s.enabled,c.revision from bar_memory_settings s join bar_conversations c using(user_id,character_id) where s.user_id=$1 and s.character_id=$2',[user,character]),
      this.pool.query<PrivateNote>(`select id,kind,content,source_turn_id as "sourceTurnId",source_quote as quote,version,provenance,updated_at as "updatedAt" from bar_memory_facts where user_id=$1 and character_id=$2 order by updated_at desc,id limit 100`,[user,character]),
    ]);
    return {enabled:settings.rows[0]?.enabled ?? true,revision:settings.rows[0]?.revision ?? 0,facts:settings.rows[0]?.enabled===false ? [] : facts.rows};
  }
  async change(user:string,character:Character,action:PrivacyAction):Promise<boolean> {
    if(action.type==='edit' && !safeMemoryText(action.content)) return false;
    const db=await this.pool.connect();
    try {
      await db.query('begin');
      await db.query('insert into bar_conversations(user_id,character_id) values($1,$2) on conflict do nothing',[user,character]);
      await db.query('insert into bar_memory_settings(user_id,character_id) values($1,$2) on conflict do nothing',[user,character]);
      await db.query('select 1 from bar_memory_settings where user_id=$1 and character_id=$2 for update',[user,character]);
      const {rows}=await db.query('select revision,jsonb_array_length(turns) as count from bar_conversations where user_id=$1 and character_id=$2 for update',[user,character]);
      if(action.type==='clear' && action.revision!==rows[0].revision) {await db.query('rollback');return false;}
      if(action.type==='edit' || action.type==='delete') {
        const result=action.type==='delete' ? await db.query('delete from bar_memory_facts where user_id=$1 and character_id=$2 and id=$3 and version=$4 returning id',[user,character,action.id,action.version]) :
          await db.query(`update bar_memory_facts set content=$5,version=version+1,provenance='user_edit',updated_at=now() where user_id=$1 and character_id=$2 and id=$3 and version=$4 returning id`,[user,character,action.id,action.version,action.content]);
        if(!result.rows.length) {await db.query('rollback');return false;}
      } else await db.query('delete from bar_memory_facts where user_id=$1 and character_id=$2',[user,character]);
      await db.query('delete from bar_memory_jobs where user_id=$1 and character_id=$2',[user,character]);
      await db.query('delete from bar_conversation_memory where user_id=$1 and character_id=$2',[user,character]);
      const start=action.type==='clear' ? 0 : rows[0].count;
      await db.query(`update bar_memory_settings set generation=generation+1,history_start=$3,enabled=coalesce($4,enabled) where user_id=$1 and character_id=$2`,[user,character,start,action.type==='enabled' ? action.enabled : null]);
      if(action.type==='clear' || action.type==='enabled') await db.query('delete from bar_told_stories where user_id=$1 and character_id=$2',[user,character]);
      await db.query(`update bar_conversations set revision=revision+1,pending_id=null,pending_until=null,turns=case when $3 then '[]'::jsonb else turns end where user_id=$1 and character_id=$2`,[user,character,action.type==='clear']);
      await db.query('commit');return true;
    } catch(error){await db.query('rollback');throw error;} finally {db.release();}
  }
}
