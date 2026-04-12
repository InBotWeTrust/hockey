import type { FastifyPluginAsync } from 'fastify';
import { GAME_CORE_VERSION } from '@hockey/game-core';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    ok: true,
    gameCoreVersion: GAME_CORE_VERSION,
  }));
};
