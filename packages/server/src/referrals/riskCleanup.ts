import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { cleanupExpiredReferralRiskSignals } from './service.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

const plugin: FastifyPluginAsync = async (app) => {
  const cleanup = async (): Promise<void> => {
    try {
      await cleanupExpiredReferralRiskSignals(app.pg);
    } catch (error) {
      app.log.error({ error }, 'failed to clean expired referral risk signals');
    }
  };

  await cleanup();
  const timer = setInterval(() => { void cleanup(); }, SIX_HOURS_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
};

export const referralRiskCleanupPlugin = fp(plugin, { name: 'referral-risk-cleanup' });
