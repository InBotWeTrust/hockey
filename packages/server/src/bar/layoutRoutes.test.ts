import { expect, it, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify';
import { createDefaultBarLayout, upgradeBarLayout, type BarLayoutSnapshot } from '@hockey/game-core';
import { barLayoutRoutes } from './layoutRoutes.js';
let app: ReturnType<typeof Fastify>;
let stored: BarLayoutSnapshot;
beforeEach(async () => {
  stored = { revision: 1, layout: createDefaultBarLayout() };
  app = Fastify();
  app.decorate(
    'authenticate',
    async (request: { headers: Record<string, unknown>; user?: { id: string } }) => {
      if (!request.headers.authorization)
        throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
      request.user = { id: String(request.headers.authorization) };
    },
  );
  app.decorate('pg', {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('select role'))
        return { rows: [{ role: values[0] === 'admin' ? 'admin' : 'player' }] };
      if (sql.startsWith('update bar_layout')) {
        if (values[0] !== stored.revision) return { rows: [] };
        stored = { revision: stored.revision + 1, layout: JSON.parse(String(values[1])) };
      }
      return { rows: [structuredClone(stored)] };
    },
  });
  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) =>
    reply.status(err.statusCode ?? 500).send({ error: { code: err.code, message: err.message } }),
  );
  await app.register(barLayoutRoutes);
  await app.ready();
});
afterEach(async () => {
  await app.close();
});
it('authenticates reads and restricts writes to administrators', async () => {
  expect((await app.inject('/bar/layout')).statusCode).toBe(401);
  expect(
    (await app.inject({ url: '/bar/layout', headers: { authorization: 'player' } })).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/admin/bar/layout',
        headers: { authorization: 'player' },
        payload: stored,
      })
    ).statusCode,
  ).toBe(403);
});
it('saves once atomically and rejects a stale concurrent write', async () => {
  const payload = structuredClone(stored);
  payload.layout.profiles.maria.name = 'Маша';
  const responses = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: 'PUT',
        url: '/admin/bar/layout',
        headers: { authorization: 'admin' },
        payload,
      }),
    ),
  );
  expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(stored.revision).toBe(2);
  expect(stored.layout.profiles.maria.name).toBe('Маша');
  expect(responses.find((r) => r.statusCode === 409)?.json().error.code).toBe(
    'bar_layout_conflict',
  );
  const read = await app.inject({ url: '/admin/bar/layout', headers: { authorization: 'admin' } });
  expect(read.json()).toEqual(stored);
  const novice=await app.inject({url:'/bar/layout',headers:{authorization:'player'}});
  expect(novice.json().novice).toBe(true);
  expect(novice.json().layout.slots.some((slot:{occupantId:string})=>slot.occupantId==='maria')).toBe(false);
});
it.each(['duplicate', 'path', 'bounds', 'default', 'unknown', 'actions'])(
  'rejects invalid %s without writing',
  async (kind) => {
    const payload = structuredClone(stored);
    if (kind === 'duplicate') payload.layout.slots[0]!.occupantId = 'maria';
    if (kind === 'path') payload.layout.profiles.maria.avatar = '/bar/../secret.png';
    if (kind === 'bounds') payload.layout.slots[0]!.scale = 2;
    if (kind === 'default') payload.layout.defaultSlotId = 'missing';
    if (kind === 'unknown') Object.assign(payload.layout.slots[0]!, { occupantId: 'stranger' });
    if (kind === 'actions')
      Object.assign(payload.layout.profiles.maria, { actions: ['arbitrary'] });
    const response = await app.inject({
      method: 'PUT',
      url: '/admin/bar/layout',
      headers: { authorization: 'admin' },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(stored.revision).toBe(1);
  },
);

it('migration seed matches the shared initial layout', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(
    new URL('../../db/migrations/198_bar_layout.sql', import.meta.url),
    'utf8',
  );
  const seed = sql.match(/values \(1,'(.+)'::jsonb\)/)?.[1];
  expect(seed).toBeDefined();
  expect(upgradeBarLayout(JSON.parse(seed!.replaceAll("''", "'")))).toEqual(createDefaultBarLayout());
});
