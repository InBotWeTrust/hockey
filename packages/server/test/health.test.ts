import { describe, it, expect, afterEach } from 'vitest';
import { GAME_CORE_VERSION } from '@hockey/game-core';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with { ok: true, gameCoreVersion }', async () => {
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 0,
        LOG_LEVEL: 'error',
      },
    });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      gameCoreVersion: GAME_CORE_VERSION,
    });
  });
});
