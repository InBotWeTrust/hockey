import type { Pool } from 'pg';
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
    const { rows } = await this.pool.query<Row>(
      `select revision,turns,(pending_until > now()) as pending from bar_conversations where user_id=$1 and character_id=$2`,
      [user, character],
    );
    const row = rows[0];
    return row ? { ...row, pending: !!row.pending } : { revision: 0, turns: [], pending: false };
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
              `update bar_conversations set pending_id=$3,pending_until=now()+interval '60 seconds' where user_id=$1 and character_id=$2`,
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
  ): Promise<ConversationRecord> {
    const { rows } = await this.pool.query<Row>(
      `update bar_conversations set turns=turns || $4::jsonb,revision=revision+1,pending_id=null,pending_until=null where user_id=$1 and character_id=$2 and pending_id=$3 returning revision,turns,false as pending`,
      [user, character, turn.id, JSON.stringify([turn])],
    );
    if (!rows[0]) throw new Error('reservation_lost');
    return rows[0];
  }
  async release(user: string, character: Character, id: string) {
    await this.pool.query(
      `update bar_conversations set pending_id=null,pending_until=null where user_id=$1 and character_id=$2 and pending_id=$3`,
      [user, character, id],
    );
  }
}
