import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { cleanupPushDeliveryLog, processPushDeliveryQueue } from '../push/queue.js';
import { runScheduledPushes } from '../push/scheduled.js';
import type { PushVapidOptions } from '../push/service.js';

export interface PushSchedulerPluginOptions extends PushVapidOptions {
  scheduleEnabled?: boolean;
  workerEnabled?: boolean;
  intervalMs?: number;
  workerBatchSize?: number;
  workerConcurrency?: number;
}

const DEFAULT_INTERVAL_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const plugin: FastifyPluginAsync<PushSchedulerPluginOptions> = async (app, opts) => {
  if (opts.scheduleEnabled === false && opts.workerEnabled === false) return;

  let running = false;
  let nextCleanupAt = 0;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const result =
        opts.scheduleEnabled === false
          ? {
              enabled: true,
              events: [],
            }
          : await runScheduledPushes(app.pg, {
              ...opts,
              processQueue: false,
            });
      const workerResult =
        opts.workerEnabled === false
          ? {
              enabled: true,
              claimed: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              retried: 0,
              events: [],
            }
          : await processPushDeliveryQueue(app.pg, {
              ...opts,
              ...(opts.workerBatchSize !== undefined ? { batchSize: opts.workerBatchSize } : {}),
              ...(opts.workerConcurrency !== undefined
                ? { concurrency: opts.workerConcurrency }
                : {}),
            });
      let cleaned = 0;
      const now = Date.now();
      if (opts.workerEnabled !== false && now >= nextCleanupAt) {
        nextCleanupAt = now + CLEANUP_INTERVAL_MS;
        cleaned = await cleanupPushDeliveryLog(app.pg);
      }
      if (!result.enabled && !workerResult.enabled) return;

      const touched = result.events.reduce(
        (sum, event) => sum + event.claimed + event.sent + event.failed + event.retried,
        workerResult.claimed +
          workerResult.sent +
          workerResult.failed +
          workerResult.retried +
          cleaned,
      );
      if (touched > 0) {
        app.log.info(
          { pushScheduler: result, pushWorker: workerResult, pushCleanupDeleted: cleaned },
          'push tick completed',
        );
      }
    } catch (err) {
      app.log.error({ err }, 'scheduled push tick failed');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  timer.unref();

  app.addHook('onReady', async () => {
    void tick();
  });

  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
};

export const pushSchedulerPlugin = fp(plugin, {
  name: 'pushScheduler',
  dependencies: ['db'],
});
