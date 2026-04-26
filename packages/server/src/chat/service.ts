import type { Pool } from 'pg';
import type { ChatDTO, ChatRow, MessageRow, ChatMessageDTO, MessageReactionRow } from './types.js';
import { toChatDTO, type ChatListAggregate, toChatMessageDTO, groupReactions } from './dto.js';
import { InvalidInputError } from './errors.js';

interface DmCounterpartRow {
  chat_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface MyChatsRow {
  id: string;
  type: 'direct' | 'group' | 'system';
  name: string | null;
  created_by: string;
  entity_type: 'team' | 'tournament' | null;
  entity_id: string | null;
  last_message_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: Date | null;
  last_message_is_deleted: boolean | null;
  last_message_reply_to_id: string | null;
  last_message_updated_at: Date | null;
  unread_count: string;
}

export async function getMyChats(pool: Pool, userId: string): Promise<ChatDTO[]> {
  const sql = `
    with my_chat_ids as (
      select chat_id from chat_members where user_id = $1
      union
      select id from chats where type = 'system' and is_active = true
    )
    select
      c.*,
      lm.id as last_message_id,
      lm.content as last_message_content,
      lm.sender_id as last_message_sender_id,
      lm.created_at as last_message_created_at,
      lm.is_deleted as last_message_is_deleted,
      lm.reply_to_id as last_message_reply_to_id,
      lm.updated_at as last_message_updated_at,
      coalesce(unread.cnt, 0)::bigint as unread_count
    from chats c
    left join lateral (
      select id, content, sender_id, created_at, is_deleted, reply_to_id, updated_at
      from messages
      where chat_id = c.id and is_deleted = false
      order by created_at desc
      limit 1
    ) lm on true
    left join lateral (
      select count(*) as cnt
      from messages m
      left join chat_members cm
        on cm.chat_id = c.id and cm.user_id = $1
      where m.chat_id = c.id
        and m.is_deleted = false
        and m.sender_id != $1
        and m.created_at > coalesce(cm.last_read_at, '1970-01-01'::timestamptz)
    ) unread on true
    where c.id in (select chat_id from my_chat_ids)
      and c.is_active = true
    order by c.last_message_at desc nulls last
  `;
  const r = await pool.query<MyChatsRow>(sql, [userId]);
  if (!r.rowCount) return [];

  const dmChatIds = r.rows.filter((row) => row.type === 'direct').map((row) => row.id);
  const counterparts = new Map<string, ChatDTO['dmCounterpart']>();
  if (dmChatIds.length > 0) {
    const cpSql = `
      select cm.chat_id, u.id as user_id, u.display_name, u.avatar_url
      from chat_members cm
      join users u on u.id = cm.user_id
      where cm.chat_id = any($1::uuid[]) and cm.user_id != $2
    `;
    const cp = await pool.query<DmCounterpartRow>(cpSql, [dmChatIds, userId]);
    for (const row of cp.rows) {
      counterparts.set(row.chat_id, {
        userId: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      });
    }
  }

  return r.rows.map((row) => {
    const chat: ChatRow = {
      id: row.id,
      type: row.type,
      name: row.name,
      created_by: row.created_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      last_message_at: row.last_message_at,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    const lastMessage: MessageRow | null = row.last_message_id
      ? {
          id: row.last_message_id,
          chat_id: row.id,
          sender_id: row.last_message_sender_id!,
          content: row.last_message_content!,
          reply_to_id: row.last_message_reply_to_id,
          is_deleted: row.last_message_is_deleted!,
          created_at: row.last_message_created_at!,
          updated_at: row.last_message_updated_at!,
        }
      : null;
    const agg: ChatListAggregate = {
      chat,
      lastMessage,
      unreadCount: Number(row.unread_count),
      dmCounterpart: row.type === 'direct' ? (counterparts.get(row.id) ?? null) : null,
    };
    return toChatDTO(agg);
  });
}

export interface GetMessagesOpts {
  limit: number;
  before?: string; // ISO timestamp; messages older than this
}

export async function getMessages(
  pool: Pool,
  chatId: string,
  currentUserId: string,
  opts: GetMessagesOpts,
): Promise<ChatMessageDTO[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const params: unknown[] = [chatId];
  let beforeClause = '';
  if (opts.before) {
    params.push(opts.before);
    beforeClause = `and m.created_at < $${params.length}`;
  }
  params.push(limit);
  const sql = `
    select m.*
    from messages m
    where m.chat_id = $1
      ${beforeClause}
    order by m.created_at desc
    limit $${params.length}
  `;
  const r = await pool.query<MessageRow>(sql, params);
  if (r.rowCount === 0) return [];

  const messageIds = r.rows.map((row) => row.id);
  const rxns = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = any($1::uuid[])`,
    [messageIds],
  );
  const grouped = groupReactions(rxns.rows, currentUserId);

  return r.rows.map((row) => toChatMessageDTO(row, grouped.get(row.id) ?? []));
}

export interface SendMessageOpts {
  chatId: string;
  senderId: string;
  content: string;
  replyToId?: string;
}

export async function sendMessage(pool: Pool, opts: SendMessageOpts): Promise<ChatMessageDTO> {
  // Lazy-upsert membership so unread/lastRead works for system-channel senders.
  await pool.query(
    `insert into chat_members (chat_id, user_id) values ($1, $2)
     on conflict (chat_id, user_id) do nothing`,
    [opts.chatId, opts.senderId],
  );
  const r = await pool.query<MessageRow>(
    `insert into messages (chat_id, sender_id, content, reply_to_id)
     values ($1, $2, $3, $4) returning *`,
    [opts.chatId, opts.senderId, opts.content, opts.replyToId ?? null],
  );
  return toChatMessageDTO(r.rows[0]!);
}

export async function deleteMessage(pool: Pool, messageId: string): Promise<void> {
  await pool.query(
    `update messages set is_deleted = true, content = '', updated_at = now() where id = $1`,
    [messageId],
  );
}

export async function markChatAsRead(
  pool: Pool,
  chatId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into chat_members (chat_id, user_id, last_read_at)
     values ($1, $2, now())
     on conflict (chat_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [chatId, userId],
  );
}

export interface FindOrCreateDMResult {
  chatId: string;
  created: boolean;
}

export async function findOrCreateDM(
  pool: Pool,
  userA: string,
  userB: string,
): Promise<FindOrCreateDMResult> {
  if (userA === userB) {
    throw new InvalidInputError('Cannot create a DM with yourself');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Advisory lock keyed on the unordered pair: same lock id regardless of arg order.
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended(least($1, $2)::text || greatest($1, $2)::text, 0))`,
      [userA, userB],
    );

    const existing = await client.query<{ id: string }>(
      `select c.id
       from chats c
       join chat_members m1 on m1.chat_id = c.id and m1.user_id = $1
       join chat_members m2 on m2.chat_id = c.id and m2.user_id = $2
       where c.type = 'direct' and c.is_active = true
       limit 1`,
      [userA, userB],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('commit');
      return { chatId: existing.rows[0]!.id, created: false };
    }

    const created = await client.query<{ id: string }>(
      `insert into chats (type, created_by) values ('direct', $1) returning id`,
      [userA],
    );
    const chatId = created.rows[0]!.id;
    await client.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`,
      [chatId, userA, userB],
    );
    await client.query('commit');
    return { chatId, created: true };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export interface UserPickerItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function searchUsers(
  pool: Pool,
  currentUserId: string,
  opts: { q: string; limit: number },
): Promise<UserPickerItem[]> {
  const q = opts.q.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(opts.limit, 1), 50);
  const r = await pool.query<{ id: string; display_name: string; avatar_url: string | null }>(
    `select id, display_name, avatar_url from users
     where id != $1 and display_name ilike '%' || $2 || '%'
     order by similarity(display_name, $2) desc
     limit $3`,
    [currentUserId, q, limit],
  );
  return r.rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));
}

export interface MessageSearchHit {
  id: string;
  chatId: string;
  content: string;
  senderName: string;
  createdAt: string;
}

export async function searchMessages(
  pool: Pool,
  currentUserId: string,
  opts: { q: string; limit: number },
): Promise<MessageSearchHit[]> {
  const q = opts.q.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const r = await pool.query<{
    id: string;
    chat_id: string;
    content: string;
    sender_name: string;
    created_at: Date;
  }>(
    `select m.id, m.chat_id, m.content, u.display_name as sender_name, m.created_at
     from messages m
     join users u on u.id = m.sender_id
     where m.chat_id in (
       select chat_id from chat_members where user_id = $1
       union
       select id from chats where type = 'system' and is_active = true
     )
       and m.is_deleted = false
       and m.search_vector @@ plainto_tsquery('russian', $2)
     order by m.created_at desc
     limit $3`,
    [currentUserId, q, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    content: row.content,
    senderName: row.sender_name,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function getUnreadCounts(
  pool: Pool,
  userId: string,
): Promise<Record<string, number>> {
  const sql = `
    select m.chat_id, count(m.id)::bigint as cnt
    from messages m
    join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = $1
    where m.created_at > cm.last_read_at
      and m.sender_id != $1
      and m.is_deleted = false
    group by m.chat_id
  `;
  const r = await pool.query<{ chat_id: string; cnt: string }>(sql, [userId]);
  const out: Record<string, number> = {};
  for (const row of r.rows) {
    out[row.chat_id] = Number(row.cnt);
  }
  return out;
}
