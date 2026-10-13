import type { Pool } from 'pg';
import { AppError } from '../plugins/errors.js';
import type { ConflictEffect } from './conflict.js';
import { startOlegFight,assertBarAccess } from './olegFightService.js';
import { personaOf } from './personas.js';
import type {
  Character,
  ConversationRecord,
  ConversationStore,
  ConversationTurn,
  Reservation,
} from './conversationRoutes.js';
interface Row {
  revision: number;
  turns: ConversationTurn[];
  pending: boolean;
}
export class SqlConversationStore implements ConversationStore {
  constructor(private readonly pool: Pool) {}
  async read(user: string, character: Character): Promise<ConversationRecord> {
    const { rows } = await this.pool.query<Row & { interventionActive: boolean }>(
      `select coalesce(b.revision,0) as revision,coalesce(b.turns,'[]'::jsonb) as turns,
        coalesce(b.pending_until > now(),false) as pending,
        coalesce(c.day=(now() at time zone coalesce(u.timezone,'UTC'))::date and c.intervening,false) as "interventionActive"
       from users u left join bar_conversations b on b.user_id=u.id and b.character_id=$2
       left join bar_conflicts c on c.user_id=u.id where u.id=$1`,
      [user, character],
    );
    return rows[0] ?? { revision: 0, turns: [], pending: false, interventionActive: false };
  }

  async reserve(
    user: string,
    character: Character,
    id: string,
    revision: number,
  ): Promise<Reservation> {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      // Serialize a player's reservations across all characters and server processes.
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `bar-conversation:${user}`,
      ]);
      await db.query(
        `insert into bar_conversations(user_id,character_id) values($1,$2) on conflict do nothing`,
        [user, character],
      );
      await db.query('insert into bar_memory_settings(user_id,character_id) values($1,$2) on conflict do nothing',[user,character]);
      await db.query('select 1 from bar_memory_settings where user_id=$1 and character_id=$2 for update',[user,character]);
      const { rows } = await db.query<Row>(
        `select revision,turns,(pending_until > now()) as pending from bar_conversations where user_id=$1 and character_id=$2 for update`,
        [user, character],
      );
      const record = { ...rows[0]!, pending: !!rows[0]!.pending };
      let result: Reservation;
      if (record.turns.some((t) => t.id === id)) result = { kind: 'duplicate', record };
      else if (record.pending) result = { kind: 'busy' };
      else if (record.revision !== revision) result = { kind: 'stale' };
      else {
        const busy = await db.query(
          `select 1 from bar_conversations where user_id=$1 and pending_until > now() limit 1`,
          [user],
        );
        if (busy.rows.length) result = { kind: 'busy' };
        else {
          const quota = await db.query(
            `insert into bar_conversation_usage(user_id,day,requests) values($1,current_date,1) on conflict(user_id,day) do update set requests=bar_conversation_usage.requests+1 where bar_conversation_usage.requests<100 returning requests`,
            [user],
          );
          if (!quota.rows.length) result = { kind: 'limit' };
          else {
            await db.query(
              `update bar_conversations set pending_id=$3,pending_until=now()+interval '150 seconds' where user_id=$1 and character_id=$2`,
              [user, character, id],
            );
            result = { kind: 'reserved', record };
          }
        }
      }
      await db.query('commit');
      return result;
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally {
      db.release();
    }
  }
  async complete(
    user: string,
    character: Character,
    turn: ConversationTurn,
    usedStoryIds: string[] = [],
    conflict?: ConflictEffect,
  ): Promise<ConversationRecord> {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`bar-conversation:${user}`]);
      await assertBarAccess(db,user);
      if(conflict&&conflict.kind!=='none') {
        const changed=await db.query(`insert into bar_conflicts(user_id,day,warnings,intervening)
          select id,$2::date,$3,$4 from users where id=$1 and (now() at time zone coalesce(timezone,'UTC'))::date=$2::date
          on conflict(user_id) do update set day=excluded.day,warnings=excluded.warnings,intervening=excluded.intervening,updated_at=now() returning user_id`,[user,conflict.day,conflict.warnings,conflict.intervening]);
        if(!changed.rows.length)throw new AppError('conversation_stale','Начался новый день. Отправь сообщение ещё раз.',409);
        if(conflict.kind==='fight')turn={...turn,fightId:await startOlegFight(db,user,turn.id)};
      }
      const settings=await db.query<{enabled:boolean}>('select enabled from bar_memory_settings where user_id=$1 and character_id=$2 for update',[user,character]);
      const enabled=settings.rows[0]?.enabled ?? true;
      const { rows } = await db.query<Row>(
        `update bar_conversations set turns=turns || $4::jsonb,revision=revision+1,pending_id=null,pending_until=null
         where user_id=$1 and character_id=$2 and pending_id=$3 and pending_until>now() returning revision,turns,false as pending`,
        [user, character, turn.id, JSON.stringify([turn])],
      );
      if (!rows[0]) throw new Error('reservation_lost');
      if (enabled && usedStoryIds.length) {
        const authored = new Set(personaOf(character).biography.stories.map(story => story.id));
        const dynamic = await db.query<{ id: string }>(
          'select id::text from bar_character_stories where character_id=$1 and id::text=any($2::text[])',
          [character, usedStoryIds],
        );
        const valid = new Set([...authored, ...dynamic.rows.map(story => story.id)]);
        for (const id of [...new Set(usedStoryIds)].filter(id => valid.has(id)).slice(0, 4))
          await db.query(`insert into bar_told_stories(user_id,character_id,story_id,first_turn_id,last_turn_id)
            values($1,$2,$3,$4,$4) on conflict(user_id,character_id,story_id) do update
            set last_turn_id=excluded.last_turn_id,last_told_at=now()`, [user,character,id,turn.id]);
      }
      if(enabled) await db.query(`insert into bar_memory_jobs(user_id,character_id,target_revision) values($1,$2,$3)
        on conflict(user_id,character_id) do update set target_revision=excluded.target_revision,attempts=0,next_at=now()`, [user,character,rows[0].revision]);
      const active = await db.query<{ interventionActive: boolean }>(
        `select coalesce(c.day=(now() at time zone coalesce(u.timezone,'UTC'))::date and c.intervening,false) as "interventionActive"
         from users u left join bar_conflicts c on c.user_id=u.id where u.id=$1`, [user]);
      await db.query('commit');
      return {...rows[0], interventionActive: active.rows[0]?.interventionActive ?? false};
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }
  }
  async release(user: string, character: Character, id: string) {
    await this.pool.query(
      `update bar_conversations set pending_id=null,pending_until=null where user_id=$1 and character_id=$2 and pending_id=$3`,
      [user, character, id],
    );
  }
}
