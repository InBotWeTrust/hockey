import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { listActiveCoinPackages } from './catalog.js';
import { createCoinPayment } from './service.js';
import type { YooKassaClient } from './yookassaClient.js';

interface CoinPackageRoutesOptions {
  yookassaClient?: YooKassaClient;
}

const createPaymentBody = z
  .object({ packageId: z.string().uuid(), attemptId: z.string().uuid() })
  .strict();

export const coinPackageRoutes: FastifyPluginAsync<CoinPackageRoutesOptions> = async (
  app,
  options,
) => {
  app.get('/bank/packages', async () => ({ packages: await listActiveCoinPackages(app.pg) }));
  app.post('/bank/payments', { preHandler: app.authenticate }, async (req) => {
    const body = createPaymentBody.parse(req.body);
    if (!options.yookassaClient) {
      throw new AppError('payments_unavailable', 'Оплата временно недоступна', 503);
    }
    return createCoinPayment(
      app.pg,
      options.yookassaClient,
      req.user.id,
      body.packageId,
      body.attemptId,
    );
  });
};
