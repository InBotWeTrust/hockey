import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createAdminPreHandlers } from '../admin/guards.js';
import { AppError } from '../plugins/errors.js';
import { ARSENICH_DESTINATION_KEYS } from './destinationRegistry.js';
import { arsenichDestinationKeySchema, arsenichIntroWindowsSchema } from './types.js';

const paramsSchema = z.object({ destinationKey: arsenichDestinationKeySchema }).strict();
const inputSchema = z
  .object({ enabled: z.boolean(), windows: arsenichIntroWindowsSchema })
  .strict();
const resetSchema = z.object({ userId: z.string().uuid() }).strict();

export const arsenichAdminRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = createAdminPreHandlers(app);
  app.get('/admin/arsenich/introductions', { preHandler }, async () => {
    const result = await app.pg.query<{
      destination_key: string;
      enabled: boolean;
      revision: number;
      windows: unknown;
    }>(
      'select destination_key,enabled,revision,windows from arsenich_destination_intro order by destination_key',
    );
    const byKey = new Map(result.rows.map((row) => [row.destination_key, row]));
    return {
      introductions: ARSENICH_DESTINATION_KEYS.map((destinationKey) => {
        const row = byKey.get(destinationKey)!;
        return {
          destinationKey,
          enabled: row.enabled,
          revision: row.revision,
          windows: arsenichIntroWindowsSchema.parse(row.windows),
        };
      }),
    };
  });
  app.put('/admin/arsenich/introductions/:destinationKey', { preHandler }, async (request) => {
    const params = paramsSchema.safeParse(request.params);
    const input = inputSchema.safeParse(request.body);
    if (!params.success || !input.success)
      throw new AppError('bad_request', 'invalid Arsenich introduction', 400);
    const { rows } = await app.pg.query<{
      destination_key: string;
      enabled: boolean;
      revision: number;
      windows: unknown;
    }>(
      `update arsenich_destination_intro set enabled=$2,windows=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=now() where destination_key=$1 returning destination_key,enabled,revision,windows`,
      [
        params.data.destinationKey,
        input.data.enabled,
        JSON.stringify(input.data.windows),
        request.user.id,
      ],
    );
    const row = rows[0]!;
    return {
      introduction: {
        destinationKey: row.destination_key,
        enabled: row.enabled,
        revision: row.revision,
        windows: arsenichIntroWindowsSchema.parse(row.windows),
      },
    };
  });
  app.post(
    '/admin/arsenich/introductions/:destinationKey/reset',
    { preHandler },
    async (request) => {
      const params = paramsSchema.safeParse(request.params);
      const input = resetSchema.safeParse(request.body);
      if (!params.success || !input.success)
        throw new AppError('bad_request', 'invalid Arsenich reset', 400);
      await app.pg.query(
        'delete from arsenich_destination_intro_view where user_id=$1 and destination_key=$2',
        [input.data.userId, params.data.destinationKey],
      );
      return { reset: true };
    },
  );
};
