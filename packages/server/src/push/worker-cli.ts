import { createPool } from '../db/pool.js';
import { loadConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { cleanupPushDeliveryLog, processPushDeliveryQueue } from './queue.js';
import { runScheduledPushes } from './scheduled.js';

const DEFAULT_TICK_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

loadDotEnv();

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
let stopping = false;
let nextCleanupAt = 0;

const pushOptions = {
  ...(config.PUSH_VAPID_PUBLIC_KEY !== undefined ? { publicKey: config.PUSH_VAPID_PUBLIC_KEY } : {}),
  ...(config.PUSH_VAPID_PRIVATE_KEY !== undefined
    ? { privateKey: config.PUSH_VAPID_PRIVATE_KEY }
    : {}),
  ...(config.PUSH_VAPID_SUBJECT !== undefined ? { subject: config.PUSH_VAPID_SUBJECT } : {}),
  batchSize: config.PUSH_WORKER_BATCH_SIZE,
  concurrency: config.PUSH_WORKER_CONCURRENCY,
};

async function tick(): Promise<void> {
  const scheduled = await runScheduledPushes(pool, {
    ...pushOptions,
    workerBatchSize: config.PUSH_WORKER_BATCH_SIZE,
    workerConcurrency: config.PUSH_WORKER_CONCURRENCY,
    processQueue: false,
  });

  // Drain queued work in batches. This lets a burst at 09:00 be handled as fast
  // as the configured concurrency allows, instead of spreading it one batch per minute.
  for (;;) {
    const processed = await processPushDeliveryQueue(pool, pushOptions);
    if (processed.claimed < config.PUSH_WORKER_BATCH_SIZE) {
      let cleaned = 0;
      const now = Date.now();
      if (now >= nextCleanupAt) {
        nextCleanupAt = now + CLEANUP_INTERVAL_MS;
        cleaned = await cleanupPushDeliveryLog(pool);
      }
      const touched =
        scheduled.events.reduce((sum, event) => sum + event.claimed + event.skipped, 0) +
        processed.claimed +
        processed.retried +
        cleaned;
      if (touched > 0) {
        console.info(
          JSON.stringify({
            msg: 'push worker tick completed',
            scheduled,
            processed,
            cleanupDeleted: cleaned,
          }),
        );
      }
      return;
    }
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await pool.end();
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});

while (!stopping) {
  try {
    await tick();
  } catch (err) {
    console.error(err);
  }
  if (!stopping) {
    await wait(DEFAULT_TICK_MS);
  }
}
