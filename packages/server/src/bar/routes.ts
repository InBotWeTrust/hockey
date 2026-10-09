import fp from 'fastify-plugin';
import { joinBarChat } from './chat.js';
import { checkAndConsumeRateLimit } from '../chat/cache.js';
import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { verifyAccessToken } from '../auth/jwt.js';
import { SnapshotHub } from './hub.js';
import { getBarBoard, getBarLive } from './service.js';

const querySchema = z
  .object({
    token: z.string().min(1).max(4096),
    page: z.coerce.number().int().min(0).max(1000).default(0),
    kind: z.enum(['duel', 'tournament']).optional(),
    id: z.string().uuid().optional(),
  })
  .refine((q) => (q.kind === undefined) === (q.id === undefined));

const plugin: FastifyPluginAsync<{ accessSecret: string }> = async (app, options) => {
  app.post('/bar/:kind/:id/chat', { preHandler: [app.authenticate] }, async (req) => {
    const { kind, id } = z
      .object({ kind: z.enum(['duel', 'tournament']), id: z.string().uuid() })
      .parse(req.params);
    await checkAndConsumeRateLimit(app.redis, req.user.id);
    return joinBarChat(app.pg, req.user.id, kind, id);
  });
  const hub = new SnapshotHub(
    async (key) => {
      const cacheKey = `bar:v1:${key}`;
      const cached = await app.redis.get(cacheKey);
      if (cached !== null) return JSON.parse(cached) as unknown;
      const [type, arg, id] = key.split(':');
      const data =
        type === 'board'
          ? await getBarBoard(app.pg, Number(arg))
          : await getBarLive(app.pg, arg as 'duel' | 'tournament', id!);
      await app.redis.set(cacheKey, JSON.stringify(data), 'PX', 1900);
      return data;
    },
    2000,
    (err) => app.log.warn({ err }, 'bar snapshot failed'),
  );
  const sockets = new Set<WebSocket>();
  const alive = new WeakSet<WebSocket>();
  const viewers = new Map<string, number>();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  app.get('/bar/ws', { websocket: true, logLevel: 'silent' }, async (socket: WebSocket, req) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      socket.close(4400, 'invalid subscription');
      return;
    }
    let closed = false;
    let off: (() => void) | null = null;
    let viewerId: string | null = null;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      off?.();
      off = null;
      sockets.delete(socket);
      if (sockets.size === 0 && heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (viewerId !== null) {
        const count = (viewers.get(viewerId) ?? 1) - 1;
        if (count === 0) viewers.delete(viewerId);
        else viewers.set(viewerId, count);
      }
    };
    socket.once('close', cleanup);
    socket.once('error', cleanup);
    try {
      const userId = (await verifyAccessToken(parsed.data.token, options.accessSecret)).sub;
      const user = await app.pg.query<{ blocked_at: Date | null }>(
        'select blocked_at from users where id=$1',
        [userId],
      );
      if (!user.rows[0]) {
        socket.close(4401, 'unauthorized');
        return;
      }
      if (user.rows[0].blocked_at !== null) {
        socket.close(4403, 'forbidden');
        return;
      }
      if (closed || socket.readyState !== socket.OPEN) return;
      if ((viewers.get(userId) ?? 0) >= 3 || sockets.size >= 5000) {
        socket.close(4429, 'viewer limit');
        return;
      }
      viewerId = userId;
      viewers.set(userId, (viewers.get(userId) ?? 0) + 1);
      sockets.add(socket);
      ensureHeartbeat();
      alive.add(socket);
      socket.on('pong', () => alive.add(socket));
      const key =
        parsed.data.kind === undefined
          ? `board:${parsed.data.page}`
          : `match:${parsed.data.kind}:${parsed.data.id}`;
      off = hub.subscribe(key, (data) => {
        if (socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > 128 * 1024) {
          socket.close(1013, 'slow connection');
          cleanup();
          return;
        }
        socket.send(data);
      });
      // No spectator-originated gameplay actions are accepted on this transport.
      socket.on('message', () => undefined);
    } catch {
      socket.close(4401, 'unauthorized');
      cleanup();
    }
  });
  function ensureHeartbeat(): void {
    if (heartbeat !== null) return;
    heartbeat = setInterval(() => {
      for (const socket of sockets) {
        if (!alive.has(socket)) {
          socket.terminate();
          continue;
        }
        alive.delete(socket);
        socket.ping();
      }
    }, 30000);
    heartbeat.unref();
  }
  // Pong listener is attached synchronously to every new socket.
  app.addHook('onClose', async () => {
    if (heartbeat !== null) clearInterval(heartbeat);
    hub.close();
    for (const socket of sockets) socket.terminate();
    sockets.clear();
  });
};
export const barRoutes = fp(plugin, { name: 'bar', dependencies: ['db', 'redis', 'chatWs'] });
