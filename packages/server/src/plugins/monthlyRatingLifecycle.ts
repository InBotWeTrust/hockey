import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { reconcileCompletedMonthlyRating } from '../duel/amateur/monthlyRewards.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;

export interface MonthlyRatingLifecyclePluginOptions {
  enabled?: boolean;
  intervalMs?: number;
}

export function millisecondsUntilNextMinuteBoundary(now: Date): number {
  const remainder = now.getTime() % DEFAULT_INTERVAL_MS;
  return remainder === 0 ? DEFAULT_INTERVAL_MS : DEFAULT_INTERVAL_MS - remainder;
}

const plugin: FastifyPluginAsync<MonthlyRatingLifecyclePluginOptions> = async (app, opts) => {
  if (opts.enabled === false) return;

  let closing = false;
  let activeTick: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  function tick(): Promise<void> {
    if (closing) return Promise.resolve();
    if (activeTick !== null) return activeTick;
    activeTick = (async () => {
      try {
        await reconcileCompletedMonthlyRating(app.pg, new Date());
      } catch (err) {
        app.log.error({ err }, 'monthly rating lifecycle tick failed');
      } finally {
        activeTick = null;
      }
    })();
    return activeTick;
  }

  function scheduleNextTick(): void {
    if (closing) return;
    const delay = opts.intervalMs ?? millisecondsUntilNextMinuteBoundary(new Date());
    timer = setTimeout(() => {
      timer = null;
      void tick().finally(scheduleNextTick);
    }, delay);
    timer.unref();
  }

  app.addHook('onReady', async () => {
    await tick();
    scheduleNextTick();
  });

  app.addHook('onClose', async () => {
    closing = true;
    if (timer !== null) clearTimeout(timer);
    await activeTick;
  });
};

export const monthlyRatingLifecyclePlugin = fp(plugin, {
  name: 'monthlyRatingLifecycle',
  dependencies: ['db'],
});
