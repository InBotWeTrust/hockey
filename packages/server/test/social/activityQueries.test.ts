import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { socialRoutes } from '../../src/social/routes.js';

it.each([true, false])('reads fan access once and preserves access guard (following=%s)', async following => {
  const app = Fastify();
  const viewer = '00000000-0000-4000-8000-000000000001';
  const player = '00000000-0000-4000-8000-000000000002';
  const query = vi.fn(async (sql: string) => ({rows: sql.includes('followers_count') ? [{followers_count: 1, following_count: 0, following, account_kind: 'player'}] : []}));
  app.decorate('pg', {query});
  app.decorate('authenticate', async (req: {user: {id: string}}) => {req.user = {id: viewer};});
  await app.register(socialRoutes);
  try {
    const response = await app.inject(`/users/${player}/activity`);
    expect(response.statusCode).toBe(following ? 200 : 403);
    expect(query.mock.calls.filter(([sql]) => sql.includes('followers_count'))).toHaveLength(1);
    if (!following) expect(query).toHaveBeenCalledTimes(1);
  } finally {await app.close();}
});
