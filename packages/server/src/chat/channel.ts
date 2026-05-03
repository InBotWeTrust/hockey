import type { Pool } from 'pg';
import type {
  ChannelPostCommentDTO,
  ChannelPostCommentRow,
  ChannelPostReactionUserDTO,
  ChannelPostViewerDTO,
  ChatMessageDTO,
  MessageReactionRow,
  MessageRow,
} from './types.js';
import { toChannelPostCommentDTO, toChatMessageDTO, groupReactions } from './dto.js';
import { MessageNotFoundError } from './errors.js';
import { AppError } from '../plugins/errors.js';

export async function isAdminUser(pool: Pool, userId: string): Promise<boolean> {
  const r = await pool.query<{ role: 'player' | 'admin' }>(`select role from users where id = $1`, [
    userId,
  ]);
  return r.rows[0]?.role === 'admin';
}

export async function assertAdminUser(pool: Pool, userId: string): Promise<void> {
  if (!(await isAdminUser(pool, userId))) {
    throw new AppError('forbidden', 'admin role required', 403);
  }
}

export async function getChannelPost(
  pool: Pool,
  postId: string,
  currentUserId: string,
): Promise<ChatMessageDTO> {
  const post = await pool.query<MessageRow>(
    `select m.*,
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
       join chats c on c.id = m.chat_id and c.type = 'channel' and c.is_active = true
       left join users u on u.id = m.sender_id
      where m.id = $1
        and m.is_deleted = false
      limit 1`,
    [postId],
  );
  if (post.rowCount === 0) throw new MessageNotFoundError(postId);

  const reactions = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = $1`,
    [postId],
  );
  const grouped = groupReactions(reactions.rows, currentUserId);
  return toChatMessageDTO(post.rows[0]!, grouped.get(postId) ?? []);
}

export async function recordChannelPostViews(
  pool: Pool,
  userId: string,
  postIds: string[],
): Promise<void> {
  if (postIds.length === 0) return;
  await pool.query(
    `insert into channel_post_views (post_message_id, user_id)
     select id, $2
       from unnest($1::uuid[]) as post_ids(id)
     on conflict (post_message_id, user_id)
       do update set last_viewed_at = now(),
                     view_count = channel_post_views.view_count + 1`,
    [postIds, userId],
  );
}

export async function getChannelPostComments(
  pool: Pool,
  postId: string,
): Promise<ChannelPostCommentDTO[]> {
  await getChannelPost(pool, postId, '00000000-0000-0000-0000-000000000000');
  const rows = await pool.query<ChannelPostCommentRow>(
    `select c.*,
            u.display_name as author_display_name,
            u.avatar_url as author_avatar_url
       from channel_post_comments c
       left join users u on u.id = c.author_id
      where c.post_message_id = $1
        and c.is_deleted = false
      order by c.created_at asc`,
    [postId],
  );
  return rows.rows.map(toChannelPostCommentDTO);
}

export async function addChannelPostComment(
  pool: Pool,
  postId: string,
  authorId: string,
  content: string,
): Promise<ChannelPostCommentDTO> {
  await getChannelPost(pool, postId, authorId);
  const row = await pool.query<ChannelPostCommentRow>(
    `with ins as (
       insert into channel_post_comments (post_message_id, author_id, content)
       values ($1, $2, $3)
       returning *
     )
     select ins.*,
            u.display_name as author_display_name,
            u.avatar_url as author_avatar_url
       from ins
       left join users u on u.id = ins.author_id`,
    [postId, authorId, content],
  );
  return toChannelPostCommentDTO(row.rows[0]!);
}

export async function getChannelPostViewers(
  pool: Pool,
  postId: string,
): Promise<ChannelPostViewerDTO[]> {
  await getChannelPost(pool, postId, '00000000-0000-0000-0000-000000000000');
  const rows = await pool.query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    first_viewed_at: Date;
    last_viewed_at: Date;
    view_count: number;
  }>(
    `select v.user_id, u.display_name, u.avatar_url,
            v.first_viewed_at, v.last_viewed_at, v.view_count
       from channel_post_views v
       join users u on u.id = v.user_id
      where v.post_message_id = $1
      order by v.last_viewed_at desc`,
    [postId],
  );
  return rows.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    firstViewedAt: row.first_viewed_at.toISOString(),
    lastViewedAt: row.last_viewed_at.toISOString(),
    viewCount: row.view_count,
  }));
}

export async function getChannelPostReactionUsers(
  pool: Pool,
  postId: string,
): Promise<ChannelPostReactionUserDTO[]> {
  await getChannelPost(pool, postId, '00000000-0000-0000-0000-000000000000');
  const rows = await pool.query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    emoji: string;
    created_at: Date;
  }>(
    `select r.user_id, u.display_name, u.avatar_url, r.emoji, r.created_at
       from message_reactions r
       join users u on u.id = r.user_id
      where r.message_id = $1
      order by r.created_at desc`,
    [postId],
  );
  return rows.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    emoji: row.emoji,
    reactedAt: row.created_at.toISOString(),
  }));
}
