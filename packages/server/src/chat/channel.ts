import type { Pool } from 'pg';
import type {
  AddReactionResult,
  ChannelPollDTO,
  ChannelPostCommentDTO,
  ChannelPostCommentReactionRow,
  ChannelPostCommentRow,
  ChannelPostReactionUserDTO,
  ChannelPostViewerDTO,
  ChatMessageDTO,
  MessageReactionRow,
  MessageRow,
} from './types.js';
import {
  toChannelPostCommentDTO,
  toChatMessageDTO,
  groupCommentReactions,
  groupReactions,
} from './dto.js';
import { MessageNotFoundError } from './errors.js';
import { AppError } from '../plugins/errors.js';

type Queryable = Pick<Pool, 'query'>;

interface ChannelPollOptionAggregateRow {
  post_message_id: string;
  id: string;
  text: string;
  position: number;
  vote_count: string;
  selected_by_me: boolean | null;
}

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

export async function hydrateChannelPolls<T extends ChatMessageDTO>(
  pool: Queryable,
  posts: T[],
  currentUserId: string,
): Promise<T[]> {
  if (posts.length === 0) return posts;
  const postIds = posts.map((post) => post.id);
  const rows = await pool.query<ChannelPollOptionAggregateRow>(
    `select o.post_message_id,
            o.id,
            o.text,
            o.position,
            count(v.user_id)::bigint as vote_count,
            bool_or(v.user_id = $2) as selected_by_me
       from channel_post_poll_options o
       left join channel_post_poll_votes v
         on v.post_message_id = o.post_message_id
        and v.option_id = o.id
      where o.post_message_id = any($1::uuid[])
      group by o.post_message_id, o.id, o.text, o.position
      order by o.post_message_id, o.position asc`,
    [postIds, currentUserId],
  );
  if (rows.rowCount === 0) return posts;

  const byPost = new Map<string, ChannelPollOptionAggregateRow[]>();
  for (const row of rows.rows) {
    const existing = byPost.get(row.post_message_id);
    if (existing) existing.push(row);
    else byPost.set(row.post_message_id, [row]);
  }

  return posts.map((post) => {
    const options = byPost.get(post.id);
    if (!options) return post;
    const totalVotes = options.reduce((sum, option) => sum + Number(option.vote_count), 0);
    let myOptionId: string | null = null;
    const pollOptions: ChannelPollDTO['options'] = options.map((option) => {
      const voteCount = Number(option.vote_count);
      const selectedByMe = option.selected_by_me === true;
      if (selectedByMe) myOptionId = option.id;
      return {
        id: option.id,
        text: option.text,
        voteCount,
        percent: totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100),
        selectedByMe,
      };
    });
    return {
      ...post,
      poll: {
        totalVotes,
        myOptionId,
        options: pollOptions,
      },
    };
  });
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
  const hydrated = await hydrateChannelPolls(
    pool,
    [toChatMessageDTO(post.rows[0]!, grouped.get(postId) ?? [])],
    currentUserId,
  );
  return hydrated[0]!;
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
  currentUserId: string,
): Promise<ChannelPostCommentDTO[]> {
  await getChannelPost(pool, postId, currentUserId);
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
  const commentIds = rows.rows.map((row) => row.id);
  if (commentIds.length === 0) return [];
  const reactions = await pool.query<ChannelPostCommentReactionRow>(
    `select * from channel_post_comment_reactions where comment_id = any($1::uuid[])`,
    [commentIds],
  );
  const grouped = groupCommentReactions(reactions.rows, currentUserId);
  return rows.rows.map((row) => toChannelPostCommentDTO(row, grouped.get(row.id) ?? []));
}

export async function addChannelPostComment(
  pool: Pool,
  postId: string,
  authorId: string,
  content: string,
  replyToId?: string,
  metadata: Record<string, unknown> = {},
): Promise<ChannelPostCommentDTO> {
  await getChannelPost(pool, postId, authorId);
  if (replyToId !== undefined) {
    const replyTo = await pool.query<{ id: string }>(
      `select id
         from channel_post_comments
        where id = $1
          and post_message_id = $2
          and is_deleted = false
        limit 1`,
      [replyToId, postId],
    );
    if (replyTo.rowCount === 0) {
      throw new AppError('comment_not_found', `Comment ${replyToId} not found`, 404);
    }
  }
  const row = await pool.query<ChannelPostCommentRow>(
    `with ins as (
       insert into channel_post_comments (post_message_id, author_id, content, reply_to_id, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       returning *
     )
     select ins.*,
            u.display_name as author_display_name,
            u.avatar_url as author_avatar_url
       from ins
       left join users u on u.id = ins.author_id`,
    [postId, authorId, content, replyToId ?? null, JSON.stringify(metadata)],
  );
  return toChannelPostCommentDTO(row.rows[0]!, []);
}

export async function getChannelPostCommentOr404(
  pool: Pool,
  commentId: string,
): Promise<ChannelPostCommentRow> {
  const row = await pool.query<ChannelPostCommentRow>(
    `select c.*,
            u.display_name as author_display_name,
            u.avatar_url as author_avatar_url
       from channel_post_comments c
       join messages m on m.id = c.post_message_id and m.is_deleted = false
       join chats ch on ch.id = m.chat_id and ch.type = 'channel' and ch.is_active = true
       left join users u on u.id = c.author_id
      where c.id = $1
        and c.is_deleted = false
      limit 1`,
    [commentId],
  );
  if (row.rowCount === 0) {
    throw new AppError('comment_not_found', `Comment ${commentId} not found`, 404);
  }
  return row.rows[0]!;
}

