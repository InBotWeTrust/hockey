import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { listActiveCoinPackages } from './catalog.js';
import { createCoinPayment, reconcileYooKassaPayment } from './service.js';
import type { YooKassaClient } from './yookassaClient.js';

interface CoinPackageRoutesOptions {
  yookassaClient?: YooKassaClient;
}

const createPaymentBody = z
  .object({ packageId: z.string().uuid(), attemptId: z.string().uuid() })
  .strict();
const paymentParams = z.object({ id: z.string().uuid() });
const webhookBody = z.object({
  type: z.literal('notification'),
  event: z.enum(['payment.succeeded', 'payment.canceled', 'payment.waiting_for_capture']),
  object: z.object({ id: z.string().min(1).max(128) }),
});

export const coinPackageRoutes: FastifyPluginAsync<CoinPackageRoutesOptions> = async (
  app,
  options,
) => {
  app.get('/bank/packages', async () => ({ packages: await listActiveCoinPackages(app.pg) }));
  app.get('/bank/payments/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = paymentParams.parse(req.params);
    const payment = (
      await app.pg.query<{ status: string }>(
        'select status from payments where id = $1 and user_id = $2',
        [id, req.user.id],
      )
    ).rows[0];
    if (!payment) throw new AppError('not_found', 'Платёж не найден', 404);
    return { status: payment.status };
  });
  app.post('/bank/payments/yookassa/webhook', async (req) => {
    const { object } = webhookBody.parse(req.body);
    if (!options.yookassaClient) {
      throw new AppError('payments_unavailable', 'Оплата временно недоступна', 503);
    }
    try {
      await reconcileYooKassaPayment(app.pg, options.yookassaClient, object.id);
    } catch (error) {
      req.log.warn(
        {
          providerPaymentId: object.id,
          code: error instanceof AppError ? error.code : 'payment_reconciliation_failed',
        },
        'YooKassa payment reconciliation failed',
      );
      throw error;
    }
    req.log.info({ providerPaymentId: object.id }, 'YooKassa payment reconciled');
    return { ok: true };
  });
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
