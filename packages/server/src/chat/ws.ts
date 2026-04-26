import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import type { ChatEvent, ChatEventFrame } from './types.js';
import type { Unsubscribe } from '../plugins/realtime.js';

export interface ChatWsOptions {
  accessSecret: string;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
}

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_HEARTBEAT_LOST = 4408;
const CLOSE_INTERNAL_ERROR = 1011;

function send(socket: WebSocket, event: ChatEvent): void {
  if (socket.readyState !== socket.OPEN) return;
  const frame: ChatEventFrame = { v: 1, event };
  socket.send(JSON.stringify(frame));
}

function readToken(req: { query: unknown }): string | null {
  const q = req.query;
  if (q === null || typeof q !== 'object') return null;
  const t = (q as Record<string, unknown>)['token'];
  return typeof t === 'string' ? t : null;
}

const plugin: FastifyPluginAsync<ChatWsOptions> = async (app, opts) => {
  await app.register(fastifyWebsocket);

  const pingIntervalMs = opts.pingIntervalMs ?? 30_000;
  const pongTimeoutMs = opts.pongTimeoutMs ?? 10_000;

  app.get('/chat/ws', { websocket: true }, async (socket: WebSocket, req) => {
    const token = readToken(req);
    if (!token) {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }
    let userId: string;
    try {
      const payload = await verifyAccessToken(token, opts.accessSecret);
      userId = payload.sub;
    } catch {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }

    const offs: Unsubscribe[] = [];
    let interval: NodeJS.Timeout | null = null;
    let pongDeadline: NodeJS.Timeout | null = null;
    let cleanedUp = false;

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (pongDeadline) {
        clearTimeout(pongDeadline);
        pongDeadline = null;
      }
      for (const off of offs) {
        try { await off(); } catch (err) { app.log.warn({ err }, 'ws: unsubscribe failed'); }
      }
    };

    // Wire close + error BEFORE any awaitable subscribe so a setup failure
    // can still trigger cleanup of partially-acquired subscriptions.
    socket.on('close', () => { void cleanup(); });
    socket.on('error', (err) => {
      app.log.warn({ err, userId }, 'ws: socket error');
    });

    try {
      const userOff = await app.realtime.subscribe(`chat:user:${userId}`, (e) => send(socket, e));
      offs.push(userOff);

      const sysRows = await app.pg.query<{ id: string }>(
        `select id from chats where type = 'system' and is_active = true`,
      );
      for (const row of sysRows.rows) {
        const off = await app.realtime.subscribe(`chat:system:${row.id}`, (e) => send(socket, e));
        offs.push(off);
      }
    } catch (err) {
      app.log.warn({ err, userId }, 'ws: setup failed');
      await cleanup();
      if (socket.readyState === socket.OPEN) {
        socket.close(CLOSE_INTERNAL_ERROR, 'setup failed');
      }
      return;
    }

    interval = setInterval(() => {
      if (socket.readyState !== socket.OPEN) return;
      socket.ping();
      if (pongDeadline) clearTimeout(pongDeadline);
      pongDeadline = setTimeout(() => {
        if (socket.readyState === socket.OPEN) {
          socket.close(CLOSE_HEARTBEAT_LOST, 'heartbeat lost');
        }
      }, pongTimeoutMs);
    }, pingIntervalMs);

    socket.on('pong', () => {
      if (pongDeadline) {
        clearTimeout(pongDeadline);
        pongDeadline = null;
      }
    });

    socket.on('message', () => undefined);
  });
};

export const chatWs = fp(plugin, { name: 'chatWs', dependencies: ['realtime'] });
