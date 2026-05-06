import type { Pool } from 'pg';
import type {
  ChatDTO,
  ChatRow,
  MessageRow,
  ChatMessageDTO,
  MessageReactionRow,
  AddReactionResult,
  UserPublicProfileDTO,
} from './types.js';
import { toChatDTO, type ChatListAggregate, toChatMessageDTO, groupReactions } from './dto.js';
import { hydrateChannelPolls } from './channel.js';
import {
  ChatNotFoundError,
  InvalidInputError,
  MessageNotFoundError,
  PinLimitExceededError,
} from './errors.js';
import { buildProfileProgress } from '../profile/summary.js';

export const PIN_LIMIT = 3;

interface DmCounterpartRow {
  chat_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: Date | null;
  last_read_at: Date | null;
}

interface MyChatsRow {
  id: string;
  type: 'direct' | 'group' | 'system' | 'channel';
  name: string | null;
  description: string | null;
  created_by: string;
  entity_type: 'team' | 'tournament' | null;
  entity_id: string | null;
  channel_slug: string | null;
  last_message_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_metadata: Record<string, unknown> | null;
  last_message_sender_id: string | null;
  last_message_sender_name: string | null;
  last_message_created_at: Date | null;
  last_message_is_deleted: boolean | null;
  last_message_reply_to_id: string | null;
  last_message_updated_at: Date | null;
  unread_count: string;
  member_count: string;
  pinned_at: Date | null;
}

export const DEFAULT_NEWS_CHANNEL_SLUG = 'news';
export const DEFAULT_NEWS_CHANNEL_NAME = 'Новости игры';

export async function ensureDefaultNewsChannel(
  pool: Pool,
  createdByUserId: string,
): Promise<ChatRow> {
  const existing = await pool.query<ChatRow>(
    `select * from chats
      where type = 'channel'
        and channel_slug = $1
        and is_active = true
      limit 1`,
    [DEFAULT_NEWS_CHANNEL_SLUG],
  );
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0]!;

  const inserted = await pool.query<ChatRow>(
    `insert into chats (type, name, channel_slug, created_by)
     values ('channel', $1, $2, $3)
     on conflict do nothing
     returning *`,
    [DEFAULT_NEWS_CHANNEL_NAME, DEFAULT_NEWS_CHANNEL_SLUG, createdByUserId],
  );
  if (inserted.rowCount && inserted.rowCount > 0) return inserted.rows[0]!;

  const raced = await pool.query<ChatRow>(
    `select * from chats
      where type = 'channel'
        and channel_slug = $1
        and is_active = true
      limit 1`,
    [DEFAULT_NEWS_CHANNEL_SLUG],
  );
  if (raced.rowCount && raced.rowCount > 0) return raced.rows[0]!;
  throw new Error('ensureDefaultNewsChannel: failed to create news channel');
}

