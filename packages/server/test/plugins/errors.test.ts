import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { errorsPlugin, AppError } from '../../src/plugins/errors.js';

describe('errorsPlugin', () => {
  it('returns uniform 4xx JSON for AppError', async () => {
    const app = Fastify();
    await app.register(errorsPlugin);
    app.get('/boom', async () => {
      throw new AppError('not_found', 'user not found', 404);
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'user not found' } });
  });

  it('masks unknown 5xx and logs original', async () => {
    const app = Fastify({ logger: false });
    await app.register(errorsPlugin);
    app.get('/boom', async () => {
      throw new Error('leaked secret value');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('leaked');
  });

  it('passes fastify validation errors through as 400', async () => {
    const app = Fastify();
    await app.register(errorsPlugin);
    app.post<{ Body: { name: string } }>(
      '/p',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
      },
      async (req) => ({ name: req.body.name }),
    );
    const res = await app.inject({ method: 'POST', url: '/p', payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('bad_request');
  });
});
