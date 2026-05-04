import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import {
  resolvePushVapidOptions,
  sendWebPush,
  type PushVapidOptions,
  type WebPushSubscription,
} from './service.js';
import {
  getPushPreferences,
  savePushPreferences,
  type PushPreferencePatch,
} from './preferences.js';

type UserRole = 'player' | 'admin';

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const deleteSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});

const clickSchema = z.object({
  deliveryId: z.string().uuid(),
});

const testPushSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    body: z.string().trim().min(1).max(180).optional(),
    url: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^\/(?!\/)/)
      .optional(),
  })
  .optional();

const preferencesPatchSchema = z
  .object({
    chatNewDialogMessage: z.boolean().optional(),
    dailyGame: z.boolean().optional(),
    trainingAvailable: z.boolean().optional(),
    gameNews: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'no changes');

async function requireAdmin(app: Parameters<FastifyPluginAsync>[0], req: FastifyRequest) {
  const { rows } = await app.pg.query<{ role: UserRole }>('select role from users where id = $1', [
    req.user.id,
  ]);
  if (rows[0]?.role !== 'admin') {
    throw new AppError('forbidden', 'admin role required', 403);
  }
}

function toSubscription(row: PushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  };
}

function getUserAgent(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) return header[0] ?? null;
  return header ?? null;
}

export const pushRoutes: FastifyPluginAsync<PushVapidOptions> = async (app, opts) => {
  app.get('/push/config', { preHandler: [app.authenticate] }, async () => {
    const config = resolvePushVapidOptions(opts);
    return {
      supported: config !== null,
      publicKey: config?.publicKey ?? null,
    };
  });

  app.get('/push/preferences', { preHandler: [app.authenticate] }, async (req) => {
    return getPushPreferences(app.pg, req.user.id);
  });

  app.patch('/push/preferences', { preHandler: [app.authenticate] }, async (req) => {
    const body = preferencesPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid push preferences', 400);
    }
    const patch: PushPreferencePatch = {};
    if (body.data.chatNewDialogMessage !== undefined) {
      patch.chatNewDialogMessage = body.data.chatNewDialogMessage;
    }
    if (body.data.dailyGame !== undefined) {
      patch.dailyGame = body.data.dailyGame;
    }
    if (body.data.trainingAvailable !== undefined) {
      patch.trainingAvailable = body.data.trainingAvailable;
    }
    if (body.data.gameNews !== undefined) {
      patch.gameNews = body.data.gameNews;
    }
    return savePushPreferences(app.pg, req.user.id, patch);
  });

  app.post('/push/subscriptions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = subscriptionSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid push subscription', 400);
    }

    await app.pg.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set user_id = excluded.user_id,
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             user_agent = excluded.user_agent,
             updated_at = now()`,
      [
        req.user.id,
        body.data.endpoint,
        body.data.keys.p256dh,
        body.data.keys.auth,
        getUserAgent(req.headers['user-agent']),
      ],
    );

    return reply.status(201).send({ ok: true });
  });

  app.post('/push/click', async (req) => {
    const body = clickSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid push click payload', 400);
    }

    await app.pg.query(
      `update push_delivery_log
          set click_count = click_count + 1,
              clicked_at = now(),
              updated_at = now()
        where id = $1`,
      [body.data.deliveryId],
    );

    return { ok: true };
  });

  app.delete('/push/subscriptions', { preHandler: [app.authenticate] }, async (req) => {
    const body = deleteSubscriptionSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid push subscription', 400);
    }

    await app.pg.query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [
      req.user.id,
      body.data.endpoint,
    ]);

    return { ok: true };
  });

  app.post(
    '/push/test',
    {
      preHandler: [
        app.authenticate,
        async (req) => {
          await requireAdmin(app, req);
        },
      ],
    },
    async (req) => {
      const config = resolvePushVapidOptions(opts);
      if (config === null) {
        throw new AppError('push_not_configured', 'push is not configured', 400);
      }
      const body = testPushSchema.safeParse(req.body);
      if (!body.success) {
        throw new AppError('bad_request', 'invalid test push body', 400);
      }
      const payload = {
        title: body.data?.title ?? 'Ultimate Hockey',
        body: body.data?.body ?? 'Проверка уведомлений',
        url: body.data?.url ?? '/profile',
        tag: 'ultimate-hockey-test-push',
      };

      const { rows } = await app.pg.query<PushSubscriptionRow>(
        `select id, endpoint, p256dh, auth
           from push_subscriptions
          where user_id = $1
          order by updated_at desc`,
        [req.user.id],
      );

      let sent = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          const result = await sendWebPush(toSubscription(row), config, payload);
          if (result.ok) {
            sent += 1;
            await app.pg.query(
              `update push_subscriptions
                  set last_success_at = now(),
                      last_error_at = null,
                      last_error_message = null
                where id = $1`,
              [row.id],
            );
            continue;
          }

          failed += 1;
          if (result.gone) {
            await app.pg.query('delete from push_subscriptions where id = $1', [row.id]);
          } else {
            await app.pg.query(
              `update push_subscriptions
                  set last_error_at = now(),
                      last_error_message = $2
                where id = $1`,
              [row.id, `HTTP ${result.status}: ${result.body.slice(0, 400)}`],
            );
          }
        } catch (err) {
          failed += 1;
          await app.pg.query(
            `update push_subscriptions
                set last_error_at = now(),
                    last_error_message = $2
              where id = $1`,
            [row.id, err instanceof Error ? err.message : 'push send failed'],
          );
        }
      }

      return { total: rows.length, sent, failed };
    },
  );
};