export async function getMyChats(pool: Pool, userId: string): Promise<ChatDTO[]> {
  await ensureDefaultNewsChannel(pool, userId);

  // Auto-pin every active system channel the user has never seen before.
  // Per-chat NOT EXISTS check (rather than "user has no pinned rows") so an
  // explicit unpin — recorded as `pinned_at = NULL` on a real chat_members
  // row — stays sticky on subsequent /chat/list calls. ON CONFLICT covers
  // the rare race of two parallel list calls hitting the same gap.
  await pool.query(
    `insert into chat_members (chat_id, user_id, pinned_at)
     select c.id, $1, now()
       from chats c
      where c.type = 'system'
        and c.is_active = true
        and not exists (
          select 1 from chat_members cm
           where cm.chat_id = c.id and cm.user_id = $1
        )
     on conflict (chat_id, user_id) do nothing`,
    [userId],
  );

  const sql = `
    with my_chat_ids as (
      select chat_id from chat_members where user_id = $1
      union
      select id from chats where type = 'system' and is_active = true
      union
      select id from chats where type = 'channel' and is_active = true
    )
    select
      c.*,
      lm.id as last_message_id,
      lm.content as last_message_content,
      lm.metadata as last_message_metadata,
      lm.sender_id as last_message_sender_id,
      lu.display_name as last_message_sender_name,
      lm.created_at as last_message_created_at,
      lm.is_deleted as last_message_is_deleted,
      lm.reply_to_id as last_message_reply_to_id,
      lm.updated_at as last_message_updated_at,
      coalesce(unread.cnt, 0)::bigint as unread_count,
      mc.cnt::bigint as member_count,
      cm_self.pinned_at as pinned_at
    from chats c
    left join chat_members cm_self
      on cm_self.chat_id = c.id and cm_self.user_id = $1
    left join lateral (
      select id, content, metadata, sender_id, created_at, is_deleted, reply_to_id, updated_at
      from messages
      where chat_id = c.id and is_deleted = false
      order by created_at desc
      limit 1
    ) lm on true
    left join users lu on lu.id = lm.sender_id
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
    left join lateral (
      -- System channels are open to every active user (chat_members is lazy);
      -- count users instead. Direct/group rely on explicit membership rows.
      select case
        when c.type in ('system', 'channel') then (select count(*) from users)
        else (select count(*) from chat_members where chat_id = c.id)
      end as cnt
    ) mc on true
    where c.id in (select chat_id from my_chat_ids)
      and c.is_active = true
    order by (c.type = 'channel') desc,
             cm_self.pinned_at desc nulls last,
             c.last_message_at desc nulls last
  `;
  const r = await pool.query<MyChatsRow>(sql, [userId]);
  if (!r.rowCount) return [];

  const dmChatIds = r.rows.filter((row) => row.type === 'direct').map((row) => row.id);
  const counterparts = new Map<string, ChatDTO['dmCounterpart']>();
  if (dmChatIds.length > 0) {
    const cpSql = `
      select cm.chat_id, u.id as user_id, u.display_name, u.avatar_url, u.last_seen_at,
             cm.last_read_at
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
        lastSeenAt: row.last_seen_at !== null ? row.last_seen_at.toISOString() : null,
        lastReadAt: row.last_read_at !== null ? row.last_read_at.toISOString() : null,
      });
    }
  }

  return r.rows.map((row) => {
    const chat: ChatRow = {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      created_by: row.created_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      channel_slug: row.channel_slug,
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
          metadata: row.last_message_metadata ?? {},
          reply_to_id: row.last_message_reply_to_id,
          is_deleted: row.last_message_is_deleted!,
          created_at: row.last_message_created_at!,
          updated_at: row.last_message_updated_at!,
        }
      : null;
    const agg: ChatListAggregate = {
      chat,
      lastMessage,
      lastMessageSenderName: row.last_message_sender_name,
      unreadCount: Number(row.unread_count),
      dmCounterpart: row.type === 'direct' ? (counterparts.get(row.id) ?? null) : null,
      memberCount: Number(row.member_count),
      pinnedAt: row.pinned_at,
    };
    return toChatDTO(agg);
  });
}

export async function pinChat(pool: Pool, userId: string, chatId: string): Promise<void> {
  // Atomic: count currently-pinned and conditionally upsert in one transaction
  // so two parallel pin requests can't both squeeze past a 2-pinned check and
  // exceed the limit.
  const client = await pool.connect();
  try {
    await client.query('begin');
    const cur = await client.query<{ cnt: string; mine: boolean }>(
      `select count(*)::bigint as cnt,
              bool_or(chat_id = $2) as mine
         from chat_members
        where user_id = $1 and pinned_at is not null`,
      [userId, chatId],
    );
    const cnt = Number(cur.rows[0]?.cnt ?? 0);
    const mine = cur.rows[0]?.mine ?? false;
    if (!mine && cnt >= PIN_LIMIT) {
      await client.query('rollback');
      throw new PinLimitExceededError(PIN_LIMIT);
    }
    await client.query(
      `insert into chat_members (chat_id, user_id, pinned_at)
       values ($1, $2, now())
       on conflict (chat_id, user_id)
         do update set pinned_at = excluded.pinned_at`,
      [chatId, userId],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const CHAT_INFO_MEMBERS_LIMIT = 100;

export async function getChatInfo(
  pool: Pool,
  chatId: string,
): Promise<{
  id: string;
  type: 'direct' | 'group' | 'system' | 'channel';
  name: string | null;
  description: string | null;
  memberCount: number;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
}> {
  // Caller is expected to have already passed assertCanAccessChat. This
  // returns chat metadata + a capped, alphabetised member list. For system
  // chats we treat every active user as a member (chat_members is lazy);
  // for group/direct we use the explicit chat_members rows.
  const chatRes = await pool.query<{
    id: string;
    type: 'direct' | 'group' | 'system' | 'channel';
    name: string | null;
    description: string | null;
  }>(`select id, type, name, description from chats where id = $1 and is_active = true`, [chatId]);
  if (chatRes.rowCount === 0) {
    throw new ChatNotFoundError(chatId);
  }
  const chat = chatRes.rows[0]!;

  let memberCount: number;
  let members: { userId: string; displayName: string; avatarUrl: string | null }[];

  if (chat.type === 'system' || chat.type === 'channel') {
    const total = await pool.query<{ c: string }>(`select count(*)::bigint as c from users`);
    memberCount = Number(total.rows[0]!.c);
    const r = await pool.query<{ id: string; display_name: string; avatar_url: string | null }>(
      `select id, display_name, avatar_url from users
       order by display_name asc limit $1`,
      [CHAT_INFO_MEMBERS_LIMIT],
    );
    members = r.rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }));
  } else {
    const total = await pool.query<{ c: string }>(
      `select count(*)::bigint as c from chat_members where chat_id = $1`,
      [chatId],
    );
    memberCount = Number(total.rows[0]!.c);
    const r = await pool.query<{ id: string; display_name: string; avatar_url: string | null }>(
      `select u.id, u.display_name, u.avatar_url
         from chat_members cm
         join users u on u.id = cm.user_id
        where cm.chat_id = $1
        order by u.display_name asc
        limit $2`,
      [chatId, CHAT_INFO_MEMBERS_LIMIT],
    );
    members = r.rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }));
  }

  return {
    id: chat.id,
    type: chat.type,
    name: chat.name,
    description: chat.description,
    memberCount,
    members,
  };
}

export async function getUserPublicProfile(
  pool: Pool,
  userId: string,
): Promise<UserPublicProfileDTO | null> {
  const r = await pool.query<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    level: number;
    timezone: string;
    lifetime_shots_total: number;
    lifetime_goals_total: number;
    created_at: Date;
    last_seen_at: Date | null;
  }>(
    `select id, display_name, avatar_url, level, timezone,
            lifetime_shots_total, lifetime_goals_total,
            created_at, last_seen_at
       from users
      where id = $1`,
    [userId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  const profileProgress = await buildProfileProgress(pool, row);

  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    competitionLevel: profileProgress.competitionLevel,
    stats: profileProgress.stats,
    achievements: profileProgress.achievements,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at !== null ? row.last_seen_at.toISOString() : null,
  };
}

export async function unpinChat(pool: Pool, userId: string, chatId: string): Promise<void> {
  // Lazy upsert: a system chat the user has never written to has no
  // chat_members row yet. Insert with pinned_at = NULL to record the explicit
  // unpin (so the auto-pin fallback in getMyChats does not re-add it).
  await pool.query(
    `insert into chat_members (chat_id, user_id, pinned_at)
     values ($1, $2, null)
     on conflict (chat_id, user_id)
       do update set pinned_at = null`,
    [chatId, userId],
  );
}

export interface GetMessagesOpts {
  limit: number;
  before?: string; // ISO timestamp; messages older than this
  after?: string; // ISO timestamp; messages newer than this
  around?: string; // message UUID; load ±radius messages centered on this anchor
  radius?: number; // default 25, used only with `around`
}

export async function getMessages(
  pool: Pool,
  chatId: string,
  currentUserId: string,
  opts: GetMessagesOpts,
): Promise<ChatMessageDTO[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);

  let rows: MessageRow[];
  if (opts.around !== undefined) {
    const radius = Math.min(Math.max(opts.radius ?? 25, 1), 50);
    const anchorRes = await pool.query<{ created_at: Date }>(
      `select created_at from messages
       where id = $1 and chat_id = $2 and is_deleted = false`,
      [opts.around, chatId],
    );
    if (anchorRes.rowCount === 0) {
      throw new MessageNotFoundError(opts.around);
    }
    const anchorAt = anchorRes.rows[0]!.created_at.toISOString();
    const r = await pool.query<MessageRow>(
      `with anchor as (select $2::timestamptz as ts),
            lower_bound as (
              select created_at from messages
               where chat_id = $1 and is_deleted = false
                 and created_at <= (select ts from anchor)
               order by created_at desc
               offset $3 limit 1
            ),
            upper_bound as (
              select created_at from messages
               where chat_id = $1 and is_deleted = false
                 and created_at >= (select ts from anchor)
               order by created_at asc
               offset $3 limit 1
            )
       select m.*,
              u.display_name as sender_display_name,
              u.avatar_url as sender_avatar_url,
              (select count(*)::bigint
                 from channel_post_comments cpc
                where cpc.post_message_id = m.id
                  and cpc.is_deleted = false) as comment_count,
              (select count(*)::bigint
                 from channel_post_views cpv
                where cpv.post_message_id = m.id) as view_count
         from messages m
         left join users u on u.id = m.sender_id
        where m.chat_id = $1 and m.is_deleted = false
          and m.created_at >= coalesce(
                (select created_at from lower_bound),
                (select min(created_at) from messages where chat_id = $1 and is_deleted = false))
          and m.created_at <= coalesce(
                (select created_at from upper_bound),
                (select max(created_at) from messages where chat_id = $1 and is_deleted = false))
        order by m.created_at asc`,
      [chatId, anchorAt, radius],
    );
    rows = r.rows;
  } else {
    const params: unknown[] = [chatId];
    let whereExtra = '';
    let orderClause = 'order by m.created_at desc';
    if (opts.before !== undefined) {
      params.push(opts.before);
      whereExtra += ` and m.created_at < $${params.length}`;
    }
    if (opts.after !== undefined) {
      params.push(opts.after);
      whereExtra += ` and m.created_at > $${params.length}`;
      orderClause = 'order by m.created_at asc';
    }
    params.push(limit);
    const sql = `
      select m.*,
             u.display_name as sender_display_name,
             u.avatar_url as sender_avatar_url,
             (select count(*)::bigint
                from channel_post_comments cpc
               where cpc.post_message_id = m.id
                 and cpc.is_deleted = false) as comment_count,
             (select count(*)::bigint
                from channel_post_views cpv
               where cpv.post_message_id = m.id) as view_count
      from messages m
      left join users u on u.id = m.sender_id
      where m.chat_id = $1
        ${whereExtra}
      ${orderClause}
      limit $${params.length}
    `;
    const r = await pool.query<MessageRow>(sql, params);
    rows = r.rows;
  }

  if (rows.length === 0) return [];

  const messageIds = rows.map((row) => row.id);
  const rxns = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = any($1::uuid[])`,
    [messageIds],
  );
  const grouped = groupReactions(rxns.rows, currentUserId);

  const dtos = rows.map((row) => toChatMessageDTO(row, grouped.get(row.id) ?? []));
  return await hydrateChannelPolls(pool, dtos, currentUserId);
}

