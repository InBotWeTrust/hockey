import Fastify, { type FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { durakRoutes } from './durakRoutes.js';
it('loads recent opponents without a query and searches by name', async () => {
  const app = Fastify();
  const query = vi
    .fn()
    .mockResolvedValue({
      rows: [{ id: 'other', display_name: 'Мария', avatar_url: null, last_seen_at: null }],
    });
  const pool = new Pool();
  vi.spyOn(pool, 'query').mockImplementation(query);
  app.decorate('pg', pool);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = { id: 'self' };
  });
  await app.register(durakRoutes);
  try {
    const quick = await app.inject('/bar/cards/players?q=');
    expect(quick.statusCode).toBe(200);
    const search = await app.inject('/bar/cards/players?q=%D0%9C%D0%B0%D1%80');
    expect(search.statusCode).toBe(200);
    expect(search.json()[0].displayName).toBe('Мария');
  } finally {
    await app.close();
    await pool.end();
  }
});
