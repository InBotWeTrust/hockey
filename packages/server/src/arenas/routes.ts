import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { listUserArenas, selectHomeArena, toUserArenaDTO } from './service.js';

const selectionSchema = z
  .object({
    arena_theme_id: z.string().uuid().nullable(),
  })
  .strict();

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
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export const arenaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/home-arenas', { preHandler: [app.authenticate] }, async (request) =>
    listUserArenas(app.pg, request.user.id),
  );

  app.patch('/me/home-arena', { preHandler: [app.authenticate] }, async (request) => {
    const body = selectionSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid home arena selection', 400);
    }

    const selected = await withTransaction(app, (client) =>
      selectHomeArena(client, request.user.id, body.data.arena_theme_id),
    );
    return {
      selected_arena: toUserArenaDTO(selected, body.data.arena_theme_id),
    };
  });
};