export interface SendMessageOpts {
  chatId: string;
  senderId: string;
  content: string;
  replyToId?: string;
  pollOptions?: string[];
  metadata?: Record<string, unknown>;
}

export async function sendMessage(pool: Pool, opts: SendMessageOpts): Promise<ChatMessageDTO> {
  const pollOptions = opts.pollOptions ?? [];
  if (pollOptions.length > 3) {
    throw new InvalidInputError('Poll can have at most 3 options');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    // Lazy-upsert membership so unread/lastRead works for system-channel senders.
    await client.query(
      `insert into chat_members (chat_id, user_id) values ($1, $2)
       on conflict (chat_id, user_id) do nothing`,
      [opts.chatId, opts.senderId],
    );
    const r = await client.query<MessageRow>(
      `with ins as (
         insert into messages (chat_id, sender_id, content, reply_to_id, metadata)
         values ($1, $2, $3, $4, $5::jsonb)
         returning *
       )
       select ins.*,
              u.display_name as sender_display_name,
              u.avatar_url as sender_avatar_url,
              '0'::bigint as comment_count,
              '0'::bigint as view_count
         from ins
         left join users u on u.id = ins.sender_id`,
      [
        opts.chatId,
        opts.senderId,
        opts.content,
        opts.replyToId ?? null,
        JSON.stringify(opts.metadata ?? {}),
      ],
    );
    const row = r.rows[0]!;
    if (pollOptions.length > 0) {
      await client.query(`insert into channel_post_polls (post_message_id) values ($1)`, [row.id]);
      for (const [index, text] of pollOptions.entries()) {
        await client.query(
          `insert into channel_post_poll_options (post_message_id, position, text)
           values ($1, $2, $3)`,
          [row.id, index + 1, text],
        );
      }
    }
    await client.query('commit');

    const dto = toChatMessageDTO(row);
    if (pollOptions.length === 0) return dto;
    const hydrated = await hydrateChannelPolls(pool, [dto], opts.senderId);
    return hydrated[0]!;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMessage(pool: Pool, messageId: string): Promise<void> {
  await pool.query(
    `update messages set is_deleted = true, content = '', updated_at = now() where id = $1`,
    [messageId],
  );
}

export async function markChatAsRead(pool: Pool, chatId: string, userId: string): Promise<void> {
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
    await client.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
      chatId,
      userA,
      userB,
    ]);
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
     join chats c on c.id = m.chat_id and c.is_active = true
     where m.chat_id in (
       select chat_id from chat_members where user_id = $1
       union
       select id from chats where type = 'system' and is_active = true
       union
       select id from chats where type = 'channel' and is_active = true
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

export async function getUnreadCounts(pool: Pool, userId: string): Promise<Record<string, number>> {
  await ensureDefaultNewsChannel(pool, userId);

  const sql = `
    with accessible_chats as (
      select c.id
        from chats c
        left join chat_members cm_access
          on cm_access.chat_id = c.id and cm_access.user_id = $1
       where c.is_active = true
         and (c.type in ('system', 'channel') or cm_access.user_id is not null)
    )
    select m.chat_id, count(m.id)::bigint as cnt
    from messages m
    join accessible_chats ac on ac.id = m.chat_id
    left join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = $1
    where m.created_at > coalesce(cm.last_read_at, '1970-01-01'::timestamptz)
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

export async function getMessageOr404(pool: Pool, messageId: string): Promise<MessageRow> {
  // Soft-deleted messages are tombstones — every other reader in this file
  // excludes them, and reactions/replies must not target them either.
  const r = await pool.query<MessageRow>(
    `select * from messages where id = $1 and is_deleted = false`,
    [messageId],
  );
  if (r.rowCount === 0) throw new MessageNotFoundError(messageId);
  return r.rows[0]!;
}

export async function addReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<AddReactionResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Drop a previous reaction by this user on this message (only if it's a different emoji).
    const del = await client.query<{ emoji: string }>(
      `delete from message_reactions
       where message_id = $1 and user_id = $2 and emoji != $3
       returning emoji`,
      [messageId, userId, emoji],
    );
    // Insert the new one; if (message,user,emoji) already exists, no-op.
    const ins = await client.query<{ id: string }>(
      `insert into message_reactions (message_id, user_id, emoji)
       values ($1, $2, $3)
       on conflict (message_id, user_id) do nothing
       returning id`,
      [messageId, userId, emoji],
    );
    await client.query('commit');
    return {
      added: ins.rowCount && ins.rowCount > 0 ? emoji : null,
      removed: del.rowCount && del.rowCount > 0 ? del.rows[0]!.emoji : null,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeReaction(
  pool: Pool,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<{ removed: boolean }> {
  const r = await pool.query(
    `delete from message_reactions
     where message_id = $1 and user_id = $2 and emoji = $3`,
    [messageId, userId, emoji],
  );
  return { removed: (r.rowCount ?? 0) > 0 };
}
