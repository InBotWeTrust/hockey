import type { FastifyPluginAsync } from 'fastify';
import { listActiveCoinPackages } from './catalog.js';

export const coinPackageRoutes: FastifyPluginAsync = async (app) => {
  app.get('/bank/packages', async () => ({ packages: await listActiveCoinPackages(app.pg) }));
};