export async function addChannelPostCommentReaction(
  pool: Pool,
  commentId: string,
  userId: string,
  emoji: string,
): Promise<AddReactionResult> {
  await getChannelPostCommentOr404(pool, commentId);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const del = await client.query<{ emoji: string }>(
      `delete from channel_post_comment_reactions
       where comment_id = $1 and user_id = $2 and emoji != $3
       returning emoji`,
      [commentId, userId, emoji],
    );
    const ins = await client.query<{ id: string }>(
      `insert into channel_post_comment_reactions (comment_id, user_id, emoji)
       values ($1, $2, $3)
       on conflict (comment_id, user_id) do nothing
       returning id`,
      [commentId, userId, emoji],
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

export async function removeChannelPostCommentReaction(
  pool: Pool,
  commentId: string,
  userId: string,
  emoji: string,
): Promise<{ removed: boolean }> {
  await getChannelPostCommentOr404(pool, commentId);
  const row = await pool.query(
    `delete from channel_post_comment_reactions
      where comment_id = $1 and user_id = $2 and emoji = $3`,
    [commentId, userId, emoji],
  );
  return { removed: (row.rowCount ?? 0) > 0 };
}

export async function deleteChannelPostComment(
  pool: Pool,
  commentId: string,
  userId: string,
): Promise<{ postId: string }> {
  const comment = await getChannelPostCommentOr404(pool, commentId);
  if (comment.author_id !== userId && !(await isAdminUser(pool, userId))) {
    throw new AppError('forbidden', 'comment owner or admin required', 403);
  }

  const row = await pool.query<{ post_message_id: string }>(
    `update channel_post_comments
        set is_deleted = true,
            content = '',
            updated_at = now()
      where id = $1
        and is_deleted = false
      returning post_message_id`,
    [commentId],
  );
  if (row.rowCount === 0) {
    throw new AppError('comment_not_found', `Comment ${commentId} not found`, 404);
  }
  return { postId: row.rows[0]!.post_message_id };
}

export async function updateChannelPostContent(
  pool: Pool,
  postId: string,
  editorUserId: string,
  content: string,
): Promise<ChatMessageDTO> {
  const existing = await getChannelPost(pool, postId, editorUserId);
  const updated = await pool.query<MessageRow>(
    `with upd as (
       update messages
          set content = $2,
              updated_at = now()
        where id = $1
          and is_deleted = false
        returning *
     )
     select upd.*,
            u.display_name as sender_display_name,
            u.avatar_url as sender_avatar_url,
            (select count(*)::bigint
               from channel_post_comments cpc
              where cpc.post_message_id = upd.id
                and cpc.is_deleted = false) as comment_count,
            (select count(*)::bigint
               from channel_post_views cpv
              where cpv.post_message_id = upd.id) as view_count
       from upd
       left join users u on u.id = upd.sender_id`,
    [postId, content],
  );
  if (updated.rowCount === 0) throw new MessageNotFoundError(postId);

  const reactions = await pool.query<MessageReactionRow>(
    `select * from message_reactions where message_id = $1`,
    [postId],
  );
  const grouped = groupReactions(reactions.rows, editorUserId);
  const dto = {
    ...toChatMessageDTO(updated.rows[0]!, grouped.get(postId) ?? []),
    chatId: existing.chatId,
  };
  const hydrated = await hydrateChannelPolls(pool, [dto], editorUserId);
  return hydrated[0]!;
}

export async function deleteChannelPost(pool: Pool, postId: string): Promise<{ chatId: string }> {
  const deleted = await pool.query<{ chat_id: string }>(
    `with target as (
       select m.id, m.chat_id
         from messages m
         join chats c on c.id = m.chat_id and c.type = 'channel' and c.is_active = true
        where m.id = $1
          and m.is_deleted = false
        limit 1
     ),
     upd as (
       update messages m
          set is_deleted = true,
              content = '',
              updated_at = now()
         from target
        where m.id = target.id
        returning target.chat_id
     )
     select chat_id from upd`,
    [postId],
  );
  if (deleted.rowCount === 0) throw new MessageNotFoundError(postId);
  return { chatId: deleted.rows[0]!.chat_id };
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

export async function setChannelPollVote(
  pool: Pool,
  postId: string,
  userId: string,
  optionId: string,
): Promise<ChatMessageDTO> {
  const result = await pool.query<{ post_message_id: string }>(
    `insert into channel_post_poll_votes (post_message_id, user_id, option_id)
     select o.post_message_id, $2, o.id
       from channel_post_poll_options o
       join messages m on m.id = o.post_message_id and m.is_deleted = false
       join chats c on c.id = m.chat_id and c.type = 'channel' and c.is_active = true
      where o.post_message_id = $1
        and o.id = $3
     on conflict (post_message_id, user_id)
       do update set option_id = excluded.option_id,
                     updated_at = now()
     returning post_message_id`,
    [postId, userId, optionId],
  );
  if (result.rowCount === 0) {
    throw new AppError('poll_option_not_found', `Poll option ${optionId} not found`, 404);
  }
  return await getChannelPost(pool, postId, userId);
}

export async function clearChannelPollVote(
  pool: Pool,
  postId: string,
  userId: string,
): Promise<ChatMessageDTO> {
  const poll = await pool.query<{ post_message_id: string }>(
    `select p.post_message_id
       from channel_post_polls p
       join messages m on m.id = p.post_message_id and m.is_deleted = false
       join chats c on c.id = m.chat_id and c.type = 'channel' and c.is_active = true
      where p.post_message_id = $1
      limit 1`,
    [postId],
  );
  if (poll.rowCount === 0) {
    throw new AppError('poll_not_found', `Poll ${postId} not found`, 404);
  }
  await pool.query(
    `delete from channel_post_poll_votes
      where post_message_id = $1
        and user_id = $2`,
    [postId, userId],
  );
  return await getChannelPost(pool, postId, userId);
}
