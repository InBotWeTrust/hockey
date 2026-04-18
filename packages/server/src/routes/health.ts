import type { FastifyPluginAsync } from 'fastify';
import { GAME_CORE_VERSION } from '@hockey/game-core';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    const checks = { db: false, redis: false };
    try {
      await app.pg.query('select 1');
      checks.db = true;
    } catch (err) {
      app.log.warn({ err }, 'health: db probe failed');
    }
    try {
      const pong = await app.redis.ping();
      checks.redis = pong === 'PONG';
    } catch (err) {
      app.log.warn({ err }, 'health: redis probe failed');
    }
    const ok = checks.db && checks.redis;
    reply.status(ok ? 200 : 503).send({
      ok,
      gameCoreVersion: GAME_CORE_VERSION,
      checks,
    });
  });
};
