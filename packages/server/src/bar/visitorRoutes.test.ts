import Fastify, { type FastifyRequest } from 'fastify';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { errorsPlugin } from '../plugins/errors.js';
import { visitorRoutes, visitorSettingsSchema } from './visitorRoutes.js';
import { defaultVisitorSettings } from './visitorRules.js';
it('requires authentication and rejects malformed purchases before storage', async () => {
  const app = Fastify();
  const query = vi.fn();
  app.decorate('pg', { query } as unknown as Pool);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (!req.headers.authorization)
      throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
    req.user = { id: '00000000-0000-4000-8000-000000000001' };
  });
  await app.register(errorsPlugin);
  await app.register(visitorRoutes);
  try {
    expect((await app.inject('/bar/visitor')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/bar/visitor/purchases',
          headers: { authorization: 'player' },
          payload: { currency: 'rubles' },
        })
      ).statusCode,
    ).toBe(400);
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it('validates settings and prevents duplicate products or lower member limits', () => {
  expect(visitorSettingsSchema.safeParse(defaultVisitorSettings).success).toBe(true);
  expect(
    visitorSettingsSchema.safeParse({ ...defaultVisitorSettings, cardMessages: 1 }).success,
  ).toBe(false);
  expect(
    visitorSettingsSchema.safeParse({
      ...defaultVisitorSettings,
      products: [...defaultVisitorSettings.products, defaultVisitorSettings.products[0]],
    }).success,
  ).toBe(false);
});

it('prevents ordinary players from reading or changing bar economy', async () => {
  const app = Fastify();
  app.decorate('pg', {
    query: vi.fn(async () => ({ rows: [{ role: 'player' }] })),
  } as unknown as Pool);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001' };
  });
  await app.register(errorsPlugin);
  await app.register(visitorRoutes);
  try {
    expect((await app.inject('/admin/bar/visitor')).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bar/visitor',
          payload: { revision: 1, settings: defaultVisitorSettings },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});

it('updates message-pack titles together with editable quantities', () => {
  const settings = structuredClone(defaultVisitorSettings);
  settings.products[1]!.amount = 50;
  expect(visitorSettingsSchema.parse(settings).products[1]!.title).toBe(
    '50 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439',
  );
});
