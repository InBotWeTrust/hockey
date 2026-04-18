import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { redisPlugin } from '../../src/plugins/redis.js';
import { getTestUrls, hasIntegrationEnv } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('redisPlugin', () => {
  let app: FastifyInstance;
  const { redisUrl } = hasIntegrationEnv ? getTestUrls() : { redisUrl: '' };

  beforeAll(async () => {
    app = Fastify();
    await app.register(redisPlugin, { url: redisUrl });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('decorates app with a working redis client', async () => {
    expect(await app.redis.ping()).toBe('PONG');
    await app.redis.set('bootstrap-k', 'v');
    expect(await app.redis.get('bootstrap-k')).toBe('v');
  });

  it('disconnects on app shutdown', async () => {
    const app2 = Fastify();
    await app2.register(redisPlugin, { url: redisUrl });
    await app2.ready();
    const r = app2.redis;
    await r.ping();
    await app2.close();
    await expect(r.ping()).rejects.toThrow();
  });
});
