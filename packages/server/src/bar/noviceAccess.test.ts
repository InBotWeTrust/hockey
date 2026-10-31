import type { Pool } from 'pg';
import Fastify, { type FastifyRequest } from 'fastify';
import { expect, it, vi } from 'vitest';
import { createDefaultBarLayout } from '@hockey/game-core';
import { registerBarNoviceAccess, noviceBarLayout } from './noviceAccess.js';

it('removes hidden occupants and their names while retaining the five novice hosts and online games', () => {
  const source = createDefaultBarLayout();
  const layout = noviceBarLayout(source);
  expect(layout.slots.map((s) => s.occupantId)).toEqual(
    expect.arrayContaining(['igor', 'grigory', 'oleg', 'veronika', 'daria', 'online']),
  );
  expect(
    layout.slots.some((s) => ['arsenich', 'maria', 'timofey'].includes(s.occupantId ?? '')),
  ).toBe(false);
  expect(JSON.stringify(layout.profiles)).not.toMatch(/Арсенич|Тимофей|Мария/);
  expect(layout.slots.some((s) => s.id === layout.defaultSlotId)).toBe(true);
  expect(source.slots.some((s) => s.occupantId === 'arsenich')).toBe(true);
});
it('guards direct character and office requests after auth while leaving online endpoints open', async () => {
  const app = Fastify();
  let completed = false;
  app.decorate('pg', { query: vi.fn(async () => ({ rows: [{ completed }] })) } as unknown as Pool);
  const auth = async (req: FastifyRequest) => {
    req.user = { id: 'player' };
  };
  registerBarNoviceAccess(app);
  for (const url of [
    '/bar/conversations/:character',
    '/bar/staff-room',
    '/bar/games/computer',
    '/bar/games/queue',
    '/bar/cards/rooms',
    '/bar/games/local-cards',
  ])
    app.post(url, { preHandler: [auth] }, async () => ({ ok: true }));
  await app.ready();
  for (const character of ['arsenich', 'timofey', 'maria', 'elina'])
    expect(
      (await app.inject({ method: 'POST', url: `/bar/conversations/${character}` })).statusCode,
    ).toBe(403);
  for (const character of ['igor', 'grigory', 'oleg', 'veronika', 'daria'])
    expect(
      (await app.inject({ method: 'POST', url: `/bar/conversations/${character}` })).statusCode,
    ).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/bar/staff-room' })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/bar/games/computer',
        payload: { character: 'timofey' },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ method: 'POST', url: '/bar/games/queue', payload: { kind: 'battleship' } }))
      .statusCode,
  ).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/bar/cards/rooms' })).statusCode).toBe(200);
  expect(
    (await app.inject({ method: 'POST', url: '/bar/games/local-cards', payload: { id: 'old' } }))
      .statusCode,
  ).toBe(403);
  completed = true;
  expect(
    (await app.inject({ method: 'POST', url: '/bar/conversations/arsenich' })).statusCode,
  ).toBe(200);
  await app.close();
});

it('blocks saved NPC matches but preserves human matches and filters old dialogue', async () => {
  const app = Fastify();
  let opponent: string | null = 'arsenich';
  app.decorate('pg', {
    query: vi.fn(async (sql: string) => ({
      rows: sql.includes('bar_game_matches') ? [{ character: opponent }] : [{ completed: false }],
    })),
  } as unknown as Pool);
  registerBarNoviceAccess(app);
  const auth = async (req: FastifyRequest) => {
    req.user = { id: 'player' };
  };
  app.get('/bar/games/matches/:id', { preHandler: [auth] }, async () => ({ ok: true }));
  app.get('/bar/conversations/:character', { preHandler: [auth] }, async () => ({
    greeting: 'Привет',
    turns: [{ assistant: 'Незнакомец – это Арсенич.' }, { assistant: 'Как игра?' }],
  }));
  const url = '/bar/games/matches/11111111-1111-4111-8111-111111111111';
  expect((await app.inject({ url })).statusCode).toBe(403);
  opponent = null;
  expect((await app.inject({ url })).statusCode).toBe(200);
  const response = await app.inject({ url: '/bar/conversations/igor' });
  expect(response.statusCode).toBe(200);
  expect(response.body).not.toContain('Арсенич');
  expect(response.body).toContain('Как игра?');
  expect(response.json().turns).toHaveLength(2);
  await app.close();
});
