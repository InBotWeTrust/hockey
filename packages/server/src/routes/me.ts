import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../plugins/errors.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const { rows } = await app.pg.query<{ id: string; display_name: string }>(
      'select id, display_name from users where id = $1',
      [req.user.id],
    );
    if (rows.length === 0) {
      throw new AppError('not_found', 'user not found', 404);
    }
    const row = rows[0]!;
    return { id: row.id, displayName: row.display_name };
  });
};
