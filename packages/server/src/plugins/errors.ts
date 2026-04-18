import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    if (err.validation) {
      reply.status(400).send({
        error: { code: 'bad_request', message: err.message },
      });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    reply.status(500).send({
      error: { code: 'internal_error', message: 'internal error' },
    });
  });
};

export const errorsPlugin = fp(plugin, { name: 'errors' });
