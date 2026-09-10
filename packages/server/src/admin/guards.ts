import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { AppError } from '../plugins/errors.js';

export async function requireAdmin(app: FastifyInstance, request: FastifyRequest): Promise<void> {
  const { rows } = await app.pg.query<{ role: 'player' | 'admin' }>(
    'select role from users where id = $1',
    [request.user.id],
  );
  if (rows[0]?.role !== 'admin') {
    throw new AppError('forbidden', 'admin role required', 403);
  }
}

export function createAdminPreHandlers(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.authenticate, async (request) => requireAdmin(app, request)];
}
