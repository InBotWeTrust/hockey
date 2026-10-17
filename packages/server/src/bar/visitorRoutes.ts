import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createAdminPreHandlers } from '../admin/guards.js';
import { AppError } from '../plugins/errors.js';
import {
  purchaseVisitorProduct,
  readVisitorSettings,
  visitorState,
  visitorTransaction,
} from './visitorService.js';
const integer = z.number().int().min(1).max(1000000);
export const visitorSettingsSchema = z
  .object({
    cardDays: integer.max(365),
    freeMessages: integer,
    cardMessages: integer,
    freeGames: integer,
    cardGames: integer,
    products: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,60}$/),
            title: z.string().trim().min(1).max(100),
            kind: z.enum(['card', 'messages']),
            amount: integer,
            coins: integer.max(100000000),
            stars: integer,
          })
          .strict(),
      )
      .min(2)
      .max(20),
  })
  .strict()
  .refine(
    (s) =>
      s.cardMessages >= s.freeMessages &&
      new Set(s.products.map((p) => p.id)).size === s.products.length &&
      s.products.filter((p) => p.kind === 'card').length === 1,
    'Проверь лимиты и товары.',
  )
  .transform((settings) => ({
    ...settings,
    products: settings.products.map((product) => {
      if (product.kind !== 'messages') return product;
      const last = product.amount % 10,
        hundred = product.amount % 100;
      const unit =
        hundred >= 11 && hundred <= 14
          ? 'сообщений'
          : last === 1
            ? 'сообщение'
            : last >= 2 && last <= 4
              ? 'сообщения'
              : 'сообщений';
      return { ...product, title: `${product.amount} ${unit}` };
    }),
  }));
export const visitorRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  app.get('/bar/visitor', auth, (req) =>
    visitorTransaction(app.pg, req.user.id, async (db, now) => ({
      state: await visitorState(db, req.user.id, now),
      ...(await readVisitorSettings(db)),
    })),
  );
  app.post('/bar/visitor/purchases', auth, (req) =>
    purchaseVisitorProduct(
      app.pg,
      req.user.id,
      z
        .object({
          id: z.string().uuid(),
          productId: z.string().min(1).max(60),
          currency: z.enum(['coins', 'stars']),
          expectedPrice: integer.max(100000000),
          expectedRevision: integer,
        })
        .strict()
        .parse(req.body),
    ),
  );
  app.get('/admin/bar/visitor', { preHandler: createAdminPreHandlers(app) }, () =>
    readVisitorSettings(app.pg),
  );
  app.put('/admin/bar/visitor', { preHandler: createAdminPreHandlers(app) }, async (req) => {
    const input = z
      .object({ revision: integer, settings: visitorSettingsSchema })
      .strict()
      .parse(req.body);
    const row = (
      await app.pg.query(
        'update bar_visitor_settings set settings=$2,revision=revision+1,updated_at=now() where id=1 and revision=$1 returning revision,settings',
        [input.revision, JSON.stringify(input.settings)],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        'bar_settings_conflict',
        'Настройки уже изменились. Обнови страницу.',
        409,
      );
    return row;
  });
};
