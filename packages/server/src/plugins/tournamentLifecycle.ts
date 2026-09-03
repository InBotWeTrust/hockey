import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Pool } from 'pg';
import {
  reconcileTournamentLifecycle,
  type TournamentLifecycleReconcileReport,
} from '../tournament/automaticLifecycle.js';
import { reconcilePlayoffDayStartingCommunications } from '../tournament/communications.js';
import type { EventPublisher } from '../chat/events.js';
import { isTournamentFeatureEnabled } from '../tournament/service.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;

export interface TournamentLifecyclePluginOptions {
  enabled?: boolean;
  intervalMs?: number;
  classicSeedSecret: string;
  systemUserId?: string;
  publisher?: EventPublisher;
}

export interface ReconcileTournamentLifecycleBestEffortOptions {
  tournamentId?: string;
  now?: Date;
}

interface ReconcileBestEffortDependencies extends ReconcileTournamentLifecycleBestEffortOptions {
  pool: Pool;
  log: FastifyBaseLogger;
  classicSeedSecret: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    reconcileTournamentLifecycleBestEffort(
      options?: ReconcileTournamentLifecycleBestEffortOptions,
    ): Promise<TournamentLifecycleReconcileReport | null>;
  }
}

/** Lifecycle errors must not turn a valid read or completed mutation into a 500. */
export async function reconcileBestEffort(
  options: ReconcileBestEffortDependencies,
): Promise<TournamentLifecycleReconcileReport | null> {
  try {
    if (!(await isTournamentFeatureEnabled(options.pool))) return null;
    const report = await reconcileTournamentLifecycle(options.pool, {
      now: options.now ?? new Date(),
      ...(options.tournamentId === undefined ? {} : { tournamentId: options.tournamentId }),
      classicSeedSecret: options.classicSeedSecret,
    });
    if (report.failures.length > 0) {
      options.log.error(
        { failures: report.failures },
        'tournament lifecycle reconcile completed with failures',
      );
    }
    return report;
  } catch (err) {
    options.log.error(
      {
        err,
        ...(options.tournamentId === undefined ? {} : { tournamentId: options.tournamentId }),
      },
      'tournament lifecycle reconcile failed',
    );
    return null;
  }
}

const plugin: FastifyPluginAsync<TournamentLifecyclePluginOptions> = async (app, opts) => {
  app.decorate('reconcileTournamentLifecycleBestEffort', (options = {}) =>
    reconcileBestEffort({
      pool: app.pg,
      log: app.log,
      classicSeedSecret: opts.classicSeedSecret,
      ...options,
    }),
  );

  if (opts.enabled === false) return;

  let closing = false;
  let activeTick: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  function tick(): Promise<void> {
    if (closing) return Promise.resolve();
    if (activeTick !== null) return activeTick;
    activeTick = (async () => {
      try {
        if (!(await isTournamentFeatureEnabled(app.pg))) return;
        const report = await reconcileTournamentLifecycle(app.pg, {
          now: new Date(),
          classicSeedSecret: opts.classicSeedSecret,
        });
        if (opts.publisher !== undefined) {
          await reconcilePlayoffDayStartingCommunications(app.pg, {
            now: new Date(),
            publisher: opts.publisher,
            ...(opts.systemUserId === undefined ? {} : { systemUserId: opts.systemUserId }),
          });
        }
        if (report.failures.length > 0) {
          app.log.error(
            { failures: report.failures },
            'tournament lifecycle tick completed with failures',
          );
        }
        const changed = report.items.filter((item) => item.changed);
        if (changed.length > 0) {
          app.log.info({ changed }, 'tournament lifecycle tick completed');
        }
      } catch (err) {
        app.log.error({ err }, 'tournament lifecycle tick failed');
      } finally {
        activeTick = null;
      }
    })();
    return activeTick;
  }

  app.addHook('onReady', async () => {
    await tick();
    setImmediate(() => {
      if (closing) return;
      timer = setInterval(() => {
        void tick();
      }, opts.intervalMs ?? DEFAULT_INTERVAL_MS);
      timer.unref();
    });
  });
  app.addHook('onClose', async () => {
    closing = true;
    if (timer !== null) clearInterval(timer);
    await activeTick;
  });
};

export const tournamentLifecyclePlugin = fp(plugin, {
  name: 'tournamentLifecycle',
  dependencies: ['db'],
});
