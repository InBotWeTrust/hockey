import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

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

function hasHttpStatus(err: unknown): err is { statusCode: number; code?: string; message: string } {
  if (err === null || typeof err !== 'object') return false;
  const maybe = err as { statusCode?: unknown; message?: unknown };
  return (
    typeof maybe.statusCode === 'number' &&
    maybe.statusCode >= 400 &&
    maybe.statusCode < 500 &&
    typeof maybe.message === 'string'
  );
}

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    if (err instanceof ZodError) {
      reply.status(400).send({
        error: { code: 'bad_request', message: err.message, issues: err.issues },
      });
      return;
    }
    if (err.validation) {
      reply.status(400).send({
        error: { code: 'bad_request', message: err.message },
      });
      return;
    }
    if (hasHttpStatus(err)) {
      reply.status(err.statusCode).send({
        error: { code: err.code ?? 'bad_request', message: err.message },
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
