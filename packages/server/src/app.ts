import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { errorsPlugin } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { lastSeenPlugin } from './plugins/lastSeen.js';
import { realtimePlugin } from './plugins/realtime.js';
import { authRoutes } from './routes/auth.js';
import { feedbackRoutes } from './routes/feedback.js';
import { mediaRoutes } from './routes/media.js';
import { meRoutes } from './routes/me.js';
import { dailyRoutes } from './duel/daily/routes.js';
import { trainingRoutes } from './duel/training/routes.js';
import { amateurDuelRoutes } from './duel/amateur/routes.js';
import { chatRoutes } from './chat/routes.js';
import { chatWs } from './chat/ws.js';
import { adminRoutes } from './admin/routes.js';
import { pushRoutes } from './push/routes.js';
import { pushSchedulerPlugin } from './plugins/pushScheduler.js';
import { createObjectStorageClient } from './storage/objectStorage.js';

export interface BuildAppOptions {
  config?: AppConfig;
  pushSchedulerEnabled?: boolean;
  pushWorkerEnabled?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const loggerOptions =
    config.NODE_ENV === 'development'
      ? {
          level: config.LOG_LEVEL,
          transport: { target: 'pino-pretty', options: { colorize: true } },
        }
      : { level: config.LOG_LEVEL };

  const app = Fastify({ logger: loggerOptions });
  const pushVapidOptions = {
    ...(config.PUSH_VAPID_PUBLIC_KEY !== undefined
      ? { publicKey: config.PUSH_VAPID_PUBLIC_KEY }
      : {}),
    ...(config.PUSH_VAPID_PRIVATE_KEY !== undefined
      ? { privateKey: config.PUSH_VAPID_PRIVATE_KEY }
      : {}),
    ...(config.PUSH_VAPID_SUBJECT !== undefined ? { subject: config.PUSH_VAPID_SUBJECT } : {}),
  };
  const objectStorage =
    config.OBJECT_STORAGE_ENDPOINT !== undefined &&
    config.OBJECT_STORAGE_REGION !== undefined &&
    config.OBJECT_STORAGE_BUCKET !== undefined &&
    config.OBJECT_STORAGE_ACCESS_KEY_ID !== undefined &&
    config.OBJECT_STORAGE_SECRET_ACCESS_KEY !== undefined
      ? createObjectStorageClient({
          endpoint: config.OBJECT_STORAGE_ENDPOINT,
          region: config.OBJECT_STORAGE_REGION,
          bucket: config.OBJECT_STORAGE_BUCKET,
          accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY_ID,
          secretAccessKey: config.OBJECT_STORAGE_SECRET_ACCESS_KEY,
          ...(config.OBJECT_STORAGE_PUBLIC_BASE_URL !== undefined
            ? { publicBaseUrl: config.OBJECT_STORAGE_PUBLIC_BASE_URL }
            : {}),
          maxUploadBytes: config.OBJECT_STORAGE_MAX_UPLOAD_BYTES,
        })
      : undefined;

  await app.register(errorsPlugin);
  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });
  await app.register(redisPlugin, { url: config.REDIS_URL });
  await app.register(realtimePlugin);
  await app.register(authPlugin, { accessSecret: config.JWT_SECRET });
  await app.register(lastSeenPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes, {
    telegramBotToken: config.TELEGRAM_BOT_TOKEN,
    ...(config.VK_APP_ID !== undefined ? { vkAppId: config.VK_APP_ID } : {}),
    ...(config.ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS !== undefined
      ? {
          accountRecoveryTelegramProviderUids: config.ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS.split(
            ',',
          )
            .map((uid) => uid.trim())
            .filter((uid) => uid.length > 0),
        }
      : {}),
    accessSecret: config.JWT_SECRET,
    refreshSecret: config.REFRESH_SECRET,
    devLoginEnabled: config.NODE_ENV !== 'production',
  });
  await app.register(feedbackRoutes);
  await app.register(meRoutes);
  await app.register(mediaRoutes, objectStorage !== undefined ? { objectStorage } : {});
  await app.register(dailyRoutes, { dailySeedSecret: config.DAILY_SEED_SECRET });
  await app.register(trainingRoutes, { trainingSeedSecret: config.DAILY_SEED_SECRET });
  await app.register(amateurDuelRoutes, { duelSeedSecret: config.DAILY_SEED_SECRET });
  await app.register(chatRoutes, pushVapidOptions);
  await app.register(chatWs, { accessSecret: config.JWT_SECRET });
  await app.register(pushRoutes, pushVapidOptions);
  await app.register(adminRoutes, objectStorage !== undefined ? { objectStorage } : {});
  await app.register(pushSchedulerPlugin, {
    ...pushVapidOptions,
    scheduleEnabled:
      options.pushSchedulerEnabled ??
      config.PUSH_SCHEDULER_ENABLED ??
      config.NODE_ENV === 'production',
    workerEnabled:
      options.pushWorkerEnabled ?? config.PUSH_WORKER_ENABLED ?? config.NODE_ENV === 'production',
    workerConcurrency: config.PUSH_WORKER_CONCURRENCY,
    workerBatchSize: config.PUSH_WORKER_BATCH_SIZE,
  });

  return app;
}
