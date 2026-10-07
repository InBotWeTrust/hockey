import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import { once } from 'node:events';
import { barRoutes } from '../../src/bar/routes.js';
vi.mock('../../src/auth/jwt.js', () => ({
  verifyAccessToken: vi.fn(async (token: string) => {
    if (token === 'invalid') throw new Error('invalid');
    return { sub: 'unit-viewer' };
  }),
}));
async function setup(blocked = false) {
  const app = Fastify();
  const query = vi.fn(async () => ({ rows: [{ blocked_at: blocked ? new Date() : null }] }));
  const get = vi.fn(async () =>
    JSON.stringify({ online: [], upcoming: [], hasMore: false, page: 0 }),
  );
  await app.register(websocket);
  await app.register(
    fp(
      async (a) => {
        a.decorate('pg', { query });
      },
      { name: 'db' },
    ),
  );
  await app.register(
    fp(
      async (a) => {
        a.decorate('redis', { get, set: vi.fn() });
      },
      { name: 'redis' },
    ),
  );
  await app.register(fp(async () => {}, { name: 'chatWs' }));
  await app.register(barRoutes, { accessSecret: 'unit-test-only' });
  await app.ready();
  return { app, query, get };
}
describe('bar websocket contract with isolated unit adapters', () => {
  it('rejects missing/invalid auth and malformed match subscriptions', async () => {
    const t = await setup();
    try {
      for (const [url, expected] of [
        ['/bar/ws', 4400],
        ['/bar/ws?token=invalid', 4401],
        ['/bar/ws?token=unit-test&kind=duel', 4400],
      ] as const) {
        const ws = await t.app.injectWS(url);
        const [code] = await once(ws, 'close');
        expect(code).toBe(expected);
      }
      expect(t.get).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('denies blocked viewers without subscribing', async () => {
    const t = await setup(true);
    try {
      const ws = await t.app.injectWS('/bar/ws?token=unit-test');
      const [code] = await once(ws, 'close');
      expect(code).toBe(4403);
      expect(t.get).not.toHaveBeenCalled();
    } finally {
      await t.app.close();
    }
  });
  it('fans out one snapshot read across viewers and accepts no gameplay writes', async () => {
    const t = await setup();
    try {
      const a = await t.app.injectWS('/bar/ws?token=unit-test');
      const b = await t.app.injectWS('/bar/ws?token=unit-test');
      const frames = await Promise.all([once(a, 'message'), once(b, 'message')]);
      expect(frames.map((f) => JSON.parse(String(f[0])))).toEqual(
        Array(2).fill({ online: [], upcoming: [], hasMore: false, page: 0 }),
      );
      expect(t.get).toHaveBeenCalledTimes(1);
      a.send(JSON.stringify({ type: 'shoot', result: 'goal' }));
      expect(t.query.mock.calls.every((c) => !String(c[0]).match(/insert|update|delete/i))).toBe(
        true,
      );
      a.close();
      b.close();
    } finally {
      await t.app.close();
    }
  });
});
