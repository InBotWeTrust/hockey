import type { Pool } from 'pg';
import type { ChatRow, MessageRow } from './types.js';
import { ChatAccessDeniedError, MessageNotFoundError, MessageNotOwnedError } from './errors.js';

export async function getChatById(pool: Pool, chatId: string): Promise<ChatRow | null> {
  const r = await pool.query<ChatRow>(
    `select c.* from chats c where c.id = $1 and c.is_active = true
       and not exists (
         select 1 from bar_match_chat b
           left join amateur_duel_match m on b.kind='duel' and m.id=b.match_id
           left join tournament_fixture f on b.kind='tournament' and f.id=b.match_id
           left join tournament t on t.id=f.tournament_id
          where b.chat_id=c.id and (
            (b.kind='duel' and (m.id is null or m.status not in ('active','settled','forfeit')))
            or (b.kind='tournament' and (t.id is null or t.visibility <> 'public'
                or t.status in ('draft','cancelled','archived','paused')))
          )
       ) limit 1`,
    [chatId],
  );
  return r.rowCount && r.rowCount > 0 ? r.rows[0]! : null;
}

export async function checkMembership(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `select exists(select 1 from chat_members where chat_id = $1 and user_id = $2) as exists`,
    [chatId, userId],
  );
  return r.rows[0]?.exists === true;
}

export interface AccessResult {
  chat: ChatRow;
  isMember: boolean; // false for system-channel access (lazy membership)
}

export async function canAccessChat(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<AccessResult | null> {
  const chat = await getChatById(pool, chatId);
  if (!chat) return null;
  if (chat.type === 'system' || chat.type === 'channel') return { chat, isMember: false };
  const isMember = await checkMembership(pool, userId, chatId);
  return isMember ? { chat, isMember: true } : null;
}

export async function assertCanAccessChat(
  pool: Pool,
  userId: string,
  chatId: string,
): Promise<ChatRow> {
  const result = await canAccessChat(pool, userId, chatId);
  if (!result) throw new ChatAccessDeniedError(chatId);
  return result.chat;
}

export async function assertOwnsMessage(
  pool: Pool,
  userId: string,
  messageId: string,
): Promise<MessageRow> {
  const r = await pool.query<MessageRow>(`select * from messages where id = $1 limit 1`, [
    messageId,
  ]);
  if (!r.rowCount) throw new MessageNotFoundError(messageId);
  const msg = r.rows[0]!;
  if (msg.sender_id !== userId) throw new MessageNotOwnedError(messageId);
  return msg;
}
