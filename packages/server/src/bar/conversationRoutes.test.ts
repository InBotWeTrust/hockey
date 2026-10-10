import Fastify, { type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  conversationRoutes,
  type ConversationStore,
  type ConversationRecord,
} from './conversationRoutes.js';

let app: ReturnType<typeof Fastify>;
let records: Map<string, ConversationRecord>;
let answer: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  records = new Map();
  answer = vi.fn().mockResolvedValue('Рада тебя видеть. Как прошла игра?');
  const store: ConversationStore = {
    read: async (user, character) =>
      records.get(`${user}:${character}`) ?? { revision: 0, turns: [], pending: false },
    reserve: async (user, character, id, revision) => {
      const key = `${user}:${character}`;
      const row = records.get(key) ?? { revision: 0, turns: [], pending: false };
      const previous = row.turns.find((t) => t.id === id);
      if (previous) return { kind: 'duplicate', record: row };
      if (row.pending) return { kind: 'busy' };
      if (row.revision !== revision) return { kind: 'stale' };
      records.set(key, { ...row, pending: true });
      return { kind: 'reserved', record: row };
    },
    complete: async (user, character, turn) => {
      const key = `${user}:${character}`;
      const row = records.get(key)!;
      const updated = { revision: row.revision + 1, turns: [...row.turns, turn], pending: false };
      records.set(key, updated);
      return updated;
    },
    release: async (user, character) => {
      const row = records.get(`${user}:${character}`);
      if (row) row.pending = false;
    },
  };
  app = Fastify();
  app.decorate(
    'authenticate',
    async (request: { headers: Record<string, unknown>; user?: { id: string } }) => {
      if (!request.headers.authorization)
        throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
      request.user = { id: String(request.headers.authorization) };
    },
  );
  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) =>
    reply.status(err.statusCode ?? 500).send({ error: { code: err.code } }),
  );
  await app.register(conversationRoutes, { store, answer });
});
afterEach(async () => app.close());
const send = (
  user = 'alice',
  id = '11111111-1111-4111-8111-111111111111',
  revision = 0,
  content = 'Привет!',
) =>
  app.inject({
    method: 'POST',
    url: '/bar/conversations/maria',
    headers: { authorization: user },
    payload: { id, revision, content },
  });
it('requires authentication and rejects non-character locations', async () => {
  expect((await app.inject('/bar/conversations/maria')).statusCode).toBe(401);
  expect(
    (await app.inject({ url: '/bar/conversations/online', headers: { authorization: 'alice' } }))
      .statusCode,
  ).toBe(400);
});
it('starts with a fixed greeting and keeps each player history private', async () => {
  const first = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'alice' },
  });
  expect(first.json().greeting).toBeTruthy();
  expect(first.json().turns).toEqual([]);
  expect(answer).not.toHaveBeenCalled();
  expect((await send()).statusCode).toBe(200);
  const own = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'alice' },
  });
  expect(own.json().turns).toHaveLength(1);
  const other = await app.inject({
    url: '/bar/conversations/maria',
    headers: { authorization: 'bob' },
  });
  expect(other.json().turns).toEqual([]);
});
it('does not pay for a retried successful turn twice', async () => {
  await send();
  expect((await send()).statusCode).toBe(200);
  expect(answer).toHaveBeenCalledTimes(1);
});
it('rejects stale and duplicate concurrent requests', async () => {
  let resolve!: (s: string) => void;
  answer.mockImplementation(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  const first = send();
  await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(1));
  expect((await send()).statusCode).toBe(409);
  resolve('Привет!');
  await first;
  expect((await send('alice', '22222222-2222-4222-8222-222222222222')).statusCode).toBe(409);
});
it('preserves history and permits retry after provider failure', async () => {
  answer.mockRejectedValueOnce(new Error('secret provider error'));
  const failed = await send();
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain('secret');
  expect(records.get('alice:maria')?.turns).toEqual([]);
  expect((await send()).statusCode).toBe(200);
});
it.each(['', ' '.repeat(5), 'x'.repeat(4001)])(
  'rejects invalid message before calling AI',
  async (content) => {
    expect((await send('alice', undefined, 0, content)).statusCode).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  },
);
