import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';
import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { errorsPlugin } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';

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
  await app.register(authPlugin, { accessSecret: config.JWT_SECRET });
  await app.register(healthRoutes);
  await app.register(authRoutes, {
    telegramBotToken: config.TELEGRAM_BOT_TOKEN,
    accessSecret: config.JWT_SECRET,
    refreshSecret: config.REFRESH_SECRET,
  });

  return app;
}
