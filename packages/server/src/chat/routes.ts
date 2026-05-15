import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_NEWS_CHANNEL_SLUG,
  getMyChats,
  getMessages,
  type GetMessagesOpts,
  sendMessage,
  type SendMessageOpts,
  deleteMessage,
  markChatAsRead,
  findOrCreateDM,
  searchUsers,
  searchMessages,
  getUnreadCounts,
  addReaction,
  removeReaction,
  getMessageOr404,
  pinChat,
  unpinChat,
  getChatInfo,
  getUserPublicProfile,
  updateMessage,
} from './service.js';
import {
  addChannelPostCommentReaction,
  addChannelPostComment,
  assertAdminUser,
  clearChannelPollVote,
  deleteChannelPost,
  deleteChannelPostComment,
  getChannelPost,
  getChannelPostComments,
  getChannelPostReactionUsers,
  getChannelPostViewers,
  recordChannelPostViews,
  removeChannelPostCommentReaction,
  setChannelPollVote,
  updateChannelPostContent,
} from './channel.js';
import { assertCanAccessChat, assertOwnsMessage } from './guards.js';
import {
  checkAndConsumeRateLimit,
  invalidateUnreadCache,
  getUnreadFromCache,
  setUnreadCache,
} from './cache.js';
import {
  publishMessageNew,
  publishMessageDeleted,
  publishMessageUpdated,
  publishChatRead,
  publishReactionAdded,
  publishReactionRemoved,
} from './events.js';
import { EMOJI_WHITELIST } from './whitelist.js';
import { InvalidInputError } from './errors.js';
import { enqueueFirstDialogMessagePush } from '../push/chat.js';
import { sendNewsPostPush } from '../push/news.js';
import type { PushVapidOptions } from '../push/service.js';

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

interface ChatAttachmentRow {
  id: string;
  url: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
}

function attachmentKind(contentType: string): 'image' | 'voice' | 'file' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'voice';
  return 'file';
}

async function loadChatAttachments(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  ids: string[],
): Promise<Array<Record<string, unknown>>> {
  if (ids.length === 0) return [];
  const { rows } = await app.pg.query<ChatAttachmentRow>(
    `select id, url, content_type, size_bytes, original_name
       from media_objects
      where owner_user_id = $1
        and purpose = 'chat_attachment'
        and id = any($2::uuid[])
      order by array_position($2::uuid[], id)`,
    [userId, ids],
  );
  if (rows.length !== ids.length) {
    throw new InvalidInputError('invalid attachment');
  }
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    kind: attachmentKind(row.content_type),
    contentType: row.content_type,
    size: row.size_bytes,
    originalName: row.original_name,
  }));
}

