import type { Pool, PoolClient } from 'pg';

export interface PoolClientConcurrencyTracker {
  activeQueries: number;
  maxConcurrentQueries: number;
}

export function trackPoolClientQueries(
  client: PoolClient,
  tracker: PoolClientConcurrencyTracker = { activeQueries: 0, maxConcurrentQueries: 0 },
): { client: PoolClient; tracker: PoolClientConcurrencyTracker } {
  const originalQuery = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
  const trackedClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'query') {
        return async (...args: unknown[]) => {
          tracker.activeQueries += 1;
          tracker.maxConcurrentQueries = Math.max(
            tracker.maxConcurrentQueries,
            tracker.activeQueries,
          );
          await Promise.resolve();
          try {
            return await originalQuery(...args);
          } finally {
            tracker.activeQueries -= 1;
          }
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { client: trackedClient, tracker };
}

export function trackPoolConnections(pool: Pool): {
  pool: Pool;
  tracker: PoolClientConcurrencyTracker;
} {
  const tracker: PoolClientConcurrencyTracker = { activeQueries: 0, maxConcurrentQueries: 0 };
  const trackedPool = new Proxy(pool, {
    get(target, property, receiver) {
      if (property === 'connect') {
        return async () => {
          const client = await target.connect();
          return trackPoolClientQueries(client, tracker).client;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { pool: trackedPool, tracker };
}
