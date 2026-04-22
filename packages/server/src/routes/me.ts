import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const { rows } = await app.pg.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      grip: string;
      tg_id: string | null;
      username: string | null;
    }>(
      `select u.id, u.display_name, u.avatar_url, u.grip,
              ap.provider_uid as tg_id,
              ap.provider_data->>'username' as username
         from users u
         left join auth_providers ap
           on ap.user_id = u.id and ap.provider = 'telegram'
        where u.id = $1`,
      [req.user.id],
    );
    if (rows.length === 0) {
      throw new AppError('not_found', 'user not found', 404);
    }
    const row = rows[0]!;
    return {
      id: row.id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {}),
      grip: row.grip as 'right' | 'left',
      ...(row.tg_id !== null ? { tgId: row.tg_id } : {}),
      ...(row.username !== null ? { username: row.username } : {}),
    };
  });

  app.patch('/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ grip: z.enum(['right', 'left']) }).safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid body', 400);
    }
    await app.pg.query('update users set grip = $1 where id = $2', [
      body.data.grip,
      req.user.id,
    ]);
    return { grip: body.data.grip };
  });
};
