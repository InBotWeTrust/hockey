import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export interface RedisPluginOptions {
  url: string;
}

const plugin: FastifyPluginAsync<RedisPluginOptions> = async (app, opts) => {
  const client = new Redis(opts.url, { lazyConnect: false, maxRetriesPerRequest: 1 });
  app.decorate('redis', client);
  app.addHook('onClose', async () => {
    await client.quit();
  });
};

export const redisPlugin = fp(plugin, { name: 'redis' });
