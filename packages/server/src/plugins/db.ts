import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { createPool } from '../db/pool.js';

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
  }
}

export interface DbPluginOptions {
  connectionString: string;
}

const plugin: FastifyPluginAsync<DbPluginOptions> = async (app, opts) => {
  const pool = createPool(opts.connectionString);
  app.decorate('pg', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
};

export const dbPlugin = fp(plugin, { name: 'db' });
