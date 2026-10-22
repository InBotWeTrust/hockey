import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

export const citySchema = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  name: z.string().min(1).max(200),
  region: z.string().max(200),
  country: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
});
export type SelectedCity = z.infer<typeof citySchema>;
export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'sleet' | 'snow' | 'blizzard' | 'fog';
export type Weather = {
  kind: WeatherKind;
  temperature: number;
  description: string;
  observedAt: string;
  fetchedAt: string;
};
export type WeatherResult = {
  status: 'fresh' | 'stale' | 'unavailable' | 'not_configured';
  weather: Weather | null;
};
interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}
interface Options {
  key?: string;
  cache: Cache;
  fetcher?: typeof fetch;
  now?: () => number;
}
const minute = 60_000;
export function mapWeatherCode(code: number, wind: number): WeatherKind | null {
  if (code === 1000) return 'clear';
  if ([1003, 1006, 1009, 1087].includes(code)) return 'overcast';
  if ([1030, 1135, 1147].includes(code)) return 'fog';
  if ([1114, 1117].includes(code)) return 'blizzard';
  if ([1066, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258, 1279, 1282].includes(code))
    return wind >= 50 ? 'blizzard' : 'snow';
  if ([1069, 1072, 1168, 1171, 1198, 1201, 1204, 1207, 1237, 1249, 1252, 1261, 1264].includes(code))
    return 'sleet';
  if (
    [1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246, 1273, 1276].includes(
      code,
    )
  )
    return 'rain';
  return null;
}
const conditionSchema = z.object({
  current: z.object({
    last_updated_epoch: z.number().finite(),
    temp_c: z.number().finite().min(-100).max(80),
    wind_kph: z.number().finite().min(0).max(500),
    condition: z.object({ code: z.number().int(), text: z.string().max(300) }),
  }),
});
const searchSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    region: z.string().max(200),
    country: z.string().min(1).max(200),
  }),
);
export class CityWeatherService {
  private pending = new Map<string, Promise<unknown>>();
  private now: () => number;
  private fetcher: typeof fetch;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
  }
  private once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key);
    if (previous) return previous as Promise<T>;
    const request = work().finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  private async request(endpoint: string, q: string): Promise<unknown> {
    if (!this.options.key)
      throw new AppError('weather_not_configured', 'Weather service is not configured', 503);
    const budgetKey = `city-weather:budget:${new Date(this.now()).toISOString().slice(0, 7)}`;
    const count = await this.options.cache.incr(budgetKey);
    if (count === 1) await this.options.cache.expire(budgetKey, 32 * 86400);
    if (count > 90_000)
      throw new AppError('weather_quota', 'Weather request budget exhausted', 503);
    const url = new URL(`https://api.weatherapi.com/v1/${endpoint}.json`);
    url.searchParams.set('key', this.options.key);
    url.searchParams.set('q', q);
    url.searchParams.set('lang', 'ru');
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('provider unavailable');
      return await response.json();
    } catch {
      throw new AppError('weather_unavailable', 'Weather service unavailable', 503);
    }
  }
  async search(query: string) {
    const q = query.trim().toLocaleLowerCase();
    const key = `city-weather:search:${createHash('sha256').update(q).digest('hex')}`;
    return this.once(key, async () => {
      const cached = await this.options.cache.get(key);
      if (cached) return searchSchema.parse(JSON.parse(cached));
      const result = searchSchema.parse(await this.request('search', q)).slice(0, 10);
      await this.options.cache.set(key, JSON.stringify(result), 'EX', 86400);
      await Promise.all(
        result.map((item) =>
          this.options.cache.set(
            `city-weather:label:${item.id}`,
            JSON.stringify(item),
            'EX',
            30 * 86400,
          ),
        ),
      );
      return result;
    });
  }
  async resolveCity(id: string): Promise<SelectedCity> {
    if (!/^\d{1,12}$/.test(id)) throw new AppError('bad_request', 'Invalid city', 400);
    const key = `city-weather:location:${id}`;
    return this.once(key, async () => {
      const cached = await this.options.cache.get(key);
      if (cached) return citySchema.parse(JSON.parse(cached));
      const payload = z
        .object({
          location: z.object({
            name: z.string(),
            region: z.string(),
            country: z.string(),
            lat: z.number(),
            lon: z.number(),
            tz_id: z.string(),
          }),
        })
        .parse(await this.request('timezone', `id:${id}`));
      const loc = payload.location;
      const labelValue = await this.options.cache.get(`city-weather:label:${id}`);
      const label = labelValue ? searchSchema.element.parse(JSON.parse(labelValue)) : null;
      const city = citySchema.parse({
        id,
        name: label?.name ?? loc.name,
        region: label?.region ?? loc.region,
        country: label?.country ?? loc.country,
        latitude: loc.lat,
        longitude: loc.lon,
        timeZone: loc.tz_id,
      });
      await this.options.cache.set(key, JSON.stringify(city), 'EX', 30 * 86400);
      return city;
    });
  }
  async weather(city: SelectedCity): Promise<WeatherResult> {
    if (!this.options.key) return { status: 'not_configured', weather: null };
    const key = `city-weather:current:${city.latitude},${city.longitude}`;
    return this.once(key, async () => {
      let previous: Weather | null = null;
      try {
        const cached = await this.options.cache.get(key);
        if (cached) previous = JSON.parse(cached) as Weather;
        const age = previous ? this.now() - Date.parse(previous.fetchedAt) : Infinity;
        const observedAge = previous ? this.now() - Date.parse(previous.observedAt) : Infinity;
        if (
          age >= 0 &&
          age < 30 * minute &&
          observedAge >= -5 * minute &&
          observedAge < 24 * 60 * minute
        )
          return { status: 'fresh', weather: previous };
        if (await this.options.cache.get(`${key}:retry`)) return this.fallback(previous);
        const data = conditionSchema.parse(
          await this.request('current', `${city.latitude},${city.longitude}`),
        ).current;
        const kind = mapWeatherCode(data.condition.code, data.wind_kph);
        const observation = data.last_updated_epoch * 1000;
        if (
          !kind ||
          observation > this.now() + 5 * minute ||
          this.now() - observation > 24 * 60 * minute
        )
          throw new Error('Invalid weather');
        const weather: Weather = {
          kind,
          temperature: data.temp_c,
          description: data.condition.text,
          observedAt: new Date(observation).toISOString(),
          fetchedAt: new Date(this.now()).toISOString(),
        };
        await this.options.cache.set(key, JSON.stringify(weather), 'EX', 86400);
        return { status: 'fresh', weather };
      } catch {
        try {
          await this.options.cache.set(`${key}:retry`, '1', 'EX', 60);
        } catch {
          /* Do not bypass shared cache on storage failure. */
        }
        return this.fallback(previous);
      }
    });
  }
  private fallback(weather: Weather | null): WeatherResult {
    const age = weather ? this.now() - Date.parse(weather.observedAt) : Infinity;
    return weather && age >= -5 * minute && age < 24 * 60 * minute
      ? { status: 'stale', weather }
      : { status: 'unavailable', weather: null };
  }
}
