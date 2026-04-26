import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
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
} from './service.js';
import { assertCanAccessChat, assertOwnsMessage } from './guards.js';
import {
  checkAndConsumeRateLimit,
  invalidateUnreadCache,
  getUnreadFromCache,
  setUnreadCache,
} from './cache.js';
import { publishMessageNew, publishMessageDeleted, publishChatRead } from './events.js';

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

export const chatRoutes: FastifyPluginAsync = async (app) => {
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
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    await assertCanAccessChat(app.pg, req.user.id, chatId);
    const opts: GetMessagesOpts = { limit: query.limit };
    if (query.before !== undefined) opts.before = query.before;
    return await getMessages(app.pg, chatId, req.user.id, opts);
  });

  app.post('/chat/:chatId/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const body = z
      .object({
        content: z.string().min(1).max(4000),
        replyToId: uuid.optional(),
      })
      .parse(req.body);
    const userId = req.user.id;
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    await checkAndConsumeRateLimit(app.redis, userId);
    const sendOpts: SendMessageOpts = { chatId, senderId: userId, content: body.content };
    if (body.replyToId !== undefined) sendOpts.replyToId = body.replyToId;
    const dto = await sendMessage(app.pg, sendOpts);
    // Invalidate unread cache for all current members so they see fresh counts.
    const members = await app.pg.query<{ user_id: string }>(
      `select user_id from chat_members where chat_id = $1`,
      [chatId],
    );
    await Promise.all(members.rows.map((m) => invalidateUnreadCache(app.redis, m.user_id)));
    await publishMessageNew(app.pg, app.realtime, chatId, chat.type, dto);
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
      const chatRow = await app.pg.query<{ type: 'direct' | 'group' | 'system' }>(
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

  app.post('/chat/:chatId/read', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const userId = req.user.id;
    const chat = await assertCanAccessChat(app.pg, userId, chatId);
    await markChatAsRead(app.pg, chatId, userId);
    await invalidateUnreadCache(app.redis, userId);
    await publishChatRead(app.pg, app.realtime, chatId, chat.type, userId, new Date().toISOString());
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
};
