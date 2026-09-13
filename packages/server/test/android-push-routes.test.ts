import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorsPlugin } from '../src/plugins/errors.js';
import { pushRoutes } from '../src/push/routes.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';

async function buildTestApp() {
  const app = Fastify();
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  app.decorate('pg', { query } as never);
  app.decorate('authenticate', async (req: { user: { id: string } }) => {
    req.user = { id: USER_ID };
  });
  await app.register(errorsPlugin);
  await app.register(pushRoutes, {});
  return { app, query };
}

describe('Android push installation routes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers and rotates an installation idempotently', async () => {
    const { app, query } = await buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/push/android/installations/${INSTALLATION_ID}`,
      payload: { token: 'fcm-registration-token', appVersionCode: 7 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(query).toHaveBeenCalledOnce();
    await app.close();
  });

  it.each([
    { id: 'not-a-uuid', body: { token: 'valid-token', appVersionCode: 1 } },
    { id: INSTALLATION_ID, body: { token: '', appVersionCode: 1 } },
    { id: INSTALLATION_ID, body: { token: 'valid-token', appVersionCode: 0 } },
  ])('rejects invalid registration %#', async ({ id, body }) => {
    const { app, query } = await buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/push/android/installations/${id}`,
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
    await app.close();
  });

  it('deletes only the authenticated user installation', async () => {
    const { app, query } = await buildTestApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/push/android/installations/${INSTALLATION_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(query.mock.calls[0]?.[1]).toEqual([USER_ID, INSTALLATION_ID]);
    await app.close();
  });
});
