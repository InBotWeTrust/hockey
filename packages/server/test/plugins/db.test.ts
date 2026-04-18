import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { dbPlugin } from '../../src/plugins/db.js';
import { getTestUrls, hasIntegrationEnv } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('dbPlugin', () => {
  let app: FastifyInstance;
  const { databaseUrl } = hasIntegrationEnv ? getTestUrls() : { databaseUrl: '' };

  beforeAll(async () => {
    app = Fastify();
    await app.register(dbPlugin, { connectionString: databaseUrl });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('decorates app with a working pg pool', async () => {
    const { rows } = await app.pg.query<{ one: number }>('select 1 as one');
    expect(rows[0]?.one).toBe(1);
  });

  it('closes pool on app shutdown', async () => {
    const app2 = Fastify();
    await app2.register(dbPlugin, { connectionString: databaseUrl });
    await app2.ready();
    const closed = app2.pg;
    await app2.close();
    await expect(closed.query('select 1')).rejects.toThrow();
  });
});
