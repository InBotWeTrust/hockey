import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export const NATIVE_APP_ORIGIN = 'https://localhost';

export const nativeCorsPlugin = fp(async (app) => {
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin === NATIVE_APP_ORIGIN);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    credentials: false,
    strictPreflight: true,
  });
});
