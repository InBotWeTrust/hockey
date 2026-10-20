import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { OlegFightService, readBarAccess, assertBarAccess } from './olegFightService.js';
export const olegFightRoutes: FastifyPluginAsync = fp(
  async (app) => {
    const service = new OlegFightService(app.pg);
    app.addHook('onRoute', (options) => {
      if (
        !options.url.startsWith('/bar/') ||
        options.url === '/bar/access' ||
        options.url.startsWith('/bar/fights/') ||
        options.url === '/bar/ws'
      )
        return;
      const handlers = options.preHandler
        ? Array.isArray(options.preHandler)
          ? options.preHandler
          : [options.preHandler]
        : [];
      options.preHandler = [
        ...handlers,
        async (request) => {
          if (request.user?.id) await assertBarAccess(app.pg, request.user.id);
        },
      ];
    });
    const auth = { preHandler: [app.authenticate] };
    const id = z.object({ id: z.string().uuid() });
    app.get('/bar/access', auth, (request) => readBarAccess(app.pg, request.user.id));
    app.post('/bar/fights/oleg', auth, async (request) => {
      const fightId = await service.start(request.user.id);
      return service.read(request.user.id, fightId);
    });
    app.get('/bar/fights/:id', auth, (request) =>
      service.read(request.user.id, id.parse(request.params).id),
    );
    const base = {
      actionId: z.string().uuid(),
      seq: z.number().int().positive().max(1000),
      phaseId: z.number().int().nonnegative(),
    };
    const command = z.discriminatedUnion('kind', [
      z.object({ ...base, kind: z.literal('attack') }).strict(),
      z
        .object({
          ...base,
          kind: z.literal('input'),
          input: z
            .object({
              direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
              crouch: z.boolean(),
              guard: z.boolean(),
            })
            .strict(),
        })
        .strict(),
    ]);
    app.post('/bar/fights/:id/commands', auth, (request) =>
      service.read(request.user.id, id.parse(request.params).id, command.parse(request.body)),
    );
    app.post('/bar/fights/:id/acknowledge', auth, async (request) => {
      await service.acknowledge(request.user.id, id.parse(request.params).id);
      return readBarAccess(app.pg, request.user.id);
    });
    let active: Promise<void> | null = null;
    let stopping = false;
    const tick = () => {
      if (active || stopping) return;
      active = service
        .tick()
        .catch(() =>
          app.log.warn({ code: 'bar_fight_tick_failed' }, 'Bar fight will resume on the next tick'),
        )
        .finally(() => {
          active = null;
        });
    };
    const timer = setInterval(tick, 250);
    timer.unref();
    app.addHook('onReady', async () => {
      tick();
    });
    app.addHook('onClose', async () => {
      stopping = true;
      clearInterval(timer);
      await active;
    });
  },
  { name: 'barOlegFight', dependencies: ['db'] },
);
