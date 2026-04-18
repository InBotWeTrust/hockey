import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../auth/jwt.js';
import { AppError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  accessSecret: string;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorateRequest('user', null);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('unauthenticated', 'missing bearer token', 401);
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await verifyAccessToken(token, opts.accessSecret);
      req.user = { id: payload.sub };
    } catch {
      throw new AppError('unauthenticated', 'invalid token', 401);
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth', dependencies: ['errors'] });
