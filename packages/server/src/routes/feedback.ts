import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { findOrCreateDM, sendMessage } from '../chat/service.js';
import { publishMessageNew } from '../chat/events.js';
import { checkAndConsumeRateLimit, invalidateUnreadCache } from '../chat/cache.js';

type FeedbackKind = 'review' | 'suggestion' | 'question';

interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  rating: number | null;
  message: string;
  is_read: boolean;
  created_at: Date;
}

const createFeedbackSchema = z
  .object({
    kind: z.enum(['review', 'suggestion', 'question']),
    rating: z.number().int().min(0).max(5).nullable().optional(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();

function mapFeedback(row: FeedbackRow) {
  return {
    id: row.id,
    kind: row.kind,
    rating: row.rating,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at.toISOString(),
  };
}

interface FeedbackRoutesOptions {
  systemUserId?: string;
}

export const feedbackRoutes: FastifyPluginAsync<FeedbackRoutesOptions> = async (app, options) => {
  app.post('/feedback', { preHandler: [app.authenticate] }, async (req) => {
    const body = createFeedbackSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid feedback payload', 400);
    }

    const rating = body.data.kind === 'review' ? (body.data.rating ?? null) : null;
    const { rows } = await app.pg.query<FeedbackRow>(
      `insert into feedback_messages (user_id, kind, rating, message)
       values ($1, $2, $3, $4)
       returning id, kind, rating, message, is_read, created_at`,
      [req.user.id, body.data.kind, rating, body.data.message],
    );

    return { feedback: mapFeedback(rows[0]!) };
  });

  app.post('/feedback/direct', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (options.systemUserId === undefined) {
      throw new AppError('configuration_error', 'SYSTEM_USER_ID is required', 409);
    }
    const body = z
      .object({ message: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(req.body);
    await checkAndConsumeRateLimit(app.redis, req.user.id);
    const { chatId } = await findOrCreateDM(app.pg, req.user.id, options.systemUserId);
    const message = await sendMessage(app.pg, {
      chatId,
      senderId: req.user.id,
      content: body.message,
    });
    await Promise.all(
      [req.user.id, options.systemUserId].map((userId) => invalidateUnreadCache(app.redis, userId)),
    );
    await publishMessageNew(app.pg, app.realtime, chatId, 'direct', message);
    reply.code(201);
    return { chatId, messageId: message.id };
  });
};
