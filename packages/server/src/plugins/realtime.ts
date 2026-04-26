import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { ChatEvent } from '../chat/types.js';

export type RealtimeHandler = (event: ChatEvent) => void;
export type Unsubscribe = () => Promise<void>;

export interface Realtime {
  publish(channel: string, event: ChatEvent): Promise<void>;
  subscribe(channel: string, handler: RealtimeHandler): Promise<Unsubscribe>;
}

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  // ioredis blocks normal commands once a client enters subscriber mode,
  // so we duplicate the existing client for sub-only use. publish stays on app.redis.
  const subClient = app.redis.duplicate();

  const handlers = new Map<string, Set<RealtimeHandler>>();

  subClient.on('message', (channel, payload) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    let parsed: ChatEvent;
    try {
      parsed = JSON.parse(payload) as ChatEvent;
    } catch (err) {
      app.log.warn({ err, channel }, 'realtime: malformed payload');
      return;
    }
    for (const h of set) {
      try {
        h(parsed);
      } catch (err) {
        app.log.warn({ err, channel }, 'realtime: handler threw');
      }
    }
  });

  const realtime: Realtime = {
    async publish(channel, event) {
      await app.redis.publish(channel, JSON.stringify(event));
    },
    async subscribe(channel, handler) {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
        await subClient.subscribe(channel);
      }
      set.add(handler);

      let unsubscribed = false;
      return async () => {
        if (unsubscribed) return;
        unsubscribed = true;
        const cur = handlers.get(channel);
        if (!cur) return;
        cur.delete(handler);
        if (cur.size === 0) {
          handlers.delete(channel);
          await subClient.unsubscribe(channel);
        }
      };
    },
  };

  app.decorate('realtime', realtime);
  app.addHook('onClose', async () => {
    handlers.clear();
    await subClient.quit().catch(() => undefined);
  });
};

export const realtimePlugin = fp(plugin, { name: 'realtime', dependencies: ['redis'] });
