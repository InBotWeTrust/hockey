import { startDrift, actDrift } from './drift.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../plugins/errors.js';
import { startCaretaker, actCaretaker } from './caretaker.js';
const point = z.number().min(0).max(1);
const action = z
  .object({
    attemptId: z.string().uuid(),
    seq: z.number().int().min(1),
    input: z
      .object({ x: point, y: point, toX: point, toY: point, ms: z.number().min(0).max(10000) })
      .strict(),
  })
  .strict();
export const caretakerRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  const controls = z
    .object({
      attemptId: z.string().uuid(),
      seq: z.number().int().min(1),
      controls: z
        .array(
          z
            .object({
              x: z.number().min(-1).max(1),
              y: z.number().min(-1).max(1),
              held: z.boolean(),
            })
            .strict(),
        )
        .min(1)
        .max(60),
    })
    .strict();
  app.post('/duel/daily/caretaker/drift/start', auth, async (req) => {
    const input = z.object({ requestId: z.string().uuid(), variant: z.enum(['drift','blizzard']).optional() }).strict().safeParse(req.body);
    if (!input.success) throw new AppError('bad_request', 'Неверный запрос уборки.', 400);
    const c = await app.pg.connect();
    try {
      await c.query('begin');
      const result = await startDrift(c, req.user.id, input.data.requestId, new Date());
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  });
  app.post('/duel/daily/caretaker/drift/action', auth, async (req) => {
    const input = controls.safeParse(req.body);
    if (!input.success) throw new AppError('bad_request', 'Неверное движение.', 400);
    const c = await app.pg.connect();
    try {
      await c.query('begin');
      const result = await actDrift(
        c,
        req.user.id,
        input.data.attemptId,
        input.data.seq,
        input.data.controls,
        new Date(),
      );
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  });

  app.post('/duel/daily/caretaker/start', auth, async (req) => {
    const input = z.object({ requestId: z.string().uuid() }).strict().safeParse(req.body);
    if (!input.success) throw new AppError('bad_request', 'Неверный запрос уборки.', 400);
    const c = await app.pg.connect();
    try {
      await c.query('begin');
      const result = await startCaretaker(c, req.user.id, input.data.requestId, new Date());
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  });
  app.post('/duel/daily/caretaker/action', auth, async (req) => {
    const input = action.safeParse(req.body);
    if (!input.success) throw new AppError('bad_request', 'Неверное действие уборки.', 400);
    const c = await app.pg.connect();
    try {
      await c.query('begin');
      const result = await actCaretaker(
        c,
        req.user.id,
        input.data.attemptId,
        input.data.seq,
        input.data.input,
        new Date(),
      );
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  });
  app.get('/duel/daily/caretaker/hint', auth, async (req) => {
    const result = await app.pg.query(
      'select introduced_at from daily_caretaker_user where user_id=$1',
      [req.user.id],
    );
    return { show: !result.rows[0]?.introduced_at };
  });
};
