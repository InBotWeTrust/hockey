import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { cityWeatherRoutes } from '../src/cityWeather/routes.js';
import { errorsPlugin } from '../src/plugins/errors.js';
import { CityWeatherService } from '../src/cityWeather/service.js';
const city = {
  id: '1',
  name: 'Москва',
  region: 'Москва',
  country: 'Россия',
  latitude: 55.75,
  longitude: 37.62,
  timeZone: 'Europe/Moscow',
};
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const app = Fastify();
  const users = new Map<string, unknown>([
    ['alice', null],
    ['bob', city],
  ]);
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('select'))
      return {
        rows: users.has(String(values[0])) ? [{ map_city: users.get(String(values[0])) }] : [],
        rowCount: 1,
      };
    const id = String(values[1]);
    if (!users.has(id)) return { rows: [], rowCount: 0 };
    users.set(id, values[0] ? JSON.parse(String(values[0])) : null);
    return { rows: [{ id }], rowCount: 1 };
  });
  app.decorate('pg', { query });
  const redis = { incr: async (_key: string) => 1, expire: async () => 1 };
  app.decorate('redis', redis);
  app.decorate('authenticate', async (req: any, reply: any) => {
    const id = req.headers['test-owner'];
    if (!id) return reply.code(401).send({ error: 'unauthorized' });
    req.user = { id };
  });
  await app.register(errorsPlugin);
  await app.register(cityWeatherRoutes);
  return { app, query, users, redis };
}
it('requires authentication on search, city read/write and weather', async () => {
  const { app, query } = await setup();
  try {
    for (const options of [
      { method: 'GET', url: '/cities?q=Moscow' },
      { method: 'GET', url: '/me/city' },
      { method: 'PUT', url: '/me/city', payload: { cityId: '1' } },
      { method: 'GET', url: '/me/weather?cityId=1' },
    ] as const) {
      expect((await app.inject(options)).statusCode).toBe(401);
    }
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it('persists only the authenticated account and returns it to a second session', async () => {
  vi.spyOn(CityWeatherService.prototype, 'resolveCity').mockResolvedValue(city);
  const { app, users } = await setup();
  try {
    const save = await app.inject({
      method: 'PUT',
      url: '/me/city',
      headers: { 'test-owner': 'alice' },
      payload: { cityId: '1' },
    });
    expect(save.statusCode).toBe(200);
    expect(
      (
        await app.inject({ method: 'GET', url: '/me/city', headers: { 'test-owner': 'alice' } })
      ).json(),
    ).toEqual({ city });
    expect(users.get('bob')).toEqual(city);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/me/city',
          headers: { 'test-owner': 'alice' },
          payload: { cityId: null },
        })
      ).statusCode,
    ).toBe(200);
    expect(users.get('alice')).toBeNull();
    expect(users.get('bob')).toEqual(city);
  } finally {
    await app.close();
  }
});
it('rejects invalid IDs, injected ownership and weather for an obsolete city', async () => {
  const { app, query } = await setup();
  try {
    for (const payload of [
      { cityId: '../../etc' },
      { cityId: '1', userId: 'bob' },
      { cityId: 123 },
      { cityId: '0'.repeat(30) },
    ])
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/me/city',
            headers: { 'test-owner': 'alice' },
            payload,
          })
        ).statusCode,
      ).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/me/weather?cityId=2',
          headers: { 'test-owner': 'bob' },
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await app.close();
  }
});
it('preserves the saved city when provider resolution fails', async () => {
  vi.spyOn(CityWeatherService.prototype, 'resolveCity').mockRejectedValue(new Error('offline'));
  const { app, users } = await setup();
  try {
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/me/city',
          headers: { 'test-owner': 'bob' },
          payload: { cityId: '2' },
        })
      ).statusCode,
    ).toBe(500);
    expect(users.get('bob')).toEqual(city);
  } finally {
    await app.close();
  }
});

it('limits weather and city reads before touching the database', async () => {
  const { app, query, redis } = await setup();
  vi.spyOn(redis, 'incr').mockResolvedValue(91);
  try {
    for (const url of ['/me/city', '/me/weather?cityId=1'])
      expect(
        (await app.inject({ method: 'GET', url, headers: { 'test-owner': 'alice' } })).statusCode,
      ).toBe(429);
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it('limits daily provider usage but still permits clearing a city', async () => {
  const { app, users, redis } = await setup();
  vi.spyOn(redis, 'incr').mockImplementation(async (key: string) =>
    key.includes('user-budget') ? 61 : 1,
  );
  const search = vi.spyOn(CityWeatherService.prototype, 'search');
  try {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/cities?q=Moscow',
          headers: { 'test-owner': 'bob' },
        })
      ).statusCode,
    ).toBe(429);
    expect(search).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/me/city',
          headers: { 'test-owner': 'bob' },
          payload: { cityId: null },
        })
      ).statusCode,
    ).toBe(200);
    expect(users.get('bob')).toBeNull();
  } finally {
    await app.close();
  }
});
