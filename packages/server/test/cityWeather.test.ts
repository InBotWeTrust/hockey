import { afterEach, expect, it, vi } from 'vitest';
import { CityWeatherService, mapWeatherCode } from '../src/cityWeather/service.js';
const city = {
  id: '2801268',
  name: 'Moscow',
  region: 'Moscow City',
  country: 'Russia',
  latitude: 55.75,
  longitude: 37.62,
  timeZone: 'Europe/Moscow',
};
function cache() {
  const values = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => values.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      values.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
  };
}
afterEach(() => vi.restoreAllMocks());
it('maps real condition codes including rain, mixed precipitation and fog', () => {
  expect(mapWeatherCode(1000, 0)).toBe('clear');
  expect(mapWeatherCode(1003, 0)).toBe('overcast');
  expect(mapWeatherCode(1183, 0)).toBe('rain');
  expect(mapWeatherCode(1069, 0)).toBe('sleet');
  expect(mapWeatherCode(1213, 0)).toBe('snow');
  expect(mapWeatherCode(1114, 0)).toBe('blizzard');
  expect(mapWeatherCode(1135, 0)).toBe('fog');
  expect(mapWeatherCode(9999, 0)).toBeNull();
});
it('shares concurrent city requests and caches weather independently of account', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          current: {
            last_updated_epoch: 1792746000,
            temp_c: 7,
            wind_kph: 10,
            condition: { code: 1183, text: 'Rain' },
          },
        }),
      ),
  );
  const service = new CityWeatherService({
    key: 'test-key',
    cache: cache(),
    fetcher,
    now: () => 1792746000000,
  });
  const results = await Promise.all([service.weather(city), service.weather(city)]);
  expect(results[0].weather?.kind).toBe('rain');
  expect(results[1]).toEqual(results[0]);
  await service.weather(city);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]![0])).not.toContain('user');
});
it('returns stale weather on outage, but never indefinitely', async () => {
  let now = 1792746000000;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            last_updated_epoch: now / 1000,
            temp_c: 0,
            wind_kph: 10,
            condition: { code: 1213, text: 'Snow' },
          },
        }),
      ),
    )
    .mockRejectedValue(new Error('offline'));
  const service = new CityWeatherService({
    key: 'test-key',
    cache: cache(),
    fetcher,
    now: () => now,
  });
  await service.weather(city);
  now += 31 * 60000;
  expect((await service.weather(city)).status).toBe('stale');
  now += 25 * 3600000;
  expect((await service.weather(city)).weather).toBeNull();
});
it('does not call provider without key and rejects malformed location metadata', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ location: { name: 'Bad', lat: 999, lon: 0, tz_id: 'bad' } })),
  );
  const disabled = new CityWeatherService({ cache: cache(), fetcher });
  expect((await disabled.weather(city)).status).toBe('not_configured');
  expect(fetcher).not.toHaveBeenCalled();
  const service = new CityWeatherService({ key: 'test-key', cache: cache(), fetcher });
  await expect(service.resolveCity('123')).rejects.toThrow();
});
