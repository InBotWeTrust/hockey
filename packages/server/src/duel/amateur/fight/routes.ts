import type { FightActionPayload } from './commands.js';
import type { RoomAck } from './runtime/room.js';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { createChallenge, respondChallenge, advancePersistedFight } from './service.js';
export interface FightDuelContext {
  id: string;
  source: string;
  status: string;
  endsAtMs: number;
  paused: boolean;
  nowMs: number;
  canExtend: boolean;
  mandatoryBlocked?: boolean;
  participants: Array<{ userId: string; state: string; totalActiveMs: number; periodElapsedMs: number; remainingMs: number; running: boolean }>;
}
export interface FightDuelAdapter {
  runtimeCommand?(matchId: string, userId: string, body: FightActionPayload): Promise<RoomAck | null>;
  transact<T>(work: (client: PoolClient) => Promise<T>): Promise<T>;
  prepare(client: PoolClient, matchId: string, userId: string): Promise<FightDuelContext>;
  snapshot(client: PoolClient, matchId: string, userId: string): Promise<unknown>;
  liveSnapshot?(matchId: string, userId: string): Promise<unknown | null>;
}
export function registerFightRoutes(app: FastifyInstance, adapter: FightDuelAdapter): void {
  const params = z.object({ matchId: z.string().uuid() });
  app.get(
    '/duel/amateur/matches/:matchId/fight/state',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { matchId } = params.parse(req.params);
      return adapter.transact(async (client) => {
        const ctx = await adapter.prepare(client, matchId, req.user.id);
        const fight = await advancePersistedFight(client, ctx);
        return { fight, match: await adapter.snapshot(client, matchId, req.user.id) };
      });
    },
  );
  app.post(
    '/duel/amateur/matches/:matchId/fight/challenge',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { matchId } = params.parse(req.params);
      const { requestId } = z.object({ requestId: z.string().uuid() }).strict().parse(req.body);
      return adapter.transact(async (client) => {
        const ctx = await adapter.prepare(client, matchId, req.user.id);
        const fight = await createChallenge(client, ctx, req.user.id, requestId);
        return { fight, match: await adapter.snapshot(client, matchId, req.user.id) };
      });
    },
  );
  app.post(
    '/duel/amateur/matches/:matchId/fight/respond',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { matchId } = params.parse(req.params);
      const body = z
        .object({
          requestId: z.string().uuid(),
          fightId: z.string().uuid(),
          decision: z.enum(['accept', 'decline']),
        })
        .strict()
        .parse(req.body);
      return adapter.transact(async (client) => {
        const ctx = await adapter.prepare(client, matchId, req.user.id);
        const fight = await respondChallenge(
          client,
          ctx,
          req.user.id,
          body.fightId,
          body.decision,
          body.requestId,
        );
        return { fight, match: await adapter.snapshot(client, matchId, req.user.id) };
      });
    },
  );
}
