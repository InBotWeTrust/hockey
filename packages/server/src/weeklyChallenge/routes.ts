import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import {
  claimWeeklyChallengeReward,
  declineWeeklyChallenge,
  getCurrentWeeklyChallenge,
  joinWeeklyChallenge,
} from './service.js';

const paramsSchema = z.object({ id: z.string().uuid() });

async function withTransaction<T>(
  app: FastifyInstance,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export const weeklyChallengeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/weekly-challenge/current', { preHandler: [app.authenticate] }, async (req) =>
    getCurrentWeeklyChallenge(app.pg, req.user.id),
  );

  app.post('/weekly-challenge/:id/join', { preHandler: [app.authenticate] }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    return withTransaction(app, (client) => joinWeeklyChallenge(client, params.data.id, req.user.id));
  });

  app.post('/weekly-challenge/:id/decline', { preHandler: [app.authenticate] }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    return withTransaction(app, (client) =>
      declineWeeklyChallenge(client, params.data.id, req.user.id),
    );
  });

  app.post(
    '/weekly-challenge/:id/claim-reward',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
      return withTransaction(app, (client) =>
        claimWeeklyChallengeReward(client, params.data.id, req.user.id),
      );
    },
  );
};
