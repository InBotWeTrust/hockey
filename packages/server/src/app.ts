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
import { meRoutes } from './routes/me.js';
import { dailyRoutes } from './duel/daily/routes.js';
import { chatRoutes } from './chat/routes.js';
import { chatWs } from './chat/ws.js';

export interface BuildAppOptions {
  config?: AppConfig;
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
  await app.register(meRoutes);
  await app.register(dailyRoutes, { dailySeedSecret: config.DAILY_SEED_SECRET });
  await app.register(chatRoutes);
  await app.register(chatWs, { accessSecret: config.JWT_SECRET });

  return app;
}
