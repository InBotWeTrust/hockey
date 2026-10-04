import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { completeDestinationIntro, getDestinationIntro } from './guidanceService.js';
import { arsenichDestinationKeySchema } from './types.js';

const paramsSchema = z.object({ destinationKey: arsenichDestinationKeySchema }).strict();
const completionSchema = z.object({ revision: z.number().int().positive() }).strict();

export const arsenichRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/arsenich/introductions/:destinationKey',
    { preHandler: [app.authenticate] },
    async (request) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success)
        throw new AppError('arsenich_destination_unknown', 'unknown Arsenich destination', 400);
      return {
        intro: await getDestinationIntro(app.pg, request.user.id, parsed.data.destinationKey),
      };
    },
  );
  app.post(
    '/arsenich/introductions/:destinationKey/complete',
    { preHandler: [app.authenticate] },
    async (request) => {
      const params = paramsSchema.safeParse(request.params);
      const body = completionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        throw new AppError('bad_request', 'invalid Arsenich introduction completion', 400);
      const client = await app.pg.connect();
      try {
        await client.query('begin');
        const existing = await client.query(
          `select 1 from arsenich_destination_intro_view where user_id=$1 and destination_key=$2`,
          [request.user.id, params.data.destinationKey],
        );
        const result = existing.rows[0]
          ? { viewed: true as const }
          : await completeDestinationIntro(
              client,
              request.user.id,
              params.data.destinationKey,
              body.data.revision,
            );
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );
};
