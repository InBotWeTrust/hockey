import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    // Marks `userId` as recently active. Throttled via Redis: writes to
    // `users.last_seen_at` happen at most once per `LAST_SEEN_TTL_SECONDS` per
    // user, so a chatty client doesn't flood the DB. Idempotent + best-effort.
    touchLastSeen: (userId: string) => Promise<void>;
  }
}

export const LAST_SEEN_TTL_SECONDS = 60;

const plugin: FastifyPluginAsync = async (app) => {
  const touch = async (userId: string): Promise<void> => {
    // SET key 1 NX EX 60 — atomic: succeeds only if no fresh marker exists,
    // bounding `last_seen_at` writes to ~1/min/user. Reply is "OK" on success
    // and `null` when the key already exists.
    const acquired = await app.redis.set(
      `last_seen:${userId}`,
      '1',
      'EX',
      LAST_SEEN_TTL_SECONDS,
      'NX',
    );
    if (acquired === null) return;
    await app.pg.query('update users set last_seen_at = now() where id = $1', [userId]);
  };
  app.decorate('touchLastSeen', touch);

  // Fire-and-forget: don't block the response on the throttle/UPDATE round-trip.
  // Runs only when the route had `authenticate` as preHandler — anonymous
  // requests leave `req.user` as the decorator default (null).
  app.addHook('onResponse', (req, _reply, done) => {
    done();
    const u = req.user;
    if (!u || !u.id) return;
    void touch(u.id).catch((err) =>
      req.log.warn({ err, userId: u.id }, 'touchLastSeen failed'),
    );
  });
};

export const lastSeenPlugin = fp(plugin, {
  name: 'lastSeen',
  dependencies: ['db', 'redis', 'auth'],
});