export const chatRoutes: FastifyPluginAsync<PushVapidOptions> = async (app, _pushOptions) => {
  app.get('/chat/list', { preHandler: [app.authenticate] }, async (req) => {
    return await getMyChats(app.pg, req.user.id);
  });

  app.post('/chat/dm', { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ otherUserId: uuid }).parse(req.body);
    return await findOrCreateDM(app.pg, req.user.id, body.otherUserId);
  });

  app.get('/chat/users', { preHandler: [app.authenticate] }, async (req) => {
    const query = z
      .object({
        q: z.string().min(1).max(100),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    return await searchUsers(app.pg, req.user.id, query);
  });

  app.get('/chat/:chatId/messages', { preHandler: [app.authenticate] }, async (req) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const query = z
      .object({
        before: isoDate.optional(),
        after: isoDate.optional(),
        around: uuid.optional(),
        radius: z.coerce.number().int().min(1).max(50).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .refine((o) => !(o.around && (o.before !== undefined || o.after !== undefined)), {
        message: 'around is mutually exclusive with before/after',
      })
      .parse(req.query);
    const chat = await assertCanAccessChat(app.pg, req.user.id, chatId);
    const opts: GetMessagesOpts = { limit: query.limit };
    if (query.before !== undefined) opts.before = query.before;
    if (query.after !== undefined) opts.after = query.after;
    if (query.around !== undefined) opts.around = query.around;
    if (query.radius !== undefined) opts.radius = query.radius;
    const messages = await getMessages(app.pg, chatId, req.user.id, opts);
    if (chat.type === 'channel') {
      await recordChannelPostViews(
        app.pg,
        req.user.id,
        messages.map((message) => message.id),
      );
    }
    return messages;
  });

  app.post('/chat/:chatId/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const body = z
      .object({
        content: z.string().trim().max(4000).default(''),
        replyToId: uuid.optional(),
        pollOptions: z.array(z.string().trim().min(1).max(160)).min(1).max(3).optional(),
        attachmentIds: z.array(uuid).max(10).optional(),
      })
      .refine(
        (value) =>
          value.content.length > 0 ||
          (value.attachmentIds !== undefined && value.attachmentIds.length > 0),
        { message: 'message content or attachment required' },
      )
      .parse(req.body);
    const userId = req.user.id;
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    if (chat.type === 'channel') {
      await assertAdminUser(app.pg, userId);
      if (body.replyToId !== undefined) {
        throw new InvalidInputError('channel posts do not support replies');
      }
    } else if (body.pollOptions !== undefined) {
      throw new InvalidInputError('polls are only supported in channels');
    }
    await checkAndConsumeRateLimit(app.redis, userId);
    const attachments = await loadChatAttachments(app, userId, body.attachmentIds ?? []);
    let isFirstDirectMessage = false;
    if (chat.type === 'direct') {
      const firstMessage = await app.pg.query<{ is_first: boolean }>(
        `select not exists(
           select 1 from messages where chat_id = $1
         ) as is_first`,
        [chatId],
      );
      isFirstDirectMessage = firstMessage.rows[0]?.is_first === true;
    }
    const sendOpts: SendMessageOpts = { chatId, senderId: userId, content: body.content };
    if (body.replyToId !== undefined) sendOpts.replyToId = body.replyToId;
    if (body.pollOptions !== undefined) sendOpts.pollOptions = body.pollOptions;
    if (attachments.length > 0) sendOpts.metadata = { attachments };
    const dto = await sendMessage(app.pg, sendOpts);
    // Invalidate unread cache for all current members so they see fresh counts.
    const members = await app.pg.query<{ user_id: string }>(
      `select user_id from chat_members where chat_id = $1`,
      [chatId],
    );
    await Promise.all(members.rows.map((m) => invalidateUnreadCache(app.redis, m.user_id)));
    await publishMessageNew(app.pg, app.realtime, chatId, chat.type, dto);
    if (chat.type === 'direct' && isFirstDirectMessage) {
      void enqueueFirstDialogMessagePush(app.pg, {
        chatId,
        senderId: userId,
        messageId: dto.id,
        content: dto.content,
      }).catch((err) => app.log.warn({ err, chatId }, 'first dialog push failed'));
    }
    if (chat.type === 'channel' && chat.channel_slug === DEFAULT_NEWS_CHANNEL_SLUG) {
      void sendNewsPostPush(app.pg, {
        senderUserId: userId,
        title: 'Новости игры',
        body: dto.content,
        url: `/chat/${chatId}`,
        tag: `ultimate-hockey-news-${dto.id}`,
      }).catch((err) => app.log.warn({ err, chatId }, 'news push failed'));
    }
    reply.code(201);
    return dto;
  });

  app.delete(
    '/chat/messages/:messageId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const message = await assertOwnsMessage(app.pg, req.user.id, messageId);
      await deleteMessage(app.pg, messageId);
      const chatRow = await app.pg.query<{ type: 'direct' | 'group' | 'system' | 'channel' }>(
        `select type from chats where id = $1`,
        [message.chat_id],
      );
      if (chatRow.rowCount && chatRow.rowCount > 0) {
        await publishMessageDeleted(
          app.pg,
          app.realtime,
          message.chat_id,
          chatRow.rows[0]!.type,
          messageId,
        );
      }
      reply.code(204);
      return null;
    },
  );

  app.patch('/chat/messages/:messageId', { preHandler: [app.authenticate] }, async (req) => {
    const { messageId } = z.object({ messageId: uuid }).parse(req.params);
    const body = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body);
    const message = await assertOwnsMessage(app.pg, req.user.id, messageId);
    const chatRow = await app.pg.query<{ type: 'direct' | 'group' | 'system' | 'channel' }>(
      `select type from chats where id = $1 and is_active = true`,
      [message.chat_id],
    );
    if (!chatRow.rowCount || chatRow.rowCount === 0) {
      throw new InvalidInputError('chat is not active');
    }
    const chatType = chatRow.rows[0]!.type;
    if (chatType === 'channel') {
      throw new InvalidInputError('channel posts must be edited through channel endpoint');
    }
    const dto = await updateMessage(app.pg, messageId, body.content, req.user.id);
    await publishMessageUpdated(app.pg, app.realtime, message.chat_id, chatType, dto);
    return dto;
  });

  app.post('/chat/:chatId/read', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const userId = req.user.id;
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    await markChatAsRead(app.pg, chatId, userId);
    await invalidateUnreadCache(app.redis, userId);
    await publishChatRead(
      app.pg,
      app.realtime,
      chatId,
      chat.type,
      userId,
      new Date().toISOString(),
    );
    reply.code(204);
    return null;
  });

  app.get('/chat/search', { preHandler: [app.authenticate] }, async (req) => {
    const query = z
      .object({
        q: z.string().min(1).max(200),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    return await searchMessages(app.pg, req.user.id, query);
  });

  app.get('/chat/unread', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.id;
    const cached = await getUnreadFromCache(app.redis, userId);
    if (cached) return cached;
    const counts = await getUnreadCounts(app.pg, userId);
    await setUnreadCache(app.redis, userId, counts);
    return counts;
  });

  app.get('/chat/channel/posts/:postId', { preHandler: [app.authenticate] }, async (req) => {
    const { postId } = z.object({ postId: uuid }).parse(req.params);
    const post = await getChannelPost(app.pg, postId, req.user.id);
    await recordChannelPostViews(app.pg, req.user.id, [postId]);
    return post;
  });

  app.patch('/chat/channel/posts/:postId', { preHandler: [app.authenticate] }, async (req) => {
    await assertAdminUser(app.pg, req.user.id);
    const { postId } = z.object({ postId: uuid }).parse(req.params);
    const body = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body);
    const post = await updateChannelPostContent(app.pg, postId, req.user.id, body.content);
    await publishMessageUpdated(app.pg, app.realtime, post.chatId, 'channel', post);
    return post;
  });

  app.delete(
    '/chat/channel/posts/:postId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await assertAdminUser(app.pg, req.user.id);
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      const { chatId } = await deleteChannelPost(app.pg, postId);
      await publishMessageDeleted(app.pg, app.realtime, chatId, 'channel', postId);
      reply.code(204);
      return null;
    },
  );

  app.post(
    '/chat/channel/posts/:postId/poll/vote',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      const { optionId } = z.object({ optionId: uuid }).parse(req.body);
      return await setChannelPollVote(app.pg, postId, req.user.id, optionId);
    },
  );

  app.delete(
    '/chat/channel/posts/:postId/poll/vote',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      return await clearChannelPollVote(app.pg, postId, req.user.id);
    },
  );

  app.get(
    '/chat/channel/posts/:postId/comments',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      return await getChannelPostComments(app.pg, postId, req.user.id);
    },
  );

  app.post(
    '/chat/channel/posts/:postId/comments',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      const body = z
        .object({
          content: z.string().trim().min(1).max(4000),
          replyToId: uuid.optional(),
        })
        .parse(req.body);
      await checkAndConsumeRateLimit(app.redis, req.user.id);
      const comment = await addChannelPostComment(
        app.pg,
        postId,
        req.user.id,
        body.content,
        body.replyToId,
      );
      reply.code(201);
      return comment;
    },
  );

  app.delete(
    '/chat/channel/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { commentId } = z.object({ commentId: uuid }).parse(req.params);
      await deleteChannelPostComment(app.pg, commentId, req.user.id);
      reply.code(204);
      return null;
    },
  );

  app.post(
    '/chat/channel/comments/:commentId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { commentId } = z.object({ commentId: uuid }).parse(req.params);
      const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
      const result = await addChannelPostCommentReaction(app.pg, commentId, req.user.id, emoji);
      reply.code(201);
      return { commentId, emoji, removed: result.removed };
    },
  );

  app.delete(
    '/chat/channel/comments/:commentId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { commentId } = z.object({ commentId: uuid }).parse(req.params);
      const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
      await removeChannelPostCommentReaction(app.pg, commentId, req.user.id, emoji);
      reply.code(204);
      return null;
    },
  );

  app.get('/chat/channel/posts/:postId/views', { preHandler: [app.authenticate] }, async (req) => {
    await assertAdminUser(app.pg, req.user.id);
    const { postId } = z.object({ postId: uuid }).parse(req.params);
    return await getChannelPostViewers(app.pg, postId);
  });

  app.get(
    '/chat/channel/posts/:postId/reactions/users',
    { preHandler: [app.authenticate] },
    async (req) => {
      await assertAdminUser(app.pg, req.user.id);
      const { postId } = z.object({ postId: uuid }).parse(req.params);
      return await getChannelPostReactionUsers(app.pg, postId);
    },
  );

  app.post(
    '/chat/messages/:messageId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
      const userId = req.user.id;
      const message = await getMessageOr404(app.pg, messageId);
      const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
      const result = await addReaction(app.pg, messageId, userId, emoji);
      if (result.removed) {
        await publishReactionRemoved(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          result.removed,
        );
      }
      if (result.added) {
        await publishReactionAdded(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          result.added,
        );
      }
      reply.code(201);
      // `removed` echoes the prior emoji from this user (or null) so the
      // caller can dedupe its optimistic UI against the upcoming WS
      // `reaction:removed` event on switch.
      return { messageId, emoji, removed: result.removed };
    },
  );

  app.get('/chat/:chatId/info', { preHandler: [app.authenticate] }, async (req) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    await assertCanAccessChat(app.pg, req.user.id, chatId);
    return await getChatInfo(app.pg, chatId);
  });

  app.get('/users/:userId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { userId } = z.object({ userId: uuid }).parse(req.params);
    const profile = await getUserPublicProfile(app.pg, userId);
    if (!profile) {
      reply.code(404);
      return { error: { code: 'user_not_found', message: 'user not found' } };
    }
    return profile;
  });

  app.post('/chat/:chatId/pin', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    await assertCanAccessChat(app.pg, req.user.id, chatId);
    await pinChat(app.pg, req.user.id, chatId);
    reply.code(204);
    return null;
  });

  app.delete('/chat/:chatId/pin', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    await assertCanAccessChat(app.pg, req.user.id, chatId);
    await unpinChat(app.pg, req.user.id, chatId);
    reply.code(204);
    return null;
  });

  app.delete(
    '/chat/messages/:messageId/reactions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { messageId } = z.object({ messageId: uuid }).parse(req.params);
      const { emoji } = z.object({ emoji: z.enum(EMOJI_WHITELIST) }).parse(req.body);
      const userId = req.user.id;
      const message = await getMessageOr404(app.pg, messageId);
      const chat = await assertCanAccessChat(app.pg, userId, message.chat_id);
      const result = await removeReaction(app.pg, messageId, userId, emoji);
      if (result.removed) {
        await publishReactionRemoved(
          app.pg,
          app.realtime,
          chat.id,
          chat.type,
          messageId,
          userId,
          emoji,
        );
      }
      reply.code(204);
      return null;
    },
  );
};
