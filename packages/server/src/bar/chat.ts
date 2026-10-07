import type { Pool } from 'pg';
import { getBarLive } from './service.js';
import { ChatAccessDeniedError } from '../chat/errors.js';

/** One ordinary guarded chat per public fixture, shared across replay attempts. */
export async function joinBarChat(
  pool: Pool,
  userId: string,
  kind: 'duel' | 'tournament',
  id: string,
): Promise<{ chatId: string }> {
  const { match } = await getBarLive(pool, kind, id);
  if (!match || match.group === 'upcoming') throw new ChatAccessDeniedError(id);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `bar-chat:${kind}:${id}`,
    ]);
    const existing = await client.query<{ chat_id: string }>(
      'select chat_id from bar_match_chat where kind=$1 and match_id=$2',
      [kind, id],
    );
    let chatId = existing.rows[0]?.chat_id;
    if (!chatId) {
      const room = await client.query<{ id: string }>(
        "insert into chats (type, name, created_by) values ('group', $1, $2) returning id",
        [match.kind === 'duel' ? 'Трансляция дуэли' : 'Трансляция турнира', userId],
      );
      chatId = room.rows[0]!.id;
      await client.query('insert into bar_match_chat (kind, match_id, chat_id) values ($1,$2,$3)', [
        kind,
        id,
        chatId,
      ]);
    }
    await client.query(
      "insert into chat_members (chat_id,user_id,role) values ($1,$2,'member') on conflict (chat_id,user_id) do nothing",
      [chatId, userId],
    );
    await client.query('commit');
    return { chatId };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
