import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as service from './service.js';
const id = z.object({ id: z.string().uuid() });
const kind = z.enum(['darts', 'billiards', 'checkers']);
const spin = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict()
  .refine((p) => Math.hypot(p.x, p.y) <= 1)
  .optional();
const point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const gameAction = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('dart'),
      gesture: z
        .object({
          dx: z.number().finite().min(-3).max(3),
          dy: z.number().finite().min(-3).max(3),
          durationMs: z.number().min(40).max(5000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('checkers'),
      path: z.array(z.number().int().min(0).max(63)).min(2).max(25),
    })
    .strict(),
  z.object({ type: z.literal('place'), point }).strict(),
  z
    .object({
      type: z.literal('aim'),
      angle: z
        .number()
        .finite()
        .min(-Math.PI * 4)
        .max(Math.PI * 4),
      power: z.number().min(0.03).max(1),
      spin,
    })
    .strict(),
  z
    .object({
      type: z.literal('shot'),
      angle: z
        .number()
        .finite()
        .min(-Math.PI * 4)
        .max(Math.PI * 4),
      power: z.number().min(0.03).max(1),
      spin,
    })
    .strict(),
  z.object({ type: z.literal('surrender') }).strict(),
  z.object({ type: z.literal('ready') }).strict(),
]);
export const barGameRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  app.get('/bar/games/lobby', auth, (req) => service.gameLobby(app.pg, req.user.id));
  app.get('/bar/games/players', auth, (req) =>
    service.searchGamePlayers(
      app.pg,
      req.user.id,
      z.object({ q: z.string().trim().max(100).default('') }).parse(req.query).q,
    ),
  );
  app.post('/bar/games/computer', auth, (req) => {
    const b = z
      .object({
        character: z.enum(['maria', 'veronika', 'arsenich']),
        requestId: z.string().uuid(),
        previousId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    return service.startComputer(app.pg, req.user.id, b.character, b.requestId, b.previousId);
  });
  app.post('/bar/games/queue', auth, (req) =>
    service.queueGame(app.pg, req.user.id, z.object({ kind }).parse(req.body).kind),
  );
  app.delete('/bar/games/queue', auth, (req) =>
    service.queueGame(app.pg, req.user.id, 'darts', true),
  );
  app.post('/bar/games/invites', auth, (req) => {
    const b = z.object({ userId: z.string().uuid(), kind }).parse(req.body);
    return service.inviteGame(app.pg, req.user.id, b.userId, b.kind);
  });
  app.post('/bar/games/invites/:id', auth, (req) =>
    service.respondGame(
      app.pg,
      req.user.id,
      id.parse(req.params).id,
      z.object({ action: z.enum(['accept', 'decline', 'cancel']) }).parse(req.body).action,
    ),
  );
  app.get('/bar/games/matches/:id', auth, (req) =>
    service.readGame(app.pg, req.user.id, id.parse(req.params).id),
  );
  app.post('/bar/games/matches/:id', auth, (req) =>
    service.actGame(
      app.pg,
      req.user.id,
      id.parse(req.params).id,
      z
        .object({
          requestId: z.string().uuid(),
          revision: z.number().int().nonnegative(),
          action: gameAction,
        })
        .strict()
        .parse(req.body),
    ),
  );
  app.post('/bar/games/local-cards', auth, (req) => {
    const b = z
      .object({ id: z.string().uuid(), leave: z.boolean().default(false) })
      .parse(req.body);
    return service.localCards(app.pg, req.user.id, b.id, b.leave);
  });
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void service
      .tickGames(app.pg)
      .catch((error) => app.log.warn({ err: error }, 'bar game tick failed'))
      .finally(() => {
        running = false;
      });
  }, 1000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
};
