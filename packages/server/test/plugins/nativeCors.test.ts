import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { nativeCorsPlugin } from '../../src/plugins/nativeCors.js';

describe('nativeCorsPlugin', () => {
  it('allows Capacitor HTTPS origin to call the API with authorization', async () => {
    const app = Fastify();
    await app.register(nativeCorsPlugin);
    app.get('/probe', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/probe',
      headers: {
        origin: 'https://localhost',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(response.headers.vary).toContain('Origin');

    await app.close();
  });

  it('does not grant CORS access to arbitrary origins', async () => {
    const app = Fastify();
    await app.register(nativeCorsPlugin);
    app.get('/probe', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
