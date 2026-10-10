import type { FastifyPluginAsync } from 'fastify';
import { createDefaultBarLayout, type BarLayoutSnapshot } from '@hockey/game-core';
import { createAdminPreHandlers } from '../admin/guards.js';
import { AppError } from '../plugins/errors.js';
import { barLayoutSchema, barLayoutWriteSchema } from './layoutSchema.js';
export const barLayoutRoutes: FastifyPluginAsync = async (app) => {
  const read = async (): Promise<BarLayoutSnapshot> => {
    const { rows } = await app.pg.query<BarLayoutSnapshot>(
      'select revision,layout from bar_layout where id=1',
    );
    const row = rows[0];
    return row
      ? { revision: row.revision, layout: barLayoutSchema.parse(row.layout) }
      : { revision: 1, layout: createDefaultBarLayout() };
  };
  app.get('/bar/layout', { preHandler: [app.authenticate] }, read);
  app.get('/admin/bar/layout', { preHandler: createAdminPreHandlers(app) }, read);
  app.put('/admin/bar/layout', { preHandler: createAdminPreHandlers(app) }, async (request) => {
    const parsed = barLayoutWriteSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError('bad_request', 'Проверь настройки бара.', 400);
    const { rows } = await app.pg.query<BarLayoutSnapshot>(
      'update bar_layout set layout=$2::jsonb,revision=revision+1,updated_at=now(),updated_by=$3 where id=1 and revision=$1 returning revision,layout',
      [parsed.data.revision, JSON.stringify(parsed.data.layout), request.user.id],
    );
    if (!rows[0])
      throw new AppError(
        'bar_layout_conflict',
        'Расстановка уже изменена. Обнови данные перед сохранением.',
        409,
      );
    return { revision: rows[0].revision, layout: barLayoutSchema.parse(rows[0].layout) };
  });
};
