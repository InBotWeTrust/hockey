import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.js';
import { loadConfig, type AppConfig } from './config.js';

export interface BuildAppOptions {
  config?: AppConfig;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(healthRoutes);

  return app;
}
