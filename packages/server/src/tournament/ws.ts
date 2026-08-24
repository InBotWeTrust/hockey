import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import type { Unsubscribe } from '../plugins/realtime.js';
import { assertFixtureParticipant, getFixtureLiveState } from './live.js';

export interface TournamentWsOptions {
  accessSecret: string;
}

function queryValue(query: unknown, key: string): string | null {
  if (typeof query !== 'object' || query === null) return null;
  const value = (query as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

const plugin: FastifyPluginAsync<TournamentWsOptions> = async (app, options) => {
    app.get('/tournaments/fixtures/:fixtureId/ws', { websocket: true }, async (socket: WebSocket, req) => {
      const token = queryValue(req.query, 'token');
      const fixtureId = (req.params as { fixtureId?: unknown }).fixtureId;
      if (!token || typeof fixtureId !== 'string') {
        socket.close(4401, 'unauthorized');
        return;
      }
      let userId: string;
      try {
        userId = (await verifyAccessToken(token, options.accessSecret)).sub;
        await assertFixtureParticipant(app.pg, fixtureId, userId);
      } catch {
        socket.close(4401, 'unauthorized');
        return;
      }
      let off: Unsubscribe | null = null;
      try {
        off = await app.realtime.subscribe(`tournament:fixture:${fixtureId}`, (event) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ v: 1, event }));
        });
        const live = await getFixtureLiveState(app.pg, fixtureId, userId);
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              v: 1,
              event: {
                type: 'tournament:fixture_update',
                fixtureId,
                sequence: Date.now(),
                payload: { live, ready: true },
              },
            }),
          );
        }
        await app.realtime.publish(`tournament:fixture:${fixtureId}`, {
          type: 'tournament:presence',
          fixtureId,
          sequence: Date.now(),
          payload: { userId, online: true },
        });
      } catch {
        socket.close(1011, 'setup failed');
        return;
      }
      const cleanup = async () => {
        if (off) await off().catch(() => undefined);
        await app.realtime
          .publish(`tournament:fixture:${fixtureId}`, {
            type: 'tournament:presence',
            fixtureId,
            sequence: Date.now(),
            payload: { userId, online: false },
          })
          .catch(() => undefined);
      };
      socket.on('close', () => void cleanup());
      socket.on('error', () => void cleanup());
      socket.on('message', () => undefined);
    });
};

export const tournamentWs = fp(plugin, {
  name: 'tournamentWs',
  dependencies: ['realtime', 'chatWs'],
});
