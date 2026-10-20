import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { joinCardRoom, readCardRoom, commandCardRoom, inviteToRoom } from './durakRooms.js';
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
export const durakRoutes: FastifyPluginAsync<{ backgroundTicksEnabled?: boolean }> = async (app, options) => {
  const auth = { preHandler: [app.authenticate] };
  app.post('/bar/cards/rooms', auth, (req) => {
    const body = z
      .object({
        capacity: z.union([
          z.number().int().min(2).max(6),
          z.array(z.number().int().min(2).max(6)).min(1).max(5),
        ]),
        searching: z.boolean().default(true),
      })
      .parse(req.body);
    return joinCardRoom(app.pg, req.user.id, body.capacity, body.searching);
  });
  app.get('/bar/cards/rooms/:id', auth, (req) =>
    readCardRoom(app.pg, req.user.id, idSchema.parse(req.params).id),
  );
  app.post('/bar/cards/rooms/:id', auth, (req) => {
    const body = z
      .object({
        revision: z.number().int().nonnegative(),
        command: z.union([
          z.object({ type: z.enum(['leave', 'renew', 'pause', 'propose', 'ready']) }),
          z.object({
            type: z.literal('move'),
            action: z.union([
              z.object({ type: z.literal('play'), cardId: z.string().max(30) }),
              z.object({
                type: z.literal('beat'),
                cardId: z.string().max(30),
                target: z.number().int().min(0).max(5),
              }),
              z.object({ type: z.literal('take') }),
              z.object({ type: z.literal('pass') }),
            ]),
          }),
        ]),
      })
      .parse(req.body);
    return commandCardRoom(
      app.pg,
      req.user.id,
      idSchema.parse(req.params).id,
      body.revision,
      body.command,
    );
  });
  app.post('/bar/cards/rooms/:id/invites', auth, (req) =>
    inviteToRoom(
      app.pg,
      req.user.id,
      idSchema.parse(req.params).id,
      z.object({ userId: z.string().uuid() }).parse(req.body).userId,
    ),
  );
  app.get('/bar/cards/lobby', auth, (req) => cardLobby(app.pg, req.user.id));
  app.post('/bar/cards/queue', auth, (req) => queueCards(app.pg, req.user.id));
  app.delete('/bar/cards/queue', auth, (req) => queueCards(app.pg, req.user.id, true));
  app.get('/bar/cards/players', auth, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
    const result = await app.pg.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      last_seen_at: Date | null;
    }>(
      "select id,display_name,avatar_url,last_seen_at from users where id<>$1 and account_kind='player' and blocked_at is null and ($2='' or display_name ilike '%'||$2||'%') and not exists(select 1 from bar_card_room_players p where p.user_id=users.id) and not exists(select 1 from bar_card_matches m where m.ended_at is null and (m.player_a=users.id or m.player_b=users.id)) order by last_seen_at desc nulls last,display_name,id limit 20",
      [req.user.id, q],
    );
    return result.rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
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
          action: z.union([action, z.literal('surrender'), z.literal('ready')]),
        })
        .parse(req.body),
    ),
  );
  if (options.backgroundTicksEnabled === false) return;
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
