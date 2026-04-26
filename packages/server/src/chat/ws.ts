import type { FastifyPluginAsync } from 'fastify';
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

function send(socket: WebSocket, event: ChatEvent): void {
  if (socket.readyState !== socket.OPEN) return;
  const frame: ChatEventFrame = { v: 1, event };
  socket.send(JSON.stringify(frame));
}

export const chatWs: FastifyPluginAsync<ChatWsOptions> = async (app, opts) => {
  await app.register(fastifyWebsocket);

  const pingIntervalMs = opts.pingIntervalMs ?? 30_000;
  const pongTimeoutMs = opts.pongTimeoutMs ?? 10_000;

  app.get('/chat/ws', { websocket: true }, async (socket: WebSocket, req) => {
    const token = (req.query as { token?: string } | undefined)?.token;
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

    const userOff = await app.realtime.subscribe(`chat:user:${userId}`, (e) => send(socket, e));
    offs.push(userOff);

    const sysRows = await app.pg.query<{ id: string }>(
      `select id from chats where type = 'system' and is_active = true`,
    );
    for (const row of sysRows.rows) {
      const off = await app.realtime.subscribe(`chat:system:${row.id}`, (e) => send(socket, e));
      offs.push(off);
    }

    let pongDeadline: NodeJS.Timeout | null = null;
    const interval = setInterval(() => {
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

    const cleanup = async () => {
      clearInterval(interval);
      if (pongDeadline) clearTimeout(pongDeadline);
      pongDeadline = null;
      for (const off of offs) {
        try {
          await off();
        } catch (err) {
          app.log.warn({ err }, 'ws: unsubscribe failed');
        }
      }
    };
    socket.on('close', cleanup);
    socket.on('error', (err) => {
      app.log.warn({ err, userId }, 'ws: socket error');
    });
  });
};
