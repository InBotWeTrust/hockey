import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

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

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
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
};
