import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { authPlugin } from '../../src/plugins/auth.js';
import { errorsPlugin } from '../../src/plugins/errors.js';
import { createJwt } from '../../src/auth/jwt.js';

const ACCESS = 'access-secret-1234567890abcdef';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorsPlugin);
  await app.register(
    fp(
      async (instance) => {
        instance.decorate('pg', {
          query: async () => ({ rows: [{ blocked_at: null }], rowCount: 1 }),
        });
      },
      { name: 'db' },
    ),
  );
  await app.register(authPlugin, { accessSecret: ACCESS });
  app.get('/protected', { preHandler: [app.authenticate] }, async (req) => ({
    userId: req.user.id,
  }));
  return app;
}

describe('authPlugin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects request without bearer as 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('rejects malformed bearer as 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer garbage.jwt.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid access token and sets request.user', async () => {
    const jwt = createJwt({ accessSecret: ACCESS, refreshSecret: ACCESS });
    const token = await jwt.issueAccessToken({ sub: 'user-xyz' });
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-xyz' });
  });
});
