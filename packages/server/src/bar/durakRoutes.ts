import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  cardLobby,
  queueCards,
  inviteCards,
  respondCards,
  getCardMatch,
  tickCardMatches,
} from './durakService.js';
const idSchema = z.object({ id: z.string().uuid() });
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), cardId: z.string().max(30) }),
  z.object({
    type: z.literal('beat'),
    cardId: z.string().max(30),
    target: z.number().int().min(0).max(5),
  }),
  z.object({ type: z.literal('take') }),
  z.object({ type: z.literal('finish') }),
]);
export const durakRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  app.get('/bar/cards/lobby', auth, (req) => cardLobby(app.pg, req.user.id));
  app.post('/bar/cards/queue', auth, (req) => queueCards(app.pg, req.user.id));
  app.delete('/bar/cards/queue', auth, (req) => queueCards(app.pg, req.user.id, true));
  app.get('/bar/cards/players', auth, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    const result = await app.pg.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      "select id,display_name,avatar_url from users where id<>$1 and account_kind='player' and blocked_at is null and display_name ilike '%'||$2||'%' order by display_name,id limit 20",
      [req.user.id, q],
    );
    return result.rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }));
  });
  app.post('/bar/cards/invites', auth, (req) =>
    inviteCards(
      app.pg,
      req.user.id,
      z.object({ userId: z.string().uuid() }).parse(req.body).userId,
    ),
  );
  app.post('/bar/cards/invites/:id', auth, (req) =>
    respondCards(
      app.pg,
      req.user.id,
      idSchema.parse(req.params).id,
      z.object({ action: z.enum(['accept', 'decline', 'cancel']) }).parse(req.body).action,
    ),
  );
  app.get('/bar/cards/matches/:id', auth, (req) =>
    getCardMatch(app.pg, req.user.id, idSchema.parse(req.params).id),
  );
  app.post('/bar/cards/matches/:id', auth, (req) =>
    getCardMatch(
      app.pg,
      req.user.id,
      idSchema.parse(req.params).id,
      z
        .object({
          revision: z.number().int().nonnegative(),
          action: z.union([action, z.literal('surrender')]),
        })
        .parse(req.body),
    ),
  );
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void tickCardMatches(app.pg)
      .catch((error) => app.log.warn({ err: error }, 'card deadlines failed'))
      .finally(() => {
        running = false;
      });
  }, 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
};
