import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { resolveAmateurAccess } from '../profile/amateurAccess.js';
const observation = z
  .object({
    event: z.enum([
      'city_first_seen',
      'novice_course_opened',
      'push_prompt_shown',
      'push_permission_outcome',
      'app_session_started',
      'app_active',
    ]),
    sessionId: z.string().uuid(),
    outcome: z
      .enum(['granted', 'denied', 'default', 'snoozed', 'install_instructions', 'error'])
      .optional(),
  })
  .strict()
  .refine((value) =>
    value.event === 'push_permission_outcome'
      ? value.outcome !== undefined
      : value.outcome === undefined,
  );
export const noviceAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const auth = {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  };
  app.post('/analytics/novice', auth, async (request) => {
    const parsed = observation.safeParse(request.body);
    if (!parsed.success) throw new AppError('bad_request', 'Некорректное событие.', 400);
    const { event, sessionId, outcome } = parsed.data;
    const key =
      event === 'city_first_seen'
        ? 'once'
        : event === 'app_active'
          ? new Date().toISOString().slice(0, 10)
          : `${sessionId}:${outcome ?? ''}`;
    await app.pg.query('select record_novice_funnel($1,$2,$3,$4::jsonb)', [
      request.user.id,
      event,
      key,
      JSON.stringify({ source: 'client', ...(outcome ? { outcome } : {}) }),
    ]);
    return { ok: true };
  });
  app.post('/analytics/novice/yard-hint', auth, async (request) => {
    if ((await resolveAmateurAccess(app.pg, request.user.id)).hasFullAccess) return { show: false };
    const { rows } = await app.pg.query(
      'update users set novice_yard_hint_offered_at=now() where id=$1 and novice_yard_hint_offered_at is null returning id',
      [request.user.id],
    );
    return { show: rows.length === 1 };
  });
};
