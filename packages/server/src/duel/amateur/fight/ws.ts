import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { verifyAccessToken } from '../../../auth/jwt.js';
import { AppError } from '../../../plugins/errors.js';
import type { FightDuelAdapter } from './routes.js';
import { advancePersistedFight } from './service.js';
import { fightActionSchema, admitFightCommand } from './commands.js';
export function registerFightSocket(
  app: FastifyInstance,
  adapter: FightDuelAdapter,
  secret: string,
): void {
  app.get(
    '/duel/amateur/matches/:matchId/ws',
    { websocket: true },
    async (socket: WebSocket, req) => {
      const matchId = (req.params as { matchId: string }).matchId;
      const protocols = String(req.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((s) => s.trim());
      const runtimeProtocol = protocols.includes('hockey-fight-v3');
      const compactSnapshots = runtimeProtocol || protocols.includes('hockey-fight-v2');
      const bearer = String(req.headers.authorization ?? '');
      const token = bearer.startsWith('Bearer ')
        ? bearer.slice(7)
        : protocols.find((p) => p.startsWith('bearer.'))?.slice(7);
      let userId: string;
      try {
        if (!token) throw Error('missing token');
        userId = (await verifyAccessToken(token, secret)).sub;
        await adapter.transact(async (c) => {
          await adapter.prepare(c, matchId, userId);
        });
      } catch {
        socket.close(4401, 'unauthorized');
        return;
      }
      const connectionId = randomUUID();
      let closed = false;
      let busy = false;
      let serial = Promise.resolve();
      let sentAt = 0;
      const samples: number[] = [];
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const send = (v: unknown) => {
        if (!closed && socket.readyState === socket.OPEN) {
          if(socket.bufferedAmount>262144){socket.close(1013,'slow consumer');return;}
          socket.send(JSON.stringify(v));
        }
      };
      let publishedFightId: string | undefined;
      const snapshot = () =>
        adapter.transact(async (c) => {
          const ctx = await adapter.prepare(c, matchId, userId);
          await advancePersistedFight(c, ctx);
          return adapter.snapshot(c, matchId, userId);
        });
      const presence = async () => {
        const compensation =
          samples.length < 3 ? 0 : Math.min(150, Math.floor(Math.min(...samples) / 2));
        await app.pg.query(
          `insert into amateur_duel_fight_presence(match_id,user_id,connection_id,expires_at,compensation_ms,protocol_version) values($1,$2,$3,now()+interval '3 seconds',$4,$5)
      on conflict(match_id,user_id) do update set connection_id=excluded.connection_id,expires_at=excluded.expires_at,compensation_ms=excluded.compensation_ms,protocol_version=excluded.protocol_version`,
          [matchId, userId, connectionId, compensation, runtimeProtocol ? 3 : 2],
        );
      };
      let snapshotBusy = false;
      let snapshotDirty = false;
      const publishSnapshot = async () => {
        snapshotDirty = true;
        if (snapshotBusy || closed) return;
        snapshotBusy = true;
        try {
          while (snapshotDirty && !closed) {
            snapshotDirty = false;
            const live = compactSnapshots ? await adapter.liveSnapshot?.(matchId, userId) : null;
            const liveFightId = (live as { fight?: { id: string } } | null)?.fight?.id;
            if (live && liveFightId === publishedFightId) send(live);
            else {
              const match = await snapshot();
              publishedFightId = (match as { fight?: { id: string } })?.fight?.id;
              send({ type: 'duel:snapshot', match });
            }
          }
        } finally {
          snapshotBusy = false;
        }
      };
      let off: (() => Promise<void>) | null = null;
      const cleanup = () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        void off?.();
        void app.pg
          .query(
            'delete from amateur_duel_fight_presence where match_id=$1 and user_id=$2 and connection_id=$3',
            [matchId, userId, connectionId],
          )
          .catch(() => undefined);
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
      socket.on('pong', () => {
        if (sentAt) {
          samples.push(Math.max(0, Date.now() - sentAt));
          if (samples.length > 10) samples.shift();
          sentAt = 0;
        }
      });
      let windowAt = Date.now();
      let messages = 0;
      socket.on('message', (raw) => {
        if (Date.now() - windowAt >= 1000) {
          windowAt = Date.now();
          messages = 0;
        }
        if (++messages > 16 || raw.toString().length > 1024) {
          send({ type: 'fight:error', reason: 'rate_limit' });
          void publishSnapshot().catch(() => undefined);
          return;
        }
        let body: ReturnType<typeof fightActionSchema.parse> | undefined;
        serial = serial
          .then(async () => {
            body = fightActionSchema.parse(JSON.parse(raw.toString()));
            const command = body;
            if(runtimeProtocol && adapter.runtimeCommand){
              const ack=await adapter.runtimeCommand(matchId,userId,command);
              if(ack){send({type:'fight:ack',actionId:command.actionId,ack});void publishSnapshot().catch(()=>undefined);return;}
            }
            const result = await adapter.transact(async (c) => {
              const ctx = await adapter.prepare(c, matchId, userId);
              await advancePersistedFight(c, ctx);
              const { notificationRevision, ...ack } = await admitFightCommand(c, ctx, userId, command);
              return { ack, notificationRevision };
            });
            send({ type: 'fight:ack', actionId: command.actionId, ack: result.ack });
            // Only announce committed state; the durable outbox retries failures.
            if (result.notificationRevision !== undefined) {
              void app.realtime.publish(`duel:fight:${matchId}`, {
                type: 'duel:fight_update', matchId, revision: result.notificationRevision,
              }).catch(() => undefined);
            }
            void publishSnapshot().catch(() => undefined);
          })
          .catch((error) => {
            app.log.warn(
              {
                matchId,
                ...(body ? { fightId: body.fightId, actionId: body.actionId, seq: body.seq } : {}),
                reason:
                  error instanceof AppError
                    ? ((error.details as { reason?: string })?.reason ?? error.code)
                    : 'bad_request',
              },
              'duel fight command rejected',
            );
            send({
              type: 'fight:error',
              ...(body ? { fightId: body.fightId, actionId: body.actionId, seq: body.seq } : {}),
              reason:
                error instanceof AppError
                  ? ((error.details as { reason?: string })?.reason ?? error.code)
                  : 'bad_request',
            });
            void publishSnapshot().catch(() => undefined);
          });
      });
      try {
        off = await app.realtime.subscribe(`duel:fight:${matchId}`, () => {
          void publishSnapshot().catch(() => undefined);
        });
        if (closed) {
          await off();
          return;
        }
        await presence();
        const initial = await snapshot();
        publishedFightId = (initial as { fight?: { id: string } })?.fight?.id;
        send({ type: 'duel:snapshot', match: initial });
        // The checkpoint may lag the active room. Resync before accepting renewed held input.
        if (runtimeProtocol) {
          const live = await adapter.liveSnapshot?.(matchId, userId);
          if (live) send(live);
        }
        send({ type: 'connection:ready' });
        heartbeat = setInterval(() => {
          if (closed || busy) return;
          busy = true;
          void presence()
            .then(() => {
              if (sentAt === 0) {
                sentAt = Date.now();
                socket.ping();
              } else if (Date.now() - sentAt > 5000) socket.close(4408, 'heartbeat lost');
            })
            .catch(() => socket.close(1011, 'presence unavailable'))
            .finally(() => {
              busy = false;
            });
        }, 1000);
      } catch {
        socket.close(1011, 'initialization failed');
        cleanup();
      }
    },
  );
}
