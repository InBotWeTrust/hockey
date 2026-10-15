import Fastify, { type FastifyRequest } from 'fastify';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { errorsPlugin as errors } from '../../plugins/errors.js';
import { barGameRoutes } from './routes.js';
import { gameAction } from './routes.js';
it('rejects impossible inputs before touching persistent state and requires authentication', async () => {
  const app = Fastify();
  const query = vi.fn();
  app.decorate('pg', { query } as unknown as Pool);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001' };
  });
  await app.register(errors);
  await app.register(barGameRoutes);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/bar/games/matches/00000000-0000-4000-8000-000000000002',
      payload: {
        requestId: '00000000-0000-4000-8000-000000000003',
        revision: 0,
        action: { type: 'shot', angle: 0, power: 20 },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
  const unauth = Fastify();
  unauth.decorate('pg', {} as Pool);
  unauth.decorate('authenticate', async () => {
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  });
  await unauth.register(barGameRoutes);
  try {
    expect((await unauth.inject('/bar/games/lobby')).statusCode).toBe(401);
  } finally {
    await unauth.close();
  }
});
it('bounds gesture duration, chain length and finite coordinates', () => {
  expect(
    gameAction.safeParse({ type: 'dart', gesture: { dx: 0, dy: -1, durationMs: 1 } }).success,
  ).toBe(false);
  expect(gameAction.safeParse({ type: 'place', point: { x: Infinity, y: 0 } }).success).toBe(false);
  expect(gameAction.safeParse({ type: 'checkers', path: [1] }).success).toBe(false);
});
