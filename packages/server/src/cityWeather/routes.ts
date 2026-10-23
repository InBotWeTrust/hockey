import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {createServiceProxyFetch} from '../network/serviceProxy.js';
import { AppError } from '../plugins/errors.js';
import { CityWeatherService, citySchema, type SelectedCity } from './service.js';

export const cityWeatherRoutes: FastifyPluginAsync<{ apiKey?: string;proxyUrl?:string }> = async (app, options) => {
  const transport=createServiceProxyFetch('https://api.weatherapi.com',options.proxyUrl);
  app.addHook('onClose',async()=>{await transport.close();});
  const service = new CityWeatherService({
    fetcher:transport.fetcher,
    cache: app.redis,
    ...(options.apiKey ? { key: options.apiKey } : {}),
  });
  const readCity = async (userId: string) => {
    const { rows } = await app.pg.query<{ map_city: SelectedCity | null }>(
      'select map_city from users where id=$1',
      [userId],
    );
    if (!rows[0]) throw new AppError('not_found', 'User not found', 404);
    return rows[0].map_city ? citySchema.parse(rows[0].map_city) : null;
  };
  const limit = async (userId: string, providerRequest = false) => {
    const key = `city-weather:limit:${userId}:${Math.floor(Date.now() / 60000)}`;
    const count = await app.redis.incr(key);
    if (count === 1) await app.redis.expire(key, 120);
    if (count > 90) throw new AppError('rate_limited', 'Too many city requests', 429);
    if (providerRequest) {
      const dailyKey = `city-weather:user-budget:${userId}:${new Date().toISOString().slice(0, 10)}`;
      const daily = await app.redis.incr(dailyKey);
      if (daily === 1) await app.redis.expire(dailyKey, 172800);
      if (daily > 60) throw new AppError('rate_limited', 'Daily city search limit reached', 429);
    }
  };
  app.get('/cities', { preHandler: [app.authenticate] }, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(req.query);
    await limit(req.user.id, true);
    return { cities: await service.search(q) };
  });
  app.get('/me/city', { preHandler: [app.authenticate] }, async (req) => {
    await limit(req.user.id);
    return { city: await readCity(req.user.id) };
  });
  app.put('/me/city', { preHandler: [app.authenticate] }, async (req) => {
    const { cityId } = z
      .object({
        cityId: z
          .string()
          .regex(/^\d{1,12}$/)
          .nullable(),
      })
      .strict()
      .parse(req.body);
    await limit(req.user.id, cityId !== null);
    const city = cityId === null ? null : await service.resolveCity(cityId);
    const result = await app.pg.query(
      'update users set map_city=$1::jsonb where id=$2 returning id',
      [city ? JSON.stringify(city) : null, req.user.id],
    );
    if (!result.rowCount) throw new AppError('not_found', 'User not found', 404);
    return { city };
  });
  app.get('/me/weather', { preHandler: [app.authenticate] }, async (req) => {
    const { cityId } = z.object({ cityId: z.string().regex(/^\d{1,12}$/) }).parse(req.query);
    await limit(req.user.id);
    const city = await readCity(req.user.id);
    if (!city || city.id !== cityId)
      throw new AppError('city_changed', 'Selected city changed', 409);
    return service.weather(city);
  });
};
