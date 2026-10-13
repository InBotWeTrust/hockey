import { expect, it, vi } from 'vitest';
import { assertBonusChallengeRouteAccess } from '../../src/bonusGames/challengeAccess.js';
it('rejects production launch by game ID before any mutation', async () => {
  const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ skill_code: 'challenge', slug: 'challenge-ski-resort' }] }));
  await expect(assertBonusChallengeRouteAccess({ query } as never, false, 'user', { gameId: 'game' }))
    .rejects.toMatchObject({ code: 'bonus_game_in_development', statusCode: 403 });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]?.[0]).toMatch(/^select /);
});
it('rejects direct period/shot access by owned attempt ID', async () => {
  const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ skill_code: 'challenge', slug: 'challenge-ski-resort' }] }));
  await expect(assertBonusChallengeRouteAccess({ query } as never, false, 'user', { attemptId: 'attempt' })).rejects.toThrow();
  expect(query.mock.calls[0]?.[1]).toEqual(['attempt', 'user']);
});
it('allows local development and keeps other modes available', async () => {
  const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ skill_code: 'speed' }] }));
  await assertBonusChallengeRouteAccess({ query } as never, false, 'user', { gameId: 'game' });
  await assertBonusChallengeRouteAccess({ query } as never, true, 'user', { gameId: 'game' });
  expect(query).toHaveBeenCalledTimes(1);
});

it.each([
  ['POST', '/bonus-games/00000000-0000-4000-8000-000000000901/attempts'],
  ['GET', '/bonus-games/attempts/00000000-0000-4000-8000-000000000999'],
  ['POST', '/bonus-games/attempts/00000000-0000-4000-8000-000000000999/period/start'],
  ['POST', '/bonus-games/attempts/00000000-0000-4000-8000-000000000999/shot'],
  ['POST', '/bonus-games/attempts/00000000-0000-4000-8000-000000000999/beach/cleanup'],
])('blocks direct production route %s %s before its handler', async (method, url) => {
  const { default: Fastify } = await import('fastify');
  const { bonusGameRoutes } = await import('../../src/bonusGames/routes.js');
  const app = Fastify();
  const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ skill_code: 'challenge', slug: 'challenge-ski-resort' }] }));
  app.decorate('pg', { query });
  // Authenticated synthetic request, isolated from the real application/session store.
  app.decorate('authenticate', async (request: { user: { id: string } }) => { request.user = { id: 'synthetic-owner' }; });
  await app.register(bonusGameRoutes, { bonusSeedSecret: 'synthetic-test-seed', dailyAttemptLimit: 2 });
  try {
    const response = await app.inject({ method: method as 'POST' | 'GET', url });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Локация в разработке');
    expect(query).toHaveBeenCalledTimes(1);
  } finally { await app.close(); }
});

it('allows the released beach location in production', async () => {
  const query = vi.fn(async () => ({ rows: [{ skill_code: 'challenge', slug: 'challenge-beach' }] }));
  await expect(assertBonusChallengeRouteAccess({ query } as never, false, 'user', { gameId: 'beach' })).resolves.toBeUndefined();
});
